import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { jobCompletedPayload } from "./payload.ts";
import { DuplicateError, type Job, type JobKind, type NewJob, type RecordingRow, type Schedule, type Store, type User, type Webhook, type WebhookDelivery } from "./types.ts";

interface Data {
  users: User[];
  sessions: { hash: string; userId: string; expires: number }[];
  limits: Record<string, { start: number; count: number }>;
  jobs: (Job & { idempotencyKey: string | null; lockedBy: string | null; leaseUntil: number | null })[];
  recordings: RecordingRow[];
  schedules: Schedule[];
  webhooks: Webhook[];
  deliveries: (WebhookDelivery & { lockedBy: string | null; leaseUntil: number | null; finishedAt: string | null })[];
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
  private timer: NodeJS.Timeout | null = null;
  private readonly debounceMs = 50;
  private exitHandler: (() => void) | null = null;
  private sigintHandler: (() => void) | null = null;
  private sigtermHandler: (() => void) | null = null;
  private closed = false;

  constructor(readonly file: string) {
    // Runtime guard: refuse to share one FileStore across processes.
    const lock = `${file}.lock`;
    if (existsSync(lock)) {
      try {
        const pid = Number(readFileSync(lock, "utf8").trim());
        if (pid && pid !== process.pid) {
          try { process.kill(pid, 0); throw new Error(`FileStore is already in use by process ${pid} (${file}). Use PgStore/SUPABASE_DB_URL for concurrent processes.`); } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e;
            // stale lock; fall through
          }
        }
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("FileStore is already in use")) throw e;
      }
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(lock, String(process.pid));
    const cleanup = () => { try { if (existsSync(lock) && readFileSync(lock, "utf8").trim() === String(process.pid)) unlinkSync(lock); } catch { /* best effort */ } };
    const flushOnExit = () => { try { this.flushSync(); } catch { /* best effort */ } cleanup(); };
    this.exitHandler = flushOnExit;
    this.sigintHandler = () => { flushOnExit(); process.exit(0); };
    this.sigtermHandler = () => { flushOnExit(); process.exit(0); };
    process.on("exit", this.exitHandler);
    process.on("SIGINT", this.sigintHandler);
    process.on("SIGTERM", this.sigtermHandler);

