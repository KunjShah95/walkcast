# Walkcast launch video — inspiration playbook

Synthesised from nine reference sites (filmagic.app, recent.design, raylight.app, remotion.dev/showcase, screenlane.com, godly.website, motionographer.com, vimeo.com/channels/staffpicks, saasframe.io) plus the existing docs/launch pipeline. This is the house spec for the next cut of walkcast-launch.mp4 and for any future promo. Written to be executed, not admired.

## 1. What the references agree on

Every site that ships high-performing launch films converges on the same shape, even when the surface style differs:

1. One sentence, one promise. Filmagic: "Paste your URL. Get a launch trailer." Raylight: "Build launch-ready demos in minutes." Walkcast: "Paste a link. Get a video tour of your site." Keep it.
2. Real product on screen, not a mock. Filmagic exports your real screens; Recent.design's best entries show the actual app. Walkcast already plays the real demo.mp4. Never replace it with a stylised fake.
3. A single emotional arc, not a feature list. Motionographer and Vimeo Staff Picks reward pacing: problem, drop, proof, payoff. Features arrive as evidence inside the arc, never as bullets.
4. Sound is half the film. Raylight ships music, SFX and voiceover on a multitrack timeline; Filmagic offers optional voiceover. Walkcast's sidechain-ducked Kokoro narration plus original score is already ahead of most. Keep investing here.
5. Motion has a reason. Screenlane and Godly reward one focal move at a time. No animation without a transfer of context. Power cuts, punch-ins and the logo build earn their place.
6. Short, then shorter. Filmagic cuts are 20/30/45s. SaaSFrame product videos are under 60s. Walkcast's 88s is long; ship a 45s social cut and a 15s teaser alongside the long form.
7. Aspect ratios are deliverables, not afterthoughts. Filmagic exports 16:9, 1:1 and 9:16 from one cut. Walkcast currently renders only 1920x1080. render.mjs now accepts width and height args as 7th/8th parameters (e.g., `node render.mjs video.html out.mp4 30 0 88 1280 720` for 720p). Auto-detects from viewport meta tag when using defaults.
8. Accessibility is part of quality. Captions (we have VTT), reduced-motion respect, audio normalised to -14 LUFS.

## 2. What Walkcast does better than the references

Do not regress these:

- Evidence-backed numbers. Every figure comes from results/ or the Lab dashboard. Filmagic and Raylight show sample apps; we show a real run.
- Original, licence-free score. music.py is numpy-only. Most launch videos use licensed tracks; ours is unencumbered and reproducible.
- Deterministic, scrubable timeline. render(t) sets every animation's currentTime; any frame is reproducible. This is our Remotion-style advantage without the dependency.
- Two products, one recorder. The "same recorder, second job" beat is unique and must survive every cut.

## 3. The v2 shot list (re-cut)

The current cut predates two shipped features. v2 adds them and tightens pacing. Target: 78s long form plus a 45s social cut plus a 15s teaser. Shared CUTS list.

1. 0:00-0:04 History. "A short history of the product walkthrough." Title card, serif italic, slow fade-in. Pad only, clock tick.
2. 0:04-0:10 The old way. Power cuts: script, record, retake, voice, captions; counter to 4h 12m. Punch-in per cut, flash. Impact plus riser.
3. 0:10-0:14 Stale. "Deployed v1.5" toast plus OUT OF DATE stamp. Stamp slams in. Impact.
4. 0:14-0:18 Second problem. Agent "Done." vs app records (real stale-owners run). Split screen, red underline. Bass hit.
5. 0:18-0:22 Scale. 76 of 378 claimed success; "flaky". Counter ticks up. Whoosh.
6. 0:22-0:28 Drop. Logo builds, "Paste a link. Get a narrated walkthrough." Logo assembly plus glow. Four-on-floor drop.
7. 0:28-0:34 One URL. URL typed, auth box ticked, "Make my walkthrough". Typing plus cursor plus button press. Tick plus click.
8. 0:34-0:46 Recording. Real demo.mp4 with captions, chapters, transcript, four features. Parallax device frame, live-preview slideshow of pages as they load. Narration.
9. 0:46-0:50 Output. recording.mp4, captions.vtt, narration.wav, transcript, trace.jsonl, voice marquee. Files stack in, marquee scrolls. Whoosh.
10. 0:50-0:54 Breakdown. "Same recorder. Second job." Walkcast Lab. Wipe transition. Impact.
11. 0:54-1:00 Pipeline. Failed run to cause plus evidence to fixture to replay times k; taxonomy; unexplained stays. Flow diagram animates left-to-right. Arp.
12. 1:00-1:06 Journey. A journey becomes a test: press/select/check/hover/waitFor/expect, exported as Playwright. Code block types in, then runs green. Tick.
13. 1:06-1:10 Results. v0 0/5, v1 5/5, v2 4/5 (regression caught), Wilson intervals, scripted-agent caveat. Numbers count up. Impact on regression.
14. 1:10-1:14 Power cuts. "Real browser. Real state. Real evidence." Three punch cuts. Three impacts.
15. 1:14-1:18 End card. Logo, "Show what actually happened.", MIT, price is zero, URL. Logo hold, URL fades. Ring-out.

