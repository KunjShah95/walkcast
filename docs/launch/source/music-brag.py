"""Generate an original, tone-aware walkthrough score (NumPy only)."""
import sys
import wave
import json
import os

import numpy as np

OUT = sys.argv[1] if len(sys.argv) > 1 else "score.wav"
TONE = sys.argv[2] if len(sys.argv) > 2 else "polished"
DURATION = max(15.0, min(90.0, float(sys.argv[3]) if len(sys.argv) > 3 else 58.0))
SR = 44100
N = int(SR * DURATION)
LEFT = np.zeros(N, dtype=np.float64)
RIGHT = np.zeros(N, dtype=np.float64)
RNG = np.random.default_rng(2026)
MIDI = {"polished": [62, 57, 59, 55], "cinematic": [57, 53, 55, 50], "playful": [60, 55, 57, 53]}.get(TONE, [62, 57, 59, 55])
BPM = {"polished": 112, "cinematic": 96, "playful": 120}.get(TONE, 112)
BEAT = 60 / BPM


def note(midi):
    return 440 * 2 ** ((midi - 69) / 12)


def add(signal, at, gain=1.0, pan=0.0):
    start = max(0, int(at * SR))
    end = min(N, start + len(signal))
    if end <= start:
        return
    signal = signal[:end - start] * gain
    LEFT[start:end] += signal * np.cos((pan + 1) * np.pi / 4) * 1.414
    RIGHT[start:end] += signal * np.sin((pan + 1) * np.pi / 4) * 1.414


def tone(freq, duration, harmonics=0.0):
    t = np.arange(int(SR * duration)) / SR
    return np.sin(2 * np.pi * freq * t) + harmonics * np.sin(4 * np.pi * freq * t)


def pluck(midi, duration=0.42):
    t = np.arange(int(SR * duration)) / SR
    f = note(midi)
    signal = np.sin(2 * np.pi * f * t) + 0.32 * np.sin(2 * np.pi * f * 2 * t)
    return signal * np.exp(-t * 6.5) * np.minimum(1, t * 90)


def soft_hit(duration=0.7):
    t = np.arange(int(SR * duration)) / SR
    f = 38 + 95 * np.exp(-t * 6)
    phase = 2 * np.pi * np.cumsum(f) / SR
    low = np.sin(phase) * np.exp(-t * 4.5)
    noise = np.diff(np.r_[0.0, RNG.standard_normal(len(t))])
    return low * 0.65 + noise * np.exp(-t * 22) * 0.06


def whoosh(duration=0.55):
    t = np.arange(int(SR * duration)) / SR
    noise = RNG.standard_normal(len(t))
    # Gentle low-pass character from a short moving-average filter.
    noise = np.convolve(noise, np.ones(18) / 18, mode="same")
    shape = np.sin(np.pi * t / duration) ** 2
    return noise * shape * 1.2


# Four-bar harmonic loop, opening with space and filling out as the product appears.
bars = int(np.ceil(DURATION / (4 * BEAT)))
for bar in range(bars):
    root = MIDI[bar % len(MIDI)]
    start = bar * 4 * BEAT
    t = np.arange(min(N - int(start * SR), int(4 * BEAT * SR))) / SR
    if not len(t):
        continue
    chord = [root, root + 3, root + 7, root + 12]
    pad = sum(np.sin(2 * np.pi * note(m) * t) for m in chord) / len(chord)
    fade_in = np.minimum(1, t / 1.2)
    fade_out = np.minimum(1, np.maximum(0.15, (DURATION - (start + t)) / 1.0))
    add(pad * fade_in * fade_out, start, 0.14 if bar < 1 else 0.105, -0.15)

    for beat in range(4):
        at = start + beat * BEAT
        # A light pulse arrives under the footage; stronger percussion waits until the reveal.
        if at > 2.6:
            t2 = np.arange(int(SR * 0.24)) / SR
            kick = np.sin(2 * np.pi * (48 + 42 * np.exp(-t2 * 24)) * t2) * np.exp(-t2 * 13)
            add(kick, at, 0.16 if TONE == "polished" else 0.2)
        add(pluck(chord[(beat + bar) % len(chord)], 0.32), at + BEAT * 0.5, 0.12, -0.35 if beat % 2 else 0.35)
        if TONE == "playful" and at > 2.6:
            add(pluck(chord[(beat + bar + 1) % len(chord)] + 12, 0.2), at + BEAT * 0.75, 0.08, 0.2)

# Place restrained hits on the actual captured page changes when available. Older recordings
# without matching trace timestamps use an even chapter rhythm as a graceful fallback.
try:
    chapter_times = json.loads(os.environ.get("WALKCAST_LAUNCH_CHAPTER_TIMES", "[]"))
except json.JSONDecodeError:
    chapter_times = []
exact = len(chapter_times) > 0 and all(isinstance(t, (int, float)) for t in chapter_times)
if exact:
    cues = [4.2] + [float(t) for t in chapter_times[1:] if 4.5 < float(t) < DURATION - 4.5] + [DURATION - 4.2]
else:
    cues = [DURATION * ratio for ratio in (0.08, 0.34, 0.61, 0.84)]
for index, at in enumerate(sorted(set(round(t, 2) for t in cues))):
    gain = (0.45, 0.25, 0.28, 0.36)[min(index, 3)]
    add(whoosh(), at - 0.36, 0.23 if TONE == "polished" else 0.33)
    add(soft_hit(1.2), at, gain * (1.25 if TONE == "cinematic" else 1.0))

# Resolve to a warm held chord and leave air around the final title.
t = np.arange(int(SR * 3.2)) / SR
root = MIDI[0]
outro = sum(np.sin(2 * np.pi * note(m) * t) for m in [root, root + 3, root + 7, root + 12, root + 19]) / 5
outro *= np.minimum(1, t * 2) * np.exp(-t * 0.42)
add(outro, DURATION - 3.6, 0.2)

fade_in = np.minimum(1, np.arange(N) / (0.55 * SR))
fade_out = np.minimum(1, np.maximum(0, (DURATION * SR - np.arange(N)) / (2.4 * SR))) ** 1.4
LEFT *= fade_in * fade_out
RIGHT *= fade_in * fade_out
peak = max(np.max(np.abs(LEFT)), np.max(np.abs(RIGHT)), 1e-8)
LEFT = np.tanh(LEFT / peak * 1.55) * 0.87
RIGHT = np.tanh(RIGHT / peak * 1.55) * 0.87
stereo = np.stack([LEFT, RIGHT], axis=1)
with wave.open(OUT, "wb") as out:
    out.setnchannels(2)
    out.setsampwidth(2)
    out.setframerate(SR)
    out.writeframes((stereo * 32767).astype("<i2").tobytes())
print(f"Original {TONE} score ready · {DURATION:.0f}s · {BPM} BPM")
