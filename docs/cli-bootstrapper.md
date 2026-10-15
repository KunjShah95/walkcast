# CLI bootstrapper (first principles)

`src/cli.ts` is the real, single dispatch site for every Walkcast command — `list`,
`run`, `replay`, `record`, `compare`, `ui`, `worker`, `db`, `ui-export`, `diff`,
`baseline`, `check`, `providers`, `check-model`, `app`, `experiment`. Everything
npm/wrappers/binaries eventually hand off to this one file. That is deliberate:
one entry point means one place to register `.env` loading (`src/env.ts`, imported
first) and one place to enforce `parseArgs`/usage errors.

## Why not always `npm run lab -- ...`?

On npm >= 12.2.0, flags after `--` are parsed as *npm's own* configuration
(`EUNKNOWNCONFIG`), so `npm run lab -- run --fault stale-owners --agent v0 --screenshots`
fails before the lab ever runs. The failure is in npm, not in Walkcast. The universal
entry point bypasses npm argv re-parsing:

```sh
node --import tsx src/cli.ts run --fault stale-owners --agent v0 --screenshots
```

`bin/walkcast.mjs` is the same thing packaged as a convenience executable:
it registers tsx via its `dist/loader.mjs` (no PATH reliance), spawns Node with
`cwd = repo root`, and inherits stdio/exit code:

```sh
node bin/walkcast.mjs list
node bin/walkcast.mjs record --url https://example.com --i-am-authorized
node bin/walkcast.mjs ui --port 4320
```

After `npm install` (or `npm link`) you can just call `walkcast …`.

## Honest limitations
- The task relies on `node_modules/tsx`; a vendored release would flatten NODE_PATH
  resolution differently. Run `npm ci` first.
- Long-running `ui`/`worker` runs should be given the `_grace_ms` env vars to
  shut down cleanly (see README graceful-shutdown note).

## Cross-references
- `README.md` — quick start now uses universal entry
- `docs/onboarding-first-day.md` — first-day path
- `src/cli.ts` — dispatch site
- `src/env.ts` — environment loader (runs first)
```