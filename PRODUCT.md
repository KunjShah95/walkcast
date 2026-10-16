# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two equal audiences share one signed-in app:

- **Walkthrough makers**: founders, marketers and PMs who paste a link to a site they own or may test and want a narrated video walkthrough (MP4 + voice-over + captions + transcript) without writing a script.
- **Agent engineers**: teams building browser AI agents who need a failed run turned into a classified, reproducible regression test, and want to know whether the next agent version fixed it or broke something else.

Neither audience is primary; the app must serve both without one feeling like an afterthought.

## Product Purpose

Walkcast drives a real browser through a site and turns what actually happened into an artifact: a narrated walkthrough video for makers, a replayable regression fixture for engineers. Success: a maker gets a shareable video from one URL; an engineer gets a cause, cited evidence, and a test that holds.

## Positioning

Every line of narration and every failure cause comes from what the browser actually did and the application's real state, not from a script, the agent's claim, or an LLM judge. Causes the rules can't explain are marked `unexplained` rather than guessed. The same recorder powers both products.

## Operating Context

- Signed-in web app at `/app` (Vite + React SPA, hash routes) served by the Node server; also deployed as one Vercel deployment (static marketing pages + server function).
- Recording and lab runs execute on a job queue with a browser worker; the deployed function has no browser, so jobs there need a separate worker or `npm run dev`.
- Lab concepts: runs, fixtures, experiments (with 95% Wilson score intervals), compare (base vs candidate), fault replay / simulator.
- Narration uses ffmpeg's flite voices: `slt` (default), `awb`, `kal`, `rms`.

## Capabilities and Constraints

- Confirmed wanted (2026-10-16): synced clickable transcript player with captions and per-page chapters; narration voice choice with preview; editable narration script with re-rendered voice-over; recording the user's own voice in-browser to replace or add to synthetic narration.
- Settings must cover: account and connected sign-ins (Google, OpenRouter, ChatGPT), sign out; recording defaults (voice, max pages, captions); connected model providers for Lab runs; usage and limits (daily recording/run quotas, jobs in flight).
- Per-user limits exist server-side: 1 active job, 20 recordings/day, 100 runs/day by default.
- Recording requires the user to confirm they own or are authorized to test the site.
- Live (paid) model runs are disabled on exposed servers unless explicitly allowed.

## Brand Commitments

- Name: Walkcast; the lab is "Walkcast Lab" (formerly "Browser Agent Failure Lab"). MIT licensed; pricing page says the price is zero.
- The user asked for Aceternity-UI-level polish in the spirit of Manu Arora's design sense, with a conversion focus.

## Evidence on Hand

- Real experiment results in `results/` (read by `siteFacts()`), demo media in `site/static/` (demo.mp4/webm/vtt, poster, og.png).
- No testimonials, customer logos or usage numbers exist; do not fabricate them.

## Product Principles

1. Show what actually happened: real evidence before interpretation.
2. Two jobs, one recorder: never bury one audience under the other.
3. One URL to a result: the shortest path from a link to a video or a fixture wins.
4. Honest uncertainty: unexplained stays unexplained; limits and missing capabilities are stated plainly.
