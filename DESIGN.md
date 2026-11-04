---
name: Walkcast
description: Narrated video walkthroughs of any website, from a link; the same recorder turns failed agent runs into regression tests.
colors:
  paper: "#ffffff"
  panel-2: "#f5f4f1"
  panel-3: "#eae8e3"
  ink: "#1b1a17"
  ink-2: "#4c4841"
  muted: "#6b665d"
  dim: "#8a847a"
  line: "#e7e3db"
  line-strong: "#cfc9bd"
  signal: "#1d5e58"
  signal-strong: "#164a45"
  signal-soft: "#dcebe7"
  exhibit: "#f6d776"
  exhibit-ink: "#4f3b00"
  exhibit-soft: "#fbf0cc"
  rec: "#c0321c"
  fail: "#b2261c"
  pass: "#2c6a3d"
typography:
  display:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(46px, 7.4vw, 100px)"
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(34px, 4.9vw, 64px)"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.012em"
  lede:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(17px, 1.55vw, 20px)"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16.5px"
    fontWeight: 400
    lineHeight: 1.6
    fontFeature: "\"ss01\""
  label:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14.5px"
    fontWeight: 600
    lineHeight: 1
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "12.5px"
    fontWeight: 500
    fontFeature: "\"tnum\""
  stat:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "clamp(28px, 3vw, 38px)"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.04em"
rounded:
  xs: "6px"
  sm: "8px"
  md: "10px"
  r: "14px"
  lg: "22px"
  frame: "34px"
  pill: "999px"
spacing:
  gutter: "20px"
  container: "1240px"
  narrow: "860px"
  column-gap: "32px"
  row-gap: "40px"
  section: "clamp(88px, 11vw, 152px)"
  section-first: "clamp(56px, 8vw, 104px)"
components:
  button-solid:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "11px 18px"
  button-rec:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "11px 18px"
  button-rec-hover:
    backgroundColor: "{colors.signal-strong}"
  button-quiet:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "11px 18px"
  button-quiet-hover:
    backgroundColor: "{colors.panel-3}"
  button-big:
    rounded: "{rounded.pill}"
    padding: "15px 24px"
  url-field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.pill}"
    padding: "6px 6px 6px 20px"
    width: "min(600px, 100%)"
  cite-chip:
    backgroundColor: "{colors.exhibit}"
    textColor: "{colors.exhibit-ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.xs}"
    padding: "4px 7px"
  chip:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    padding: "9px 15px 9px 13px"
  panel:
    backgroundColor: "{colors.panel-2}"
    rounded: "{rounded.lg}"
    padding: "clamp(18px, 2.4vw, 28px)"
  card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.r}"
    padding: "22px"
  faq-row:
    backgroundColor: "{colors.panel-2}"
    rounded: "{rounded.r}"
    padding: "18px 20px"
  faq-row-open:
    backgroundColor: "{colors.paper}"
  auth-card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.lg}"
    padding: "24px 24px 20px"
  auth-input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  nav-bar:
    height: "64px"
---

# Design System: Walkcast

## Overview

**Creative North Star: "The Case File, Opened Up"**

The public site is the signed-in app's case file laid open on white paper for a visitor. It speaks in the app's palette (ink, teal signal, exhibit cream, record red, pass green) but composes on the vidyst.com grammar: centred two-tone headlines with a drawn icon tile set into the line, a product window held in a soft grey ring, pill buttons, hairline-topped feature columns, rounded FAQ rows and a multi-column footer that ends in a huge, faded wordmark. The page cites its own evidence: claims carry EX-n citation chips that seek and spotlight a line in the real recording.

Density is airy and editorial. Sections are separated by generous vertical space, not by colour bands; surfaces separate by one step of warm grey and a 1px hairline. The site is light only, on pure white paper, with no dark variant.

