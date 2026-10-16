import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

/**
 * What the desktop shell runs: the app server on a loopback port, for one person on one machine.
 *
 * The Tauri process (src-tauri/src/lib.rs) starts this with the bundled Node and the app's data
 * directory as the working directory, waits for /healthz, then opens the window on /app. So:
 *
 *   - Everything is local. Recordings, runs and the queue live under the data directory; any
 *     hosted-database settings in the environment are ignored.
 *   - No sign-in. The server only listens on 127.0.0.1 and the person at the keyboard owns it.
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

// Local only: these must be set before the store and auth modules read them.
for (const key of ["SUPABASE_DB_URL", "DATABASE_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "LAB_SITE_URL", "LAB_HOST"]) {
  delete process.env[key];
}
process.env.LAB_AUTH = "off";
process.env.PLAYWRIGHT_BROWSERS_PATH ??= join(root, "browsers");
mkdirSync(process.env.PLAYWRIGHT_BROWSERS_PATH, { recursive: true });

const { installChromium } = await import("../../packages/core/src/record/browser-install.ts");
const { serveDashboard } = await import("./server/server.ts");

const server = await serveDashboard(port, { root, host: "127.0.0.1", requireAuth: false });
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
