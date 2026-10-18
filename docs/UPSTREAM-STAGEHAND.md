# Upstreaming the dynamic fixture tier to Stagehand (#2841)

## What to upstream
The "dynamic fixture tier" is the replay harness in `packages/core/src/lab/fixture.ts` +
`packages/core/src/lab/runner.ts` + `packages/core/src/llm/gateway.ts` (recorded-LLM
cassette replay). It lets a captured agent run be replayed deterministically against a
live app, with the LLM gateway serving recorded responses instead of hitting providers.

## Suggested PR plan
1. Extract the cassette/replay logic from `packages/core/src/llm/gateway.ts` into a
   standalone module with no Walkcast-specific imports.
2. Generalize the fixture manifest schema (`FixtureManifest`) to accept arbitrary app
   state snapshots, not just MiniCRM leads.
3. Add tests against Stagehand's own example app.
4. Open a PR to `browserbase/stagehand` referencing issue #2841, titled
   "feat: dynamic fixture tier for deterministic agent replay".

## Files to port
- `packages/core/src/llm/cassette.ts` (self-contained; start here)
- `packages/core/src/lab/fixture.ts`
- `packages/core/src/lab/runner.ts`
- `packages/core/src/llm/gateway.ts` (only as a usage example of `cassette.ts`)
- `packages/core/src/llm/credentials.ts`

## Status (2026-10-18)
- [x] **Step 1 — standalone module.** `packages/core/src/llm/cassette.ts` holds the cassette
  format, `CassetteRecorder`, `CassettePlayer` (ordered replay per channel, drift detection,
  `ReplayExhaustedError`), request hashing that ignores session noise, and Stagehand element-id
  remapping. It has no Walkcast imports; secret handling is injected (`redact` / `restore`
  hooks). `gateway.ts` now uses it, so the in-repo Stagehand replay tests exercise exactly the
  code to be ported. Unit tests: `test/cassette.test.ts`.
- [x] **Re-scoped after reading upstream (2026-10-18).** #3106 had already shipped the static
  observation tier for #2841, and its README left *network response recording* as future work.
  That, not LLM-call replay, is the piece the issue discussion asked for, so the upstream work
  became a network tier modelled on Walkcast's HAR replay (record in the same session, misses
  fail rather than reach the network).
- [x] **PR 1 — [browserbase/stagehand#3230](https://github.com/browserbase/stagehand/pull/3230):**
  `packages/evals/tasks/network.ts` (CDP Fetch record/replay, body-hash keys, cache-buster
  normalisation, SW/cache bypass) and `task:record --network`, with real-Chromium tests.
- [x] **PR 2 — [browserbase/stagehand#3231](https://github.com/browserbase/stagehand/pull/3231)**
  (stacked on #3230): a real `stagehand.act()` replayed offline from a network task with a
  deterministic model, plus a diverging run that surfaces as a miss.
- [ ] Maintainer review. External PRs are mirrored by a maintainer before full CI runs; tests
  passed locally on Windows, Linux CI is pending.

`llm/cassette.ts` stays a standalone module in this repo; it would only be proposed upstream if
maintainers ask for recorded-model replay.
