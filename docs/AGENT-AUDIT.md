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

## Recommendations: status (2026-10-18)

| Recommendation | Status |
|---|---|
| `/api/agents/usage` aggregate per agent id | **Done.** `GET /api/agents/usage?windowMs=` returns total / succeeded / failed / active per agent, plus its exposure and daily ceiling. Counts only, no inputs or owners (`Store.agentUsage`). |
| Per-agent rate limits / quotas | **Done.** Model-backed agents get a per-account daily ceiling on live runs (`LAB_LLM_RUNS_PER_DAY`, default 20; per-agent override `LAB_AGENT_RUNS_PER_DAY_<ID>`). Replay and scripted model modes are free and not counted. Enforced with the store's atomic `hit()`, so it holds across instances. |
| A ceiling on what one run may cost | **Done.** Every live run carries a per-run budget (`packages/core/src/llm/budget.ts`): 250k tokens or ~$5 by default, per agent with `LAB_AGENT_TOKEN_BUDGET_<ID>` / `LAB_AGENT_COST_BUDGET_USD_<ID>`. The daily quota says how often a run may start; the budget says what one may cost. A run that reaches a ceiling stops and is reported as `budget-exhausted`, not as an agent failure. Replays and scripted runs are never charged against it. |
| Canary that runs one scripted agent per deploy | **Covered by CI.** The `regression-fixtures` job runs `lab compare fixtures --agents v1 --trials 3` on every push (release gate); a regression in the harness or v1 fails the build before release. |
| Document which agents are safe to expose | **Done**, table below; also returned as `exposure` in `/api/capabilities` and `/api/agents/usage`. |

## Exposure

| Agent | Exposure | Why |
|---|---|---|
| `v0`, `v1`, `v2` | `public` | Deterministic scripts. No model calls, no provider cost; safe on any server. |
| `sh-p0`, `sh-p1` | `lab` | Drive a real model through the gateway. On a server reachable from other machines, live runs are refused unless `LAB_ALLOW_LIVE_RUNS=1`, and they count against the per-agent daily ceiling. Replays of a recorded fixture cost nothing and are always allowed. A live run that reaches its per-run budget stops on purpose and is reported as `budget-exhausted`. |