New beats vs. current cut: 8 adds the live-preview slideshow (pages appear as the browser walks); 12 adds the journey to test export. Both are shipped features. Renumbering is a re-cut, not an edit, per README.
## 4. Motion principles (house rules)

- One focal move per beat. Never two simultaneous animations competing for attention.
- Object constancy. The logo, the device frame and the URL persist across cuts. A hard cut needs an anchor.
- Easing: cubic-bezier(0.2, 0.7, 0.2, 1) for entrances; 0.4, 0, 0.2, 1 for exits. No linear motion except progress bars.
- Durations: entrances 0.3-0.6s, holds 1.5-3s, cuts 0.15s. Never a transition longer than the content it carries.
- Depth: tilt the device frame 8-12 degrees on the Z axis for the recording beat (Raylight's 3D tilt trick). Keep everything else flat.
- Reduced motion: every animation must have a prefers-reduced-motion fallback that shows the final state.

## 5. Sound principles

- Voice is 9-26 dB above music (already implemented via sidechain).
- Music sections align to cuts, not to arbitrary bars: the drop lands on the logo build (0:22), the breakdown on "Same recorder" (0:50), the climax on the power cuts (1:10).
- SFX: one whoosh per transition, one impact per power cut, one click per button press. No SFX without a visual cause.
- Normalise final mix to -14 LUFS, true peak at most -1.2 dBTP (already done).
- Every SFX must exist in music.py's instrument set or be added there; no external sample packs.

## 6. Multi-format deliverables (Filmagic pattern)

Render from the same timeline, three crops:

- 16:9, 1920x1080: YouTube, website hero, LinkedIn.
- 1:1, 1080x1080: X, Instagram feed.
- 9:16, 1080x1920: Reels, Shorts, TikTok.

The timeline is authored at 1920x1080. 1:1 and 9:16 are centre-crops with a safe zone of 1080x1080 in the middle; keep all critical text and the device frame inside that zone. render.mjs now accepts width and height args.

## 7. Production checklist (run before calling a cut done)

- Every number traces to results/ or a Lab screenshot. No invented stats.
- voiceover.py runs clean with zero OVER lines.
- npm run copy:check passes on any new on-screen copy.
- Captions match narration exactly (VTT generated by voiceover.py).
- render(t) scrubbed at every cue time; no frame with a half-transition.
- Reduced-motion version reviewed.
- All three aspect ratios rendered and spot-checked.
- Poster frame chosen and exported (walkcast-launch-poster.jpg).
- File sizes: long form at most 25 MB (faststart), social cut at most 8 MB.
- Uploaded to YouTube plus LinkedIn with chapters from the VTT.

## 8. Tooling changes in this repo

- docs/launch/source/render.mjs now accepts optional width and height arguments: node render.mjs video.html out.mp4 30 0 78 1080 1080 renders a square cut. Defaults remain 1920x1080. Also supports custom resolutions via 7th/8th args and auto-detects from viewport meta.
- docs/launch/source/scenes.json is the machine-readable shot list (cues, on-screen copy, assets). The HTML timeline should be regenerated from it in a future step; for now it is the spec the author edits against.
- docs/launch/README.md "What this cut predates" is replaced by the re-cut plan.

## 9. What we deliberately did NOT do

- No 3D engine (Raylight/Blender). Walkcast's value is evidence, not spectacle. Depth is faked with CSS transforms on the device frame only.
- No licensed music or stock footage. Licence risk on a zero-budget MIT project is unacceptable.
- No AI-generated voiceover beyond Kokoro. We own the narration script in voiceover.py; an LLM-written script would not match the product's voice.
- No testimonial or customer-logo beats. None exist (see product-marketing.md).
- No quantified speed or quality claims vs. competitors. We publish their prices with a checked-on date; we do not publish our own performance numbers.