    let loaded: Partial<Data> = {};
    if (existsSync(file)) {
      try {
        loaded = JSON.parse(readFileSync(file, "utf8")) as Partial<Data>;
      } catch (e) {
        const backup = `${file}.corrupt-${Date.now()}`;
        try { renameSync(file, backup); } catch { /* best effort */ }
        console.error(`FileStore: could not parse ${file} (${e instanceof Error ? e.message : String(e)}); moved to ${backup} and starting empty.`);
        loaded = {};
      }
    }
    this.data = { users: [], sessions: [], limits: {}, jobs: [], recordings: [], schedules: [], webhooks: [], deliveries: [], ...loaded };
    // Jobs that were running when the process stopped go back to the queue.
    for (const j of this.data.jobs) if (j.status === "running") Object.assign(j, { status: "queued", lockedBy: null, leaseUntil: null });
  }

  /** Run a mutation immediately (in memory), then schedule a debounced persist. Mutations never interleave. */
  private write<T>(fn: () => T): Promise<T> {
    const next = this.chain.then(() => {
      const value = fn();
      this.schedulePersist();
      return value;
    });
    this.chain = next.then(() => undefined, () => undefined);
    return next;
  }

  /** Coalesce rapid mutations: persist at most once after a short idle window. */
  private schedulePersist() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const task = this.chain.then(() => {
        try { this.persistSync(); } catch (e) { console.error(`FileStore: persist failed (${e instanceof Error ? e.message : String(e)})`); }
      });
      this.chain = task.then(() => undefined, () => undefined);
    }, this.debounceMs);
    this.timer?.unref?.();
  }

  /** Synchronous atomic persist (temp file + rename). */
  private persistSync() {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data), { mode: 0o600 });
    // On Windows the rename above a just-written file can fail transiently (EPERM/EBUSY) while
    // another component (antivirus, indexer) holds it. The swap is the store's atomic commit;
    // retry the rename with a short backoff instead of failing the write.
    let tries = 0;
    for (;;) {
      try {
        renameSync(tmp, this.file);
        break;
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if ((code !== "EPERM" && code !== "EBUSY" && code !== "EACCES") || ++tries > 4) throw e;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * 2 ** (tries - 1));
      }
    }
  }

  /** Flush any pending debounced write synchronously. */
  private flushSync() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    try { this.persistSync(); } catch { /* best effort */ }
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
      const row = newJobRow(job);
      this.data.jobs.push(row);
      return strip(row);
    });
  }

  enqueueLimited(job: NewJob, maxActive: number) {
    // Count and insert inside one serialized mutation: the check and the write cannot interleave
    // with another submit, matching the atomic single-statement form PgStore uses.
    return this.write(() => {
      if (job.idempotencyKey) {
        const existing = this.data.jobs.find((j) => j.owner === job.owner && j.idempotencyKey === job.idempotencyKey);
        if (existing) return strip(existing);
      }
      const active = this.data.jobs.filter((j) => j.owner === job.owner && (j.status === "queued" || j.status === "running")).length;
      if (active >= maxActive) return null;
      const row = newJobRow(job);
      this.data.jobs.push(row);
      return strip(row);
    });
  }
  async claim(workerId: string, leaseMs: number, kind?: JobKind) {
    return this.write(() => {
      const now = Date.now();
      // Scan past dead candidates instead of stopping at the first one (same semantics as PgStore).
      const candidates = this.data.jobs.filter((j) => {
        if (j.status === "queued") return true;
        if (j.status === "running" && (j.leaseUntil ?? 0) < now) return true;
        return false;
      });
      // Retention: age finished jobs off the hot path occasionally, like the sessions table.
      if (Math.random() < 0.02) {
        const cutoff = now - 30 * 86_400_000;
        this.data.jobs = this.data.jobs.filter((j) => j.status === "queued" || j.status === "running" || !j.finishedAt || Date.parse(j.finishedAt) > cutoff || !j.finishedAt);
      }
      if (kind) {
        candidates.sort((a, b) => {
          const aPref = a.kind === kind ? 0 : 1;
          const bPref = b.kind === kind ? 0 : 1;
          if (aPref !== bPref) return aPref - bPref;
          return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
        });
      } else {
        candidates.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
      }
      for (const job of candidates) {
        if (job.status === "running" && (job.leaseUntil ?? 0) < now && job.attempts >= job.maxAttempts) {
          Object.assign(job, { status: "failed", error: "The worker stopped responding too many times.", secret: null, finishedAt: new Date().toISOString(), lockedBy: null, leaseUntil: null });
          continue;
        }
        Object.assign(job, { status: "running", lockedBy: workerId, leaseUntil: now + leaseMs, attempts: job.attempts + 1, startedAt: new Date().toISOString(), finishedAt: null, error: null });
        return strip(job);
      }
      return null;
    });
  }
  heartbeat(jobId: string, workerId: string, leaseMs: number) {
    return this.write(() => {
      const job = this.data.jobs.find((j) => j.id === jobId && j.lockedBy === workerId && j.status === "running");
      if (!job) return false;
      job.leaseUntil = Date.now() + leaseMs;
      return true;
    });
  }
  setProgress(jobId: string, workerId: string, progress: string) {
    return this.write(() => {
      const job = this.data.jobs.find((j) => j.id === jobId && j.lockedBy === workerId && j.status === "running");
      if (job) job.progress = progress;
    });
  }
  finish(jobId: string, workerId: string, outcome: Parameters<Store["finish"]>[2]) {
    return this.write(() => {
      const job = this.data.jobs.find((j) => j.id === jobId && j.lockedBy === workerId);
      if (!job) return;
      if (outcome.status === "succeeded") Object.assign(job, { status: "succeeded", result: outcome.result, secret: null, finishedAt: new Date().toISOString(), lockedBy: null, leaseUntil: null });
      else if (outcome.retry && job.attempts < job.maxAttempts) Object.assign(job, { status: "queued", error: outcome.error, lockedBy: null, leaseUntil: null });
      else Object.assign(job, { status: "failed", error: outcome.error, secret: null, finishedAt: new Date().toISOString(), lockedBy: null, leaseUntil: null });
      // Outbox rows in the same serialized mutation as the transition (PgStore: same transaction).
      if (job.status !== "succeeded" && job.status !== "failed") return;
      const payload = jobCompletedPayload(strip(job));
      const now = new Date().toISOString();
      for (const w of this.data.webhooks) {
        if (w.owner !== job.owner) continue;
        this.data.deliveries.push({ id: randomUUID(), webhookId: w.id, owner: w.owner, url: w.url, event: "job.completed", payload, status: "pending", attempts: 0, nextAt: now, lastError: null, createdAt: now, lockedBy: null, leaseUntil: null, finishedAt: null });
      }
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
    return (await this.queueStats()).depth;
  }

  async queueStats() {
    const now = Date.now();
    const queued = this.data.jobs.filter((j) => j.status === "queued");
    const oldest = queued.reduce((min, j) => Math.min(min, Date.parse(j.createdAt)), now);
    return { depth: queued.length, oldestQueuedMs: Math.max(0, now - oldest) };
  }
  async metrics(windowMs = 86_400_000) {
    const qs = await this.queueStats();
    const now = Date.now();
    const cutoff = now - windowMs;
    const buckets = new Map<JobKind, number[]>();
    for (const j of this.data.jobs) {
      if (!j.startedAt || !j.finishedAt) continue;
      if (j.status !== "succeeded" && j.status !== "failed") continue;
      const finishedAt = Date.parse(j.finishedAt);
      if (finishedAt < cutoff) continue;
      const startedAt = Date.parse(j.startedAt);
      const durMs = Math.max(0, finishedAt - startedAt);
      const arr = buckets.get(j.kind) ?? [];
      arr.push(durMs);
      buckets.set(j.kind, arr);
    }
    const percentile = (vals: number[], p: number) => {
      if (!vals.length) return 0;
      const sorted = [...vals].sort((a, b) => a - b);
      const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p / 100 * sorted.length) - 1));
      return sorted[idx]!;
    };
    const finished = [...buckets.entries()].map(([kind, vals]) => ({
      kind,
      count: vals.length,
      p50Ms: Math.round(percentile(vals, 50)),
      p95Ms: Math.round(percentile(vals, 95)),
    }));
    return { windowMs, queue: qs, finished };
  }
  async queuePosition(createdAt: string) {
    const now = Date.now();
    // ISO-8601 UTC strings compare lexicographically in creation order, and claim() walks the
    // array in that same order, so this count is exactly the jobs taken first.
    const queued = this.data.jobs.filter((j) => j.status === "queued");
    const ahead = queued.filter((j) => j.createdAt < createdAt).length;
    const oldest = queued.reduce((min, j) => Math.min(min, Date.parse(j.createdAt)), now);
    return { ahead, oldestQueuedMs: Math.max(0, now - oldest) };
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

  async schedules(owner: string | null) {
    return this.data.schedules.filter((x) => x.owner === owner).map((x) => ({ ...x }));
  }
  addSchedule(schedule: Schedule) {
    return this.write(() => { this.data.schedules.push({ ...schedule }); });
  }
  removeSchedule(id: string, owner: string | null) {
    return this.write(() => {
      const before = this.data.schedules.length;
      this.data.schedules = this.data.schedules.filter((x) => !(x.id === id && x.owner === owner));
      return this.data.schedules.length < before;
    });
  }
  claimDueSchedules(limit: number) {
    return this.write(() => {
      const now = Date.now();
      const due = this.data.schedules
        .filter((x) => x.authorized && (!x.lastRunAt || now - Date.parse(x.lastRunAt) >= x.intervalMs))
        .sort((a, b) => (a.lastRunAt ?? "").localeCompare(b.lastRunAt ?? ""))
        .slice(0, limit);
      const stamp = new Date(now).toISOString();
      for (const x of due) x.lastRunAt = stamp;
      return due.map((x) => ({ ...x }));
    });
  }

  async webhooks(owner: string | null) {
    return this.data.webhooks.filter((w) => w.owner === owner).map((w) => ({ ...w }));
  }
  addWebhook(owner: string | null, url: string) {
    return this.write(() => {
      const existing = this.data.webhooks.find((w) => w.owner === owner && w.url === url);
      if (existing) return { ...existing };
      const row: Webhook = { id: randomUUID(), owner, url, createdAt: new Date().toISOString() };
      this.data.webhooks.push(row);
      return { ...row };
    });
  }
  removeWebhook(owner: string | null, idOrUrl: string) {
    return this.write(() => {
      const gone = new Set(this.data.webhooks.filter((w) => w.owner === owner && (w.id === idOrUrl || w.url === idOrUrl)).map((w) => w.id));
      if (!gone.size) return false;
      this.data.webhooks = this.data.webhooks.filter((w) => !gone.has(w.id));
      // Matches the Postgres cascade: pending deliveries for a removed webhook go with it.
      this.data.deliveries = this.data.deliveries.filter((d) => !d.webhookId || !gone.has(d.webhookId));
      return true;
    });
  }
  claimDeliveries(workerId: string, leaseMs: number, limit: number) {
    return this.write(() => {
      const now = Date.now();
      if (Math.random() < 0.02) {
        const cutoff = now - 30 * 86_400_000;
        this.data.deliveries = this.data.deliveries.filter((d) => d.status === "pending" || !d.finishedAt || Date.parse(d.finishedAt) > cutoff);
      }
      const due = this.data.deliveries
        .filter((d) => d.status === "pending" && Date.parse(d.nextAt) <= now && (d.leaseUntil ?? 0) < now)
        .sort((a, b) => a.nextAt.localeCompare(b.nextAt))
        .slice(0, limit);
      for (const d of due) Object.assign(d, { lockedBy: workerId, leaseUntil: now + leaseMs, attempts: d.attempts + 1 });
      return due.map(stripDelivery);
    });
  }
  completeDelivery(id: string, workerId: string, outcome: Parameters<Store["completeDelivery"]>[2]) {
    return this.write(() => {
      const d = this.data.deliveries.find((x) => x.id === id && x.lockedBy === workerId);
      if (!d) return;
      const now = new Date().toISOString();
      if (outcome.ok) Object.assign(d, { status: "done", finishedAt: now, lockedBy: null, leaseUntil: null, lastError: null });
      else if (outcome.retryAt) Object.assign(d, { status: "pending", nextAt: outcome.retryAt.toISOString(), lastError: outcome.error, lockedBy: null, leaseUntil: null });
      else Object.assign(d, { status: "failed", finishedAt: now, lastError: outcome.error, lockedBy: null, leaseUntil: null });
    });
  }
  async deliveries(owner: string | null, limit: number) {
    return this.data.deliveries
      .filter((d) => d.owner === owner)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(stripDelivery);
  }

  async migrationStatus() {
    return null;
  }
  async leases() {
    return this.data.jobs
      .filter((j) => j.status === "running")
      .map((j) => ({ jobId: j.id, kind: j.kind, workerId: j.lockedBy ?? "", leaseUntil: j.leaseUntil ? new Date(j.leaseUntil).toISOString() : "", attempts: j.attempts }));
  }
  async agentUsage(windowMs: number) {
    const cutoff = Date.now() - windowMs;
    const by = new Map<string, { agent: string; total: number; succeeded: number; failed: number; active: number }>();
    for (const j of this.data.jobs) {
      const agent = j.input?.agent;
      if (j.kind !== "run" || typeof agent !== "string" || Date.parse(j.createdAt) <= cutoff) continue;
      const row = by.get(agent) ?? { agent, total: 0, succeeded: 0, failed: 0, active: 0 };
      row.total++;
      if (j.status === "succeeded") row.succeeded++;
      else if (j.status === "failed") row.failed++;
      else if (j.status === "queued" || j.status === "running") row.active++;
      by.set(agent, row);
    }
    return [...by.values()].sort((a, b) => b.total - a.total);
  }

  async ping() {}
  async close() {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    await this.chain;
    try { this.persistSync(); } catch { /* best effort */ }
    if (this.exitHandler) process.off("exit", this.exitHandler);
    if (this.sigintHandler) process.off("SIGINT", this.sigintHandler);
    if (this.sigtermHandler) process.off("SIGTERM", this.sigtermHandler);
    this.exitHandler = null;
    this.sigintHandler = null;
    this.sigtermHandler = null;
  }
}

function strip(j: Data["jobs"][number]): Job {
  const { idempotencyKey: _k, lockedBy: _l, leaseUntil: _u, ...job } = j;
  return { ...job };
}

function stripDelivery(d: Data["deliveries"][number]): WebhookDelivery {
  const { lockedBy: _l, leaseUntil: _u, finishedAt: _f, ...rest } = d;
  return { ...rest };
}

function newJobRow(job: NewJob): Data["jobs"][number] {
  return {
    id: randomUUID(),
    kind: job.kind,
    owner: job.owner,
    status: "queued",
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
}
