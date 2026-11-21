# Known issues

Status of the findings in [the 2026-10-22 bug report](archive/BUGS-2026-10-22.md), re-checked against the
code on 2026-11-15. "Fixed" means the code now does what the report asked for (checked by reading it, and
for the ones marked **test** by a test). "Not re-checked" means nobody has looked since the report; treat it
as open until someone does.

| ID | Finding | Status |
|----|---------|--------|
| P1-1 | Cron schedules ran hourly | Fixed: `cron.ts` parses five-field cron, bad input is rejected |
| P1-5 | Journeys ignored `maxSeconds` / `maxPages` | Fixed: waits clamped, cap enforced on click-reached pages, clock starts with the walk (**test**) |
| P1-6 | Cursor glide hung on a hidden page | Fixed: glide is raced against a timer; every page evaluate has a deadline (**test**) |
| P1-8 | Un-scrubbed HAR left on disk | Fixed |
| P1-9 | Harness errors counted in detection / false-positive rates | Fixed: `experiment.ts` counts them apart (`harnessErrors`) |
| P1-10, P1-11 | No timeout on ChatGPT / TTS downloads | Fixed: `AbortSignal.timeout` on the voice providers; retry in `llm/retry.ts` |
| P2-6 | robots.txt wildcards and `Allow` ignored | Fixed: `robots.ts` handles both |
| P2-9 | Silent recordings overlapped captions | Fixed (captions are sequenced in `captionsFor`) |
| P2-10 | Zoom-filter failure left no MP4 | Fixed: `withZoomFallback` |
| P1-2, P1-3, P1-4, P1-7, P1-12, P2-1 to P2-5, P2-7, P2-8, P2-11 to P2-14, P3 | See the report | Not re-checked |

## Open, found since

- Test suite: `record.test.ts` is slow (about 90s alone) and times out under heavy parallel load. Run browser and
  ffmpeg tests with `--test-concurrency=1`.
- `dist/web` is shared between web-build tests; building into a temp dir per test would remove the contention.
