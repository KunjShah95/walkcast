# Walkcast: an architecture from first principles

Walkcast is a failure lab, so its architecture is deliberately the opposite of a magic framework: one seam, one clock, one source of truth, and only the failures the code can actually explain.

## Data flow

A run is a linear, inspectable pipeline, each stage producing the input of the next:

1. **MiniCRM app** (`src/app/server.ts`) boots per run with seeded fault + seed, exposing `AppState` (leads + write ledger).
2. **BrowserTools** (`src/capture/tools.ts`) is the agent's *only* interface to the browser. Every call becomes one step recorded with URLs/fingerprints before and after, target identity checks, network/console.
3. **Capture/Recorder** stamps all of it on one clock into `trace.jsonl`.
4. **Runner** (`src/lab/runner.ts`) drives agent (scripted or Stagehand LLM), then closes browser + app.
5. **Oracle** (`src/lab/task.ts`) reads the app's final state — never the agent's claim — and returns `taskPassed / claimHonest`.
6. **Classifier** (`src/lab/classifier.ts`) maps trace + oracle + ledger + agent error into symptoms + causes, each citing steps; unmatched failures become `unexplained`.
7. **Fixture** (`src/lab/fixture.ts`) freezes task + fault + seed + timings + cassette; **replay** re-runs any agent against it (deterministic scripted or $0 cassette replay) for pass^k.

Recordings flow the same job queue, but the classification pipeline above is the heart.

## Job state machine

Every queued unit of work transitions through:

`enqueued -> claimed(lease) -> in-progress -> sealed-secret erasure -> index update`

- **Enqueued** with an `Idempotency-Key`; `jobByKey` makes a double-click one job.
- **Claimed**: a worker acquires with a lease (60 s, `FOR UPDATE SKIP LOCKED` on Postgres; equivalent locking in FileStore). `claim()` may steal a job whose lease expired, so a dead worker is reclaimed without operator action.
- **In-progress, CAS-like continuity**: heartbeat extends the lease; it returns `false` once ownership is lost and the worker aborts instead of racing. `worker.id` is the token.
- **Graceful exit**: SIGTERM gives 30 s, then aborts and `release()`s the job back to the queue without counting an attempt.
- **Hard stop**: a 6 min deadline aborts the browser process.
- **Terminal**: `finish()` writes succeeded/failed, including a `retry` bit; `RecordError` and aborts do not retry, crashes/timeouts do, bounded by `maxAttempts = 2`.
- **Secret erasure**: `unregisterSecret(...)` runs in `finally`; `job.secret` is cleared on end. Input is AES-256-GCM under `LAB_SECRET_KEY`.
- **Index update**: the scrubbed `recording.json` is written to `recordings/` and indexed in the store.

The **fork**: `FileStore` is one JSON file, single machine, single process semantics; `PgStore` shares users/sessions/throttle/queue/index so web scales horizontally and workers are separate processes. Only the `Store` interface (`src/store/types.ts`) is the seam — see Law #1.

## Idempotency, and why it matters

- Submission: `POST /api/record|run` returns 202 with a job id immediately; the dashboard polls. Retrying the request with the same `Idempotency-Key` returns the job created first, never a duplicate.
- At the task level: `unsafe-retry` is a classified cause because the backend commits, the gateway returns 504, and a blind retry re-submits. The rule fires only when no read-back (GET `/leads` or `fetchText`) occurred between writes.
- Replay uses recorded model calls (`model-calls.jsonl`) and gives exact, $0 reproduction — *semantically idempotent*, a useful property only because the oracle re-verifies app state each trial.

## Backpressure and capacity

- Per user: `activeJobsPerUser` (default 1) is enforced in the store, shared across instances.
- Daily: fixed-window counters `recordingsPerDay` (20) and `runsPerDay` (100) via `store.hit(key, 86_400_000)`.
- Hard per-job deadline 6 min kills the browser.
- Each worker runs one job at a time (Chromium + ffmpeg weight; process-wide secrets registry); scale out workers, not threads. `FOR UPDATE SKIP LOCKED` keeps polling disjoint.
- Readiness: `/readyz` checks DB reachability and drain state; queue depth is exposed.

## Failure modes

- **Reaped on SIGTERM** within 30 s, else aborted and re-queued.
- **Lease expiry** reclaims orphaned jobs.
- **Deadline kill** aborts long runs (no silent hangs).
- **agent-error**: harness crash, missing key, provider outage, exhausted replay — always a failure, *never* stored as a fixture or mistaken for agent intelligence.
- **unexplained**: no rule fired; surfaced for human/LLM review rather than guessed. "Deterministic causes or admit ignorance" is the policy.
- **Empty rule gap**: an impossible task can still fail if blind retries left duplicate leads — collateral damage fails honesty. Conversely, the classifier demotes causes to *incidents* on passing runs ("recovered").

## Reusable laws

1. **The store interface is the only seam.** File or Postgres behind one contract; migration is a URL change, not a code change.
2. **The oracle owns ground truth.** `OracleResult` compares app state; LLM judges and agent claims are never the verdict.
3. **Every action is timed on one clock.** Before/after snapshots, target checks, network — all recorded by one `Recorder`, so races stay visible.
4. **Scrub secrets before disk.** Value-based scrubbing + placeholders (`{{secret:name}}`); redacted traces/request hashes computed on scrubbed form.
5. **Capture must not change timing.** Snapshots are bounded (250 ms) and recorded as `pending` when a navigation is in flight.
6. **Ignored tool failures surface.** `act` returning `success: false` is now a classifier rule, not swallowed.
7. **Agent timing differs from action timing.** Clicks return immediately (`noWaitAfter`); "locator not found" requires no network or DOM effect.

## First-principles equations

Cost model: each run is `startApp` + one browser context + one agent loop. For scripted agent `runOnce` cost is `O(n)` steps bottom-up: n = |faults × seeds × agents|; fixtures reuse seed+fault so the replay grid is `O(trials)` reuse of one captured scenario cost. Pass^k is `trials` independent applications of the same expected outcome, so confidence in "agent fixes the bug" scales as `1 - (1-p)^k` for per-trial success probability p. Backpressure throughput `λ_jobs ≤ min(workers, quota_per_user)`; with one worker and one active job per user, arrival rate above `1/deadline` serialises rather than drops. Lease expiry `T_claim + leaseMs` bounds any unmanaged failure to at most one lease window before reclamation.