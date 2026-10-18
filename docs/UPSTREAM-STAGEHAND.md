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
- [ ] Step 2 — generalise `FixtureManifest` state snapshots beyond MiniCRM leads.
- [ ] Step 3 — tests against Stagehand's example app (in their repo).
- [ ] Step 4 — open the PR on `browserbase/stagehand` referencing #2841. Not opened: submitting
  to an external repository is the maintainer's call, not something done from here.

Port `cassette.ts` first; it is the piece the issue asks for.
