# Walkcast natural walkthrough film

This is the current creative and technical direction for Launch Studio. The supplied Archmind promo is a visual reference for cinematic typography, confident cuts, and carefully mixed audio. Walkcast keeps the product footage factual and uses its own layout, colours, and brand elements.

## Film direction

- Use the source Walkcast recording as one continuous, chronological browser visit. Do not jump to arbitrary points in the capture.
- Target up to 58 seconds, capped at the available recording length. Render at 30 fps in the selected 16:9, 9:16, or 1:1 format.
- Open with a short editorial title over the real site footage. Show page labels as the recording moves through the site. Close with the product name and domain.
- Use a dark navy grade, warm orange accent, Instrument Serif display type, and small monospace chapter labels. Keep type legible over real footage and preserve the actual UI as the focal point.
- Use subtle camera drift, texture, controlled fades, and restrained transition hits. Every effect should support the footage; avoid fast flashing text, fabricated interface elements, or invented product claims.

## Voice and audio

- Compose brief conversational narration automatically from the recorded product name and page titles. Keep the lines in memory only. Do not ask the creator to provide a script and do not export scripts, transcripts, or caption files.
- Use Kokoro as the local preset voice. A cloned owner voice can be used through the configured custom TTS endpoint with the profile ID created in the owner's pipeline. Walkcast itself does not clone or enroll a voice.
- Generate an original score for the full film duration. Use the selected direction for its energy, place restrained transition accents at chapter changes, sidechain music under narration, and master the final mix to -14 LUFS with a -1.2 dB true-peak ceiling.
- Keep spoken claims limited to the website name and the actual visited page titles. The endpoint receives short text requests to synthesize audio; Walkcast does not persist those request lines.

## Deliverables

- Finished H.264/AAC MP4.
- Poster frame selected from the rendered video.
- No subtitle or transcript sidecars, storyboard, or generated share-copy files.

## Implementation map

- `source/build-site-film.mjs` prepares the real recording, builds the composition, creates audio, and muxes the final film.
- `source/site-film.html` defines the motion design and deterministic frame timeline.
- `source/voiceover-site.py` creates transient narration from the recording's page titles using Kokoro or the custom endpoint adapter.
- `source/music-brag.py` creates the original tone-aware score and short transition accents.
- `voice-pipeline.md` defines the custom voice endpoint contract and setup steps.
