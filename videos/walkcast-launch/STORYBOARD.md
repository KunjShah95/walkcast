---
format: 1920x1080
duration: 31.5s
message: "Paste a link. Get a narrated video walkthrough of your site — free, no filming, nothing to edit."
arc: Hook → Pain → Product intro → Demo (2 beats) → Benefits → CTA
audience: developers and product people who currently film and edit their own demo/walkthrough videos
mode: collaborative
music: upbeat, confident, software-launch energy
---

## Locked

Layout sheet (`storyboard.html` v1) confirmed as-is, all 7 frames. Durations synced to real
Kokoro narration (`am_michael`) — actual run length **31.5s**, shorter than the 45-60s target
because the spoken lines ran faster than estimated; still inside the route's 30-90s sweet spot.
BGM skipped (no HeyGen credential available) — voice + SFX only unless added later.

## Video direction

- **Palette** (from `frame.md`): cream `#F3EEE6` and navy `#151818` alternate as each beat's
  register (cream = present/relief, navy = the old-way pain); ink `#1E1A16` for text on cream,
  cream text on navy. The single voltage accent, teal-coral `#1D5E58`, appears at most once per
  frame — never two accent moments in one shot.
- **Type**: display/body = Bricolage Grotesque, sentence case; kickers and the URL/mono label =
  JetBrains Mono uppercase, tracked wide. Reference by role, never raw family.
- **Motion grammar + reveal model**: long-tail `power3` eases throughout, never bouncy/spring
  except the one named spring-pop moments the blueprints call for. Every frame reveals paced to
  the voiceover — nothing appears before the VO reaches it; the back half of a frame carries at
  least one reveal. A hold is a still read, at most a subtle jitter — no lazy breathing, no
  forced drift.
- **Rhythm / held frames**: Frame 6 (Benefits) is the one deliberate breather — content resolves
  and sits still after five fast cuts. Frame 3's wordmark is a light hold within an otherwise
  typing beat. Every other frame keeps moving.
- **Negative list**: no stock photography, no fake/recreated product UI — Frames 4-5 use the real
  `demo.mp4` footage only, nothing rebuilt. No browser chrome/cursor beyond what the real capture
  already shows. No glow/bloom gradients, no two accent corals in one frame, no slideshow (never
  dump the whole canvas at t=0), no screensaver (no motion with nothing cueing it).
- **Caption-band keep-out**: every frame's content stays in the top ~83% regardless of whether
  captions render.
- **Callback**: the Walkcast wordmark + `logo.png` mark introduced in Frame 3 is the hero prop
  that returns, held, at the Frame 7 close.

## Frame 1 — Hook

- type: hook
- blueprint: kinetic-type-beats
- scene: A single bold question lands alone on bare canvas, then clears.
- duration: 2.133s
- transition_in: cut
- status: animated
- src: compositions/frames/01-hook.html
- voiceover: "Still filming your own demo video?"
- sfx: impact-bass-1

Open cold on the pain, as a question — not a company description. No product, no logo yet.

Reproduce — hook-kinetic-type-flash: the whole line is one spoken breath, so one window; nothing
held back to reveal later.

Scene 1 (0.0–2.133s): solid cream field, camera locked. Bold ink text "Still filming your own
demo video?" hard-cut FLASHES in dead-center as one line — no fade, no slide. Centered template,
~50% of frame. Holds to the cut.

## Frame 2 — Pain

- type: pain_point
- blueprint: kinetic-type-beats
- scene: Three short pain phrases land solo in sequence, each clearing before the next.
- duration: 3.819s
- transition_in: cut
- status: animated
- src: compositions/frames/02-pain.html
- voiceover: "Record the screen. Fumble a click. Cut it together by hand."
- sfx: click-soft

Three beats of the actual manual workflow, landing one at a time — validate the pain without yet naming the product.

Reproduce — problem-kinetic-type-beats: three short pain statements, each landing solo on the
bare canvas before the next replaces it, no product visible yet.

Scene 1 (0.0–1.1s): solid navy field, camera locked. "Record the screen." lands centered in
cream text, flash-cut. Centered, ~45% of frame.
Scene 2 (1.1–2.4s): clears; "Fumble a click." lands centered, same treatment — one small
accent-coral underline flicks under "click" as the VO names it.
Scene 3 (2.4–3.819s): clears; "Cut it together by hand." lands centered, holds to the cut.

## Frame 3 — Product intro

- type: product_intro
- blueprint: kinetic-type-beats
- scene: Hard cut through a short value beat into the brand name/mark landing.
- duration: 5.397s
- transition_in: crossfade
- status: animated
- src: compositions/frames/03-product-intro.html
- voiceover: "Introducing Walkcast — paste a link, and a real browser does the walkthrough for you."
- asset_candidates: assets/logo.png
- focal: assets/logo.png
- roles: logo.png = cutout (hero mark, returns at Frame 7)
- sfx: pop

Resolve the tension from frames 1-2 onto the one-line mechanism and the brand name.

Reproduce — product-intro-kinetic-type-namedrop: hard-cut through "Introducing…" and resolve on
the brand name/mark.

Scene 1 (0.0–1.8s): cream field, camera locked. "Introducing" flash-cuts in small, centered,
JetBrains Mono kicker above center. At ~0.9s the `logo.png` mark + "Walkcast" wordmark spring-pop
in bold, dead-center, below the kicker — Centered template, ~55% of frame.
Scene 2 (1.8–5.397s): as the VO continues, the tagline "paste a link, and a real browser does the
walkthrough for you" types on beneath the wordmark, JetBrains Mono, character by character. The
wordmark itself stays locked, held — the light breather within this beat. Holds to the cut.

## Frame 4 — Demo: the walk

