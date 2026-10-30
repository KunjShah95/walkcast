# Walkthrough video improvements

## 1. Kokoro as the default natural voice

Kokoro (`packages/core/src/record/voice.ts`) was wired into the backend in a prior commit but
never reached the dashboard: `TtsProvider` (`apps/desktop/dashboard/src/lib/prefs.ts`) has no
`"kokoro"` entry, so the picker in `Studio.tsx`/`Settings.tsx` can't offer it and users stay on
the deliberately flat flite/SAPI fallback.

Changes:
- Add `"kokoro"` to `TtsProvider` and `PROVIDERS` in `prefs.ts`.
- Add a `kokoro` entry to `PROVIDER_NAME` in `Studio.tsx` and wherever `Settings.tsx` lists
  providers for the picker, using the existing `CATALOG.kokoro` voices from `voices.ts`.
- Backend default order in `chooseVoiceEngine()` (`voice.ts`): when no `LAB_TTS_PROVIDER` is set
  (the "flite" default case), try `kokoroEngine()` first if `kokoroAvailable()`, falling back to
  flite/SAPI only when Kokoro isn't installed. Explicit `LAB_TTS_PROVIDER=flite` still forces the
  old behavior for anyone who wants it.
- Update the Settings copy that currently says "basic offline voice (robotic) or no voice at all"
  to mention Kokoro as the default natural offline option.

## 2. Trim dead-air between screens

Root cause: `site.ts` calls `tools.waitForQuiet(400-600ms settle, up to 15000ms timeout)` after
every `goto`/click while the recorder is still rolling, so real idle seconds land in
`video.webm`. `narration.ts` times captions directly off the recorded `startedAt`/`endedAt`
timestamps, so the idle time ships untouched in the final video.

The wait logic itself stays as-is — it exists for capture reliability (make sure the page is
actually loaded before the next action/claim is recorded) and shortening it risks capturing
half-loaded pages.

Instead, add a post-process trim pass in `media.ts`, run on `video.webm` before mux:
- Run ffmpeg's `freezedetect` filter (or equivalent near-identical-frame detection) over the raw
  recording to find static stretches longer than ~1.5s.
- For each stretch beyond that threshold, cut it down to a fixed short hold (trim, not a
  speed-ramp — avoids audio pitch/sync complications and keeps the ffmpeg filter chain simple).
- Build a time-remap table from the cuts and shift every `Caption` (`start`/`end`) and the
  underlying trace timestamps consumed by `captionsFor` so narration stays in sync with the
  shortened timeline.
- This runs before narration synthesis timing is finalized, so caption text doesn't need to
  change — only the clock it's placed against.

Scope boundary: this only touches the render/mux step in `media.ts`. It does not change
`site.ts`'s capture behavior, `tools.ts`'s wait helpers, or anything in the recorder/trace layer.

## 3. Download without voice

`video.webm` (the silent original capture) and `muxSilent()` in `media.ts` already exist
internally but nothing in the UI exposes them.

Changes:
- Add a "Download (no voice)" link in `Library.tsx`, next to the existing Transcript/Step guide
  links, following the same pattern as `transcriptUrl()`.
- Serving rule: if `video.webm` exists for the recording, serve it (or an on-demand mp4 remux of
  it so the download is a normal `.mp4`, reusing `muxSilent()`); build and cache that remux once
  per recording directory rather than on every click.
- This is a download of an *existing* recording's silent variant — it does not change the
  record-time `ttsProvider=none` flow, which already exists for recording with no voice from the
  start.

## Out of scope

Per explicit scope decision: no other improvements beyond these three in this pass (caption
readability, narration speed control, etc. were considered and deferred).
