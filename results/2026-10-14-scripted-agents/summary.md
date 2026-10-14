# Experiment summary

> Agents are deterministic scripts, not LLMs. These numbers validate the harness (capture, oracle, classifier, fixtures, replay); they say nothing about LLM agent behaviour.

Seeds per fault: 5 · trials per replay: 3 · baseline: v0 · candidates: v1, v2

## Failure detection and attribution (baseline runs)

| Fault | Runs | Failed (oracle) | Correct primary cause | Spurious causes | Unexplained |
|---|---|---|---|---|---|
| none | 5 | 0 | n/a | none | 0 |
| stale-owners | 5 | 5 | 5/5 | none | 0 |
| gateway-timeout | 5 | 5 | 5/5 | none | 0 |
| silent-owner-drop | 5 | 5 | 5/5 | none | 0 |
| session-expiry | 5 | 5 | 5/5 | none | 0 |
| ui-drift | 5 | 5 | 5/5 | none | 0 |

False positives on clean runs: baseline 0/5, candidates 0/10.

## Reproduction (fixture replayed with the agent that failed)

25/25 fixtures reproduced the original causes in every trial.

| Fixture | Reproduced | Environment drift |
|---|---|---|
| stale-owners-s1-stale-observation | 3/3 | none |
| stale-owners-s2-stale-observation | 3/3 | none |
| stale-owners-s3-stale-observation | 3/3 | none |
| stale-owners-s4-stale-observation | 3/3 | none |
| stale-owners-s5-stale-observation | 3/3 | none |
| gateway-timeout-s1-unsafe-retry | 3/3 | none |
| gateway-timeout-s2-unsafe-retry | 3/3 | none |
| gateway-timeout-s3-unsafe-retry | 3/3 | none |
| gateway-timeout-s4-unsafe-retry | 3/3 | none |
| gateway-timeout-s5-unsafe-retry | 3/3 | none |
| silent-owner-drop-s1-app-dropped-field | 3/3 | none |
| silent-owner-drop-s2-app-dropped-field | 3/3 | none |
| silent-owner-drop-s3-app-dropped-field | 3/3 | none |
| silent-owner-drop-s4-app-dropped-field | 3/3 | none |
| silent-owner-drop-s5-app-dropped-field | 3/3 | none |
| session-expiry-s1-auth-lost | 3/3 | none |
| session-expiry-s2-auth-lost | 3/3 | none |
| session-expiry-s3-auth-lost | 3/3 | none |
| session-expiry-s4-auth-lost | 3/3 | none |
| session-expiry-s5-auth-lost | 3/3 | none |
| ui-drift-s1-locator-not-found | 3/3 | none |
| ui-drift-s2-locator-not-found | 3/3 | none |
| ui-drift-s3-locator-not-found | 3/3 | none |
| ui-drift-s4-locator-not-found | 3/3 | none |
| ui-drift-s5-locator-not-found | 3/3 | none |

## Regression comparison (pass^k per fixture)

| Fixture | v0 | v1 | v2 |
|---|---|---|---|
| stale-owners-s1-stale-observation | ❌ 0/3 (stale-observation) | ✅ 3/3 | ✅ 3/3 |
| stale-owners-s2-stale-observation | ❌ 0/3 (stale-observation) | ✅ 3/3 | ✅ 3/3 |
| stale-owners-s3-stale-observation | ❌ 0/3 (stale-observation) | ✅ 3/3 | ✅ 3/3 |
| stale-owners-s4-stale-observation | ❌ 0/3 (stale-observation) | ✅ 3/3 | ✅ 3/3 |
| stale-owners-s5-stale-observation | ❌ 0/3 (stale-observation) | ✅ 3/3 | ✅ 3/3 |
| gateway-timeout-s1-unsafe-retry | ❌ 0/3 (unsafe-retry, app-error) | ✅ 3/3 | ❌ 0/3 (unsafe-retry, app-error) |
| gateway-timeout-s2-unsafe-retry | ❌ 0/3 (unsafe-retry, app-error) | ✅ 3/3 | ❌ 0/3 (unsafe-retry, app-error) |
| gateway-timeout-s3-unsafe-retry | ❌ 0/3 (unsafe-retry, app-error) | ✅ 3/3 | ❌ 0/3 (unsafe-retry, app-error) |
| gateway-timeout-s4-unsafe-retry | ❌ 0/3 (unsafe-retry, app-error) | ✅ 3/3 | ❌ 0/3 (unsafe-retry, app-error) |
| gateway-timeout-s5-unsafe-retry | ❌ 0/3 (unsafe-retry, app-error) | ✅ 3/3 | ❌ 0/3 (unsafe-retry, app-error) |
| silent-owner-drop-s1-app-dropped-field | ❌ 0/3 (app-dropped-field) | ✅ 3/3 | ✅ 3/3 |
| silent-owner-drop-s2-app-dropped-field | ❌ 0/3 (app-dropped-field) | ✅ 3/3 | ✅ 3/3 |
| silent-owner-drop-s3-app-dropped-field | ❌ 0/3 (app-dropped-field) | ✅ 3/3 | ✅ 3/3 |
| silent-owner-drop-s4-app-dropped-field | ❌ 0/3 (app-dropped-field) | ✅ 3/3 | ✅ 3/3 |
| silent-owner-drop-s5-app-dropped-field | ❌ 0/3 (app-dropped-field) | ✅ 3/3 | ✅ 3/3 |
| session-expiry-s1-auth-lost | ❌ 0/3 (auth-lost) | ✅ 3/3 | ✅ 3/3 |
| session-expiry-s2-auth-lost | ❌ 0/3 (auth-lost) | ✅ 3/3 | ✅ 3/3 |
| session-expiry-s3-auth-lost | ❌ 0/3 (auth-lost) | ✅ 3/3 | ✅ 3/3 |
| session-expiry-s4-auth-lost | ❌ 0/3 (auth-lost) | ✅ 3/3 | ✅ 3/3 |
| session-expiry-s5-auth-lost | ❌ 0/3 (auth-lost) | ✅ 3/3 | ✅ 3/3 |
| ui-drift-s1-locator-not-found | ❌ 0/3 (locator-not-found) | ✅ 3/3 | ✅ 3/3 |
| ui-drift-s2-locator-not-found | ❌ 0/3 (locator-not-found) | ✅ 3/3 | ✅ 3/3 |
| ui-drift-s3-locator-not-found | ❌ 0/3 (locator-not-found) | ✅ 3/3 | ✅ 3/3 |
| ui-drift-s4-locator-not-found | ❌ 0/3 (locator-not-found) | ✅ 3/3 | ✅ 3/3 |
| ui-drift-s5-locator-not-found | ❌ 0/3 (locator-not-found) | ✅ 3/3 | ✅ 3/3 |

## Cost

Agent runs: 265 · model calls: 0 · median run: 4168 ms · p95 run: 12051 ms
