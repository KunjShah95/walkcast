# Scaling Walkcast

How this system scales, in the order you should attack it. Hard rule first: **the browser is the
product, so CPUs are the unit of work.** Nothing else here is a bottleneck worth engineering
around until you are pushing thousands of jobs a day — and by then, only two things matter:
keep the queue honest, and keep adding boring workers.

Piyush-style pruning applied: monolith-first, bottleneck-first with capacity math, scale reads
before writes, one thing at a time, no premature microservices.

---

## 1. What already scales (do not touch it)

The current design already made the right calls. Each of these is load-bearing; a re-architecture
that loses any of them is a regression:

| Decision | Where | Why it holds under load |
| --- | --- | --- |
| One `Store` interface, two backends | `src/store/` | `FileStore` for local, `PgStore` for shared. Scaling = flip an env var, not a rewrite. |
| Postgres as the queue, `FOR UPDATE SKIP LOCKED` claims | `src/store/pg-store.ts` | The classic pattern. Exactly-once claims, zero new infra (no Redis, no SQS divergence), and the same connection carries app state. Postgres queues handle tens of thousands of jobs/day comfortably. |
| Lease + heartbeat + hard deadline + 2 attempts | `jobs/worker.ts`, `claim()` in `pg-store.ts` | A worker that dies mid-job (OOM on Chromium, node reboot) hands the job back automatically. No babysitting. |
| Stateless web tier | `src/ui/server.ts`, `src/deploy/vercel-function.ts` | Sessions in Postgres (hashes only), media in object storage. Any number of web instances behind an ALB — the mark of a monolith done right. |
| Media off the web tier | `src/media/` | Big MP4s go to Supabase Storage/S3; serving happens via 15-minute presigned links. The web tier never ships a video. |
| Per-tenant limits at enqueue time | `/api/record`, `/api/run` | 1 active job, 20 recordings/day, 100 runs/day — enforced atomically server-side. One noisy tenant cannot flood the queue, which is why FIFO claiming stays fair. |
| Idempotency keys | `jobs.enqueue` | A double-click is one job, not two. Without this, every retry storm doubles your browser bill. |
| Static marketing as documents | `src/site/prerender.ts` | Public pages are files; the CDN serves them "at scale" for free. No request ever renders a marketing page. |
| Secrets sealed per job, erased at end | `src/jobs/secret-box.ts` | Tenant credentials never outlive the job. |

So the honest summary of "how would you scale this from zero to thousands of jobs a day":

```
Web tier (stateless, any N)  ──▶  Postgres (store + queue)  ──▶  Browser workers (scale on queue depth)
        ▲                                │                              │
 marketing on CDN, free                  └── media ──▶ S3/Supabase ◀────┘
```

Everything below is about the right edge of that picture — and keeping the middle honest.

## 2. Capacity math (the part most people skip)

One web instance costs ~100 MB. One browser worker is an order of magnitude heavier:

| Component | Worst case per job | Notes |
| --- | --- | --- |
| Chromium (Playwright) | ~500 MB–1 GB RSS | The recorder walks ≤30 pages with screenshots; lab runs add Stagehand + Chrome for Testing as a second head. |
| ffmpeg encode (H.264 + AAC mix) | ~1 CPU core for minutes | H.264 of a multi-minute screencast is the CPU spike in every `record` job. flite narration is cheap. |
| LLM loop (lab jobs) | network-bound but long | Live model runs can consume the whole 6-min deadline; Stagehand resolution doubles model calls. |

From real running: a lab run is ~30 s; a recording of a small site is ~1–3 min. Budget **~2 min
average nominal, ~4 min at p95** — deadlines cap a job at 6 min either way.

Per worker, then:

```
2024m·4 work hours/day sustained worst case:  ~45 jobs/day (accounting for p95 tail & restarts)
2-min nominal during peek bursts:            ~60–70 jobs/day
```

So: **one worker ≈ 50 jobs/day.** The math is directly on the queue:

- 10 recording users × 20/day = 200 jobs/day → 3–4 workers.
- 100 makers → 2,000/day → 40 workers (achieved at ~4–6 GB/worker if collocated; cheaper: modern
  VM with browsers sharing a warm instance — see §4).
- Supabase Postgres at the center of it all must not be forced into a compute role — that's why
  the worker backoff below matters.

The asymmetric math is the point: **queue depth grows with adoption; worker count is a dial, and
each unit is a fork()** — this is why the architecture was a queue from day one.

