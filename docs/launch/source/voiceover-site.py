"""Generate an automatic, short narration track from the recording's real page titles.

No transcript, subtitles, script, or captions file is written. The narration text exists only in
memory while Kokoro synthesizes it; it describes the recorded visit and avoids inferred claims.
"""
import json
import base64
import os
import re
import subprocess
import sys
import tempfile
import unicodedata
import urllib.request
import wave
from pathlib import Path

VOICE = sys.argv[1] if len(sys.argv) > 1 else "af_heart"
OUT = sys.argv[2] if len(sys.argv) > 2 else "voice.wav"
CONFIG = sys.argv[3] if len(sys.argv) > 3 else ""
DURATION = max(15, min(90, float(sys.argv[4]) if len(sys.argv) > 4 else 58))
SR = 24000
PROVIDER = os.environ.get("WALKCAST_LAUNCH_VOICE_PROVIDER", "kokoro")

with open(CONFIG, encoding="utf-8") as handle:
    site = json.load(handle)
host = " ".join(str(site.get("host") or "this website").split())[:45]
brand = " ".join(str(site.get("title") or host).split())[:34]
pages = []
for page in site.get("pages", []):
    name = " ".join(str(page.get("title") or "").split())[:50]
    if name and name.casefold() not in [item.casefold() for item in pages]:
        pages.append(name)

