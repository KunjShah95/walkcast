# Walkcast launch video

`walkcast-launch.mp4`: 88 s, 1920×1080, 30 fps, H.264 + AAC stereo. `walkcast-launch-poster.jpg`
is the thumbnail.

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
| 1:20 | End card | Logo, "Show what actually happened.", MIT, the price is zero, the clone command. |

Every number is taken from `results/` or from the Lab dashboard screenshots in `docs/screenshots/`. None are made up.

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
node render.mjs "$PWD/video.html" silent.mp4 30 0 88
ffmpeg -i silent.mp4 -i score.wav -c:v libx264 -crf 20 -preset slow -pix_fmt yuv420p \
  -c:a aac -b:a 192k -movflags +faststart -shortest ../walkcast-launch.mp4
```

`video.html` is a deterministic timeline. `render(t)` sets every CSS animation's `currentTime`
to `t` and drives the counters, typing, cursor and footage, and the renderer screenshots each
frame. Open it in a browser and call `render(42)` in the console to scrub to any moment.
