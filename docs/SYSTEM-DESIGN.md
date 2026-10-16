# Walkcast: the system-design guarantees, stated precisely

Companion to [`docs/SCALING.md`](SCALING.md). That one is about capacity and growth; this one is
about **correctness under failure** — what the system actually guarantees (to a user, to a tenant,
to itself) and what each component does when the world misbehaves. The rights-and-wrongs below are
cited to the code that implements them, with the fixes applied alongside.

The organizing question, per the distributed-systems canon: *when this component dies mid-operation,
what happens to a real user's money (model bill), data (video), and expectations (job status)?*
A system design that cannot answer per-component is a diagram, not a design.

---

## 1. The job state machine and its fences

```
             enqueue (limited, idempotent)
   ┌─────────┐   claim (SKIP LOCKED)   ┌─────────┐   heartbeat fails/lease lapses
   │ queued  │ ──────────────────────▶ │ running │ ───────────────────────────────┐
   └─────────┘                         └────┬────┘                                 │
       ▲                finish(failed, retry=true) │◀── steal (another worker claims)│
       │            ┌──────────────────────────────┘                               ▼
       │            ▼                                                               │
       │         (back to queued; attempts already counted)                         │
       │            finish(failed, retry=false)   finish(succeeded)                 │
       │            ▼                              ▼                                │
       │            └──────────────▶  ┌─────────┐ ◀─────────┘                       │
       └────────────────────────────  │ failed  │                                   │
                                      └─────────┘
```

Every transition to a *terminal or re-claimable* state carries a fence — `locked_by <workerId>` in
the WHERE clause (`PgStore.finish`/`release`/`heartbeat`, and the FileStore equivalents). The
guarantee that falls out:

- **Claim is exactly-once.** `FOR UPDATE SKIP LOCKED` under row locks; two workers can never
  observe the same claim (locked by test: six workers race, `Set(claimed).size === 10`).
- **Execution is at-least-once.** A killed worker mid-job means the lease expires and a second
  worker re-runs the job. Copy in: distributed systems don't give you exactly-once *execution*;
  you get it from idempotent *effects* (§3).
- **Finalization is fenced (monotonic)**: only the worker the store currently believes owns the
  job can transition it. A zombie finishing after its lease was stolen is a no-op — the DB refuses
  by fence, not by luck. This is a fencing token with a name (`locked_by`) rather than a number;
  cheap and sufficient here because ownership has a single writer column.

### The failure window that motivated this hardening

The heartbeat fires every `lease/3` (20 s at the default 60 s lease). It already handled an actively
revoked lease (`mine === false` → abort). What it did **not** cover: the store going silent for
longer than a lease isn't covering — DB stall, worker-to-DB partition. In that silence the worker
keeps computing (Chromium + ffmpeg + model tokens), finishes, then its fenced `finish()` is quietly
discarded — and the job gets re-executed on another worker. Money was spent; no user-visible artifact
gained (beyond the duplicate media noted in §3).

**Fix shipped: a lease-margin watcher.** The worker tracks `confirmed` (last successful heartbeat
acknowledge). If the clock passes `0.8 × leaseMs` without confirmation (`install` the interval at
2 s granularity), the job is aborted *pre-emptively* — while work is still cheap enough to waste,
rather than after 5 minutes of encoding nobody will accept. In the at-least-once world, an
**unknown** ownership state for too long must be treated as *lost ownership*: choose the side that
does the least damage, and that is "stop computing, let the lease expiry machinery do its thing."

## 2. The enqueue invariant was a read-then-write race (fixed)

Before: the server did `activeJobs(owner)` → compare → `enqueue`. Two instances holding a user's
two near-simultaneous submits could both read `active = 0` and enqueue. The "max 1 active job"
was an *intention over two trips*, not a fact of the store.

**Fix shipped: `Store.enqueueLimited(job, maxActive)`** — the ceiling check and the insert are one
statement (a filtered `INSERT … SELECT` in Postgres; one serialized `write()` critical section in
the FileStore). The invariant is again a *fact of the store*, which is the only place invariants
can live when more than one process exists. Idempotent resubmit semantics are unchanged
(conflict → return the existing job, never a new one — so the limit can't be defeated with a
different key claimed by the same browser retry — note the `.filter(Boolean)` contract test:
five parallel submits, limit 1, exactly one row).

Design principle cited by this change: **check-then-act across a network is a bug**. The entire
inventory of check-then-act in Walkcast is now: (a) enqueue limits (fixed), (b) daily quota —
atomic by construction (one upsert `hit()`), (c) idempotency pre-read — safe *because* the sink is
an idempotent upsert (the pre-read is an optimization to return 202-with-existing faster; the DB
conflict is the true guarantor).

