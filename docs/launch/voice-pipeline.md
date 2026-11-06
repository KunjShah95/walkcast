# Launch Studio voice pipeline

Launch Studio can use a connected TTS service for owner-approved voice profiles. It does not use a Claude subscription as a speech API: Claude may help the external pipeline prepare the experience, while the configured endpoint returns the audio.

## Configure

1. In Walkcast Settings → Credentials, save **Custom TTS endpoint** (`LAB_TTS_ENDPOINT`) and, when required, **Custom TTS API key** (`LAB_TTS_API_KEY`). These credentials are saved locally by Walkcast.
2. In Launch Studio, choose **Connected voice pipeline** and enter the voice profile ID created by your pipeline.
3. Generate a film from a fresh website recording.

## Endpoint contract

For each short narration line, Walkcast sends a `POST` request with JSON:

```json
{"text":"...","language":"en","voice":"profile-id"}
```

If configured, `LAB_TTS_API_KEY` is sent as `Authorization: Bearer …`. The response can be WAV/MP3 audio bytes, or JSON with a base64 encoded `audio` or `audioContent` field. Keep the endpoint available to the computer running Walkcast. The profile must already exist in the connected provider; Walkcast does not enroll or clone voices itself.

Narration lines are assembled in memory from the recorded site name and page titles. Walkcast does not save or export those lines, a transcript, or captions for launch films. The generated MP4 contains the finished voice track and original score.
