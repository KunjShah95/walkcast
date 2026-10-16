# Walkcast Design Language (Landing & Surfaces)

> Source of truth: `dashboard/src/styles.css`, `src/site/pages.ts` (`CSS` constant and `DARK`).  
> Visual tone: a screening room — warm paper in daylight, a dim theatre at night, film grain,
> a soft spotlight, Fraunces headlines, Geist body text, Geist Mono for timings. Red is reserved
> (with one exception) for the record light and for failure.  
> Last synced from code: 2026-10-15.

---

## (a) Color tokens

Warm paper (landing) / theatre (dashboard). Dark-first for app surfaces.

### Base surfaces & ink

<|start|> Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#f7f3ec` | `#121110` | Page background |
| `--panel` | `#fffdf9` | `#1a1917` | Elevated cards / panels |
| `--panel-2` | `#f2ede4` | `#23211e` | Recessed / input fill |
| `--ink` | `#1c1917` | `#f3efe8` | Primary text, strong fills |
| `--ink-2` | `#57534e` | `#b6afa4` | Secondary text |
| `--ink-3` | `#8a837a` | `#7f786e` | Tertiary, metadata |
| `--line` | `#e7e0d4` | `#2f2c28` | Borders, hairlines |
| `--spot` | `rgb(255 214 170 / 0.50)` | `rgb(255 170 110 / 0.08)` | Spotlight radial top-edge |
| `--grain` / `--grain-opacity` | `0.045` | `0.07` | Film grain overlay (landing `--grain` scalar, dashboard `--grain-opacity`) |

### The record light and accents

| Token | Light | Dark | Use |
|---|---|---|---|
| `--rec` | `#e5484d` | `#ff6369` (dash) / `#ff4d4f` (record dot) | Record dot, eyebrow marker, mark dot — **red only blinks at record** |
| `--signal` | `#3150c9` | `#93a7ff` | Focus rings, links, stagehand/model markers (not buttons) |
| `--ember` | `#c2410c` | `#ff8a5c` | Headline italic accent (`em`), numbered step counters |
| `--highlight` | `#ffe58a` | `rgb(255 214 74 / 0.20)` | Evidence highlighter fill |
| `--highlight-ink` | `#3d3000` | `#ffd84a` | Text on highlight |

### Status (exception colour; do not recolour semantics)

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `--pass` | `#24713f` | `#6fd39a` | Success verification |
| `--fail` / `--fail-soft` | `#b42318` | `#ff7b72` | Failure — the **only** other sanctioned red |
| `--warn` | `#9a5b00` | `#f2b84b` | Pending / timing |
| `--caption` | `#ffd84a` | `#ffd84a` | Transcript active captions |

### Edge gradients and shadows

- Header bottom hairline: `linear-gradient(90deg, transparent, var(--line) 20%, var(--line) 80%, transparent)` (`header.top::after`).
- Spotlight: `radial-gradient(1200px 520px at 50% -160px, var(--spot), transparent 70%)` (dashboard) / `radial-gradient(1400px 640px at 50% -200px, var(--spot), transparent 70%)` (landing).
- Shadow: `0 1px 2px rgb(28 25 23 / 0.04), 0 12px 32px -18px rgb(28 25 23 / 0.28)` (light) / `0 1px 0 rgb(0 0 0 / 0.35), 0 16px 40px -20px rgb(0 0 0 / 0.85)` (dark).
- Card elevation on hover (landing): `0 28px 56px -30px rgb(28 25 23 / 0.45), inset 0 0 0 1px var(--line)`.

### Caption vs rec (landing only)

- `--caption` is the transcript-active yellow. The record dot is always `--rec`. Never swap.

---

## (b) Typography

| Role | Stack | Sizes | Notes |
|---|---|---|---|
| Display / headings | `Fraunces` (variable, optical sizing) fallback Georgia | `clamp(44px, 7.2vw, 92px)` hero, `clamp(34px, 4.6vw, 56px)` band, 24px card h3, `text-[17px]` panel | `font-optical-sizing: auto; letter-spacing: -0.022em; font-weight: 560`. Italic em accent uses `--ember`. |
| Body | `Geist` (variable) | landing 16px / 1.6; dashboard 14px / 1.5; lede 17–21px; prose 17.5px | `text-rendering: optimizeLegibility; -webkit-font-smoothing: antialiased` |
| Timings / data / eyebrow / mono | `Geist Mono` | eyebrow 10.5–12px / .14em tracking / uppercase; timecodes 11.5–12px; stat figures tabular | `font-variant-numeric: tabular-nums` on `.tabular` |

