import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

/**
 * What the desktop shell runs: the app server on a loopback port, for one person on one machine.
 *
 * The Tauri process (src-tauri/src/lib.rs) starts this with the bundled Node and the app's data
 * directory as the working directory, waits for /healthz, then opens the window on /app. So:
 *
 *   - Everything is local by default. Recordings, runs and the queue live under the data
 *     directory; hosted-database settings in the environment are ignored unless the person opts
 *     in with WALKCAST_DATABASE_URL (their own Supabase connection string, never shipped).
 *   - Signing in is required before anything of the app is shown. With Supabase configured
 *     (desktop.env, written by the staging script: the project URL and its public anon key,
 *     nothing secret) accounts live in Supabase, Google included via the system browser; without
 *     it, accounts are local to this machine. LAB_AUTH=off turns the gate off for development.
 *   - Chromium is downloaded once, on first run, into the data directory (it is too large to ship
 *     in the installer). The dashboard shows the progress (/api/browser), and a recording asked for
 *     before it finishes is refused with a message saying so.
 */

const { values } = parseArgs({ options: { port: { type: "string" } } });
const port = Number(values.port);
if (!Number.isInteger(port) || port <= 0) {
  console.error("sidecar: --port <n> is required");
  process.exit(2);
}

const root = process.cwd();

// One stray rejected promise (a webhook retry, a Playwright event after a page closed) would end
// this process under Node's default, taking a running recording and the whole window with it.
// For one person's desktop app, log it and keep serving; the job itself has its own guards.
process.on("unhandledRejection", (reason) => {
  console.error(JSON.stringify({ t: new Date().toISOString(), level: "error", event: "process.unhandled_rejection", error: reason instanceof Error ? (reason.stack ?? reason.message) : String(reason) }));
});

// The app's public Supabase settings, shipped next to the sources. The environment wins.
try {
  const file = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "desktop.env");
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^(SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE_PUBLISHABLE_KEY)=(.+)$/.exec(line.trim());
    if (m) process.env[m[1]!] ??= m[2]!.trim();
  }
} catch {
  /* no desktop.env: accounts are local to this machine */
}
// Validate the Supabase URL so a stray space or typo can't silently break sign-in.
if (process.env.SUPABASE_URL) {
  const url = process.env.SUPABASE_URL;
  let ok = true;
  try {
    const u = new URL(url);
    ok = (u.protocol === "https:" || u.protocol === "http:") && !!u.host;
  } catch {
    ok = false;
  }
  if (!ok || url !== url.trim()) {
    console.error(`sidecar: SUPABASE_URL is invalid ("${url}"); falling back to local accounts`);
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
  }
}
// Local data by default: these must be unset before the store and auth modules read them.
for (const key of ["SUPABASE_DB_URL", "DATABASE_URL", "LAB_SITE_URL", "LAB_HOST"]) {
  delete process.env[key];
}
// Opt-in shared database: a person who sets WALKCAST_DATABASE_URL in their own environment (a
// Supabase connection string) gets the Postgres store, so the desktop app shares accounts, the
// queue and the recordings index with their deployment. Never read from desktop.env: a database
// password must not ship inside an installer.
const shared = process.env.WALKCAST_DATABASE_URL?.trim();
if (shared) {
  if (/^postgres(ql)?:\/\//.test(shared)) process.env.SUPABASE_DB_URL = shared;
  else console.error("sidecar: WALKCAST_DATABASE_URL is not a postgres:// URL; using the local store");
}
// The ffmpeg the installer ships (stage-sidecar.ts), set before the media modules read it.
const bundledFfmpeg = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "bin", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
if (existsSync(bundledFfmpeg)) process.env.LAB_FFMPEG ??= bundledFfmpeg;
// The committed fixture suite ships with the app and is copied into the data directory on first
// run. Without it a fresh install has no fixtures at all: the Fixtures page and the fault-replay
// page are empty, and a regression guard nobody can try is no guard. The app's own fixtures
// (saved from failed runs) are never overwritten.
const shippedFixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures");
if (existsSync(shippedFixtures) && !existsSync(join(root, "fixtures"))) {
  try {
    cpSync(shippedFixtures, join(root, "fixtures"), { recursive: true });
  } catch (e) {
    console.error(`sidecar: could not copy the bundled fixtures (${e instanceof Error ? e.message : String(e)})`);
  }
}
process.env.PLAYWRIGHT_BROWSERS_PATH ??= join(root, "browsers");
mkdirSync(process.env.PLAYWRIGHT_BROWSERS_PATH, { recursive: true });

const { installChromium } = await import("../../packages/core/src/record/browser-install.ts");
const { serveDashboard } = await import("./server/server.ts");

// Sign-in first: the app shows nothing until the person has an account and is signed in (through
// Supabase when desktop.env configures it, which release builds always do). LAB_AUTH=off restores
// the old open-on-launch behaviour for local development.
const server = await serveDashboard(port, { root, host: "127.0.0.1", requireAuth: process.env.LAB_AUTH !== "off", desktop: true });
installChromium();

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await server.close(5_000);
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
// Under the shell, stdin is a pipe it holds open: when the shell goes away, so do we.
if (process.env.WALKCAST_PARENT_STDIN === "1") {
  process.stdin.on("end", stop);
  process.stdin.resume();
}
