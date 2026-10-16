---
version: 2
slug: "dashboard-src-app-tsx"
primary_target: "apps/desktop/dashboard/src/App.tsx"
related_targets:
  - "apps/desktop/dashboard/src/styles.css"
  - "apps/desktop/dashboard/src/components/ui.tsx"
  - "apps/desktop/dashboard/src/components/RecordBar.tsx"
  - "apps/desktop/dashboard/src/components/Studio.tsx"
---

# Signed-in app (/app)

Scope: the whole signed-in dashboard SPA (apps/desktop/dashboard/src). Visitor mode: Operate.
Audience: walkthrough makers and agent engineers, equally (PRODUCT.md). Task: paste a URL and get a narrated walkthrough; inspect failed agent runs, fixtures, experiments, compare, audit; manage account, recording defaults, models, usage in Settings.
Constraints: real data only from /api; no invented numbers; recording needs authorization checkbox; jobs may be unavailable on the Vercel deploy (503 message must surface).

## Direction contract

THESIS: Every claim cites its evidence. A failure cause, a narration line, a pass rate, each points at an exhibit (frame, transcript line, state diff, run) and clicking the citation spotlights it. Refuses the category-default stat-card dashboard where numbers float with no source.

OWN-WORLD: The site's case-file language at working density. White paper desk, grey rail, warm ink, ochre signal (record + evidence), record red, pass green. Scaled corners (6/8/10/14/22/pill), 1px inset hairline rings, no drop shadows. Schibsted Grotesk, JetBrains Mono for timecodes/ids/counts. Light mode plus a warm unlit Night variant.

STORY: The visitor sees their newest walkthrough and their newest failure side by side, understands that both are backed by evidence they can open, and records a new URL or opens an exhibit in one click.

FIRST VIEWPORT: Grey rail (Record workspace: Dashboard, Record, Library; Lab workspace: Runs, Fixtures, Experiments, Fault replay, Vibecode audit; Settings at the foot). Sticky blurred header with breadcrumbs, the compact record pill and live/snapshot status. Below: two-tone page head, the record pill, then the latest walkthrough player beside the latest failure case.

FORM: Exhibit Spotlight (courtroom exhibit binder) recomposed for the app. Signature: `.cite` chips and EX-n exhibit tags seek and spotlight the player; empty states are a drawn tile + one sentence + one pill; the recorder window is the one product shot in a grey ring.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
