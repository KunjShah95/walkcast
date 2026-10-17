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
- `packages/core/src/lab/fixture.ts`
- `packages/core/src/lab/runner.ts`
- `packages/core/src/llm/gateway.ts` (replay mode only)
- `packages/core/src/llm/credentials.ts`

## Status
Prepared in-repo; external submission pending maintainer review.
