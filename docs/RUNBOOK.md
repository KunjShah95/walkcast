# Walkcast runbook (incident handling + capacity)

Production readiness gates live in `docs/SCALING.md` and `docs/SYSTEM-DESIGN.md`.
This file is the operating manual: what to turn on, what to read, and what to do at 3 AM.

## 1. Boot order (do not skip)

1. Database first. Apply `supabase/migrations/*` exactly once (Supabase CLI `db push` or
   `npm run lab -- db migrate`). Confirm `walkcast_migrations` has all entries.
2. **One** web instance with `LAB_WORKER=off` (the web service must never run Chromium).
3. **One** worker pair, `LAB_WORKER_KIND=record` and `LAB_WORKER_KIND=lab`, both with
   `LAB_WARM_BROWSER=1` and `SUPABASE_DB_URL` pointing at the same project.
4. Only after (3) is green, scale the web tier. Never scale workers below the number needed to
   drain queued jobs (see `queue.oldest_queued_ms`, every poll tick).

## 2. Environment variables that matter (worker/web)

| Variable | Web | Worker | Notes |
|---|---|---|---|
| `SUPABASE_DB_URL`/`DATABASE_URL` | required | required | PgStore is mandatory past one instance |
| `LAB_SECRET_KEY` | required | required | worker decrypts sealed credentials |
| `LAB_SITE_URL` | required | not needed | canonical origin for prerendered site |
| `LAB_WORKER` | `off` | absent | a web with this on runs Chromium in the API process |
| `LAB_WORKER_KIND` | – | `record` / `lab` | kind affinity for split fleets |
| `LAB_WORKER_MAX_POLL_MS` | 10000 (default) | 10000 | idle poll cap for fleets |
| `LAB_STATUS_TTL_MS` | 1500 | – | job-status poll memo |
| `LAB_ALLOW_LIVE_RUNS` | `0` default | keep `0` | avoids the model provider bill |
| `LAB_WARM_BROWSER` | – | `1` | saves 1–2 s per recording |
| `LAB_LOG` | `json` | `json` | `pretty` for local; `off` in tests |
| `LAB_PORT` | 4320 | – | |

## 3. Readiness

- `GET /healthz` → process answers, always 200.
- `GET /readyz` → DB reachable and not draining. **Use this as the load-balancer target**.
- `GET /api/metrics` → `queue.depth`, `queue.oldestQueuedMs`, per-kind duration p50/p95.
- Smoke command: `npm run doctor` (Node, env, browsers, ffmpeg+flite, repo dirty state). Exit
  code 0 only on a runnable machine (only fails if Node < 22).

## 4. Incident ladder

### a. Recordings never finish (jobs sit in `queued`)
- Check `readyz` → worker records `store: postgres`; a `file` store means workers can't share.
- Check worker logs for `job.started`. No `job.started` = worker never claimed → check
  `LAB_WORKER=off` on web and worker `driver` logs.
- If DB is read-only (Supabase pausing): web still serves (read-only friendly), workers abort at
  the `0.8 × leaseMs` margin and re-queue. In progress work loses at most lease/3 progress.
- Action: add one worker before touching anything else (FIFO + SKIP LOCKED keeps claims honest).

### b. Progress labels look frozen
- Confirm `LAB_STATUS_TTL_MS` isn't absurd (>5s). Lower it.
- Confirm `heartbeat()` still fires every `lease/3` (db std).
- Governor rule: label granularity is the heartbeat beat (20 s in the worst case), never the
  deep stages — this is deliberate (see SYSTEM-DESIGN.md §1).

### c. Latency grows, no jobs pending
- Check `claim` index: the `[partial]` index on `jobs (created_at) where status='queued'`
  exists and started_at on older-than-30-day finished jobs were pruned.
- The 2 s idle poll may have decayed: raise `maxPollMs`, or restart the worker.

### d. "Someone else's run used my key"
- **Alarm-grade.** The `withCredentials` AsyncLocalStorage scope regressed back to a
  `process.env` swap. Verify `src/jobs/worker.ts#labRun` uses `withCredentials`, and
  `test/credentials.test.ts` still passes. Do not deploy without it.

### e. Retry storm
- Check `RecordError` → `retry=false` discrimination survived in `worker.ts#execute`.
  A pure bad-input failure (broken URL) gives up on the first try; transient (timeout / OOM)
  retries with `attempts < max_attempts`.

### f. Job bloat / slow claims
- Prune manually: `delete from jobs where status in (...) and finished_at < now() - interval '30 days'`.
- Add the partial index if it was dropped.

## 5. Rollback (every change is reversible)

- Storage schema: `FileStore` <-> `PgStore` via env var, no migration to roll.
- Jobs: `enqueue`/`claim`/`finish` semantics are unchanged; reverting `worker.ts` only
  changes lifecycle (warm browser is optional via `LAB_WARM_BROWSER=0`).
- Provider feature flags default off — unset keys roll them back automatically.

## 6. Capacity decision table

See `docs/SCALING.md` §2 (foundational capacity math), §4 (fleet steps), and §9 (10k
simultaneous users). Roughly: one worker ≈ 50 jobs/day; web tier scales horizontally;
queue is Postgres until ~50k claims/s. Anything past that is an ops budget problem, not a code feature.