## 3. Source-of-truth analysis across two resources (why the order matters)

A record job writes to two systems: object storage (the MP4) and Postgres (the recordings index).
This is the two-general problem; there is no atomic commit across S3 and Postgres. Walkcast
resolves it **exactly the way a WAL-backed ingest would**: pick the commit point on the resource
you can verify from the *reader's* side, and accept a bounded orphan cost on the other.

```
recordSite() ──▶ media.publish(id, files) ──▶ store.saveRecording(upsert, idempotent by id)
                    (durable, verifiable)          (commit point: the user's view)
```

- **Crash before publish** → nothing persisted; job retries; no user-visible badness. ✓
- **Crash between publish and index** → orphaned MP4 in the bucket; invisible to users; bounded
  excess storage. Deliberately accepted over the alternative (index first → a user lands on a
  recording that doesn't exist — a correctness crime against the user).
- `saveRecording` is an upsert on the recording id — so a retried job that re-publishes the same
  recording id converges rather than duplicating. Effects idempotent → the at-least-once execution
  in §1 becomes **exactly-once effects** for the index, and near-exactly-once for media.
- Residual non-idempotent effect: each *execution* of a lab job may bill the model provider. This
  is inherent — you cannot make a third-party HTTP call idempotent on your side. Bounded by the
  per-tenant 1-active-job ceiling and 2 attempts; noted as the honest residual cost rather than
  hand-waved as "exactly-once".

## 4. Failure-domain table

| Death of… | What happens | Property that saves you |
| --- | --- | --- |
| A web instance | Requests to it fail; ALB reroutes; users retry | Web tier is stateless (sessions *and* quota in the store). |
| A worker (kill -9) mid-job | Lease expires (< 60 s); another worker claims; `attempts` bounds repetition | Leases + attempts. Not the heartbeat. |
| Postgres for 30 s | Workers heartbeat-fail silently (existing catch), abort at the 0.8-margin; jobs re-run when it returns | Lease-margin abort (new) + claim sweep on recovery. |
| Postgres for an hour | Jobs in `running` with expired leases are failed by the claim sweep only *after* attempts exhausted; queue holds | The queue IS the durable backlog. dulce de-leche: nothing is lost, work is *delayed*. |
| S3 | Media writes fail; the job fails; retried later | Publish-first ordering keeps the index from referencing nothing. |
| The LLM provider mid-run | Gateway's fallback chain rotates; if all fail → `agent-error`, never a fixture, no retry storm | Fallback backend + bad-input no-retry discrimination in `finish`. |

The table is the design review: each row must have a *mechanism* column, not a hope.

## 5. Backpressure, genuinely

- **Users:** 1 active job (`enqueueLimited` — atomic), plus a per-kind daily quota, plus `Idempotency-Key`
  de-duplication for the double-click. This is token-bucket-with-capacity-1 per tenant — leads
  cannot pile up, and the queue can't be flooded by one account.
- **Workers:** one job at a time per process by design (Chromium + ffmpeg don't share well), scale
  = more processes; `stop(graceMs)` hands half-done work back so scale-in and deploys never
  destroy jobs.
- **The DB as a throttle target:** worker polls back off 2 s→10 s with ±10% jitter (today's
  S1 fix), so a large fleet's floor load is `N_workers / max_poll_interval` claim queries, not
  `N_workers × 1/2s`. The claim sweep is piggybacked on the claim statement — no separate cron,
  no new failure surface.

## 6. What is deliberately NOT implemented (and where the line is)

- **No distributed lock service** (Redlock et al.): ownership is a Postgres row. Introducing
  Redis locks would *add* a failure mode to solve a problem Postgres already solved. The margin
  watcher (§1) is what makes the single-writer fence robust to stalls.
- **No outbox pattern:** there is no second write target coupled to a business event — queue
  transitions live in the same DB as the app state, in the same transaction scope per statement.
  The moment Walkcast grows a downstream consumer (webhooks on job completion, say), the outbox
  becomes necessary; the design document flag is here so that decision is made loudly.
- **No exactly-once ingestion of model calls:** third-party call, honestly at-least-once, bounded
  by tenant ceilings (§3). Pretending otherwise is the classic distributed-systems lie.

## 7. One-line summaries

- Claims: exactly-once (SKIP LOCKED + PK), tested.
- Execution: at-least-once; effects idempotent where a second run would be user-visible.
- Finalization: fenced by `locked_by`; unknown lease state past the margin ⇒ abort, don't gamble.
- Limits: enforced atomically in the store; the store is the only thing that's true.
- Two-resource writes: publish-first, upsert-commit; orphans bounded and invisible.
- Every failure domain has a named mechanism, not a hope.