# Conversational lines are composed from the pages actually present in the Walkcast capture.
# The generated words are used only to synthesize speech; no script or transcript is exported.
page_line_count = max(1, min(5, int((DURATION - 5) // 3.5)))
lines = [f"Welcome to {brand}."]
for i, page in enumerate(pages[:page_line_count]):
    lead = ["First,", "Next,", "Then,", "Here,", "And finally,"][i]
    lines.append(f"{lead} {page[:32]}.")
lines.append(f"That's {brand}.")
if PROVIDER == "kokoro":
    from kokoro import KPipeline
    import numpy as np
    import soundfile as sf
    voice = KPipeline(lang_code=VOICE[0])
else:
    voice = None

def request_audio(phrase):
    # Adapter contract: POST {text, language, voice} to LAB_TTS_ENDPOINT. Return WAV/MP3 bytes,
    # or JSON with base64 audio/audioContent. This lets an owner-consented voice pipeline serve
    # its own voice profile without coupling Walkcast to one vendor's clone model.
    endpoint = os.environ.get("LAB_TTS_ENDPOINT", "").strip()
    profile = os.environ.get("WALKCAST_LAUNCH_VOICE_ID", "").strip()
    key = os.environ.get("LAB_TTS_API_KEY", "").strip()
    body = json.dumps({"text": phrase, "language": os.environ.get("LAB_TTS_LANGUAGE", "en"), "voice": profile}).encode()
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    request = urllib.request.Request(endpoint, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            raw = response.read()
            if "application/json" in response.headers.get("Content-Type", ""):
                result = json.loads(raw.decode("utf-8"))
                encoded = result.get("audio") or result.get("audioContent")
                if not encoded:
                    raise RuntimeError("Connected voice endpoint returned no base64 audio.")
                raw = base64.b64decode(encoded)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"Connected voice endpoint returned HTTP {error.code}.") from None
    except urllib.error.URLError:
        raise RuntimeError("Could not reach the configured voice endpoint.") from None
    return raw

def slots():
    # Keep breathing room between phrases so the captured interface can be watched naturally.
    slot = max(4.0, DURATION - 4.0) / len(lines)
    return [(phrase, 1.0 + index * slot, min(4.8, slot * 0.86)) for index, phrase in enumerate(lines)]

def phonemizer_safe(phrase):
    """Keep page titles from feeding Kokoro tokens with missing phonemes (Misaki None + str crash)."""
    normalized = unicodedata.normalize("NFKD", phrase).encode("ascii", "ignore").decode("ascii")
    candidate = re.sub(r"[^A-Za-z0-9 ,.!?'’-]", " ", normalized)
    candidate = re.sub(r"\s+", " ", candidate).strip()
    if not candidate:
        return "Explore this website."
    try:
        voice.g2p(candidate)
        return candidate
    except (TypeError, AttributeError):
        # Misaki has hit an upstream bug on some out-of-lexicon product names. Check individual
        # words and omit only the token it cannot phonemize; retain the rest of the real page title.
        safe_words = []
        for word in candidate.split():
            try:
                voice.g2p(word)
                safe_words.append(word)
            except (TypeError, AttributeError):
                continue
        candidate = " ".join(safe_words).strip(" ,.!?'’- ")
        if candidate:
            try:
                voice.g2p(candidate)
                return candidate
            except (TypeError, AttributeError):
                pass
        return "Explore this website."

if PROVIDER == "kokoro":
    out = np.zeros(round(DURATION * SR), dtype=np.float32)
    for line_number, (phrase, start, budget) in enumerate(slots(), 1):
        phrase = phonemizer_safe(phrase)
        speed = 1.0
        for _attempt in range(6):
            try:
                chunks = [audio for _, _, audio in voice(phrase, voice=VOICE, speed=speed)]
            except (TypeError, AttributeError):
                if phrase == "Explore this website.":
                    raise RuntimeError("Kokoro could not phonemize the fallback narration. Update the Kokoro/Misaki packages and try again.") from None
                phrase = "Explore this website."
                chunks = [audio for _, _, audio in voice(phrase, voice=VOICE, speed=speed)]
            audio = np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.float32)
            nonzero = np.where(np.abs(audio) > 0.01)[0]
            if len(nonzero):
                audio = audio[max(0, nonzero[0] - 240):nonzero[-1] + 1200]
            if len(audio) / SR <= budget or speed >= 1.32:
                break
            speed = round(min(1.32, speed * 1.12), 3)
        if len(audio) / SR > budget:
            raise RuntimeError("The selected Kokoro voice could not fit a narration line into its visual beat.")
        offset = round(start * SR)
        out[offset:offset + len(audio)] += audio
        print(f"voice segment {line_number}/{len(lines)} synthesized", flush=True)
    sf.write(OUT, out, SR)
else:
    ffmpeg = os.environ.get("LAB_FFMPEG", "ffmpeg")
    with tempfile.TemporaryDirectory(prefix="walkcast-voice-") as temp:
        inputs = []
        filter_parts = []
        for line_number, (phrase, start, budget) in enumerate(slots(), 1):
            source = Path(temp) / f"source-{line_number}"
            wav = Path(temp) / f"voice-{line_number}.wav"
            source.write_bytes(request_audio(phrase))
            result = subprocess.run([ffmpeg, "-v", "error", "-y", "-i", str(source), "-ar", str(SR), "-ac", "1", "-c:a", "pcm_s16le", str(wav)], capture_output=True, text=True)
            if result.returncode:
                raise RuntimeError(f"Could not convert connected voice audio: {result.stderr[-1200:]}")
            with wave.open(str(wav), "rb") as clip:
                clip_duration = clip.getnframes() / clip.getframerate()
            if clip_duration > budget:
                raise RuntimeError("The connected voice endpoint returned a line that is too long for its visual beat.")
            inputs.append(wav)
            delay = round(start * 1000)
            filter_parts.append(f"[{line_number}:a]adelay={delay}|{delay}[v{line_number}]")
            print(f"voice segment {line_number}/{len(lines)} synthesized", flush=True)
        labels = "".join(f"[v{i}]" for i in range(1, len(inputs) + 1))
        filter_parts.append(f"[0:a]{labels}amix=inputs={len(inputs)+1}:duration=first:normalize=0[out]")
        args = [ffmpeg, "-v", "error", "-y", "-f", "lavfi", "-t", str(DURATION), "-i", f"anullsrc=r={SR}:cl=mono"]
        for path in inputs:
            args.extend(["-i", str(path)])
        args.extend(["-filter_complex", ";".join(filter_parts), "-map", "[out]", "-ar", str(SR), "-ac", "1", OUT])
        result = subprocess.run(args, capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError(f"Could not assemble connected voice track: {result.stderr[-1200:]}")
