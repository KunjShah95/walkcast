import postgres from "postgres";
import { migrationFiles } from "./migrations.ts";
import { jobCompletedPayload } from "./payload.ts";
import { DuplicateError, type Annotation, type Job, type JobKind, type NewJob, type RecordingRow, type Schedule, type Store, type User, type Webhook, type WebhookDelivery } from "./types.ts";

type Row = Record<string, unknown>;

/**
 * Postgres store, built for Supabase. Connect with the project's connection string
 * (SUPABASE_DB_URL / DATABASE_URL). Works through Supabase's pooler in transaction mode: no
 * prepared statements, no session state, every claim is a single statement.
 */
export class PgStore implements Store {
  readonly kind = "postgres" as const;
  readonly sql: postgres.Sql;

  /**
   * Read replica for the read-heavy, lag-tolerant queries (recordings library, metrics, usage).
   * Same pool as `sql` when no replica is configured. Anything that must read its own writes
   * (job status after submit, sessions, the queue itself) always goes to the primary.
   */
  readonly read: postgres.Sql;

  /** `schema` isolates one database between several apps or test runs (sets search_path). */
  constructor(url: string, options: { max?: number; schema?: string; readUrl?: string } = {}) {
    const connect = (u: string) => postgres(u, {
      max: options.max ?? 5,
      prepare: false, // required behind PgBouncer / Supavisor in transaction mode
      idle_timeout: 30,
      connect_timeout: 10,
      onnotice: () => undefined,
      // Supabase requires TLS; local Postgres usually has none.
      ssl: /localhost|127\.0\.0\.1|sslmode=disable/.test(u) ? false : "require",
      types: { bigint: postgres.BigInt },
      ...(options.schema ? { connection: { search_path: options.schema } } : {}),
    });
    this.sql = connect(url);
    this.read = options.readUrl && options.readUrl !== url ? connect(options.readUrl) : this.sql;
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

  async insertFailed(job: Pick<NewJob, "kind" | "owner" | "input">, error: string) {
    const [r] = await this.sql`
      insert into jobs (kind, owner, input, status, error, attempts, finished_at)
      values (${job.kind}, ${job.owner}, ${this.sql.json(job.input as postgres.JSONValue)}, 'failed', ${error}, 0, now())
      returning *`;
    return toJob(r!);
  }

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

  async enqueueLimited(job: NewJob, maxActive: number) {
    // A single insert-if-count-below statement is not enough: under READ COMMITTED, concurrent
    // statements each count from a snapshot without the others' uncommitted rows, so all of them
    // pass. A transaction-scoped advisory lock per owner serializes the count and the insert across
    // every connection and instance; the next submit counts only after this one has committed.
    const [inserted] = await this.sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext(${`jobs:${job.owner ?? ""}`}))`;
      return tx`
        insert into jobs (kind, owner, input, secret, idempotency_key, max_attempts)
        select ${job.kind}, ${job.owner}, ${tx.json(job.input as postgres.JSONValue)}, ${job.secret ?? null}, ${job.idempotencyKey ?? null}, ${job.maxAttempts ?? 2}
        where (select count(*)::int from jobs j
               where j.owner is not distinct from ${job.owner} and j.status in ('queued', 'running')) < ${maxActive}
        on conflict (owner, idempotency_key) where idempotency_key is not null do nothing
        returning *`;
    });
    if (inserted) return toJob(inserted);
    // No row: either the owner was at the limit, or an idempotent resubmit hit the conflict.
    if (job.idempotencyKey) {
      const existing = await this.jobByKey(job.owner, job.idempotencyKey);
      if (existing) return existing;
    }
    return null;
  }

  async claim(workerId: string, leaseMs: number, kind?: JobKind) {
    // Retirement sweep on expired, exhausted jobs (lease machinery, same statement family).
    await this.sql`
      update jobs set status = 'failed', error = 'The worker stopped responding too many times.', secret = null, finished_at = now(), locked_by = null, lease_until = null
      where status = 'running' and lease_until < now() and attempts >= max_attempts`;
    const [r] = await this.sql`
      update jobs set status = 'running', locked_by = ${workerId}, attempts = attempts + 1, started_at = now(),
        finished_at = null, error = null,
        lease_until = now() + (${leaseMs} * interval '1 millisecond')
      where id = (
        select id from jobs
        where status = 'queued' or (status = 'running' and lease_until < now())
        order by
          case when ${kind ?? null}::text is not null and status = 'queued' and kind <> ${kind ?? null} then 1 else 0 end,
          created_at
        for update skip locked
        limit 1
      )
      returning *`;
    if (Math.random() < 0.02) {
      await this.sql`delete from jobs where status in ('succeeded', 'failed', 'cancelled') and finished_at < now() - interval '30 days'`.catch(() => undefined);
    }
    return r ? toJob(r) : null;
  }

  async heartbeat(jobId: string, workerId: string, leaseMs: number) {
    const rows = await this.sql`
      update jobs set lease_until = now() + (${leaseMs} * interval '1 millisecond')
      where id = ${jobId} and locked_by = ${workerId} and status = 'running'
      returning id`;
    return rows.length === 1;
  }

  async setProgress(jobId: string, workerId: string, progress: string) {
    // Fenced like every other transition: only the worker the store currently believes owns the
    // job can move the label, so a zombie finishing after its lease was stolen stays invisible.
    await this.sql`
      update jobs set progress = ${progress}
      where id = ${jobId} and locked_by = ${workerId} and status = 'running'`;
  }

  async finish(jobId: string, workerId: string, outcome: Parameters<Store["finish"]>[2]) {
    // The transition and its outbox rows commit together: a delivery exists if and only if the
    // job really reached a terminal state (a fenced-out zombie writes neither).
    await this.sql.begin(async (tx) => {
      const [r] = outcome.status === "succeeded"
        ? await tx`update jobs set status = 'succeeded', result = ${tx.json(outcome.result as postgres.JSONValue)}, secret = null, finished_at = now(), locked_by = null, lease_until = null
            where id = ${jobId} and locked_by = ${workerId}
            returning *`
        : await tx`
            update jobs set
              status = case when ${outcome.retry} and attempts < max_attempts then 'queued' else 'failed' end,
              secret = case when ${outcome.retry} and attempts < max_attempts then secret else null end,
              finished_at = case when ${outcome.retry} and attempts < max_attempts then null else now() end,
              error = ${outcome.error}, locked_by = null, lease_until = null
            where id = ${jobId} and locked_by = ${workerId}
            returning *`;
      if (!r || (r.status !== "succeeded" && r.status !== "failed")) return;
      const payload = jobCompletedPayload(toJob(r));
      await tx`
        insert into webhook_deliveries (webhook_id, owner, url, event, payload)
        select id, owner, url, 'job.completed', ${tx.json(payload as postgres.JSONValue)}
        from webhooks where owner is not distinct from ${(r.owner as string | null) ?? null}`;
    });
  }

  async cancel(jobId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) return null;
    const [r] = await this.sql`
      update jobs set status = 'cancelled', secret = null, finished_at = now(), locked_by = null, lease_until = null
      where id = ${jobId} and status in ('queued', 'running')
      returning *`;
    return r ? toJob(r) : null;
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
  async failedJobs(owner: string | null, kind: JobKind, limit: number) {
    const rows = owner === null
      ? await this.read`select * from jobs where kind = ${kind} and status = 'failed' order by finished_at desc nulls last limit ${limit}`
      : await this.read`select * from jobs where kind = ${kind} and status = 'failed' and owner = ${owner} order by finished_at desc nulls last limit ${limit}`;
    return rows.map(toJob);
  }
  async activeJobs(owner: string | null) {
    const [r] = await this.sql`select count(*)::int as n from jobs where owner is not distinct from ${owner} and status in ('queued', 'running')`;
    return Number(r!.n);
  }
  async queueDepth() {
    return (await this.queueStats()).depth;
  }

  async queueStats() {
    const [r] = await this.sql`
      select
        (select count(*)::int from jobs where status = 'queued') as depth,
        coalesce((select extract(epoch from (now() - min(created_at))) from jobs where status = 'queued'), 0) as oldest_s`;
    return { depth: Number(r!.depth), oldestQueuedMs: Math.max(0, Math.round(Number(r!.oldest_s) * 1000)) };
  }

  async metrics(windowMs = 86_400_000) {
    const qs = await this.queueStats();
    const rows = await this.read`
      select kind,
        count(*)::int as n,
        coalesce(percentile_cont(0.5) within group (order by extract(epoch from (finished_at - started_at)) * 1000), 0) as p50,
        coalesce(percentile_cont(0.95) within group (order by extract(epoch from (finished_at - started_at)) * 1000), 0) as p95
      from jobs
      where status in ('succeeded', 'failed')
        and started_at is not null and finished_at is not null
        and finished_at > now() - (${windowMs} * interval '1 millisecond')
      group by kind
      order by kind`;
    const finished = rows.map((r) => ({
      kind: r.kind as JobKind,
      count: Number(r.n),
      p50Ms: Math.round(Number(r.p50)),
      p95Ms: Math.round(Number(r.p95)),
    }));
    return { windowMs, queue: qs, finished };
  }
  async queuePosition(createdAt: string) {
    // One round trip for both numbers. `created_at < $1` is the same ordering claim() uses, so the
    // count is exactly the jobs taken first; the oldest wait is the scale-out signal.
    const [r] = await this.sql`
      select
        (select count(*)::int from jobs where status = 'queued' and created_at < ${createdAt}::timestamptz) as ahead,
        coalesce((select extract(epoch from (now() - min(created_at))) from jobs where status = 'queued'), 0) as oldest_s`;
    return { ahead: Number(r!.ahead), oldestQueuedMs: Math.max(0, Math.round(Number(r!.oldest_s) * 1000)) };
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
      ? await this.read`select * from recordings order by created_at desc limit ${limit}`
      : await this.read`select * from recordings where owner = ${owner} order by created_at desc limit ${limit}`;
    return rows.map(toRecording);
  }
  async recording(id: string) {
    const [r] = await this.sql`select * from recordings where id = ${id}`;
    return r ? toRecording(r) : null;
  }
  async deleteRecording(id: string) {
    await this.sql`delete from recordings where id = ${id}`;
  }

  // ---------------------------------------------------------------- annotations

  async annotations(recordingId: string, owner: string | null) {
    // The primary, not the read replica: a note written a moment ago must be there when its
    // owner looks for it again.
    const rows = await this.sql`
      select * from annotations
      where recording_id = ${recordingId} and owner is not distinct from ${owner}
      order by at_seconds, created_at`;
    return rows.map(toAnnotation);
  }
  async addAnnotation(a: Annotation) {
    await this.sql`
      insert into annotations (id, recording_id, owner, at_seconds, text, created_at)
      values (${a.id}, ${a.recordingId}, ${a.owner}, ${a.at}, ${a.text}, ${a.createdAt})`;
  }
  async removeAnnotation(id: string, owner: string | null) {
    if (!UUID.test(id)) return false;
    const rows = await this.sql`delete from annotations where id = ${id} and owner is not distinct from ${owner} returning id`;
    return rows.length > 0;
  }

  // ---------------------------------------------------------------- schedules

  async schedules(owner: string | null) {
    const rows = await this.sql`select * from schedules where owner is not distinct from ${owner} order by created_at`;
    return rows.map(toSchedule);
  }
  async addSchedule(sch: Schedule) {
    await this.sql`insert into schedules (id, owner, url, spec, interval_ms, authorized, created_at, last_run_at)
      values (${sch.id}, ${sch.owner}, ${sch.url}, ${sch.interval}, ${sch.intervalMs}, ${sch.authorized}, ${sch.createdAt}, ${sch.lastRunAt})`;
  }
  async removeSchedule(id: string, owner: string | null) {
    if (!UUID.test(id)) return false;
    const rows = await this.sql`delete from schedules where id = ${id} and owner is not distinct from ${owner} returning id`;
    return rows.length > 0;
  }
  async claimDueSchedules(limit: number) {
    // One statement: the row lock taken by the inner select makes a concurrent claimer skip the
    // row, so every due schedule is stamped (and therefore enqueued) by exactly one instance.
    const rows = await this.sql`
      update schedules set last_run_at = now()
      where id in (
        select id from schedules
        where authorized and (last_run_at is null or last_run_at <= now() - (interval_ms * interval '1 millisecond'))
        order by last_run_at nulls first
        for update skip locked
        limit ${limit}
      )
      returning *`;
    return rows.map(toSchedule);
  }

  // ---------------------------------------------------------------- webhooks + outbox

  async webhooks(owner: string | null) {
    const rows = await this.sql`select * from webhooks where owner is not distinct from ${owner} order by created_at`;
    return rows.map(toWebhook);
  }
  async addWebhook(owner: string | null, url: string) {
    const [inserted] = await this.sql`insert into webhooks (owner, url) values (${owner}, ${url})
      on conflict (owner, url) do nothing returning *`;
    if (inserted) return toWebhook(inserted);
    const [existing] = await this.sql`select * from webhooks where owner is not distinct from ${owner} and url = ${url}`;
    return toWebhook(existing!);
  }
  async removeWebhook(owner: string | null, idOrUrl: string) {
    const rows = UUID.test(idOrUrl)
      ? await this.sql`delete from webhooks where owner is not distinct from ${owner} and (id = ${idOrUrl} or url = ${idOrUrl}) returning id`
      : await this.sql`delete from webhooks where owner is not distinct from ${owner} and url = ${idOrUrl} returning id`;
    return rows.length > 0;
  }
  async claimDeliveries(workerId: string, leaseMs: number, limit: number) {
    const rows = await this.sql`
      update webhook_deliveries set locked_by = ${workerId}, attempts = attempts + 1,
        lease_until = now() + (${leaseMs} * interval '1 millisecond')
      where id in (
        select id from webhook_deliveries
        where status = 'pending' and next_at <= now() and (lease_until is null or lease_until < now())
        order by next_at
        for update skip locked
        limit ${limit}
      )
      returning *`;
    if (Math.random() < 0.02) {
      await this.sql`delete from webhook_deliveries where status in ('done', 'failed') and finished_at < now() - interval '30 days'`.catch(() => undefined);
    }
    return rows.map(toDelivery);
  }
  async completeDelivery(id: string, workerId: string, outcome: Parameters<Store["completeDelivery"]>[2]) {
    if (outcome.ok) {
      await this.sql`update webhook_deliveries set status = 'done', finished_at = now(), locked_by = null, lease_until = null, last_error = null
        where id = ${id} and locked_by = ${workerId}`;
      return;
    }
    const retryAt = outcome.retryAt;
    await this.sql`update webhook_deliveries set
        status = ${retryAt ? "pending" : "failed"},
        next_at = ${retryAt ?? new Date()},
        finished_at = ${retryAt ? null : new Date()},
        last_error = ${outcome.error}, locked_by = null, lease_until = null
      where id = ${id} and locked_by = ${workerId}`;
  }
  async deliveries(owner: string | null, limit: number) {
    const rows = await this.read`select * from webhook_deliveries where owner is not distinct from ${owner} order by created_at desc limit ${limit}`;
    return rows.map(toDelivery);
  }

  // ---------------------------------------------------------------- ops

  async migrationStatus() {
    const [t] = await this.sql`select to_regclass('walkcast_migrations')::text as t`;
    const applied = t?.t ? (await this.sql`select name from walkcast_migrations order by name`).map((r) => String(r.name)) : [];
    const done = new Set(applied);
    return { applied, pending: migrationFiles().filter((f) => !done.has(f)) };
  }
  async leases() {
    const rows = await this.sql`select id, kind, locked_by, lease_until, attempts from jobs where status = 'running' order by lease_until`;
    return rows.map((r) => ({ jobId: String(r.id), kind: r.kind as JobKind, workerId: String(r.locked_by ?? ""), leaseUntil: iso(r.lease_until) ?? "", attempts: Number(r.attempts) }));
  }
  async agentUsage(windowMs: number) {
    const rows = await this.read`
      select input->>'agent' as agent,
        count(*)::int as total,
        count(*) filter (where status = 'succeeded')::int as succeeded,
        count(*) filter (where status = 'failed')::int as failed,
        count(*) filter (where status in ('queued', 'running'))::int as active
      from jobs
      where kind = 'run' and input ? 'agent' and created_at > now() - (${windowMs} * interval '1 millisecond')
      group by 1 order by 2 desc`;
    return rows.map((r) => ({ agent: String(r.agent), total: Number(r.total), succeeded: Number(r.succeeded), failed: Number(r.failed), active: Number(r.active) }));
  }

  async ping() {
    await this.sql`select 1`;
  }
  async flush() {
    // Writes commit synchronously in Postgres; nothing to flush.
  }
  async close() {
    if (this.read !== this.sql) await this.read.end({ timeout: 5 });
    await this.sql.end({ timeout: 5 });
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

function toSchedule(r: Row): Schedule {
  return {
    id: String(r.id),
    owner: (r.owner as string | null) ?? null,
    url: String(r.url),
    interval: String(r.spec),
    intervalMs: Number(r.interval_ms),
    authorized: Boolean(r.authorized),
    createdAt: iso(r.created_at)!,
    lastRunAt: iso(r.last_run_at),
  };
}

function toWebhook(r: Row): Webhook {
  return { id: String(r.id), owner: (r.owner as string | null) ?? null, url: String(r.url), createdAt: iso(r.created_at)! };
}

function toDelivery(r: Row): WebhookDelivery {
  return {
    id: String(r.id),
    webhookId: r.webhook_id == null ? null : String(r.webhook_id),
    owner: (r.owner as string | null) ?? null,
    url: String(r.url),
    event: String(r.event),
    payload: r.payload as Record<string, unknown>,
    status: r.status as WebhookDelivery["status"],
    attempts: Number(r.attempts),
    nextAt: iso(r.next_at)!,
    lastError: (r.last_error as string | null) ?? null,
    createdAt: iso(r.created_at)!,
  };
}

function toRecording(r: Row): RecordingRow {
  return { id: String(r.id), owner: (r.owner as string | null) ?? null, url: String(r.url), createdAt: iso(r.created_at)!, summary: r.summary as Record<string, unknown> };
}

function toAnnotation(r: Row): Annotation {
  return {
    id: String(r.id),
    recordingId: String(r.recording_id),
    owner: (r.owner as string | null) ?? null,
    at: Number(r.at_seconds),
    text: String(r.text),
    createdAt: iso(r.created_at)!,
  };
}
