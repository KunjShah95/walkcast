#!/usr/bin/env node
// Walkcast universal CLI bootstrapper.
//
// Why this exists: npm >= 12 swallows flags after `npm run <script> --` (see
// docs/onboarding-first-day.md), and people forget the --import tsx dance. This
// tiny Node entry just forwards everything to Walkcast's real CLI after registering
// the tsx transpiler, so `walkcast run --fault ...` works regardless of shell,
// OS, or npm version.
//
// Implementation note: we spawn a fresh Node process instead of inlining, so that
// (a) the tsx loader registers for the WHOLE program, (b) process.exit codes
// and SIGTERM/SIGINT propagate normally, (c) the child cwd is the project root
// (required for relative paths stored in .lab/ and recordings/).
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const loader = path.join(root, 'node_modules', 'tsx', 'dist', 'loader.mjs');
const loaderSpec = pathToFileURL(loader).href;
const cli = path.join(root, 'apps', 'desktop', 'cli.ts');

const extra = process.argv.slice(2);
const args = ['--import', loaderSpec, cli, ...extra];

const result = spawnSync(process.execPath, args, {
  stdio: 'inherit',
  cwd: root,
  env: process.env,
});

if (result.error) {
  console.error('walkcast: failed to spawn Node child:', result.error.message);
  process.exit(1);
}

if (result.signal) {
  process.exit(128); // conventional shell signal-exit code
}
process.exit(result.status ?? 0);
