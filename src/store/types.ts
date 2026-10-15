/**
 * Everything the web app and workers keep between requests: accounts, sessions, rate-limit
 * counters, the job queue and the recordings index. Two implementations:
 *
 * - FileStore (default): one JSON file under .lab/, for a single process on one machine.
 * - PgStore: Postgres, e.g. Supabase (SUPABASE_DB_URL / DATABASE_URL). Required as soon as there is
 *   more than one web instance or a separate worker, because all of this state must be shared.
 */
export interface User {
  id: string;
  email: string;
  name?: string;
  /** scrypt$N$salt$hash, absent for Google-only accounts. */
  password?: string;
  google?: string;
  /** Supabase Auth user id (auth.users.id) when Supabase handles sign-in. */
  authId?: string;
  createdAt: string;
}

export type JobKind = "record" | "run";
export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface Job {
  id: string;
  kind: JobKind;
  owner: string | null;
  status: JobStatus;
  input: Record<string, unknown>;
  /** Sealed credentials (see secret-box.ts); only workers can open them, cleared when the job ends. */
  secret: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  progress: string | null;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface NewJob {
  kind: JobKind;
  owner: string | null;
  input: Record<string, unknown>;
  secret?: string | null;
  idempotencyKey?: string | null;
  maxAttempts?: number;
}

/** A recording's index row; `summary` is the RecordingSummary the dashboard shows. */
export interface RecordingRow {
  id: string;
  owner: string | null;
  url: string;
  createdAt: string;
  summary: Record<string, unknown>;
}

export interface Store {
  readonly kind: "file" | "postgres";

  // accounts
  userByEmail(email: string): Promise<User | null>;
  userById(id: string): Promise<User | null>;
  userByGoogle(sub: string): Promise<User | null>;
  userByAuthId(authId: string): Promise<User | null>;
  /** Throws DuplicateError when the email is taken (unique index; no check-then-insert race). */
  insertUser(user: User): Promise<void>;
  updateUser(user: User): Promise<void>;

  // sessions (only the token's hash is stored)
  createSession(tokenHash: string, userId: string, expiresAt: Date): Promise<void>;
  sessionUser(tokenHash: string): Promise<User | null>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;

  /** Fixed-window counter shared by every instance: returns the count including this hit. */
  hit(key: string, windowMs: number): Promise<number>;

  // job queue
  /** Returns the existing job when (owner, idempotencyKey) was already submitted. */
  enqueue(job: NewJob): Promise<Job>;
  /**
   * Claim the oldest queued job (or one whose worker's lease ran out) for `workerId`. Postgres uses
   * FOR UPDATE SKIP LOCKED so any number of workers can poll without taking the same job.
   */
  claim(workerId: string, leaseMs: number): Promise<Job | null>;
  /** Extend the lease while the job runs; false if the job is no longer this worker's. */
  heartbeat(jobId: string, workerId: string, leaseMs: number, progress?: string): Promise<boolean>;
  finish(jobId: string, workerId: string, outcome: { status: "succeeded"; result: Record<string, unknown> } | { status: "failed"; error: string; retry: boolean }): Promise<void>;
  /** Hand a job back to the queue (graceful shutdown) without counting an attempt. */
  release(jobId: string, workerId: string): Promise<void>;
  job(id: string): Promise<Job | null>;
  /** The job an owner already submitted with this idempotency key, if any. */
  jobByKey(owner: string | null, idempotencyKey: string): Promise<Job | null>;
  /** Jobs that are queued or running for an owner (for per-user concurrency limits). */
  activeJobs(owner: string | null): Promise<number>;
  queueDepth(): Promise<number>;

  // recordings index
  saveRecording(row: RecordingRow): Promise<void>;
  recordings(owner: string | null, limit: number): Promise<RecordingRow[]>;
  recording(id: string): Promise<RecordingRow | null>;

  /** Cheap round trip for readiness checks. */
  ping(): Promise<void>;
  close(): Promise<void>;
}

export class DuplicateError extends Error {}
