# Aceternity Parity Components — Walkcast Brief

> Companion to `docs/design-language-landing.md`.  
> Persona lens: Manu Arora / Aceternity UI — dark-first, motion-dense, premium pixels,
> reimplementation via Tailwind + Motion, but only idioms Walkcast already owns.  
> Scope: no code today. A ready build brief for the next builder.  
> Source files inspected: `dashboard/src/components/ui.tsx`, `dashboard/src/components/FlightStrip.tsx`,
> `dashboard/src/App.tsx`, `dashboard/src/styles.css`, `src/site/pages.ts`.

---

## 1. Aceternity → Walkcast idiom map

| Aceternity block | Walkcast equivalent (in place) | Where it lives | Parity notes / drift to fix |
|---|---|---|---|
| **Spotlight card** (radial-gradient following cursor, revealed on `mousemove`) | `SpotlightCard` | `dashboard/src/components/ui.tsx:61-91` | **Parity high.** Uses `--signal-soft` for the radial and toggles opacity 0↔1 with a 300ms transition. Tamed "Aceternity toned down" — spotlight is in **signal** (blue), not the usual Aceternity purple; deliberate, keep it so the record light stays the only red. Drift: only renders while `pos !== null`; focus gets the `--signal` ring instead (good, do not change). |
| **Tracing beam** (vertical SVG path draw that tracks scroll position) | **Partial — not yet a component.** App has a sticky header (`header.top` / `sticky z-30`) and the `FlightStrip` SVG timeline, but **no scroll-tracking vertical beam**. Closet idiom: `header.top::after` gradient hairline + `.eyebrow::before` record dot. | `src/site/pages.ts:116-117`, `dashboard/src/App.tsx:81-84` | **Gap.** Walkcast wants tracing as a **record progress beam**, not decoration: it should track the run timeline (steps / evidence). Best home: alongside `FlightStrip` in `RunView`, vertical left edge of the sticky ** Timeline, not a global page beam. |
| **Sticky scroll reveal** (cards pinned while content scrubs past) | `Header sticky` + sticky `.side` aside on guide pages; `FlightStrip` is `overflow-x-auto`, not pinned. | `dashboard/src/App.tsx:81`, `src/site/pages.ts:186` | **Partial.** Guide `aside.side` is `position: sticky; top: 88px`. Formalise into a small "sticky panel with scrubbed highlights" used in `RunView` to keep the step-detail pinned while the timeline scrolls. |
| **Bento grid** | `.steps` / `.grid2` / `.gridstats` plus `grid gap-20`. 20px gap, gapless feel. | `src/site/pages.ts:151,155,156` | Matches Aceternity bento (wide gaps, soft cards). Gap is **law** — do not tighten below 20px on landing. |
| **Moving border / shimmer** | `.packet` (offset-path travel, 650ms) — used once for simulator packets; landing `@keyframes rise`. | `dashboard/src/styles.css:191-204` | Aceternity's moving border is not present. Do not add: could fight the record dot. If needed, reuse `.packet` motion idiom on a single element per view. |
| **Background beams / aurora** | `--spot` radial gradient + `--grain` overlay. | `src/site/pages.ts:97-108`, `dashboard/src/styles.css:126-147` | Equivalent, softened. Aurora is a spotlight strip from above, not beams. Aceternity "background beams" should be interpreted as the `radial 1400×640 at 50% -200px` — **not** moving beams. |
| **Text generate effect** | `rise` keyframe (opacity + 12px) with staggered delays (`.hero .lede` 0.08, `.urlform` 0.16). | `src/site/pages.ts:193` | Matched in restraint. Aceternity's text-generate sweeps bigger; here it's capped to **two lines** to keep reading. |
| **3D card / hover lift** | `.card:hover { translateY(-3px) }` + deeper shadow on linked cards only. | `src/site/pages.ts:188` | Parity on landing. Dashboard has `hover:border-signal/50` on `SpotlightCard`. Consistent. |

**Owner rule (Walkcast-specific):** Aceternity components that introduce a *second* accent colour, idle loops, or perspective 3D are **forbidden** — they collide with `--rec` (record light) and the theatre motif. Only adopt accents as variations of `--spot`, `--signal`, or `--grain`.

---

## 2. Proposed new blocks (design-spec only)

### Block A — Record-Light Halo

A small, halo-style red glow that **only** lights up around the mark/badge when a run is actively recording. Aceternity's "animated beam" idiom, re-skinned as a record indicator.

