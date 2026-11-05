"""Create short, readable narration and matching captions for a Brag-style site film."""
import json
import sys

import numpy as np
import soundfile as sf
from kokoro import KPipeline

VOICE = sys.argv[1] if len(sys.argv) > 1 else "af_heart"
OUT = sys.argv[2] if len(sys.argv) > 2 else "voice.wav"
VTT = sys.argv[3] if len(sys.argv) > 3 else "captions.vtt"
CONFIG = sys.argv[4] if len(sys.argv) > 4 else ""
SR = 24000
DURATION = 20
tone = "polished"
try:
    with open(CONFIG, encoding="utf-8") as handle:
        tone = json.load(handle).get("tone", tone)
except (OSError, json.JSONDecodeError):
    pass

LINES_BY_TONE = {
    "polished": [
        (0.45, 2.8, "A closer look at what you are building."),
        (3.25, 6.4, "Start with the first impression."),
        (7.25, 10.4, "Explore the details that make it distinct."),
        (11.25, 14.7, "See how the experience comes together."),
        (16.7, 19.4, "One real visit. One clear story."),
    ],
    "cinematic": [
        (0.45, 2.8, "Every great experience starts somewhere."),
        (3.25, 6.4, "Step inside. See the first impression."),
        (7.25, 10.4, "Move closer. The details unfold."),
        (11.25, 14.7, "The whole experience, brought into view."),
        (16.7, 19.4, "One real visit. A story worth sharing."),
    ],
    "playful": [
        (0.45, 2.8, "Your website is ready for its close-up."),
        (3.25, 6.4, "First up, the very first impression."),
        (7.25, 10.4, "Now, the details that make it yours."),
        (11.25, 14.7, "Look at that. It all comes together."),
        (16.7, 19.4, "One real visit. Pretty good story."),
    ],
}

pipeline = KPipeline(lang_code=VOICE[0])
out = np.zeros(DURATION * SR, dtype=np.float32)
cues = []
for start, end, text in LINES_BY_TONE.get(tone, LINES_BY_TONE["polished"]):
    speed = 1.0
    for _ in range(7):
        chunks = [audio for _, _, audio in pipeline(text, voice=VOICE, speed=speed)]
        audio = np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.float32)
        nonzero = np.where(np.abs(audio) > 0.01)[0]
        if len(nonzero):
            audio = audio[max(0, nonzero[0] - 240):nonzero[-1] + 1200]
        duration = len(audio) / SR
        if duration <= end - start or speed >= 1.32:
            break
        speed = round(min(1.32, speed * min(1.25, (duration / (end - start)) * 1.02)), 3)
    if duration > end - start:
        raise RuntimeError(f"Narration line overruns its scene ({duration:.2f}s / {end-start:.2f}s): {text}")
    offset = int(start * SR)
    out[offset:offset + len(audio)] += audio
    cues.append((start, start + duration, text))
    print(f"{start:5.2f} {duration:5.2f}s speed {speed} {text}")

sf.write(OUT, out, SR)

def stamp(seconds):
    minutes = int(seconds // 60)
    return f"00:{minutes:02d}:{seconds % 60:06.3f}"

with open(VTT, "w", encoding="utf-8") as handle:
    handle.write("WEBVTT\n\n")
    for number, (start, end, text) in enumerate(cues, 1):
        handle.write(f"{number}\n{stamp(start)} --> {stamp(end)}\n{text}\n\n")
