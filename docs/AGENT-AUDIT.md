# Agent Audit — Walkcast Lab

Audit of every agent the harness can run, where each is used, whether it is exercised by tests,
and production-readiness notes. Generated as part of production hardening.

## Inventory

### Scripted agents (`packages/core/src/agents/scripted.ts`)

| id | kind | description | key flags |
|---|---|---|---|
| `v0` | scripted | Naive baseline | settleBeforeObserve=false, reobserveBeforeAct=false, selectByLabel=false, verifySelection=false, cachedSubmitSelector=#save-lead, readBackBeforeRetry=false, verifyOutcome=false, onSessionLoss=assume-saved, retryReads=false |
| `v1` | scripted | Fixed (settle + re-observe, label targets, verify selection, read-back before retry, verify outcome, safe re-auth) | all of the above flipped on |
| `v2` | scripted | Deliberate regression of v1 (read-back before retry removed) | readBackBeforeRetry=false only |

### Stagehand/LLM agents (`packages/core/src/agents/stagehand-agent.ts`)

| id | kind | prompt | maxTurns |
|---|---|---|---|
| `sh-p0` | stagehand | p0 (neutral baseline) | 30 |
| `sh-p1` | stagehand | p1 (adds verification + safe-retry guidance) | 30 |

Total: **5 agents** (3 scripted + 2 Stagehand).

## Registry & resolution

- `packages/core/src/agents/registry.ts` — `allAgents()` returns all 5; `resolveAgent(id | spec)` looks up by id and throws `Unknown agent '...'` listing known ids.
- Consumers: `apps/desktop/cli.ts` (`list`, `run`, `replay`, `compare`, `experiment`), `apps/desktop/server/server.ts` (`/api/agents`, run submission validation), `packages/core/src/lab/runner.ts`, `fixture.ts`, `experiment.ts`.

## Usage map

| Agent | CLI | HTTP API | runner | fixture replay | experiment grid |
|---|---|---|---|---|---|
| v0 | ✅ list/run/replay/compare/experiment | ✅ | ✅ | ✅ | ✅ baseline |
| v1 | ✅ | ✅ | ✅ | ✅ | ✅ candidate |
| v2 | ✅ | ✅ | ✅ | ✅ | ✅ candidate |
| sh-p0 | ✅ | ✅ | ✅ | ✅ | ✅ (scripted model mode) |
| sh-p1 | ✅ | ✅ | ✅ | ✅ | ✅ |

## Test coverage (access evaluation)

| Agent | Exercised by tests? | Where |
|---|---|---|
| v0 | ✅ | `test/e2e.test.ts` (clean pass, all 5 faults × create-lead, reassign-lead grid, lookup-owner) |
| v1 | ✅ | `test/e2e.test.ts` (passes fixed faults) |
| v2 | ✅ | `test/e2e.test.ts` (regresses on gateway-timeout only) |
| sh-p0 | ✅ | `test/stagehand.test.ts` (silent-owner-drop, ui-drift, replay) |
| sh-p1 | ✅ | `test/stagehand.test.ts` (replay against sh-p0 fixture) |

**Verdict: all 5 agents are exercised by the automated suite.** No dead/unused agent ids in the registry.

## Production-readiness gaps & fixes applied

1. **Observability of agent invocations.** Previously a run logged nothing at start about which agent/fault/task it used. `runner.ts` now emits `log.info("run.start", { runId, agent, task, fault, seed, mode })` so production runs are auditable per agent. (Fix applied.)
2. **Unknown-agent attempts are now logged** in `resolveAgent` via `log.warn("agent.unknown", { requested })` before throwing, so misconfigured clients/automation show up in logs instead of only as a thrown error. (Fix applied.)
3. **Agent registry is the single source of truth** — both CLI and HTTP API read from `allAgents()`, so adding/removing an agent requires one edit. (Already in place; verified.)
4. **Stagehand agents require `LAB_CHROME_PATH`** — `chromePath()` throws a clear error when missing. Documented in README. (Already in place.)
5. **LLM agents require provider keys** — `configuredProviders()` reports which are set; `providers` command lists them. (Already in place.)

## Remaining recommendations (not auto-fixed)

- Add an `/api/agents/usage` aggregate (counts per agent id) to the dashboard for production monitoring.
- Add per-agent rate limits / quotas in the queue worker (currently per-account only).
- Add a canary check that runs one scripted agent per deploy (CI already runs `npm test`).
- Document which agents are "safe to expose to end users" vs. lab-only in the API docs.