- **Visual**: radial gradient, `--rec` at 18% → transparent over ~48px, centered on the mark's record dot. Breathing opacity between `0.4` and `1` on a 1.6s ease-in-out loop **only while recording**. No blur beyond 6px (`backdrop-filter` not used here).
- **Anatomy**: outer span `position: absolute; inset: -12px; border-radius: 50%; pointer-events: none;`, z-index below the mark.
- **States**: idle → `opacity: 0` + `scale 0.85`; recording → animated; reduced-motion → static `opacity: 0.7`, no loop.
- **Where used**: landing `.stage` figcaption (already static record dot exists there), dashboard `Mark`, `Record` view header, transcript active line timestamp (subtle 8px halo).
- **Token dependency**: `--rec` only. Stroke ring around dot stays `stroke: var(--ink)` on dark / `var(--paper)` on light, so halo reads as the dot leaking, not a button.

### Block B — Film Grain Mask

A reusable, localised grain layer for cards that need to feel like film (stage, result clip cards, fixture thumbnails). Aceternity's "noise" card idiom, but fixed-frequency (stitch-tiled) so it never reads as video jitter when scrolling.

- **Visual**: same turbulence SVG as global grain (`baseFrequency .85`, `numOctaves 3`, `stitchTiles`), opacity 0.06 light / 0.10 dark, masked with `radial-gradient` so edges fade and the grain looks like it sits *inside* the panel.
- **Anatomy**: card `position: relative; overflow: hidden`, mask `::after` at `inset: 0; pointer-events: none; mix-blend-mode: multiply` (light) / `soft-light` (dark).
- **Token dependency**: reuses `--grain` scalar; no new colour. Should **not** replace the global body::before — it is a **second, localised** layer and must be opted in per-card.
- **Where used**: `.stage`, transcript, `Mark` display card in `/record` results page, screenshot preview in dashboard `RunView` evidence thumbnails.

---

## 3. Implementation notes for the next builder

- **React / TypeScript (dashboard)**: keep it like `SpotlightCard` — a single component with a `ref` + `useState` position. Record-Light Halo wants an `isRecording: boolean` prop, not hover-driven. Grain Mask is purely CSS; prefer a utility class `.grain-mask` so it composes inside Tailwind without a React wrapper.
- **Animation**: Motion (Framer Motion) **or** plain CSS `@keyframes`. Prefer CSS for these two (they're state-driven, not gesture-driven) so they stay 0-bundle-cost and reduce-motion compliant under the global guard in `dashboard/src/styles.css:206-213`.
- **Reduced motion**: both blocks must honour the existing guard (animation-duration 0.01ms). Halo falls back to a static glow; Grain layer becomes a static image (`opacity: 0.04`) with no `transition`.
- **Parity checkpoints before merging**:
  1. Red still only appears on `--rec` and `--fail` usages; new blocks must not introduce a third red.
  2. Spotlight cards remain the **only** cursor-driven radial.
  3. Grain remains two layers max: global body::before + optional `.grain-mask` per card. Never stack grained cards — overlapping grain moirés.
  4. No `backdrop-filter` additions outside header / `--spot` caption (perf budget).
  5. Check mobile safe areas: Landing has no grain mask on the hero; Record halo must not be clipped by `env(safe-area-inset-*)` nav.
- **Tracing beam gap**: if you pick one to build first, build the **record-light halo** — it's the most rewarding and requires no new data or SVG path logic. The tracing beam is a larger piece; before building, define the data contract with `FlightStrip`'s event loop (don't invent a parallel one). Suggested contract: `{ stepId, state: "pending" | "active" | "evidence", top, height (px), color }`, driven by the same `events` array `FlightStrip` already consumes.
- **Do not touch**: `dashboard/src/views/*`, `src/site/pages.ts`, `src/site/guides.ts`. New components live in `dashboard/src/components/` new files (e.g. `RecordHalo.tsx`, `GrainMask.tsx`) or a pure CSS utility in `styles.css`. A PR brief (`docs/aceternity-parity-PR-brief.md`) can be spun off later.

---

## 4. What not to do (Manu's standing cautions)

- Do **not** port Aceternity's purple/glow palette. Brand is warm paper + `--rec` red + `--ember` on italics.
- Do **not** add scroll-linked 3D perspective or `translateZ`. The theatre reads as flat 2D photography.
- Do **not** ship new hover bowls; hover variety is capped to three (button, linked card, spotlight).
- No placeholder imagery. Grain + spotlight carry all decoration.
- Type keeps three families; no new font. "Fraunces" italics are the only flourish.

---

### Source files inspected

- `dashboard/src/components/ui.tsx` — Spotlight card, panel, finding chips.
- `dashboard/src/components/FlightStrip.tsx` — timeline + colour families.
- `dashboard/src/App.tsx` — sticky header, nav, `Mark` (record dot), footer.
- `dashboard/src/styles.css` — tokens, elevation, grain, packet travel, reduced motion.
- `src/site/pages.ts` — landing tokens, hero, urlform, stage/transcript, `--grain` layer, gradient header hairline.<|end|><|start|>write to=assistant<|channel|>analysis<|message|>Created file successfully: docs/aceternity-parity-components.md