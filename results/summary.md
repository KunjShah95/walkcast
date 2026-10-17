# Experiment summary

> Agents are deterministic scripts, not LLMs. These numbers validate the harness (capture, oracle, classifier, fixtures, replay); they say nothing about LLM agent behaviour.

## Model

Model selection: defaults from LAB_AGENT_MODEL/LAB_STAGEHAND_MODEL

Model mode: default (scripted for replay). Live-token accounting only applies to runs whose mode is "live".

## Run shape

Seeds per fault: 1 · trials per replay: 1 · baseline: v0 · candidates: v1, v2

## Failure detection and attribution (baseline runs)

| Fault | Runs | Failed (oracle) | Correct primary cause | Spurious causes | Unexplained |
|---|---|---|---|---|---|
| none | 1 | 0 | n/a | none | 0 |
| stale-owners | 1 | 1 | 1/1 | none | 0 |
| gateway-timeout | 1 | 1 | 1/1 | none | 0 |
| silent-owner-drop | 1 | 1 | 1/1 | none | 0 |
| session-expiry | 1 | 1 | 1/1 | none | 0 |
| ui-drift | 1 | 1 | 1/1 | none | 0 |

False positives on clean runs: baseline 0/1, candidates 0/2.

## False success (baseline)

Success claims: 4/6. False success among those claims: 3/4 (75%, 95% CI 30%–95%).

A false success is a run where the agent claimed the task worked and the application's records disagree.

## Rates

Reproduction of the original causes: 5/5 (100%, 95% CI 57%–100%).

- v0 trial pass rate: 0/5 (0%, 95% CI 0%–43%); fixtures passing every trial: 0/5 (0%, 95% CI 0%–43%).
- v1 trial pass rate: 5/5 (100%, 95% CI 57%–100%); fixtures passing every trial: 5/5 (100%, 95% CI 57%–100%).
- v2 trial pass rate: 4/5 (80%, 95% CI 38%–96%); fixtures passing every trial: 4/5 (80%, 95% CI 38%–96%).

## Reproduction (fixture replayed with the agent that failed)

5/5 fixtures reproduced the original causes in every trial.

| Fixture | Reproduced | Environment drift |
|---|---|---|
| stale-owners-s1-stale-observation | 1/1 | none |
| gateway-timeout-s1-unsafe-retry | 1/1 | none |
| silent-owner-drop-s1-app-dropped-field | 1/1 | none |
| session-expiry-s1-auth-lost | 1/1 | none |
| ui-drift-s1-locator-not-found | 1/1 | none |

## Regression comparison (pass^k per fixture)

| Fixture | v0 | v1 | v2 |
|---|---|---|---|
| stale-owners-s1-stale-observation | ❌ 0/1 (stale-observation) | ✅ 1/1 | ✅ 1/1 |
| gateway-timeout-s1-unsafe-retry | ❌ 0/1 (unsafe-retry, app-error) | ✅ 1/1 | ❌ 0/1 (unsafe-retry, app-error) |
| silent-owner-drop-s1-app-dropped-field | ❌ 0/1 (app-dropped-field) | ✅ 1/1 | ✅ 1/1 |
| session-expiry-s1-auth-lost | ❌ 0/1 (auth-lost) | ✅ 1/1 | ✅ 1/1 |
| ui-drift-s1-locator-not-found | ❌ 0/1 (locator-not-found) | ✅ 1/1 | ✅ 1/1 |

## Cost

Agent runs: 23 · model calls: 0 · live tokens in/out: 0/0 · median run: 4157 ms · p95 run: 8995 ms