## 3. What this change does today (S1)

Two cheap changes landed with this document (§ `docs/SCALING.md` commit):

1. **Adaptive poll with jitter** (`src/jobs/worker.ts`). Before: every idle worker hit
   `claim()` every 2 s — a 40-worker fleet was 4,800 claim queries/day even with zero work.
   Now: back off 2s→4s→…→10s cap (`LAB_WORKER_MAX_POLL_MS`), and jitter ±10 % so a wake burst
   doesn't make 40 workers hit `SKIP LOCKED` simultaneously. Supafastinterconnect-friendly.
   A worker that claims a job resets to 2 s immediately, so latency for real work doesn't grow.
2. **Job-scoped model credentials** (`src/llm/credentials.ts` + wiring). The old worker split the
   job owner's OpenRouter/ChatGPT token through **`process.env`** — process-global, restored after
   each job. Fine while one worker = one job; a landmine the moment anything runs two lab jobs in
   one process (the pool, a callback, an accidental `2 * worker`). Tenant A's key could charge
   Tenant B's run — invisible to both, and a compliance incident on a paid tier. Now keys resolve
   through an `AsyncLocalStorage` scope (`withCredentials(...)` → `apiKey()`/`accessToken()`), so
   each run reads only its owner's keys, and the shared env reads safe default behavior on
   fallthrough. Verifiable: `test/credentials.test.ts`.

Why keep polling at all? Supabase's Supavisor in transaction mode doesn't support `LISTEN/NOTIFY`,
and a self-hosted broker adds failure modes for latency savings nobody feels at 50 jobs/day.
Revisit at fleet size ≥ 100, in order: partitioned claim index (§4), not notifications first.

## 4. S2 — the fleet (side effect well-managed past ~2k jobs/day)

In order of ROI, each one virtual (no rewire):

1. **One worker type, deployed separately from the web tier.** `LAB_WORKER=off` on the web machines
   already works; run the worker binary on a fleet (ECS/E2C with Chromium image — `Dockerfile`
   exists). Scaling = a queue-depth alarm; a deploy never loses work already handled by
   `stop(graceMs)` handing the job back.
2. **Split the fleet by job kind: `record` vs `lab`.** Today the single `claim()` is FIFO by
   `created_at` over a mixed jobs table. When a maker's video job and an engineer's 6-min lab run
   share one fleet, a batch of lab runs can starve short video jobs. Options, in cost: sticky
   worker pick (poll `where kind = $1` round-robin first, then the mixed queue) — 1 SQL change;
   or `priority` column. Do the 1-SQL version.
3. **Postgres claims via partial index** on `status = 'queued'`/(expired leases) instead of a
   growing heap scan once `jobs` crosses ~100k retained rows — a meta-index, no application
   change. Also add an `attempts` budget to failed-once jobs to prevent retry storms.
4. **Warm browsers on the recorder.** Playwright's Chromium cold-start is ~1–2 s; the Stagehand
   Chrome-for-Testing cold start is worse. Reuse the `browser()` singleton per worker process for
   record jobs (a fresh context per job is already how run_scripted/lab works) and keep a tiny pool
   of warm CDP targets. Get ~10–15 s off every recording (p95 relevant when makers watch progress).
5. **Autoscale on queue depth, not CPU.** ECS service with a Lambda-on-queue-depth alarm:
   `depth > 3 × fleet` scale up, `depth < 1 × fleet` scale in. The worker is stateless-ish
   (all durable state via queue/lease) so this is genuinely safe — the design decision that makes
   autoscaling boring was the lease, months earlier.

## 5. S3 — when Postgres is the bottleneck (not before)

Real signals it's time: `claim()` p99 latency grows even at night (lock contention), or `jobs`
IOPs exceed the Supabase tier's steady budget. In order:

1. **Read replicas for the dashboard/read APIs.** `/api/index`, run listings, and the record
   library are read-heavy and can go stale-free with ordinary replication lag. Writes stay on
   primary. This is the "scale reads before writes" move: it buys months at 1/10th the risk of a
   queue backend change.
2. **Retenant the queue into its own database** (still Postgres, separate instance) — the queue's
   access pattern (hot UPDATE churn) is fundamentally different from account data. Both code paths
   already talk to a `Store` interface; a second instance is env plumbing, not architecture.
3. **Only if you outgrow Postgres's ceiling (~50k claims/s, decidedly not before millions of
   jobs/day): move the queue to SQS/BullMQ and keep Postgres as the store of record.** The claim
   semantics (SKIP LOCKED + lease) translate directly. This is a "when the numbers say so" change,
   not a resume-ops flex.

