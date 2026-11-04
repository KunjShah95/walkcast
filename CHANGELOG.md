# Changelog

All notable changes to Walkcast are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/). The GitHub release body for each version lives in
`.github/release-notes/v<version>.md`.

## [0.10.0] - Unreleased

### Added

- Batch render: select several recordings in the Library and re-frame them all to 9:16 or 1:1
  in one background job, with progress, per-recording ok/failed results, and cancel.
- `POST /api/recordings/batch-render` endpoint and `batch-render` job kind. All ids are checked
  for existence and ownership before anything is enqueued; a batch counts as one active job.
- `LAB_MAX_BATCH_RENDER_ITEMS` environment variable (default 10) caps recordings per batch.
- Postgres migration `20261104000000_batch_render_jobs.sql` allowing the new job kind.
- `docs/batch-render.md` and `scripts/batch-render-bench.mjs`.
- Website: hero links to the product demo video guide and the Loom comparison.

### Known limitations

- A running batch is not re-attached in the Library after a page reload.
- The batch endpoint has no idempotency key.

## [0.9.1] - 2026-11-03

### Added

- Launch Studio accepts a website URL: record the site, then generate a launch film from its
  captured pages and titles.
- Site-specific 1080p launch films with local Kokoro narration, music, and captions, saved with
  the source recording.

Earlier releases: see [GitHub Releases](https://github.com/KunjShah95/walkcast/releases).

[0.10.0]: https://github.com/KunjShah95/walkcast/compare/v0.9.1...v0.10.0
[0.9.1]: https://github.com/KunjShah95/walkcast/releases/tag/v0.9.1