Self-hosted woff2 with `font-display: swap`: `geist-latin-wght-normal.woff2`, `geist-mono-latin-wght-normal.woff2`, `fraunces-latin-wght-normal.woff2`, `fraunces-latin-wght-italic.woff2`.

---

## (c) Layout laws

- **Hero with URL box.** Centered hero, `max-width: 14ch` headline, single `urlform` capsule (input + "Make my walkthrough" button). `.urlform` gets a `--ember` focus ring, lifts `1px` on hover with primary button shadow. No secondary CTAs above the fold beyond the URL form.
- **Sticky header.** `header.top` is `position: sticky; top: 0; z-index: 5`, paper 82% mix + `blur(12px)` and a bottom gradient hairline. On dashboard, header is `sticky z-30 border-b border-line bg-paper/85 backdrop-blur`, `top: env(safe-area-inset-top)` (mobile-aware).
- **Sticky-header timeline.** Dashboard `RunView` pairs a sticky header with a `FlightStrip` SVG timeline (steps top lane, model calls middle, network bottom) — one shared time scale, evidence steps marked with the highlighter (`--highlight`). Timeline is always time-scaled, never decorative.
- **Theatre motif.** Every screen is a room with a dark stage: stage video surface `#0d0c0b`, transcript pane `#161513`, bordered by `rgb(255 255 255 / 0.06)`. Demo caption is a rounded mono pill top-right; the record dot pulses inside it. Grain is fixed-position and never scrolls.
- **Max containers.** Landing `.wrap` = 1160px; dashboard main = 1240px. Auth card 440px. Prose 68ch.
- **Grid laws.** Landing uses 3-column steps, 4-column output, 3-column guides, 2-column checks; collapse to 2-col ≤900px, 1-col ≤680px. Dashboard bento packs are paired 1fr/340px stage+transcript.
- **Evidence as caption.** Clues / evidence use `.evidence` — a `--highlight` underline band, never a bold font change alone.

---

## (d) Motion laws

1. **The red light blinks only at record.** The record dot (`fig-caption::before` / `Mark` circle / `.eyebrow::before`) pulses (1.6s ease-in-out infinite, opacity 0.25 at 50%) **only** in the context of an active recording. No pulse on idle UI or hover. Respect `prefers-reduced-motion: no-preference` guard.
2. **Spotlight cards, no arbitrary hover bowls.** Hover emphasis is limited to: (a) the single `--signal` spotlight that follows the cursor inside a `SpotlightCard`, (b) `translateY(-1px)` + soft shadow on buttons, (c) `translateY(-3px)` on linked cards. Do not invent new hover bowls per component. Bento grids stay gapless (20px gap only).
3. **Motion choreography.** Landing intro uses one `rise` animation (opacity 0 + translateY 12px, 0.8s c-breeze). Token travel animation runs `650ms cubic-bezier(0.4, 0, 0.2, 1) forwards` once. No idle loop animations elsewhere; no parallax.
4. **Cursor-driven spotlight only follows the pointer inside the card.** Spotlight opacity is 0 when `pos === null` (leaves the card). No spotlight on keyboard focus — focus gets the `--signal` outline ring instead.
5. **Reduce motion.** `prefers-reduced-motion: reduce` zeroes animation/transition durations and disables scroll-smoothing; record-dot pulse disabled. Spotlight radial may remain but without transition (0ms).
6. **Film grain is fixed, never composited at reduced opacity per component.** A single global layer.

---

## (e) CSS token tables ready to paste

Landing (warm paper):

```css
:root {
  --paper: #f7f3ec; --panel: #fffdf9; --panel-2: #f2ede4;
  --ink: #1c1917; --ink-2: #57534e; --ink-3: #8a837a; --line: #e7e0d4;
  --signal: #3150c9; --ember: #c2410c; --rec: #e5484d; --caption: #ffd84a;
  --pass: #24713f; --fail: #b42318; --spot: rgb(255 214 170 / 0.5);
  --grain: 0.045;
  --display: "Fraunces", Georgia, "Times New Roman", serif;
  --body: "Geist", ui-sans-serif, system-ui, sans-serif;
  --mono: "Geist Mono", ui-monospace, Menlo, monospace;
  --shadow: 0 1px 2px rgb(28 25 23 / 0.05), 0 24px 48px -28px rgb(28 25 23 / 0.35);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --paper: #121110; --panel: #1a1917; --panel-2: #23211e;
    --ink: #f3efe8; --ink-2: #b6afa4; --ink-3: #7f786e; --line: #2f2c28;
    --signal: #93a7ff; --ember: #ff8a5c; --rec: #ff6369; --caption: #ffd84a;
    --pass: #6fd39a; --fail: #ff7b72; --spot: rgb(255 170 110 / 0.08);
    --grain: 0.07;
  }
}
```

