---
version: 1
slug: "src-site-pages-ts"
primary_target: "src/site/pages.ts"
related_targets: []
---

# Public site (marketing, guides, pricing, auth)

Scope: every server-rendered public page in src/site/pages.ts (landing, how, lab, safety, pricing, guides index + guide, compare, auth, 404). Visitor mode: Persuade (landing, pricing, lab, how, safety, compare), Read (guides).
Audience: walkthrough makers and agent engineers, equally. Action: paste a URL (/start -> signup) or open the lab.
Proof on hand: the real demo recording (site/static/demo.*), real lab numbers from results/ via siteFacts(). No testimonials, logos, usage counts.
Constraints: full content server-rendered; JSON-LD unchanged; test/site.test.ts pins `class="stat">k/n<small>`, auth `<p class="dh">`, a plain `<footer>`; no rendered page links crawler files.
Decisions (user, 2026-10-16): match the shipped dashboard palette rather than dark Aceternity; hero centrepiece is the live exhibit player; vidyst.com (Manu Arora) is the composition reference.

## Direction contract

THESIS: The site cites its own evidence. Claims carry EX-n citations into the real demo recording, and clicking one seeks and spotlights that line in the recorder window. Refuses the glow/dot-grid SaaS hero and same-size feature-card bento.

OWN-WORLD: Vidyst composition in Walkcast's app palette. White paper #ffffff, ink #1b1a17, dim #8a847a for the second tone of every headline, drawn rounded icon tiles set into headlines (ink, ochre #9c5700, rec #c0321c, pass #2c6a3d, exhibit #f1dfbd). Pill buttons: solid ink for go, ochre with rec dot for record. Grey #f3f1ec rounded panels, hairline-topped feature columns, the recorder window as a white panel in a soft grey ring; light mode only (user, 2026-10-16: whole site white). Schibsted Grotesk 700, JetBrains Mono only for timecodes/files/URLs/counts.

STORY: A maker watches the real narrated video beside its transcript, sees each claim tied to a line, pastes their link. An engineer sees the same recorder's measured lab numbers with intervals and trial marks, opens the lab.

FIRST VIEWPORT: Sticky bar (mark, How/Lab/Guides/Pricing, Sign in, Get started pill). Centred two-tone h1 "Paste a [link] link. / Get it [play] narrated." ~100px; lede; pill URL field with ochre "Make my walkthrough"; fine print. Below, the framed white recorder window: video + chapter strip left, EX-n transcript right, page-status chips foot.

FORM: Exhibit Spotlight extension (dashboard world, candidate 7 of 7, seed key 505358cf) recomposed on the vidyst.com grammar. Signature: `.cite` chips and chapter/page chips seek and spotlight the player.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