**Key Characteristics:**
- White paper (#ffffff), warm ink, and two signals used sparingly: teal for "record this" and for evidence, red only for the record light.
- Headlines in two tones: the claim in ink, the consequence in dim ink, with a rotated drawn tile in the line.
- Every button is a pill; every container is a softly rounded rectangle; hairlines are drawn as inset 1px rings.
- One product shot, the recorder window, framed in a soft grey ring with the only large shadow on the site.
- JetBrains Mono appears only where the content is machine-literal: timecodes, file names, URLs and counts.

## Colors

A warm, near-monochrome paper-and-ink palette with one deep-teal voice and two status colours that each mean exactly one thing.

### Primary
- **Record Teal** (signal): the record action (the "Make my walkthrough" pill), focus rings, the input caret, the active chapter segment, the playing timecode and hover state of text links. Its deeper step **Pressed Teal** (signal-strong) is the hover of the record pill and the fill of the brand mark.
- **Teal Wash** (signal-soft): the outer halo of a focused field and the pricing ticket stub.

### Secondary
- **Exhibit Cream** (exhibit) with **Exhibit Ink** (exhibit-ink): citation chips, the active EX tag and text selection. **Exhibit Wash** (exhibit-soft) tints the transcript line currently playing.

### Tertiary
- **Record Red** (rec): the record light only: the dot inside the record pill, the red tile in a headline.
- **Pass Green** (pass): a page that answered 200, checkmarks in pricing features, filled pass marks in the lab ledger.
- **Fail Red** (fail): filled fail marks in the ledger and form errors.

### Neutral
- **White Paper** (paper): the page, the recorder window, cards, open FAQ rows and inputs.
- **Shelf Grey** (panel-2): quiet pills, chips, panels, closed FAQ rows, the frame ring and the pricing tray.
- **Deep Shelf** (panel-3): pill hover, empty chapter segments and ledger marks, and the faded footer wordmark.
- **Ink** (ink): headlines, primary text and the solid "go" pill.
- **Ink Two** (ink-2): transcript lines, prose and table body.
- **Muted Ink** (muted): ledes, secondary copy, nav links, metadata.
- **Dim Ink** (dim): the second tone of display headlines; icon tint inside the URL field.
- **Hairline** (line) and **Strong Hairline** (line-strong): dividers, inset rings, the ghost pill outline, dashed and dotted receipt rules.

### Named Rules
**The Two Signals Rule.** Teal means "record this" or "this is the evidence"; red means the record light. Neither is decoration, and neither tints a section background.

**The One Meaning Rule.** Green is only a page that answered or a check that passed; fail red is only a counted failure or an error.

**The Dim Is Display Rule.** Dim ink (#8a847a, about 3.6:1 on white) is the second tone of large headlines. Small text uses muted ink or darker.

## Typography

**Display Font:** Schibsted Grotesk (with ui-sans-serif, system-ui)
**Body Font:** Schibsted Grotesk
**Label/Mono Font:** JetBrains Mono (with ui-monospace, SFMono-Regular, Menlo)

**Character:** One grotesk carries every size, tight and heavy at the top, plain and readable below; the mono is reserved for strings a machine wrote.

### Hierarchy
- **Display** (700, clamp(46px, 7.4vw, 100px), 0.98, -0.04em): the landing h1, centred, two tones with an inline tile. Inner page heads use clamp(42px, 6.2vw, 84px); guide articles clamp(36px, 4.6vw, 58px).
- **Headline** (700, clamp(34px, 4.9vw, 64px), 1.02, -0.04em): section heads, also two-tone. In split layouts it steps down to clamp(32px, 4vw, 54px).
- **Title** (700, 18px, 1.3): feature column and card titles; FAQ questions run 600 at 16.5px.
- **Lede** (400, clamp(17px, 1.55vw, 20px), 1.55, muted): under every headline, max 50ch, 66ch when centred.
- **Body** (400, 16.5px, 1.6, ss01): running copy; guide prose at 17px with a 70ch measure.
- **Label** (600, 14.5px, 1): pills and nav.
- **Mono** (500, 11.5 to 13.5px, tabular): timecodes, file names, URLs in the link field, EX tags, page chips, receipts.
- **Stat** (mono 600, clamp(28px, 3vw, 38px), -0.04em): measured k/n counts in the lab ledger.

### Named Rules
**The Two-Tone Headline Rule.** Every display and section headline sets its claim in ink and its consequence in dim ink, in the same weight and size. A drawn tile may sit in the line; the words carry the meaning, the tile is decorative and aria-hidden.

**The Machine-Literal Mono Rule.** JetBrains Mono is only for timecodes, file names, URLs and counts. Headings, buttons, labels and prose are always Schibsted Grotesk.

## Layout

A single centred container (1240px, with a 20px or safe-area gutter); long reading drops to 860px or a 70ch prose measure. Landing and inner page heads are centred; content below alternates centred section heads with left-aligned splits (1fr / 1.1fr) and FAQ grids (0.8fr / 1.2fr, the left column sticky at 96px).

Sections share one rhythm: clamp(88px, 11vw, 152px) of top padding, clamp(56px, 8vw, 104px) for the first. The close section is larger (clamp(104px, 13vw, 176px)). Feature columns run three across with 40px row and 32px column gaps, dropping to two at 1020px and one at 620px. The footer grid is a 1.5fr brand column plus four link columns, two-up at 1020px.

Responsive steps: 1020px (footer, specimens, features to two columns), 900px (recorder window stacks video over transcript; splits, FAQ, article and auth go single-column), 760px (main nav hides), 620px (URL field stacks its button full width, comparison table becomes stacked rows), 480px (pricing ticket loses its stub). The sticky top bar is 64px tall with a translucent white backdrop blur.

## Elevation & Depth

Depth is mostly tonal: a white surface sits on Shelf Grey, or a grey surface on white, with a 1px inset hairline ring. Real shadows are rare, soft, and always negative-spread so they read as a pool of shade under an object rather than a lifted card.

### Shadow Vocabulary
- **Product shot** (`box-shadow: inset 0 0 0 1px #e7e3db, 0 40px 80px -48px rgb(27 26 23 / .45)`): the frame around the recorder window only.
- **Open row** (`box-shadow: inset 0 0 0 1px #e7e3db, 0 12px 28px -20px rgb(27 26 23 / .35)`): an expanded FAQ row.
- **Field rest** (`box-shadow: inset 0 0 0 1px #cfc9bd, 0 1px 2px rgb(27 26 23 / .04)`): the URL field.
- **Focus halo** (`box-shadow: inset 0 0 0 2px #1d5e58, 0 0 0 5px #dcebe7`): focused fields.

### Named Rules
**The One Product Shot Rule.** The large soft shadow belongs to the recorder window frame. Other containers separate by tone and hairline.

**The Inset Hairline Rule.** Borders are drawn as `inset 0 0 0 1px` rings so they never shift layout; dividers between rows are 1px top borders in hairline.

## Shapes

Soft, generous rounding everywhere, scaled to the object: 6px on tags and citation chips; 8 to 10px on inputs, video and transcript rows; 14px on cards and FAQ rows; 22px on panels, the recorder window and auth cards; 34px (22px + 12px) on the ring around the recorder window; full pills on every button, chip, nav link and the URL field. Concentric radii are kept: an inner radius plus its padding equals the outer.

Icon tiles are rounded squares (0.24em corners) sized to 0.86em of the headline, rotated -5deg (or +6deg when tilted). Icons are drawn on one 24px grid with a single 1.75 round stroke. The pricing receipt is the one cut shape: notched with radial masks and divided by a dashed stub line.

## Components

### Buttons
Soft, confident pills.
- **Shape:** fully round (999px).
- **Solid (go):** ink fill, white text; hover mixes 14% paper into the ink.
- **Rec (record):** teal fill, white text, an 8px record-red dot with a white ring before the label; hover to Pressed Teal.
- **Quiet:** Shelf Grey fill, ink text; hover Deep Shelf.
- **Ghost:** transparent with a 1px strong-hairline inset ring.
- **Big:** 16px label, 15px 24px padding.
- **Hover / Focus:** 0.18s colour transitions, press scales to 0.98; focus is a 2px teal outline offset 3px.

### The Download Button
One family for the whole site: signal fill, white text, the platform's glyph, the platform's name, the download arrow. Every download on every page is this button — the nav pill, the hero's three platform pills, the installer cards, the footer, the closing panel. No second treatment, no icon-only variant, and never the record light (the red dot means recording, not installing).
- **Single:** the visitor's own platform, labelled "Download for Windows / Linux".
- **Row:** both platforms, fixed order so nothing moves when the page hydrates and learns the visitor's machine.
- **Installer card:** the same button, labelled for the file it fetches (.exe, .msi, .AppImage, .deb).

### Chips
- **Citation chip:** exhibit cream, exhibit ink, mono 600 11px, 6px radius, a half-opacity dot before the EX-n label; click seeks and spotlights the cited transcript line.
- **Tag:** mono 11.5px on Shelf Grey, turning exhibit cream when its line is active.
- **Feature chip:** sans 14px on a Shelf Grey pill with a leading icon.
- **Page chip:** mono 12.5px on Shelf Grey, 9px radius, status code in pass green.

### Cards / Containers
- **Corner Style:** 14px cards, 22px panels.
- **Background:** white cards with an inset hairline; grey panels without one.
- **Shadow Strategy:** none, per the One Product Shot Rule.
- **Internal Padding:** 22px cards, clamp(18px, 2.4vw, 28px) panels.

### Inputs / Fields
- **URL field:** one white pill holding a link icon, a mono URL input and the rec pill; stacks to a 22px-radius block under 620px.
- **Auth inputs:** white, 10px radius, strong-hairline inset ring, 15px sans.
- **Focus:** 2px teal inset ring plus an teal-wash halo.
- **Error:** fail red text at 13.5px below the field.

### Navigation
- Sticky 64px bar, 88% white with a 14px saturate blur and a bottom hairline. Brand mark plus a 700 18px wordmark, four muted 14.5px links in pill hit areas (hover: ink on Shelf Grey; current page: ink), then Sign in and a quiet "Get started" pill (or a solid "Open the app" pill when signed in). The main links hide under 760px.

### Recorder Window (signature)
A white window inside a Shelf Grey ring: a 46px title bar, the video (16:10, 10px radius) over a chapter strip of 5px rounded segments (teal for the current, mixed teal for done), a transcript list of timecoded lines on the right whose active line takes the exhibit wash, and a footer row of page chips that fades out at its scrolling edge. A cited line flashes a 2px teal ring for 1.8s.

### The Stage (landing product shot)
On the landing page the recorder window becomes the hero: a dark theatre card (stage `#0d0c0b`, transcript `#161513`, chrome line `rgb(255 255 255 / 0.06)`) holding the real recording, its caption bar carrying the live narration line and the visit log beneath it, the spoken line lit in exhibit wash. It is the one product shot on the page and the only large shadow on it. The card sits on the warm paper ground beside the headline, not below it, and the recording's own caption file drives the caption bar and the lit line.

### Feature Columns
Hairline-topped columns: a 1px top border, 24px above, an ink icon, an 18px title and a muted 15px description. No card fill.

### FAQ Rows
Rounded Shelf Grey rows (14px) with an 8px gap; a 30px round toggle holding a plus that rotates 45deg and fills ink when the row opens, and the open row turns white with the Open row shadow.

### Lab Ledger
A white card of stacked rows: a mono k/n stat with a sans caption, then one 9px square mark per trial, filled pass green or fail red.

### Footer
A hairline-topped multi-column sitemap (brand column with a solid pill, then Product, Guides, Compare, Account), a base row, and the word "walkcast" set at 800 weight, clamp(96px, 22vw, 320px), in Deep Shelf and masked to fade downward. Auth pages omit the footer.

### Auth Card
Auth pages keep the full navbar and drop the footer. A compact 820px shell pairs a grey story panel (headline, a short exhibit list, file chips) with a white card holding the form; under 900px the card comes first and the exhibit extras hide.

## Do's and Don'ts

### Do:
- **Do** keep every public page on white paper (#ffffff), light only.
- **Do** set display and section headlines in two tones, ink then dim ink, with at most one drawn tile in the line.
- **Do** make every button a pill: solid ink for go, teal with the red dot for record, Shelf Grey for the rest.
- **Do** separate surfaces with one step of warm grey and a 1px inset hairline.
- **Do** top feature columns with a hairline instead of boxing them in cards.
- **Do** use JetBrains Mono only for timecodes, file names, URLs and counts.
- **Do** tie claims to the recording with exhibit-cream citation chips.
- **Do** keep the full navbar on auth pages, omit the footer there, and use the compact card.

### Don't:
- **Don't** add a dark mode or tinted page background to the public site.
- **Don't** use teal or red as decoration or section fills; each signal has one meaning.
- **Don't** give containers other than the recorder frame and an open FAQ row a drop shadow.
- **Don't** set headings, buttons or prose in mono.
- **Don't** set small text in dim ink; it is a display tone.
- **Don't** use square or lightly rounded buttons on the site; the 6px app radius is the app's, not the site's.

---

# The signed-in app (/app)

The app is the same case file, open on the desk and being worked on. It shares the site's palette and grammar but keeps working density: the site persuades, the app decides. Source of truth: `apps/desktop/dashboard/src/styles.css` and `components/ui.tsx`.

## Shell
- A grey rail (`--panel-2`) on the left. Dashboard stands alone at the top; then the Walkthroughs group (Record, Library, Launch Studio), the Lab group (Runs, Failures, Fixtures, Experiments, Fault replay), then Automations. Group labels are 11px, 600, uppercase, ink-3. The active item is a teal-tinted pill with a teal hairline and a teal icon. Settings sits at the foot with a gear icon.
- A sticky white header (62px, solid paper, no blur) carries breadcrumbs, the compact record field, when the data was read (mono), and the **active-job chip**.
- **Active-job chip:** shown only while this account has a queued or running job (record, lab run or batch render); nothing is shown when idle, so the header never claims liveness it hasn't seen. Kind label, progress text (`aria-live="polite"`), Open (Record, the run or Runs, Library) and Cancel with an inline confirm. Polls `/api/jobs/mine` every 4s with a job, 15s without, paused while the window is hidden. `useActiveJob()` in `lib/active-job.ts` is the same state for any view.
- The record field is the site's URL pill: a link icon, a mono input and the teal record pill with its red dot. `walkcast://record?url=…` and a link dropped on the window open Record with the address filled in; neither starts a recording.

## Theme
The app follows the system (`prefers-color-scheme`, light when unknown). Settings > Appearance overrides it with System / Light / Dark, kept in `localStorage` (`lab-theme`). The sidebar toggle cycles Auto → Day → Night.

| Token | Light | Dark | Meaning |
|---|---|---|---|
| paper / panel | #ffffff / #ffffff | #0a1012 / #10191b | ground, cards |
| ink / ink-2 / ink-3 | #1b1a17 / #4c4841 / #6b665d | #f1f7f4 / #b3c3be / #8fa19b | text steps |
| signal / on-signal | #1d5e58 / #ffffff | #5cb8ad / #04201c | record, selected, focus, links |
| solid / on-solid | #1b1a17 / #ffffff | #e8efec / #0a1012 | "go" pill |
| pass | #2c6a3d | #86d47e | passed (a leaf green, kept clear of the teal) |
| fail / rec | #b2261c / #c0321c | #f87171 / #ff5c47 | failure / the record light |

In dark, signal (teal), solid (near-white), pass (leaf green) and rec (red) are four different hues, so "record", "go", "selected" and "passed" never read as one another.

### Contrast (WCAG 2.x, measured)
- Light: ink 17.4, ink-2 9.1, ink-3 5.7 on paper (ink-3 5.2 on panel-2); on-signal on signal 7.5; pass on pass-soft 5.6; fail on fail-soft 5.6.
- Dark: ink 16.4, ink-2 9.7, ink-3 6.6 on panel; on-signal on signal 7.3; signal on panel 7.6; pass on pass-soft 7.9; fail on fail-soft 5.5.
- Dim ink stays a display tone (large text only).

## Surfaces
- Cards and panels separate from the desk by one step of tone and a 1px hairline. No drop shadows, glows or blur anywhere in the app.
- Corners: 6px tags and chips, 8px inputs, 10px cards and stat tiles, 14px panels (`rounded-xl`, the `Panel` component), full pills on every button and nav item. Concentric radii hold.

## Type
- Page heads are two-tone: the claim in ink, the consequence in dim ink, same weight and size. Section heads are 700 Schibsted Grotesk with tight tracking.
- JetBrains Mono is only for timecodes, ids, URLs, counts and machine-literal strings. Tabular figures on every number.

## Components
- **Buttons** are pills: solid ink for go, teal with the red dot for record, Shelf Grey for the rest, a hairline ring for ghost, fail red for danger. Press scales to 0.98.
- **Empty states** are a drawn tile (rotated rounded square, tinted by meaning), one sentence and the single next action as a pill. No dashed boxes.
- **Exhibits** keep the site's language: an `EX-n` tag in exhibit cream with a half-opacity dot; a citation scrolls to the evidence and lights it with a 2px teal ring for 1.8s.
- **Verdicts** are small pass/fail pills; **stamps** mark rows that stay listed (failed, contradicted, kept).
- **Evidence** (a cited step, a transcript line) is exhibit cream; the active transcript line takes the exhibit wash.

## Motion
- 0.15 to 0.18s colour transitions on pills, links and chips; the record light blinks only while recording; a cited line holds its accent for 1.8s; no entrance animations on the dashboard. `prefers-reduced-motion` zeroes all of it (global rule in styles.css, `MotionConfig reducedMotion="user"` for motion components).

## Do's and Don'ts
### Do:
- **Do** keep the app on white paper in light mode, following the system theme, with a graphite dark theme that keeps the same teal.
- **Do** set page heads in two tones, ink then dim.
- **Do** make every button a pill and every container a softly rounded rectangle.
- **Do** separate surfaces by tone and a 1px inset hairline, never by shadow.
- **Do** tie every claim to its exhibit with a citation that seeks and spotlights it.

### Don't:
- **Don't** add drop shadows to app containers; depth comes from tone and hairlines.
- **Don't** use teal or red as decoration; teal means record/evidence, red means the record light and failure.
- **Don't** set headings, buttons or prose in mono.
- **Don't** use the site's airy marketing density in the app; the app is a working tool.
