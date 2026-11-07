# Changelog

All notable changes to Walkcast are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/). The GitHub release body for each version lives in
`.github/release-notes/v<version>.md`.

## [0.10.9] - 2026-11-07

### Fixed

- Launch narration now normalizes unsupported website title characters and retries with a safe line when Kokoro/Misaki returns a missing phoneme.
- Voice recording explains browser and Windows microphone permission steps, handles denied devices clearly, and reports video playback failures instead of silently recording against a paused player.
- Own voice uploads have a longer request window for media conversion.

### Added

- Launch Studio can render a narrated film and a matching music-only MP4 in one job, or render music only without setting up a speech model.
- The download page now points to the published 0.10.8 installers and retains 0.10.7 and older downloads.

## [0.10.8] - 2026-11-06

### Added

- Launch Studio's natural walkthrough films follow the real capture chronologically, with page-aware chapter timing, editorial motion, an original full-length score, and automatic narration.
- Connected voice pipeline support for an owner-approved voice profile through the custom TTS endpoint.

### Changed

- Launch films export only the finished MP4 and poster; scripts, transcripts, caption files, and storyboard downloads are not generated.
- Launch Studio supports continuous films up to 58 seconds and adapts score accents to recorded page changes.
- Release metadata and the installed app version are advanced to 0.10.8.

## [0.10.7] - 2026-11-05

### Fixed

- Linux desktop release validation now selects Tauri v2's signed `.AppImage` payload, with a legacy `.AppImage.tar.gz` fallback.
- Settings makes the signed, in-place desktop update flow easier to find.

### Changed

- Added a ranked search-query map with evidence limits, current citation sources and crawl-measurement steps.
- Removed unsupported AI-search citation multipliers from the SEO notes and clarified that crawl eligibility does not guarantee indexing or citation.

## [0.10.2] - 2026-11-04

First release of the 0.10 line. Tags `v0.10.0` and `v0.10.1` exist, but their builds stopped
before publishing, so this release includes everything planned for 0.10.0.

### Added

- Batch render: select up to 10 recordings in the Library and re-frame them to 9:16 or 1:1 in
  one background job, with progress, per-recording results with download and show-in-folder,
  cancel, and re-attach after reload.
- `POST /api/recordings/batch-render` endpoint and `batch-render` job kind; all ids are checked
  for existence and ownership before anything is enqueued; a batch counts as one active job.
- Running-job chip in the header (replaces the always-on LIVE badge) and pre-checks of the
  one-active-job limit on every start button.
- Desktop notifications when a job finishes; `walkcast://record?url=` deep links and URL drop.
- Share button plus a grouped Export menu in place of ten export buttons.
- System / Light / Dark theme setting; reworked dark tokens with distinct signal, record and pass.
- Lab: "Connect your agent" empty states, configurable Experiments that resume, Compare from Runs.
- `GET /api/diagnostics` scrubbed JSON bundle and a Settings action to download it.
- `POST /api/recordings/:id/reveal` (desktop) and `POST /api/shutdown` (desktop, token-gated).
- Env vars `LAB_MAX_BATCH_RENDER_ITEMS`, `LAB_MIN_FREE_DISK_MB`, `LAB_LAUNCH_RENDER_TIMEOUT_MS`,
  `LAB_ALLOWED_HOSTS`.
- Postgres migration `20261104000000_batch_render_jobs.sql`.
- Website: hero links to the product demo video guide and the Loom comparison.

### Changed

- Server routes split from one handler into `apps/desktop/server/routes/*` with a route table
  and per-route auth labels; behavior locked by `test/route-inventory.test.ts`.
- Desktop sidecar is pre-bundled with esbuild (about 6x faster start) and uses ports 4317-4326.
- Releases publish as drafts, pass an installed-build smoke test on Windows, then are promoted;
  optional Windows code signing when certificate secrets are configured.
- Desktop logs rotate at 5 MB, keeping five; dashboard polling is logged at debug.

### Fixed

- Quitting during a recording no longer kills the local server mid-job; the quit guard and tray
  status read the real worker state, and shutdown drains the running job.
- Closing the window hides to the tray instead of quitting.
- Batch-render deadline now covers a full ffmpeg encode per item; cancelling stops ffmpeg; the
  recording summary is written atomically.
- Checkmarks on accent backgrounds were unreadable in dark mode.
- Launch Studio renders get a timeout, are killed on quit, and their temp folders are swept.
- The file-store queued-recording end-to-end test runs in CI again; the Postgres variant stays
  quarantined in CI until an intermittent job stall is root-caused (issue #6).
- Jobs check free disk space before starting; ENOSPC is reported clearly.

### Security

- Provider keys and the job sealing key are encrypted with a master key held in the OS keychain;
  plaintext credentials are migrated and removed.
- Host-header check against DNS rebinding on the local server; Content Security Policy on `/app`.
- Recording authorization confirmations are stored with user, URL and time.

### Known limitations

- The batch endpoint has no idempotency key.

## [0.9.1] - 2026-11-03

### Added

- Launch Studio accepts a website URL: record the site, then generate a launch film from its
  captured pages and titles.
- Site-specific 1080p launch films with local Kokoro narration, music, and captions, saved with
  the source recording.

Earlier releases: see [GitHub Releases](https://github.com/KunjShah95/walkcast/releases).

[0.10.2]: https://github.com/KunjShah95/walkcast/compare/v0.9.1...v0.10.2
[0.10.7]: https://github.com/KunjShah95/walkcast/compare/v0.10.6...v0.10.7
[0.10.8]: https://github.com/KunjShah95/walkcast/compare/v0.10.7...v0.10.8
[0.9.1]: https://github.com/KunjShah95/walkcast/releases/tag/v0.9.1
