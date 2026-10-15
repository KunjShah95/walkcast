import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DuplicateError, type Job, type NewJob, type RecordingRow, type Store, type User } from "./types.ts";

interface Data {
  users: User[];
  sessions: { hash: string; userId: string; expires: number }[];
  limits: Record<string, { start: number; count: number }>;
  jobs: (Job & { idempotencyKey: string | null; lockedBy: string | null; leaseUntil: number | null })[];
  recordings: RecordingRow[];
}

/**
 * Single-process store in one JSON file (the default for local use). Writes are atomic
 * (temp file + rename) and serialized in-process. It is NOT safe for two processes: use PgStore
 * (Supabase) for more than one web instance or a separate worker.
 */
export class FileStore implements Store {
  readonly kind = "file" as const;
  private data: Data;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(readonly file: string) {
    const loaded = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Partial<Data>) : {};
    this.data = { users: [], sessions: [], limits: {}, jobs: [], recordings: [], ...loaded };
    // Jobs that were running when the process stopped go back to the queue.
    for (const j of this.data.jobs) if (j.status === "running") Object.assign(j, { status: "queued", lockedBy: null, leaseUntil: null });
  }

  /** Run a mutation, then persist; mutations never interleave. */
  private write<T>(fn: () => T): Promise<T> {
    const next = this.chain.then(() => {
      const value = fn();
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.data), { mode: 0o600 });
      renameSync(tmp, this.file);
      return value;
    });
    this.chain = next.catch(() => undefined);
    return next;
  }

  async userByEmail(email: string) {
    return this.data.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
  }
  async userById(id: string) {
    return this.data.users.find((u) => u.id === id) ?? null;
  }
  async userByGoogle(sub: string) {
    return this.data.users.find((u) => u.google === sub) ?? null;
  }
  async userByAuthId(authId: string) {
    return this.data.users.find((u) => u.authId === authId) ?? null;
  }
  insertUser(user: User) {
    return this.write(() => {
      if (this.data.users.some((u) => u.email.toLowerCase() === user.email.toLowerCase() || (user.authId && u.authId === user.authId))) throw new DuplicateError("email taken");
      this.data.users.push({ ...user });
    });
  }
  updateUser(user: User) {
    return this.write(() => {
      const i = this.data.users.findIndex((u) => u.id === user.id);
      if (i >= 0) this.data.users[i] = { ...user };
    });
  }

  createSession(tokenHash: string, userId: string, expiresAt: Date) {
    return this.write(() => {
      const now = Date.now();
      this.data.sessions = this.data.sessions.filter((s) => s.expires > now);
      this.data.sessions.push({ hash: tokenHash, userId, expires: expiresAt.getTime() });
    });
  }
  async sessionUser(tokenHash: string) {
    const s = this.data.sessions.find((x) => x.hash === tokenHash && x.expires > Date.now());
    return s ? this.userById(s.userId) : null;
  }
  deleteSession(tokenHash: string) {
    return this.write(() => {
      this.data.sessions = this.data.sessions.filter((s) => s.hash !== tokenHash);
    });
  }
  deleteUserSessions(userId: string) {
    return this.write(() => {
      this.data.sessions = this.data.sessions.filter((s) => s.userId !== userId);
    });
  }

  async hit(key: string, windowMs: number) {
    // Counters are not worth a disk write per hit; they live in memory for this process.
    const now = Date.now();
    const cur = this.data.limits[key];
    if (!cur || now - cur.start >= windowMs) this.data.limits[key] = { start: now, count: 1 };
    else cur.count++;
    return this.data.limits[key]!.count;
  }

  enqueue(job: NewJob) {
    return this.write(() => {
      if (job.idempotencyKey) {
        const existing = this.data.jobs.find((j) => j.owner === job.owner && j.idempotencyKey === job.idempotencyKey);
        if (existing) return strip(existing);
      }
      const row = {
        id: randomUUID(),
        kind: job.kind,
        owner: job.owner,
        status: "queued" as const,
        input: job.input,
        secret: job.secret ?? null,
        result: null,
        error: null,
        progress: null,
        attempts: 0,
        maxAttempts: job.maxAttempts ?? 2,
        createdAt: new Date().toISOString(),
        startedAt: null,
        finishedAt: null,
        idempotencyKey: job.idempotencyKey ?? null,
        lockedBy: null,
        leaseUntil: null,
      };
      this.data.jobs.push(row);
      return strip(row);
    });
  }
  claim(workerId: string, leaseMs: number) {
    return this.write(() => {
      const now = Date.now();
      const job = this.data.jobs.find((j) => j.status === "queued" || (j.status === "running" && (j.leaseUntil ?? 0) < now));
      if (!job) return null;
      if (job.status === "running" && job.attempts >= job.maxAttempts) {
        Object.assign(job, { status: "failed", error: "The worker stopped responding too many times.", secret: null, finishedAt: new Date().toISOString() });
        return null;
      }
      Object.assign(job, { status: "running", lockedBy: workerId, leaseUntil: now + leaseMs, attempts: job.attempts + 1, startedAt: new Date().toISOString() });
      return strip(job);
    });
  }
  heartbeat(jobId: string, workerId: string, leaseMs: number, progress?: string) {
    return this.write(() => {
      const job = this.data.jobs.find((j) => j.id === jobId && j.lockedBy === workerId && j.status === "running");
      if (!job) return false;
      job.leaseUntil = Date.now() + leaseMs;
      if (progress !== undefined) job.progress = progress;
      return true;
    });
  }
  finish(jobId: string, workerId: string, outcome: Parameters<Store["finish"]>[2]) {
    return this.write(() => {
      const job = this.data.jobs.find((j) => j.id === jobId && j.lockedBy === workerId);
      if (!job) return;
      if (outcome.status === "succeeded") Object.assign(job, { status: "succeeded", result: outcome.result, secret: null, finishedAt: new Date().toISOString(), lockedBy: null, leaseUntil: null });
      else if (outcome.retry && job.attempts < job.maxAttempts) Object.assign(job, { status: "queued", error: outcome.error, lockedBy: null, leaseUntil: null });
      else Object.assign(job, { status: "failed", error: outcome.error, secret: null, finishedAt: new Date().toISOString(), lockedBy: null, leaseUntil: null });
    });
  }
  release(jobId: string, workerId: string) {
    return this.write(() => {
      const job = this.data.jobs.find((j) => j.id === jobId && j.lockedBy === workerId && j.status === "running");
      if (job) Object.assign(job, { status: "queued", attempts: Math.max(0, job.attempts - 1), lockedBy: null, leaseUntil: null });
    });
  }
  async job(id: string) {
    const j = this.data.jobs.find((x) => x.id === id);
    return j ? strip(j) : null;
  }
  async jobByKey(owner: string | null, idempotencyKey: string) {
    const j = this.data.jobs.find((x) => x.owner === owner && x.idempotencyKey === idempotencyKey);
    return j ? strip(j) : null;
  }
  async activeJobs(owner: string | null) {
    return this.data.jobs.filter((j) => j.owner === owner && (j.status === "queued" || j.status === "running")).length;
  }
  async queueDepth() {
    return this.data.jobs.filter((j) => j.status === "queued").length;
  }

  saveRecording(row: RecordingRow) {
    return this.write(() => {
      this.data.recordings = [row, ...this.data.recordings.filter((r) => r.id !== row.id)];
    });
  }
  async recordings(owner: string | null, limit: number) {
    return this.data.recordings
      .filter((r) => owner === null || r.owner === owner)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
  async recording(id: string) {
    return this.data.recordings.find((r) => r.id === id) ?? null;
  }

  async ping() {}
  async close() {
    await this.chain;
  }
}

function strip(j: Data["jobs"][number]): Job {
  const { idempotencyKey: _k, lockedBy: _l, leaseUntil: _u, ...job } = j;
  return { ...job };
}
