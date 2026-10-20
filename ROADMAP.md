# Walkcast — Roadmap

Living roadmap for the desktop app + lab harness. Milestones are ordered; each ships independently.

## Shipped (v0.1 / v0.2)
- Narrated site recorder (sign-in, same-origin walk, captions, ffmpeg flite/SAPI, cloud TTS).
- Walkcast Lab: 6 faults, 3 agents, classifier, fixtures, replay, experiment grid, compare.
- LLM agent arm (sh-p0/sh-p1) via 15-provider gateway, Stagehand v4, recorded-LLM replay.
- Dashboard (overview, timeline, fault replay, compare, fixtures, experiments) single-file build.
- Accounts (built-in + Supabase Auth), job queue, workers, media (local/S3), SSRF guard.
- Desktop app (Tauri + sidecar), browser download, ffmpeg bundled.
- 11 TTS providers (flite, sarvam, bhashini, elevenlabs, google, azure, awspolly, openai, murf, reverie, custom/maya) selectable in Settings/Record.
- STT helper (sarvamTranscribe).

## Near term (v0.3) — stability & DX
- [x] FileStore write batching/debounce to cut event-loop blocking on large stores.
- [x] S3 upload streaming (avoid buffering whole MP4s).
- [x] LRU status cache in server; Postgres CI service container for PgStore tests (cache done; CI container).
- [x] ESLint + prettier + pre-commit hook; `npm run lint`.
- [x] `doctor` reports store health, migration status, worker leases (store ping, applied/pending migrations, queue, every running lease with expiry).
- [x] Runtime guard against two processes sharing one FileStore.
- [x] Credentials/API keys entry UI in Settings (stored locally, applied immediately).

## Mid term (v0.4) — product
- [x] Per-recording TTS provider already wired; add voice preview for cloud providers.
- [x] Caption editing in the dashboard (already partially: renarrate/voiceover).
- [x] Multi-language UI strings (i18n) for Indian languages.
- [x] Export recording as SRT/VTT/JSON transcript (`/api/recordings/:id/transcript?format=`).
- [x] Scheduled/recurring recordings (cron-like) for change detection.
- [x] Webhook on job completion: transactional outbox in the store, written by `finish()`, owner-scoped, signed, SSRF-guarded (SYSTEM-DESIGN §6a).
- [x] Schedules in the store: each due schedule fires once across all instances (`claimDueSchedules`).

## Longer term (v0.5+) — lab & research
- [x] Run the live-LLM arm of the §7 experiment and publish raw results (`results/llm-arm-2026-10-18/`; sh-p0 vs sh-p1, Sonnet 5 agent + Haiku 4.5 Stagehand via OpenRouter). One seed per scenario: a first look, not a benchmark.
- [x] Upstream to Stagehand #2841: network tier PRs opened, [#3230](https://github.com/browserbase/stagehand/pull/3230) (record/replay + `task:record --network`) and [#3231](https://github.com/browserbase/stagehand/pull/3231) (real `act()` replay). Awaiting maintainer review (docs/UPSTREAM-STAGEHAND.md).
- [x] Voice cloning / custom voice upload for narration.
- [x] STT-driven caption generation (auto-captions from recorded audio): Sarvam, OpenAI, Groq, ElevenLabs Scribe, or any OpenAI-compatible endpoint (`record/stt.ts`), with real timestamps where the provider returns them.
- [x] Mobile companion (view recordings, trigger runs): responsive dashboard (drawer nav under `lg`), Mobile view, installable PWA.

## Release
- [x] Unsigned installers by design (no signing certs; docs/SIGNING.md).

## Non-goals
- Competing with Browserbase/Playwright as a general browser agent.
- Multi-tenant SaaS beyond Supabase-backed single deployment.
- Supporting third-party sites without authorization attestation.

## Ops & lab hardening (2026-10-18)
- [x] Queue-age alarm and metrics: `queue.stats` / `queue.alarm` logs, `alarm.state` in `/api/metrics`, autoscaling commands in DEPLOY-AWS §3a.
- [x] Read-replica support (`SUPABASE_DB_READ_URL`) for lag-tolerant reads.
- [x] `/api/agents/usage`, per-agent daily ceilings for model-backed agents, agent exposure levels.
- [x] Classifier rules: `locator-ambiguous`, `wrong-target`, `prompt-injection` (ASSESSMENT §8).
- [x] HAR-based network replay for third-party responses (ASSESSMENT §8): runs record non-app traffic to `network.har` (scripted and plugin agents), fixtures carry it, replays serve it and abort anything unrecorded.
- [x] Lint actually runs: eslint 9 + typescript-eslint flat config, clean, enforced in CI and the pre-commit hook.

## Walkthrough insights & sharing (2026-10-20)
- [x] What the recorder found, per walkthrough: console errors, failed requests, page load times, links found vs pages visited, controls with no name, links whose text says nothing. Measured from the trace it captured (`packages/core/src/record/insights.ts`); older walkthroughs are read from their trace on demand.
- [x] What changed between two walkthroughs of the same site: pages added or gone, titles, statuses, controls that came and went, errors new or fixed. The question a scheduled recording exists to answer.
- [x] Share links: a public page that plays the walkthrough with its captions, chapters and transcript, for anyone who has the link. The token is the permission, links expire, and the owner can stop one.
- [x] Copy the failure (a lab run) as a note for a ticket: what the application recorded, what the agent claimed, the rules' findings, and the command that reproduces it.

## Up next (v0.6+)
- [x] Voice cloning / custom voice upload for narration (upload + playback fallback).
- [ ] Code-signed installers (Windows/macOS) to remove SmartScreen warnings. Blocked on buying certificates; unsigned by decision for now (docs/SIGNING.md).
- [ ] Native mobile companion app: Capacitor shell scaffolded in `apps/mobile` (Android + iOS projects, connect screen, opens the server's mobile view). Not yet built or run on a device: needs Android Studio / Xcode.
- [x] Additional TTS/STT providers and auto-caption generation from recorded audio (11 TTS, 5 STT).
- [x] First-run sample site: "Try it on a sample site" on the Record screen records a sample CRM the recorder starts for the job.
- [x] Hosted demo sandbox, code side: a sample-site recording is a job flag (`demo: true`), so the worker starts and records its own MiniCRM wherever it runs; on a shared server it's opt-in with `LAB_DEMO_SITE=1` (DEPLOY-AWS §6).
- [ ] Hosted demo sandbox, the deployment itself: needs a public server (DEPLOY-AWS) with `LAB_DEMO_SITE=1`.
- [x] Plugin API for custom faults and agent adapters (`plugins.ts`, docs/PLUGINS.md, example `examples/plugins/prompt-injection.ts`).