## 6. What NOT to do (Piyush pruning list)

- **No microservices.** The monolith has exactly one heavy part (browser workers), and that part
  is already horizontally separable. Splitting `src/lab/` from `src/record/` from uploads buys
  nothing — they already only share a `Store` and a `MediaStore` interface.
- **No Redis for rate limits.** `rate_limits` as an atomic upsert in Postgres is correct and
  shared across instances; a Redis move would mean a second stateful system for latency nobody
  measures in the 50–5k jobs/day regime.
- **No Kubernetes yet.** Stateful browser workers benefit from VM image leveling (Docker compose
  in `docker-compose.yml` already proves the shape). K8s adds pods/prestudies/value-ops on a
  system whose steady unit is "N identical 4 GB workers"; revisit when worker count > 50.
- **No fan-out of LLM keys to client-side "reduce server load".** Keys must never reach the
  browser; per-tenant keys resolve server-side under the credential scope. That was just fixed —
  don't unfix it.
- **Don't migrate the store off Postgres "for scale".** Nothing in Walkcast is high-cardinality
  or document-shaped: users, sessions, job rows, recordings index. A document DB would make the
  queue weaker and add nothing else.

## 7. The observability before any scaling decision

You cannot autoscale what you cannot see. Cheap, in priority order (all existing plumbing):

1. Emit `queue.depth`, `queue.oldest_queued_ms` on each worker poll tick (counters via
   `store` SQL — a `select count` with the claim's existing filters, cheap at backoff cadence).
2. `job.duration_ms` by kind — you have it (`job.succeeded`), export it. p95 duration × fleet is
   your true capacity number, better than any estimate in §2.
3. `claim` timeout rate; the leak scenario is a worker claiming at p99 and losing its lease
   (visible already as retries; add an alarm at >1 % of claims).

---

## 9. Traffic shape for ~10,000 simultaneous signed-in users (added S1.5+)

This is a *traffic* ceiling, not a *job* ceiling — the job budget is still §2.

| Tier | Stateless? | Unit | 10k-user sizing |
|---|---|---|---|
| Marketing pages (`/`) | static files | 0 | CDN for free (§1, prerender) |
| Dashboard (`/app` SPA) | 815 KB single-file JS | edge | CloudFront/Vercel edge; cache-forever hashed asset |
| `GET /api/jobs/:id` (polling) | per-user dynamic | N web instances + DB cache | **1.5 s process-local memo + ETag 304** turns 4 polls/sec/user into ≤1 store read per job (S1.5); fall back to read replica for the listing pages |
| Auth / sessions | rows in Postgres | N web instances | single shared store, hash only, already stateless |
| Upload queue identity / quotas | atomic upsert | Postgres | wins across instances by construction |
| Workers | browser jobs | M workers | unchanged; see §4, one per ~50 jobs/day |

Operators settings for that shape:

```
LAB_STATUS_TTL_MS=1500          # poll memo (raise to 3000–5000 only if progress feels acceptably laggy)
DATABASE_URL=...                # PgStore mandatory at that scale (FileStore is single process)
LAB_WORKER=off                  # web instances must never run Chromium
SUPABASE reader replica          # dashboard/read APIs + /api/metrics
```

The two things that still break at 10k users unless they are done first:
1. **Deploy the worker fleet** (`Dockerfile`, `docker-compose.yml` or ECS) — without this, no live recording completes regardless of web capacity.
2. **Turn on the alarm on `queue.oldest_queued_ms`** (§7.1) so scale-out is data-driven rather than a manual dial.

Nothing above requires a new service; all of it reuses the monolith's interfaces.

## 8. TL;DR cheat-sheet

| Symptom | Likely fix |
| --- | --- |
| New recordings take ages to start a video, queue > N min | More workers (§4.1), one per ~50 jobs/day |
| Lab runs starve video jobs | FIFO claim by kind-first round-robin (§4.2) |
| Job latency grows at night, no jobs pending | Poll backoff cap raised too high, or claim index scan (§4.3) |
| Postgres CPU flatlines at scale, no queue | It's the dashboard reads — replica, §5.1 |
| "Someone's run used my OpenRouter key" | Behavior regression of the credential scope fix (§3.2) — this is alarm-grade |
| Retries of the same failing job storm | Verify `bad input` → `RecordError` no-retry discrimination survived (§ worker `retry`) |