- type: feature_showcase
- blueprint: device-surface-showcase
- scene: Real captured footage plays inside a browser-window device frame: the recorder signs in and clicks through pages.
- duration: 4.693s
- transition_in: crossfade
- status: animated
- src: compositions/frames/04-demo-walk.html
- voiceover: "It signs in, clicks through your pages, and narrates every step as it goes."
- asset_candidates: assets/demo.mp4, assets/demo-poster.jpg
- focal: assets/demo.mp4
- roles: demo.mp4 = cutout (hero surface) · demo-poster.jpg = supporting (poster frame only)
- sfx: whoosh

The product shown doing its real core loop, cursorless, inside its actual interface — this is genuine recorded footage, not a recreation.

Adapt (device-surface-showcase, floating-window variant): keep the floating-window establish +
single camera push-in signature move; drop the synthetic screen-cycling the blueprint assumes —
the hero IS real captured footage already playing its own flow, so the push targets a moment in
that real footage instead of a mocked sidebar.

Scene 1 (0.0–1.5s): cream backdrop, kicker "✱ the walk" (JetBrains Mono) upper-left. `demo.mp4`,
framed as a macOS-style browser window (traffic-lights + URL pill chrome already in the capture),
drifts in from a slight tilt and settles centered — establishing shot, asymmetric 60/40, ~55% of
frame.
Scene 2 (1.5–4.693s): as the VO says "clicks through your pages, and narrates every step," the
camera pushes in gently on the browser window while the real footage plays its sign-in and
click-through sequence — one continuous push, no cuts inside the frame, holding the push to the
end of the beat.

## Frame 5 — Demo: the output

- type: feature_showcase
- blueprint: video-text-pivot
- scene: The same demo clip continues, then slides aside to hand the frame to the deliverables it produces.
- duration: 7.125s
- transition_in: crossfade
- status: animated
- src: compositions/frames/05-demo-output.html
- voiceover: "Captions. A transcript. A spoken voice-over. One finished MP4 — no editing, no watermark."
- asset_candidates: assets/demo.mp4, assets/demo.vtt, assets/svg-786f25a4.svg, assets/svg-88121d7a.svg
- focal: assets/demo.mp4 (Scenes 1-2), then kinetic text (Scenes 3-4)
- roles: demo.mp4 = cutout · svg-786f25a4.svg (document icon, "transcript") = supporting · svg-88121d7a.svg (download icon, "MP4") = supporting
- sfx: impact-bass-2

The clip proves the walk works; the pivot hands off to the concrete artifact the viewer gets to keep.

Reproduce — metric-video-text-pivot: show → yield → pivot → stamp, each handoff sharing an anchor
so it reads as weight-transfer, not four separate cuts.

Scene 1 (0.0–1.6s): `demo.mp4` continues centered from Frame 4's handoff, breathing gently —
camera static.
Scene 2 (1.6–3.2s): as the VO says "Captions. A transcript.", the video SLIDES aside (x + scale
down) into the space two icon chips now fill at the same anchor — the document icon (transcript)
and a caption-pill glyph pop in with 3D-depth type. One weight-transfer event. Asymmetric 60/40.
Scene 3 (3.2–5.4s): as the VO says "A spoken voice-over.", video and chips clear; kinetic text
"One finished MP4" types into the vacated center, character by character — the word "MP4" carries
the single coral accent.
Scene 4 (5.4–7.125s): a coral-outline gradient pill snaps shut (scaleX 0→1) around "no editing ·
no watermark," its glow halo resolving a beat behind the silhouette — the stamp. Holds to the cut.

## Frame 6 — Benefits

- type: benefit_highlight
- blueprint: titlecard-reveal
- scene: One clean two-line value title, a slide-up crossfade, held still.
- duration: 3.264s
- transition_in: crossfade
- status: animated
- src: compositions/frames/06-benefits.html
- voiceover: "Free. MIT licensed. Every seat included."

Low motion is the point here — let the claim sit after the fast demo beats.

Reproduce — benefits-titlecard-crossfade: one calm two-line value card, exactly one restrained
move, then a still hold. This is the video's deliberate held/breather beat (named in Video
direction).

Scene 1 (0.0–1.3s): navy field. "Free. MIT licensed." fades in centered, scaling ~95%→100%,
smooth ease-out. Holds.
Scene 2 (1.3–3.264s): "Free. MIT licensed." translates up and fades out as "Every seat included."
translates up from below center and fades in to take its place — the one slide-up crossfade.
Holds to the cut.

## Frame 7 — CTA

- type: cta
- blueprint: titlecard-reveal
- scene: 2-3 near-still cards hard-cut in sequence, terminating on the held logo and URL.
- duration: 5.099s
- transition_in: cut
- status: animated
- src: compositions/frames/07-cta.html
- voiceover: "Walkcast. Free for Windows and Linux — at walkcast.kunjshah.in."
- asset_candidates: assets/logo.png
- focal: assets/logo.png
- roles: logo.png = cutout (callback to Frame 3)
- sfx: chime

The calm, confident close: brand, platforms, URL, held.

Adapt — hard-cut-card-stack-to-logo: keep the instant hard-cut card chain (no crossfades), but
compress to three short cards since the VO carries only three beats, not a full statement chain.

Scene 1 (0.0–1.8s): cream field. `logo.png` + the "Walkcast" wordmark hard-cut in centered at
full opacity — the callback: the exact hero prop introduced in Frame 3, now returning.
Scene 2 (1.8–2.8s): instant hard cut (no crossfade) to "Free for Windows and Linux," centered
below the wordmark, which stays held.
Scene 3 (2.8–5.099s): instant hard cut reveals "walkcast.kunjshah.in" in JetBrains Mono beneath; held ≥2s before the film ends;
the whole lockup spring-settles small and holds — terminal frame, no exit.
