---
version: 1
slug: "dashboard-src-app-tsx"
primary_target: "dashboard/src/App.tsx"
related_targets: []
---

# Signed-in app (/app)

Scope: the whole signed-in dashboard SPA (dashboard/src). Visitor mode: Operate.
Audience: walkthrough makers and agent engineers, equally (PRODUCT.md). Task: paste a URL and get a narrated walkthrough; inspect failed agent runs, fixtures, experiments, compare, audit; manage account, recording defaults, models, usage in Settings.
Constraints: real data only from /api; no invented numbers; recording needs authorization checkbox; jobs may be unavailable on the Vercel deploy (503 message must surface).

## Direction contract

THESIS: Every claim cites its evidence. A failure cause, a narration line, a pass rate, each points at an exhibit (frame, transcript line, state diff, run) and clicking the citation spotlights it. Refuses the category-default stat-card dashboard where numbers float with no source.

OWN-WORLD: Near-black ground (#09090b) with Aceternity spotlight beams and a slow moving-border beam on the active work area; panels #111113 with 1px hairline borders at 8% white; exhibit-tag yellow (#f5d547) used only for evidence tags and spotlight; indigo (#818cf8) for primary actions; red only for failure/record, green only for pass. Geist for UI, Geist Mono tabular figures for timecodes, ids and numbers.

STORY: The visitor sees their newest walkthrough and their newest failure side by side, understands that both are backed by evidence they can open, and records a new URL or opens an exhibit in one click.

FIRST VIEWPORT: Left rail (Record workspace: Overview, Record, Library; Lab workspace: Runs, Fixtures, Experiments, Fault replay, Audit; Settings at foot). Top: a single command-bar URL input with Record button, spotlight beam behind it. Below: bento, left 7/12 latest walkthrough player with synced transcript lines tagged EX-n, right 5/12 latest failed run with cause line citing EX tags, then a fixed-cell job/run strip.

FORM: Exhibit Spotlight, candidate 7 of 7 (courtroom exhibit binder), seed key 505358cf. Raises: fixed-cell rows (split-flap), stamped failed jobs (ticket wallet), single-next-decision empty states (wayfinding), magnitude-ramp dots for pass rate (star atlas).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
