# Page Transitions & "Zero-Memory" Motion — Walkcast Design Law

> Persona lens: Manu Arora / Aceternity UI — dark-first, motion-dense, premium pixels — but
> re-skinned to Walkcast's warm paper / theatre motif and the `--rec` record light.  
> Companion to `docs/design-language-landing.md` (§d motion laws) and
> `docs/aceternity-parity-components.md`.  
> **Core goal:** page transitions and movements must carry the user's attention and context so
> that **nobody has to memorise the whole UI** to move through it. Motion is information, not
> decoration.

---

## 0. The problem this solves

A user moving through a multi-surface app (Overview → Run → Compare → Experiments → Record) has to
hold an invisible map in working memory: where am I, what did I just leave, how do I get back,
what is this new surface? If transitions are abrupt cuts, the user memorises. If transitions are
ornamental (fade-for-fade's-sake), the user still memorises — the motion teaches nothing.

**Law:** every transition must *transfer context* (position, object, identity, or state) from the
source surface to the destination surface, so the user's eye is led, not reset.

---

## 1. Principles (Manu / Aceternity reading of "zero-memory")

1. **Object constancy over navigation.** When an element exists on two surfaces (a run id, a
   screenshot, a chip, a step), it **morphs** (`layoutId`) rather than disappearing and reappearing.
   The user never re-finds it.
2. **Spatial continuity.** Departure direction predicts arrival direction. If a card sits on the
   right and is opened, its detail expands *from that card* (scale+translate origin at the card),
   not from screen centre.
3. **Persistent anchors never scroll away.** Sticky header, sticky FlightStrip lane, sticky side
   panel (`aside.side`). The anchor is the memory prosthetic: the UI remembers for the user.
4. **One focal move at a time.** A transition changes *one* thing at a time (position OR scale OR
   colour), never all three. Stagger, don't simultaneous-glitter.
5. **Entrance ≠ exit.** Entering a surface is a *reveal* (opacity + small translate 8–12px); leaving
   is a *hold-and-fade* (keep last frame 80ms, then fade) so the eye catches where it was.
6. **Motion carries state, state carries motion.** Loading → success → failure get distinct, fixed
   motion signatures (pulse / settle / jolt) so status is read kinetically, not scanned.
7. **No memorisation through friction.** Hover reveals affordances; nothing is "hidden behind a
   memorised chord". Every interactive thing shows its handle on focus or hover within 120ms.
8. **Reduce-motion is a design, not a fallback.** Reduced motion still preserves object constancy
   via instant layout swaps and focus moves — never a blank replacement.

---

## 2. Surface map & transition contract

Surfaces in Walkcast: `Overview`, `Runs`, `RunView` (sticky header + FlightStrip), `Compare`,
`Experiments`, `Simulator`, `Record`, `Fixtures`, settings/auth.

| From → To | Trigger | Motion signature | Context carried |
|---|---|---|---|
| Overview → RunView | click a run row/card | `layoutId="run-{id}"` row expands into Run header; FlightStrip scrubs 0→first event | run id, time-zero offset |
| Runs → Compare | select two runs | selected rows slide together into Compare's split stage; timeline lanes align | the two runs' step arrays |
| RunView ↔ Compare | tab/segment pill | cross-fade with shared stage box (same `layoutId="stage"`), tabs themselves don't move | active time cursor |
| Cards → Detail drawer | click card | card scales 1.0→1.02, detail drawer slides in from the **card's side** (right on desktop, bottom on mobile), card dims to 0.6 | card content as the drawer header |
| List → Empty / Error | data change | soft settle (no jolt): content fades, empty-state rises 12px; error adds a single `--fail` jolt shake (max 2px, 240ms) | previous query string stays in urlform |
| Modal / sheet open | action | backdrop fade 120ms, sheet slides from edge with spring (stiffness 260, damping 28); focus moves to first field | trigger element focus token |
| Auth gate | protected route | surface dims, auth card (440px) rises; after success, auth card shrinks into the user pill (`layoutId="user-pill"`) | return-to URL |
| Theme toggle | toggle | Tokens swap with a 180ms cross-dissolve of the *whole* paper; grain stays; no layout shift | scroll position |
| Route change (generic) | link | shared-element first; if none, `AnimatePresence` keyed fade + 8px translate, 220ms `cubic-bezier(0.4,0,0.2,1)` | page title via `document.title` |

Rule of thumb: if a transition has no entry in this table, it does not ship.

---

## 3. Motion primitives (Aceternity idioms, Walkcast-skinned)

Reuse **only** idioms Walkcast owns (see aceternity parity doc §1). New primitives that earn
their keep:

- **`SharedMorph`** — Framer Motion `layoutId` wrapper. Any element tagged on two routes morphs.
  Allowed tag families: `run-{id}`, `stage`, `user-pill`, `evidence-{stepId}`, `chip-{findingId}`.
  No arbitrary morphs (would become noise).
- **`Reveal`** — `opacity 0→1`, `translateY 12→0`, 0.22s, respects stagger. Max two staggered
  children before "rise" takes over (design-language §d.3).
- **`Carry`** — when leaving a surface, hold the last frame for 80ms (`AnimatePresence` exit
  delay) so the eye anchors; never instant-cut.
- **`Pin`** — sticky primitive; header `z-30`, side panel `top: 88px`, FlightStrip lane pinned.
- **`Scrub`** — timeline pointer. A single horizontal/vertical time cursor that every view can
  subscribe to; the transition between views preserves cursor position (zero-memory: the clock
  never resets).
- **`Jolt`** — failure only. 2px shake, 240ms, `--fail`. Used max once per error event.
- **`Settle`** — success. Opacity stabilise + 1px downward rest, 160ms. No confetti.
- **`Spring`** — sheets/modals: stiffness 260, damping 28, mass 0.9. Nothing else uses springs
  (keeps the vocabulary small).

No idle loops. No parallax. No scroll-linked 3D (`translateZ` forbidden, aceternity doc §4).

---

## 4. Persistent navigation (the memory prosthetic)

Zero-memory requires the chrome to *think* for the user:

- **Sticky header** (`z-30`, paper 85% + blur 12px) — always shows: `Mark` record dot, brand,
  active section, theme toggle, user pill. Never collapses to a hamburger below 900px? Actually
  collapse to icon row ≤680px, **labels return as tooltips on focus** (not hidden behind memory).
- **Breadcrumbs as position, not history.** `Overview › Runs › {run-id}` always reflects *where*,
  never *how you got there*. Clickable at every crumb.
- **FlightStrip as orientation.** In RunView, the sticky timeline is the "you are here" strip; step
  evidence markers (`--highlight`) double as anchors. The `Scrub` cursor persists across Compare.
- **Side panel sticky highlights.** Guide pages pin `aside.side` at `top: 88px` and highlight the
  active subsection as the user scrolls — the user never tracks "which section am I on".
- **URL as memory.** Every state worth remembering is in the URL (query params for filters,
  hash for active tab). Back/forward = transition with context, never a reset.
- **Command palette (optional, ⌘K)** — discoverable search over surfaces/actions; the escape hatch
  for anyone who *did* forget. Not a substitute for clear nav.

---

## 5. Anti-patterns (forbidden)

- Full-page white flash / hard cut with no anchor (and the stage-ground `#root` background guard
  prevents the dark-theatre white flash — seam-craft doc).
- Animating colour and transform in the same transition (pick one).
- Resetting scroll on route change (always `scrollRestoration` + restore).
- Hiding primary nav behind a memorised gesture without a visible affordance.
- Two simultaneous morphs competing (sequence them).
- Any transition longer than 400ms for navigation (keep ≤ 260ms content, ≤ 400ms sheets).
- Decoration motion that carries no state (idle shimmer, auto-rotating carousels).

---

## 6. Per-surface notes (Manu reading)

- **Overview (landing):** hero URL form is the single above-fold CTA; `rise` capped to two lines;
  spotlight card follows cursor (`--signal-soft` radial). Transition *into* a run makes the URL
  form morph into the run's header URL (`layoutId="hero-url"` → `run-url`), so the user sees
  their submitted URL become the run's source. Zero new memory.
- **RunView:** sticky header + pinned FlightStrip. Step detail pinned while timeline scrolls
  (sticky scroll reveal). Time cursor `Scrub` persists.
- **Compare:** split stage shares `layoutId="stage"` with RunView; switching tabs cross-fades the
  stage, tabs stay put. The user's eyes stay on the stage.
- **Record:** mark record dot pulses **only while recording**; the Record-Light Halo (aceternity doc
  Block A) is the single kinetic signal. After stop, the mark shrinks into the results thumbnail
  (`layoutId="mark"`).
- **Experiments/Simulator:** packets travel once (650ms, `cubic-bezier(0.4,0,0.2,1)`); no loops.

---

## 7. Accessibility & reduce motion

- `prefers-reduced-motion: reduce`: all durations → 0.01ms, transforms stripped, but **object
  constancy preserved** via instant `layoutId` swaps and focus moves (focus token carried).
  Breadcrumbs and sticky anchors remain (they are the prosthetic, not motion).
- Spotlight radial may remain without transition (0ms).
- Focus ring (`--signal`) always visible on keyboard focus; focus moves with the morphed element.
- Announce route changes to screen readers via `aria-live="polite"` on a title region.

---

## 8. Implementation order (for the next builder)

1. Land the **contract table (§2)** as a typed `TRANSITIONS` map in code (routes → signature).
2. Implement `SharedMorph` / `Reveal` / `Carry` primitives (CSS first, Framer Motion where needed).
3. Add `Scrub` cursor state (URL + store) so it persists across views.
4. Wire breadcrumbs + sticky anchors; verify URL-as-memory for filters.
5. Only then add sheets/modals/spring treatment.
6. Parity checkpoints (must pass before merge):
   - No transition introduced without a §2 row.
   - Red (`--rec`) appears only in record/error/jolt contexts; motion doesn't add a third red.
   - Reduced-motion preview passes the same flows.
   - No idle loops; no `translateZ`.

---

## 9. What "done" looks like

A first-time user can go Overview → pick a run → Compare two runs → return, **without ever being
told where anything lives**, because every movement showed them. If a user asks "where's the X
button?" after one pass, the design failed.

---

### Source files this doc derives from
- `docs/design-language-landing.md` (§c layout, §d motion)
- `docs/aceternity-parity-components.md` (idiom map, parity rules)
- `dashboard/src/styles.css`, `src/site/pages.ts`, `dashboard/src/components/ui.tsx`, `App.tsx`,
  `FlightStrip.tsx`
No source edited by this doc — spec only.
