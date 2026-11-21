# Narration, voice and capture

How a recording's script, voice and picture are made, and the settings that change them. Everything
here is optional; the defaults need nothing.

## The script

The narration is written from what the browser did ("Opening the pricing page. Clicking “Sign in”.").
Two optional layers sit on top.

**Claude Code script writer.** Turn on *Polish the script with Claude Code* on the Record screen, or set
`WALKCAST_NARRATION_WRITER=claude-code`. Walkcast runs the `claude` command already signed in on your
computer (your subscription, through the tool you installed) in print mode with no tools, no hooks and a
throwaway folder. It never reads or stores a Claude credential.

The model only rephrases. Each line it returns is checked against the line it replaces: the same quoted
control names, no number or name the original lacked, a sensible length. A line that fails keeps its
recorded wording, a long tour is written in batches of 24 lines, and a failed batch is retried once.
The narration lines (page titles and control names) go to Anthropic through Claude Code, which is why
it is off unless you ask. `WALKCAST_NARRATION_MODEL` picks a model; `WALKCAST_CLAUDE_BIN` points at the
`claude` executable. Exposed servers never run it.

**Chapters.** Each page opens a chapter. With the writer on, Claude Code gives each a short title.
Chapters are stored on the line that opens them, so editing or rewording that line keeps the chapter.

**Review before the voice.** *Review the script before the voice* records and writes the script, keeps the
video silent, and marks the recording a draft. Open it in the Studio, edit any line, and press *Add the
voice*; it uses the provider, voice and delivery you chose on the Record screen.

## The voice

**Delivery style** (`warm`, `calm`, `upbeat`, `authoritative`; `WALKCAST_VOICE_STYLE` sets the default):

| Engine | What the style controls |
| --- | --- |
| Kokoro | pace, and a blend of two voices for calm and upbeat |
| ElevenLabs | stability and expressiveness, and the line before and after each one for continuity |
| OpenAI (gpt-4o family) | spoken delivery instructions |

`KOKORO_SPEED` (0.8 to 1.2) and `KOKORO_VOICE` (a voice, or two joined by a comma to blend them) override it.

**Pronunciation.** `WALKCAST_PRONUNCIATIONS="Kunj = koonj; Estate360 = estate three sixty"`, or a file of
`word = how it is said` lines named by `WALKCAST_PRONUNCIATIONS_FILE`. It changes what is spoken only.

**Your own voice.** With `ELEVENLABS_API_KEY` set, a voice sample you upload is cloned once (kept beside
the sample) and used as the narrator. Only upload your own voice. Clones count against the ElevenLabs
account's voice slots and need a plan that allows cloning. `WALKCAST_CLONE_VOICE=0` goes back to playing
the sample.

**Kokoro and unknown words.** Without espeak, Kokoro's English phonemizer fails on a word it has no
dictionary entry for. Walkcast retries the line with the word split into two known words or spelled out,
then word by word, so a product name never costs the recording its voice.

**Audio finish.** Each clip is faded in and out, the whole track gets a high-pass filter, a gentle
compressor and loudness normalisation to -16 LUFS. The MP4 is H.264 at CRF 18 with 160 kbit/s AAC.

## The picture

Playwright's built-in video is VP8 at roughly 1 to 2 Mbit/s. Walkcast also captures the page through
Chromium's screencast and encodes it at up to 8 Mbit/s, constant 30 fps, then uses that as the
recording's video. Both come from the same JPEG screencast frames, so the gain is bitrate headroom in
motion (scrolls, animations) and a cleaner source for the MP4 encode, not a different renderer. If the
high-quality capture cannot start or fails, the standard video is used. `WALKCAST_HQ_CAPTURE=0` turns it
off.
