# Walkcast launch video

`walkcast-launch.mp4`: 88 s, 1920×1080, 30 fps, H.264 + AAC stereo, narrated, with an English
subtitle track. `walkcast-launch.vtt` holds the same captions for YouTube or LinkedIn uploads.
`walkcast-launch-poster.jpg` is the thumbnail.

## Story

| Time | Act | On screen |
| --- | --- | --- |
| 0:00 | History | "A short history of the product walkthrough." |
| 0:04 | The old way | Power cuts on every beat: write the script, record the screen, retake, retake, voice-over, captions, with a time-spent counter running to 4h 12m. |
| 0:10 | Stale | The finished walkthrough gets a "Deployed v1.5" toast and an OUT OF DATE stamp. |
| 0:14 | Second problem | An agent reports "Done."; the app's own records say the owner is wrong (the real `stale-owners` run from the Lab). |
| 0:18 | Scale | 76 runs claimed success that the app disagreed with (Lab overview: 162 of 378 failed). No repro, no cause, just "flaky". |
| 0:22 | Drop | The logo builds in, then "Paste a link. Get a narrated walkthrough." |
| 0:30 | One URL | The URL gets typed in, the authorization box ticked, then "Make my walkthrough" pressed. |
| 0:36 | Recording | Real footage from `apps/web/public/assets/demo.mp4`, with its captions, chapters, the transcript and four features called out. |
| 0:48 | Output | recording.mp4, captions.vtt, narration.wav, transcript, trace.jsonl, then a marquee of voice providers. |
| 0:54 | Breakdown | "Same recorder. Second job." Walkcast Lab. |
| 1:00 | Pipeline | Failed run → cause + evidence → fixture → replay × k; the cause taxonomy; `unexplained` stays unexplained. |
| 1:08 | Results | v0 0/5, v1 5/5, v2 4/5 (regression caught), with Wilson intervals from `results/summary.md` and the scripted-agent caveat. |
| 1:14 | Power cuts | Real browser. Real state. Real evidence. |
| 1:20 | End card | Logo, "Show what actually happened.", MIT, the price is zero, walkcast.kunjshah.in. |

Every number is taken from `results/` or from the Lab dashboard screenshots in `docs/screenshots/`. None are made up.

## Re-cut plan (v2)

The 88 s cut above is shipped. It predates two features that have since landed
(`record/live-view.ts` live preview, and `record/journey.ts` journey-as-test).
v2 re-cuts the film to include them and tightens pacing to 78 s, plus 45 s and
15 s social cuts. Full spec: `docs/launch/INSPIRATION.md`. Machine-readable shot
list: `docs/launch/source/scenes.json`. Inspiration patterns that drive the
decisions come from filmagic.app, recent.design, raylight.app, remotion.dev/showcase,
screenlane.com, godly.website, motionographer.com, vimeo.com/channels/staffpicks
and saasframe.io.

A re-cut needs the full build pipeline; `video.html` alone is not the deliverable. For new product
footage, use the fresh rebuild below. It extracts proof shots from a new Walkcast recording instead
of the older CRM demo used in the original launch cut.

## Build a fresh launch cut

In the desktop app, open **Launch Studio**, paste any website URL, and press **Record site**. After
recording its pages, return to Launch Studio, choose that recording, a Kokoro narrator, a creative
direction, and a video format. **Make Brag launch film** creates a 20-second storyboarded film from
three timed excerpts of that recording, with animated page cards, original tone-matched music, locally
generated narration, and captions. Rendering stays on the computer. The MP4, poster, captions, and
downloadable storyboard are saved beside the source recording. The command below still builds the
original Walkcast-specific launch cut from a raw MP4.

The Brag-style local film supports polished, cinematic, and playful directions in landscape (16:9),
vertical (9:16), and square (1:1). It follows the installed Brag skill's creative rules—short
hook/reveal/highlights/outro, readable text, real product footage, and no invented claims—using
Walkcast's built-in Playwright/FFmpeg renderer and original generated score. Each feature beat plays
a short clip from the source recording. It does not require a network connection or a separate
Hyperframes installation.