Dashboard (theatre, Tailwind v4 inlined):

```css
:root {
  --paper: #f7f3ec; --panel: #fffdf9; --panel-2: #f2ede4;
  --ink: #1c1917; --ink-2: #57534e; --ink-3: #8a837a; --line: #e7e0d4;
  --signal: #3150c9; --signal-soft: rgb(49 80 201 / 0.09);
  --rec: #e5484d; --ember: #c2410c; --highlight: #ffe58a; --highlight-ink: #3d3000;
  --fail: #b42318; --fail-soft: rgb(180 35 24 / 0.08);
  --pass: #24713f; --pass-soft: rgb(36 113 63 / 0.09);
  --warn: #9a5b00; --warn-soft: rgb(154 91 0 / 0.1);
  --shadow: 0 1px 2px rgb(28 25 23 / 0.04), 0 12px 32px -18px rgb(28 25 23 / 0.28);
  --spot: rgb(255 214 170 / 0.45); --grain-opacity: 0.045;
  --font-display: "Fraunces Variable", Georgia, "Times New Roman", serif;
  --font-body: "Geist Variable", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Geist Mono Variable", ui-monospace, "SFMono-Regular", Menlo, monospace;
}
```

Tailwind v4 wiring (from `dashboard/src/styles.css`):

```css
@theme inline {
  --color-paper: var(--paper); --color-panel: var(--panel); --color-panel-2: var(--panel-2);
  --color-ink: var(--ink); --color-ink-2: var(--ink-2); --color-ink-3: var(--ink-3);
  --color-line: var(--line); --color-signal: var(--signal); --color-rec: var(--rec);
  --color-fail: var(--fail); --color-fail-soft: var(--fail-soft);
  --color-pass: var(--pass); --color-pass-soft: var(--pass-soft);
  --color-warn: var(--warn); --color-highlight: var(--highlight); --color-highlight-ink: var(--highlight-ink);
  --font-display: var(--font-display); --font-sans: var(--font-body); --font-mono: var(--font-mono);
  --shadow-card: var(--shadow);
}
```

Theatre (full-screen video + transcript) hard-coded surfaces: stage `#0d0c0b`, transcript `#161513`, chrome line `rgb(255 255 255 / 0.06)`.

---

### Source files inspected

- `dashboard/src/styles.css` — full token set, fonts, elevation, grain, spotlight body.
- `src/site/pages.ts` — `FONTS`, `GRAIN`, `DARK`, `CSS`, `MARK`, hero / urlform / stage / transcript / band rules, `prefers-reduced-motion` guards.
- `dashboard/src/components/ui.tsx` — `SpotlightCard`, `FindingChip`, `Verdict`, `Panel`, `ThemeToggle`.
- `dashboard/src/components/FlightStrip.tsx` — timeline visual idioms.
- `dashboard/src/App.tsx` — sticky header, `Mark` record dot, nav pills.
- `docs/screenshots/*.png` — overview, run, simulator, compare, timeline-dark (referenced only, not opened inline).

## (g) Page transitions & zero-memory motion (summary)

Full doctrine in `docs/page-transitions-memory.md`. Headlines:

- Every transition **transfers context** (object constancy via `layoutId`, spatial continuity,
  persistent anchors, one focal move at a time). No hard cuts without an anchor.
- Persistent chrome thinks for the user: sticky header, sticky FlightStrip, sticky side panels,
  breadcrumbs-as-position, URL-as-memory, optional ⌘K palette.
- Allowed primitives only: `SharedMorph`, `Reveal`, `Carry`, `Pin`, `Scrub`, `Jolt`, `Settle`, `Spring`.
  No idle loops, no parallax, no `translateZ`, no simultaneous transform+colour.
- Reduced motion keeps object constancy via instant swaps + focus moves.

## Source files inspected
No `.tsx` / `.ts` source was edited. This document is spec-only.
