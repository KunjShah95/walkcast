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
- [x] `doctor` reports store health, migration status, worker leases.
- [x] Runtime guard against two processes sharing one FileStore.
- [x] Credentials/API keys entry UI in Settings (stored locally, applied immediately).

## Mid term (v0.4) — product
- [x] Per-recording TTS provider already wired; add voice preview for cloud providers.
- [x] Caption editing in the dashboard (already partially: renarrate/voiceover).
- [x] Multi-language UI strings (i18n) for Indian languages.
- [x] Export recording as SRT/VTT/JSON transcript (`/api/recordings/:id/transcript?format=`).
- [x] Scheduled/recurring recordings (cron-like) for change detection.
- [x] Webhook on job completion (outbox pattern — flagged in SYSTEM-DESIGN §6).

## Longer term (v0.5+) — lab & research
- [x] Run the live-LLM arm of the §7 experiment (needs API keys) and publish raw results.
- [x] Upstream the dynamic fixture tier to Stagehand #2841.
- [x] Voice cloning / custom voice upload for narration.
- [x] STT-driven caption generation (auto-captions from recorded audio).
- [x] Mobile companion (view recordings, trigger runs) — web mobile view.

## Release
- [x] Unsigned installers by design (no signing certs; docs/SIGNING.md).

## Non-goals
- Competing with Browserbase/Playwright as a general browser agent.
- Multi-tenant SaaS beyond Supabase-backed single deployment.
- Supporting third-party sites without authorization attestation.

## Up next (v0.6+)
- [x] Voice cloning / custom voice upload for narration (upload + playback fallback).
- [ ] Code-signed installers (Windows/macOS) to remove SmartScreen warnings.
- [ ] Native mobile companion app (beyond the responsive web view).
- [ ] Additional TTS/STT providers and auto-caption generation from recorded audio.
- [ ] Hosted demo sandbox with sample sites for first-run walkthroughs.
- [ ] Plugin/extension API for custom fault definitions and agent adapters.