Capture a new recording of the current product site, then pass its raw MP4 to the launch builder:

```powershell
npm run kokoro:setup
npm run launch:video -- recordings/<fresh-recording-id>/recording.mp4
```

The builder makes three proof shots from the fresh capture (Home, Download, and Lab), renders the
88-second motion timeline with the installed Chrome browser, generates an `af_heart` Kokoro voice
track, writes matching captions, creates the original Walkcast music score and effects, ducks the
music under narration, resamples the stereo master to 48 kHz, and normalizes the mix to -14 LUFS.
The homepage proof shot trims the page below the hero so its embedded legacy demo is not reused.
Set `KOKORO_VOICE` to another installed
Kokoro voice id if desired. The MP4, poster, and intermediate renders are written to
`source/output-fresh/`; the VTT is `walkcast-launch-fresh.vtt`.

This command requires `ffmpeg` with libx264, Node/Playwright, Python with Kokoro, NumPy and
SoundFile, plus a fresh recorder MP4. `npm run kokoro:warm` loads Kokoro once and checks that its
model cache can synthesize speech.

## Voice-over

The fresh launch builder speaks `source/voiceover-fresh.py` with Kokoro (`af_heart` voice), an
open-weight neural TTS (Apache-2.0) that runs locally after the model is cached. The script places
each line on its cue, trims silence, adjusts pace only when needed to fit its visual window, and
writes the VTT. The music is sidechain-ducked under the voice, and the mix is normalized to
−14 LUFS. `source/voiceover.py` remains the script for the original cut.

## Music

The score is original and was synthesized from scratch by `source/music.py` (numpy only), so it
carries no licence restrictions. It runs at 120 BPM in A minor (i–VI–III–VII) and goes: a filtered pad with
clock ticks → bass and hats with a snare-roll riser → a four-on-the-floor drop at 0:22 with
sidechained chords and a 16th arp → a breakdown at 0:54 → a climax at 1:14 → a ring-out. A sub impact
and a flash land on each power cut, from one shared list of cut times (`CUTS` in `video.html`,
the impact list in `music.py`).

## Rebuilding

```sh
cd docs/launch/source
./prepare.sh                                   # demo segments → frames/
npm i playwright@1.56.1 && npx playwright install chromium
python3 music.py score.wav
python3 -m venv .venv && .venv/bin/pip install kokoro-onnx soundfile
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
.venv/bin/python voiceover.py kokoro-v1.0.onnx voices-v1.0.bin af_heart vo.wav ../walkcast-launch.vtt
node render.mjs "$PWD/video.html" silent.mp4 30 0 88
ffmpeg -i score.wav -i vo.wav -filter_complex "
  [1:a]aresample=44100,highpass=f=80,equalizer=f=3000:t=q:w=1.2:g=2.5,acompressor=threshold=0.1:ratio=3:attack=5:release=120:makeup=1.6,pan=stereo|c0=c0|c1=c0,asplit=2[vo][key];
  [0:a]volume=0.55[mus];[mus][key]sidechaincompress=threshold=0.02:ratio=10:attack=25:release=400[duck];
  [duck][vo]amix=inputs=2:weights='1 1.25':normalize=0,loudnorm=I=-14:TP=-1.2:LRA=11" -ar 48000 mix.wav
ffmpeg -i silent.mp4 -i mix.wav -i ../walkcast-launch.vtt -map 0:v -map 1:a -map 2 -c:v copy \
  -c:a aac -b:a 192k -c:s mov_text -metadata:s:s:0 language=eng -movflags +faststart -t 88 ../walkcast-launch.mp4
```

`video.html` is a deterministic timeline. `render(t)` sets every CSS animation's `currentTime`
to `t` and drives the counters, typing, cursor and footage, and the renderer screenshots each
frame. Open it in a browser and call `render(42)` in the console to scrub to any moment.
