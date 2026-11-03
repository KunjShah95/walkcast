# Frame packet: 05-demo-output

## Project inputs

- Project: C:\browser-user\videos\walkcast-launch
- Design tokens: C:\browser-user\videos\walkcast-launch\frame.md
- RULES_DIR: C:\Users\jksha\.claude\skills\hyperframes-animation\rules

## Assigned storyboard block

## Frame 5 — Demo: the output

- type: feature_showcase
- blueprint: video-text-pivot
- scene: The same demo clip continues, then slides aside to hand the frame to the deliverables it produces.
- duration: 7.125s
- transition_in: crossfade
- status: built
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

## Selected blueprint: video-text-pivot

# video-text-pivot — Video → Text Pivot

**intent**: A product video holds center and claims attention, then slides aside to hand its weight to a hero stat in the space it vacates, then both clear and kinetic text types into the center — accent words carrying the meaning the video used to carry — sealed by a gradient pill. The arc is "show → yield → pivot → stamp," and each handoff pairs an exit with a same-anchor entrance so two beats read, not four.

**roles served**

- Product_Intro (from `metric-video-text-pivot`): when the open is "see the feature" then "see the impact" and the `[product video]` must stay visible through the stat reveal — it slides, it doesn't cut.
- Key_Feature: a feature clip that yields to a frame-filling metric and a typographic impact line.

**duration**: 6–8s

**shot structure** (a `[bg]` canvas; one `[product video]` as a real muted `.mp4` clip, a hero stat, then kinetic text — each pair shares a screen anchor so the handoff reads as a weight-transfer)

- **Scene 1 (0.0–~1.6s) — the video shows.** The `[product video]` lands centered on a smooth scale-up and breathes (a small y-bob), claiming full attention. Camera static.
- **Scene 2 (~1.6–3.2s) — yield + stat (signature move).** The video SLIDES aside (x + scale down) **into the very space** the `[hero stat]` now fills as the stat pops in with 3D-depth type — one weight-transfer reading as a single event, not two. The stat breathes within this window.
- **Scene 3 (~3.2–5.0s) — pivot to text.** Both video and stat clear out and kinetic `[impact text]` TYPES into the vacated center, character by character; its `[accent words]` carry the meaning the video used to carry.
- **Scene 4 (~5.0–end) — stamp.** A gradient `[pill]` snaps shut around the closing line (`scaleX` 0→1), its glow halo resolving a beat behind so the silhouette reads before the bloom — sealing the statement as one graphic. Holds.

**motion vocabulary**: video scale-in + small breath; weight-transfer slide (video x + scale-down handing off to the stat at the same anchor); 3D-depth stat type; character-stream typing; gradient pill scaleX-snap; glow-halo bloom trailing the silhouette.

**rule mapping**

- video entrance (smooth) and the weight-transfer slide → `gsap-effects` (scale/opacity then x + scale on a long-tail `power3`); the video itself is a muted `<video class="clip">` direct child of the root
- hero stat's frame-filling 3D type → `3d-text-depth-layers` (static-depth variation — layers built at setup, no cascade fighting the entry)
- the same-anchor video-exit ↔ stat-entry handoff (if treated as a morph) → `scale-swap-transition` (shared center)
- character-by-character impact typing through segmented spans → `dynamic-content-sequencing` (clean character stream) or `discrete-text-sequence`
- pill `scaleX` snap + trailing glow halo → `gsap-effects` (scaleX) + `ambient-glow-bloom` (the halo, resolving a beat behind)
- video / stat breath within their windows → `sine-wave-loop` (low-amplitude register — subtle jitter, gated to each element's window, never a forever loop)

**camera modifier**: camera-static — all motion is element-space (the video translates), so the "pivot" is the elements moving, not a camera.
