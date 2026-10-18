# Experiment summary

> Stagehand agents ran against a live model for new runs; fixture replays of the same agent used recorded model calls. Model behaviour varies between runs: read pass^k over trials, not single runs.

## Model

Model selection: agent=openrouter:anthropic/claude-sonnet-5, stagehand=openrouter:anthropic/claude-haiku-4.5

Model mode: live. Live-token accounting only applies to runs whose mode is "live".

## Run shape

Seeds per fault: 1 · trials per replay: 3 · baseline: sh-p0 · candidates: sh-p1

## Failure detection and attribution (baseline runs)

| Fault | Runs | Failed (oracle) | Correct primary cause | Spurious causes | Unexplained |
|---|---|---|---|---|---|
| none | 1 | 0 | n/a | none | 0 |
| stale-owners | 1 | 0 | 0/0 | none | 0 |
| gateway-timeout | 1 | 0 | 0/0 | none | 0 |
| silent-owner-drop | 1 | 1 | 1/1 | none | 0 |
| session-expiry | 1 | 1 | 1/1 | none | 0 |
| ui-drift | 1 | 1 | 0/1 | unexplained | 1 |

False positives on clean runs: baseline 0/1, candidates 0/1.

## False success (baseline)

Success claims: 4/6. False success among those claims: 1/4 (25%, 95% CI 5%–70%).

A false success is a run where the agent claimed the task worked and the application's records disagree.

## Rates

Reproduction of the original causes: 9/9 (100%, 95% CI 70%–100%).

- sh-p0 trial pass rate: 0/9 (0%, 95% CI 0%–30%); fixtures passing every trial: 0/3 (0%, 95% CI 0%–56%).
- sh-p1 trial pass rate: 9/9 (100%, 95% CI 70%–100%); fixtures passing every trial: 3/3 (100%, 95% CI 44%–100%).

## Reproduction (fixture replayed with the agent that failed)

3/3 fixtures reproduced the original causes in every trial.

| Fixture | Reproduced | Environment drift |
|---|---|---|
| silent-owner-drop-s1-app-dropped-field | 3/3 | none |
| session-expiry-s1-auth-lost | 3/3 | model replay ran past the recording (the run diverged) |
| ui-drift-s1-unexplained | 3/3 | app changed (66944e3db565 → d8d7a26cb6bc); 9 model request(s) differed from the recording |

## Regression comparison (pass^k per fixture)

| Fixture | sh-p0 | sh-p1 |
|---|---|---|
| silent-owner-drop-s1-app-dropped-field | ❌ 0/3 (app-dropped-field) | ✅ 3/3 |
| session-expiry-s1-auth-lost | ❌ 0/3 (auth-lost) | ✅ 3/3 |
| ui-drift-s1-unexplained | ❌ 0/3 (unexplained) | ✅ 3/3 |

## Cost

Agent runs: 25 · model calls: 626 · live tokens in/out: 244426/9010 · median run: 45581 ms · p95 run: 336400 ms
