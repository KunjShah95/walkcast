"""Generate narration and captions for a website-specific launch film with local Kokoro."""
import json
import sys

import numpy as np
import soundfile as sf
from kokoro import KPipeline

VOICE = sys.argv[1] if len(sys.argv) > 1 else "af_heart"
OUT = sys.argv[2] if len(sys.argv) > 2 else "voice.wav"
VTT = sys.argv[3] if len(sys.argv) > 3 else "captions.vtt"
CONFIG = sys.argv[4]
SR = 24000
with open(CONFIG, encoding="utf-8") as handle:
    site = json.load(handle)
host = str(site.get("host") or "this website")
pages = [str(page.get("title") or "the product") for page in site.get("pages", [])]
while len(pages) < 3:
    pages.append(pages[-1] if pages else host)
def concise(value, limit):
    value = value.removeprefix("www.").strip()
    if len(value) <= limit:
        return value
    return (value[:limit].rsplit(" ", 1)[0] or value[:limit]).rstrip(".,:;-")
spoken_host = concise(host, 30)
pages = [concise(page, 42) for page in pages]

LINES = [
    (0.5, 4.7, f"A closer look at {spoken_host}."),
    (5.2, 9.5, f"First, {pages[0]}."),
    (10.0, 14.5, "A real browser visit, captured straight from the site."),
    (15.2, 19.5, f"Next, {pages[1]}."),
    (20.0, 24.5, "Every screen in this film comes from an actual recorded visit."),
    (25.2, 29.5, f"Then, {pages[2]}."),
    (30.0, 34.5, "A clear look at the details people came to see."),
    (35.0, 41.5, f"Explore {spoken_host} with Walkcast. A real visit."),
]
pipeline = KPipeline(lang_code=VOICE[0])
out = np.zeros(42 * SR, dtype=np.float32)
cues = []
for start, end, text in LINES:
    speed = 1.02
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
