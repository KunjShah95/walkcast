import postgres from "postgres";
import { DuplicateError, type Job, type NewJob, type RecordingRow, type Store, type User } from "./types.ts";

type Row = Record<string, unknown>;

/**
 * Postgres store, built for Supabase. Connect with the project's connection string
 * (SUPABASE_DB_URL / DATABASE_URL). Works through Supabase's pooler in transaction mode: no
 * prepared statements, no session state, every claim is a single statement.
 */
export class PgStore implements Store {
  readonly kind = "postgres" as const;
  readonly sql: postgres.Sql;

  /** `schema` isolates one database between several apps or test runs (sets search_path). */
  constructor(url: string, options: { max?: number; schema?: string } = {}) {
    this.sql = postgres(url, {
      max: options.max ?? 5,
      prepare: false, // required behind PgBouncer / Supavisor in transaction mode
      idle_timeout: 30,
      connect_timeout: 10,
      onnotice: () => undefined,
      // Supabase requires TLS; local Postgres usually has none.
      ssl: /localhost|127\.0\.0\.1|sslmode=disable/.test(url) ? false : "require",
      types: { bigint: postgres.BigInt },
      ...(options.schema ? { connection: { search_path: options.schema } } : {}),
    });
  }

  // ---------------------------------------------------------------- accounts

  async userByEmail(email: string) {
    const [r] = await this.sql`select * from users where lower(email) = lower(${email})`;
    return r ? toUser(r) : null;
  }
  async userById(id: string) {
    const [r] = await this.sql`select * from users where id = ${id}`;
    return r ? toUser(r) : null;
  }
  async userByGoogle(sub: string) {
    const [r] = await this.sql`select * from users where google_sub = ${sub}`;
    return r ? toUser(r) : null;
  }
  async userByAuthId(authId: string) {
    const [r] = await this.sql`select * from users where auth_id = ${authId}`;
    return r ? toUser(r) : null;
  }
  async insertUser(u: User) {
    try {
      await this.sql`insert into users (id, email, name, password_hash, google_sub, auth_id, openrouter_key, chatgpt, created_at)
        values (${u.id}, ${u.email}, ${u.name ?? null}, ${u.password ?? null}, ${u.google ?? null}, ${u.authId ?? null}, ${u.openrouterKey ?? null}, ${u.chatgpt ? this.sql.json(u.chatgpt as postgres.JSONValue) : null}, ${u.createdAt})`;
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw new DuplicateError("email taken");
      throw e;
    }
  }
  async updateUser(u: User) {
    await this.sql`update users set email = ${u.email}, name = ${u.name ?? null}, password_hash = ${u.password ?? null}, google_sub = ${u.google ?? null},
      auth_id = ${u.authId ?? null}, openrouter_key = ${u.openrouterKey ?? null}, chatgpt = ${u.chatgpt ? this.sql.json(u.chatgpt as postgres.JSONValue) : null} where id = ${u.id}`;
  }

  // ---------------------------------------------------------------- sessions

  async createSession(tokenHash: string, userId: string, expiresAt: Date) {
    await this.sql`insert into sessions (token_hash, user_id, expires_at) values (${tokenHash}, ${userId}, ${expiresAt})`;
    // Opportunistic cleanup keeps the table small without a cron job.
    if (Math.random() < 0.02) await this.sql`delete from sessions where expires_at < now()`;
  }
  async sessionUser(tokenHash: string) {
    const [r] = await this.sql`select u.* from sessions s join users u on u.id = s.user_id where s.token_hash = ${tokenHash} and s.expires_at > now()`;
    return r ? toUser(r) : null;
  }
  async deleteSession(tokenHash: string) {
    await this.sql`delete from sessions where token_hash = ${tokenHash}`;
  }
  async deleteUserSessions(userId: string) {
    await this.sql`delete from sessions where user_id = ${userId}`;
  }

  // ---------------------------------------------------------------- rate limits

  async hit(key: string, windowMs: number) {
    // One atomic upsert: a new window resets the count, otherwise it increments.
    const [r] = await this.sql`
      insert into rate_limits (key, window_start, count) values (${key}, now(), 1)
      on conflict (key) do update set
        count = case when rate_limits.window_start < now() - (${windowMs} * interval '1 millisecond') then 1 else rate_limits.count + 1 end,
        window_start = case when rate_limits.window_start < now() - (${windowMs} * interval '1 millisecond') then now() else rate_limits.window_start end
      returning count`;
    return Number(r!.count);
  }

  // ---------------------------------------------------------------- jobs

  async enqueue(job: NewJob) {
    const [inserted] = await this.sql`
      insert into jobs (kind, owner, input, secret, idempotency_key, max_attempts)
      values (${job.kind}, ${job.owner}, ${this.sql.json(job.input as postgres.JSONValue)}, ${job.secret ?? null}, ${job.idempotencyKey ?? null}, ${job.maxAttempts ?? 2})
      on conflict (owner, idempotency_key) where idempotency_key is not null do nothing
      returning *`;
    if (inserted) return toJob(inserted);
    const [existing] = await this.sql`select * from jobs where owner is not distinct from ${job.owner} and idempotency_key = ${job.idempotencyKey ?? null}`;
    return toJob(existing!);
  }

