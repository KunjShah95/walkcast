# Launch Studio voice pipeline

Launch Studio can use a connected TTS service for owner-approved voice profiles. It does not use a Claude subscription as a speech API: Claude may help the external pipeline prepare the experience, while the configured endpoint returns the audio.

## Configure

1. In Walkcast Settings → Credentials, save **Custom TTS endpoint** (`LAB_TTS_ENDPOINT`) and, when required, **Custom TTS API key** (`LAB_TTS_API_KEY`). These credentials are saved locally by Walkcast.
2. In Launch Studio, choose **Connected voice pipeline** and enter the voice profile ID created by your pipeline.
3. Generate a film from a fresh website recording.

## Endpoint contract

For each short narration line, Walkcast sends a `POST` request with JSON. `speed` reflects the Launch Studio narration-pace choice; endpoints may ignore it if their provider does not support rate control.

```json
{"text":"...","language":"en","voice":"profile-id","speed":1.0}
```

If configured, `LAB_TTS_API_KEY` is sent as `Authorization: Bearer …`. The response can be WAV/MP3 audio bytes, or JSON with a base64 encoded `audio` or `audioContent` field. Keep the endpoint available to the computer running Walkcast. The profile must already exist in the connected provider; Walkcast does not enroll or clone voices itself.

Narration lines are assembled in memory from the recorded site name and page titles. Walkcast does not save or export those lines, a transcript, or captions for launch films. The generated MP4 contains the finished voice track and original score.

## Pronunciation, timing, and owner voice

- In Launch Studio, enter word-to-pronunciation pairs such as `Kokoro = koh-koh-roh; ArchMind = arch mind`. They affect spoken audio only and are not written into the recording summary.
- Set narration pace to relaxed, balanced, or brisk; motion pace to calm, balanced, or quick; and chapter cues to land on a recorded page change or 0.75 seconds before or after it.
- After generating a film, use **Record your own voice** to record against the music-only cut. Walkcast ducks the score beneath your voice and saves a separate MP4, leaving the generated-voice and music-only files available.
