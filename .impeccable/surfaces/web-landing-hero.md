---
version: 2
slug: web-landing-hero
primary_target: "apps/web/src/sections/Hero.tsx"
related_targets:
  - "apps/web/src/styles.css"
  - "apps/web/src/ui.tsx"
  - "apps/web/src/sections/More.tsx"
---

# Landing hero (/)

Scope: the landing page's first viewport, and the download button on every page. Visitor mode: Persuade.
Audience: founders, marketers and PMs who want a video tour of a site they own or may test; agent engineers arriving through /lab.
Task: install the desktop app and record one URL.
Proof: the real demo recording in `apps/web/public/assets/` — demo.mp4, demo.vtt — played in the hero, not a mock-up of one.
Constraints: the price is zero and the licence MIT; no testimonials, logos or usage numbers may be invented; the public site stays light-only on warm paper; every download button on the site is one component.

## Direction contract

THESIS: The first screen is a receipt, not a pitch. The product is already running on the right, doing the job out loud, while the left says what to do next. Refuses the category-default centred hero with a row of feature chips under the headline.

OWN-WORLD: The case-file world, extended with one dark stage rather than replaced. Warm paper ground, ink type, the signal colour for the record action, exhibit cream for the highlighter stroke, record red only for the REC light. One large soft shadow, on the product shot only. Bricolage Grotesque display, Schibsted Grotesk body, JetBrains Mono for machine-literal strings.

STORY: A visitor recognises the product in one second — a real browser walking a real site, narrating itself — then learns the price of entry is zero and the install is one click on their own platform.

FIRST VIEWPORT: Two columns. Left: a four-line two-tone headline (claim in ink, consequence in dim) with the exhibit-cream highlighter stroke on "video tour"; a three-line lede; a row of three platform download pills; one line of fine print. Right: the product shot — a dark theatre card holding the real recording, its caption bar carrying the live narration line, the visit log beneath it with the spoken line lit, the file chips along the foot. The nav carries the same download pill on every page, so the action is in the same place and the same shape everywhere.

FORM: Split landing, recomposed from the site's own case-file grammar rather than a new world. Signature moment: the hero narrates itself — the caption bar and the lit log line follow the recording's own VTT, so the words on screen are the words the recorder spoke. The download button is one family: platform glyph, platform name, arrow, brand fill.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
