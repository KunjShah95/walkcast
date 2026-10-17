import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

/**
 * What the desktop shell runs: the app server on a loopback port, for one person on one machine.
 *
 * The Tauri process (src-tauri/src/lib.rs) starts this with the bundled Node and the app's data
 * directory as the working directory, waits for /healthz, then opens the window on /app. So:
 *
 *   - Everything is local. Recordings, runs and the queue live under the data directory; any
 *     hosted-database settings in the environment are ignored.
 *   - Signing in is optional. With Supabase configured (desktop.env, written by the staging
 *     script: the project URL and its public anon key, nothing secret) people can create an account
 *     or sign in, Google included via the system browser; without one, nothing is gated.
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

// The app's public Supabase settings, shipped next to the sources. The environment wins.
try {
  const file = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "desktop.env");
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^(SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE_PUBLISHABLE_KEY)=(.+)$/.exec(line.trim());
    if (m) process.env[m[1]!] ??= m[2]!;
  }
} catch {
  /* no desktop.env: accounts are local to this machine */
}
// Local data: these must be unset before the store and auth modules read them.
for (const key of ["SUPABASE_DB_URL", "DATABASE_URL", "LAB_SITE_URL", "LAB_HOST"]) {
  delete process.env[key];
}
// The ffmpeg the installer ships (stage-sidecar.ts), set before the media modules read it.
const bundledFfmpeg = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "bin", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
if (existsSync(bundledFfmpeg)) process.env.LAB_FFMPEG ??= bundledFfmpeg;
process.env.PLAYWRIGHT_BROWSERS_PATH ??= join(root, "browsers");
mkdirSync(process.env.PLAYWRIGHT_BROWSERS_PATH, { recursive: true });

const { installChromium } = await import("../../packages/core/src/record/browser-install.ts");
const { serveDashboard } = await import("./server/server.ts");

const server = await serveDashboard(port, { root, host: "127.0.0.1", requireAuth: false, desktop: true });
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
