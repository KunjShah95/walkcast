"""Narrate the fresh Walkcast launch film with the locally installed Kokoro model."""
import sys
import numpy as np
import soundfile as sf
from kokoro import KPipeline

VOICE = sys.argv[1] if len(sys.argv) > 1 else "af_heart"
OUT = sys.argv[2] if len(sys.argv) > 2 else "vo-fresh.wav"
VTT = sys.argv[3] if len(sys.argv) > 3 else "../walkcast-launch-fresh.vtt"
SR = 24000

# (start, end-of-window, spoken line) — the line is given room before the visual cut.
LINES = [
    (0.5, 3.9, "Every launch needs a walkthrough. Nobody enjoys making it."),
    (4.1, 5.9, "Write the script."),
    (6.05, 7.0, "Record the screen."),
    (7.0, 8.0, "Retake. Retake."),
    (8.05, 9.0, "Record the voice."),
    (9.05, 10.0, "Sync the captions."),
    (10.3, 13.9, "Then the product changes, and the walkthrough is already out of date."),
    (14.2, 17.9, "The agent says done. The application records what really happened."),
    (18.1, 20.35, "Seventy-six said success. The app disagreed."),
    (20.45, 21.75, "No repro. Just flaky."),
    (23.1, 24.2, "Meet Walkcast."),
    (24.4, 29.8, "Paste a link. Get a narrated video walkthrough of your website."),
    (30.4, 35.9, "Confirm you're authorized to test the site, then press record."),
    (36.6, 40.1, "A real browser opens the site and clicks through its pages."),
    (40.3, 43.1, "The narration follows what actually happened."),
    (43.3, 45.3, "Captions. Chapters. Transcript."),
    (45.4, 48.25, "At a CAPTCHA or two-factor prompt, Walkcast stops."),
    (48.3, 53.8, "Choose natural offline Kokoro, a cloud voice, or record your own."),
    (54.25, 55.3, "Same recorder."),
    (55.45, 56.7, "Second job."),
    (56.75, 60.3, "Walkcast Lab turns failed browser-agent runs into regression tests."),
    (60.4, 64.2, "Capture the failure. Classify the cause. Freeze it. Replay it."),
    (64.4, 67.9, "Causes come from the app's recorded state, not an LLM judge."),
    (68.2, 73.8, "Did the next version fix it, or break something else? Now you know."),
    (74.1, 76.0, "Real browser."),
    (76.1, 78.0, "Real state."),
    (78.1, 80.0, "Real evidence."),
    (80.7, 87.0, "Walkcast. Show what actually happened. Free and open source. Visit our website."),
]

pipeline = KPipeline(lang_code=VOICE[0])
out = np.zeros(int(88 * SR), dtype=np.float32)
cues = []
for start, end, text in LINES:
    # Misaki recognizes these as custom product words through its documented pronunciation markup.
    spoken = (text.replace("walkthrough", "[walkthrough](/wˈɔkθɹu/)")
                  .replace("Walkcast", "[Walkcast](/wˈɔlkæst/)")
                  .replace("Kokoro", "[Kokoro](/kˈOkəɹO/)"))
    speed = 1.04
    for _ in range(6):
        chunks = [audio for _, _, audio in pipeline(spoken, voice=VOICE, speed=speed)]
        audio = np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.float32)
        nonzero = np.where(np.abs(audio) > 0.01)[0]
        if len(nonzero):
            audio = audio[max(0, nonzero[0] - 240):nonzero[-1] + 1200]
        duration = len(audio) / SR
        if duration <= end - start or speed >= 1.3:
            break
        speed = round(min(1.3, speed * min(1.25, (duration / (end - start)) * 1.03)), 3)
    if duration > end - start:
        raise RuntimeError(f"Kokoro line overruns its visual window ({duration:.2f}s / {end-start:.2f}s): {text}")
    offset = int(start * SR)
    out[offset:offset + len(audio)] += audio
    cues.append((start, start + duration, text))
    print(f"{start:6.2f} {duration:5.2f}s speed {speed} {text}")

sf.write(OUT, out, SR)

def stamp(seconds):
    hours = int(seconds // 3600)
    minutes = int(seconds % 3600 // 60)
    return f"{hours:02d}:{minutes:02d}:{seconds % 60:06.3f}"

with open(VTT, "w", encoding="utf-8") as handle:
    handle.write("WEBVTT\n\n")
    for n, (start, end, text) in enumerate(cues, 1):
        shown = text.replace("dot kunjshah dot in", "kunjshah.in")
        handle.write(f"{n}\n{stamp(start)} --> {stamp(end)}\n{shown}\n\n")