  async claim(workerId: string, leaseMs: number) {
    // Jobs whose worker vanished (lease expired) and that are out of attempts fail for good.
    await this.sql`
      update jobs set status = 'failed', error = 'The worker stopped responding too many times.', secret = null, finished_at = now(), locked_by = null, lease_until = null
      where status = 'running' and lease_until < now() and attempts >= max_attempts`;
    const [r] = await this.sql`
      update jobs set status = 'running', locked_by = ${workerId}, attempts = attempts + 1, started_at = now(),
        lease_until = now() + (${leaseMs} * interval '1 millisecond')
      where id = (
        select id from jobs
        where status = 'queued' or (status = 'running' and lease_until < now())
        order by created_at
        for update skip locked
        limit 1
      )
      returning *`;
    return r ? toJob(r) : null;
  }

  async heartbeat(jobId: string, workerId: string, leaseMs: number, progress?: string) {
    const rows = await this.sql`
      update jobs set lease_until = now() + (${leaseMs} * interval '1 millisecond'), progress = coalesce(${progress ?? null}, progress)
      where id = ${jobId} and locked_by = ${workerId} and status = 'running'
      returning id`;
    return rows.length === 1;
  }

  async finish(jobId: string, workerId: string, outcome: Parameters<Store["finish"]>[2]) {
    if (outcome.status === "succeeded") {
      await this.sql`update jobs set status = 'succeeded', result = ${this.sql.json(outcome.result as postgres.JSONValue)}, secret = null, finished_at = now(), locked_by = null, lease_until = null
        where id = ${jobId} and locked_by = ${workerId}`;
      return;
    }
    await this.sql`
      update jobs set
        status = case when ${outcome.retry} and attempts < max_attempts then 'queued' else 'failed' end,
        secret = case when ${outcome.retry} and attempts < max_attempts then secret else null end,
        finished_at = case when ${outcome.retry} and attempts < max_attempts then null else now() end,
        error = ${outcome.error}, locked_by = null, lease_until = null
      where id = ${jobId} and locked_by = ${workerId}`;
  }

  async release(jobId: string, workerId: string) {
    await this.sql`update jobs set status = 'queued', attempts = greatest(attempts - 1, 0), locked_by = null, lease_until = null
      where id = ${jobId} and locked_by = ${workerId} and status = 'running'`;
  }

  async job(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [r] = await this.sql`select * from jobs where id = ${id}`;
    return r ? toJob(r) : null;
  }
  async jobByKey(owner: string | null, idempotencyKey: string) {
    const [r] = await this.sql`select * from jobs where owner is not distinct from ${owner} and idempotency_key = ${idempotencyKey}`;
    return r ? toJob(r) : null;
  }
  async activeJobs(owner: string | null) {
    const [r] = await this.sql`select count(*)::int as n from jobs where owner is not distinct from ${owner} and status in ('queued', 'running')`;
    return Number(r!.n);
  }
  async queueDepth() {
    const [r] = await this.sql`select count(*)::int as n from jobs where status = 'queued'`;
    return Number(r!.n);
  }

  // ---------------------------------------------------------------- recordings

  async saveRecording(row: RecordingRow) {
    await this.sql`
      insert into recordings (id, owner, url, created_at, summary)
      values (${row.id}, ${row.owner}, ${row.url}, ${row.createdAt}, ${this.sql.json(row.summary as postgres.JSONValue)})
      on conflict (id) do update set summary = excluded.summary`;
  }
  async recordings(owner: string | null, limit: number) {
    const rows = owner === null
      ? await this.sql`select * from recordings order by created_at desc limit ${limit}`
      : await this.sql`select * from recordings where owner = ${owner} order by created_at desc limit ${limit}`;
    return rows.map(toRecording);
  }
  async recording(id: string) {
    const [r] = await this.sql`select * from recordings where id = ${id}`;
    return r ? toRecording(r) : null;
  }

  async ping() {
    await this.sql`select 1`;
  }
  async close() {
    await this.sql.end({ timeout: 5 });
  }
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));

function toUser(r: Row): User {
  return {
    id: String(r.id),
    email: String(r.email),
    ...(r.name ? { name: String(r.name) } : {}),
    ...(r.password_hash ? { password: String(r.password_hash) } : {}),
    ...(r.google_sub ? { google: String(r.google_sub) } : {}),
    ...(r.auth_id ? { authId: String(r.auth_id) } : {}),
    ...(r.openrouter_key ? { openrouterKey: String(r.openrouter_key) } : {}),
    ...(r.chatgpt ? { chatgpt: r.chatgpt as User["chatgpt"] } : {}),
    createdAt: iso(r.created_at)!,
  };
}

function toJob(r: Row): Job {
  return {
    id: String(r.id),
    kind: r.kind as Job["kind"],
    owner: (r.owner as string | null) ?? null,
    status: r.status as Job["status"],
    input: r.input as Record<string, unknown>,
    secret: (r.secret as string | null) ?? null,
    result: (r.result as Record<string, unknown> | null) ?? null,
    error: (r.error as string | null) ?? null,
    progress: (r.progress as string | null) ?? null,
    attempts: Number(r.attempts),
    maxAttempts: Number(r.max_attempts),
    createdAt: iso(r.created_at)!,
    startedAt: iso(r.started_at),
    finishedAt: iso(r.finished_at),
  };
}

function toRecording(r: Row): RecordingRow {
  return { id: String(r.id), owner: (r.owner as string | null) ?? null, url: String(r.url), createdAt: iso(r.created_at)!, summary: r.summary as Record<string, unknown> };
}
