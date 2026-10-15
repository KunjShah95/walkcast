# Walkcast — First Day (Day 0 / Day 1 / Day 2)

You got 3 days. Goal: run it, break it, fix it. Universal entry point (works on Windows, no `npm run ... --` forwarding issues):

```sh
node --import tsx src/cli.ts <command>
# or
npm run cli -- <command>
```

## Day 0 — Install and run (30 min)

Values: `list` (see faults + agents), `typecheck` (green baseline).

Steps:
1. Node 22+, Playwright Chromium, optional ffmpeg.
   ```sh
   npm ci
   npx playwright install chromium
   node --import tsx src/cli.ts list
   ```
2. Run the curated failure:
   ```sh
   node --import tsx src/cli.ts run --fault stale-owners --agent v0 --screenshots
   ```
   Expect exit code 1 (`FAIL symptoms=[false-success] causes=[stale-observation]`). That is success.

Try this: change `--agent v0` to `v1`. Does it still fail? Break it: remove `--screenshots`; fix: add it back and check report dir.

## Day 1 — Replay + compare (60 min)

Values: fixture path, agent version, pass^k.

Steps:
1. Replay the fixture:
   ```sh
   node --import tsx src/cli.ts replay runs/_fixtures/stale-owners-s1-stale-observation --agent v1 --trials 3
   ```
2. Compare versions:
   ```sh
   node --import tsx src/cli.ts compare fixtures --agents v0,v1,v2 --trials 3
   ```

Try this: run `npm run qa` (typecheck + ui:build). Break: edit a fault description; fix: revert and rerun typecheck.

## Day 2 — Web app (30 min)

Values: `LAB_AUTH=off`, port 4320.

Steps:
1. Build + serve:
   ```sh
   LAB_AUTH=off npm run cli -- ui
   ```
   Open http://127.0.0.1:4320/app

Try this: hit `/app` without auth (with LAB_AUTH=on) and observe redirect; fix: turn auth off.

## Launch cheat sheet

- Universal CLI: `node --import tsx src/cli.ts`
- `npm run cli` alias included.
- `npm run qa` runs typecheck + UI build.
- `npm run app` serves MiniCRM via CLI.
PY