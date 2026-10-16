import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
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
 *   - No sign-in. The server only listens on 127.0.0.1 and the person at the keyboard owns it.
 *   - Chromium is downloaded once, on first run, into the data directory (it is too large to ship
 *     in the installer). Until it is there, a recording fails with a message saying so.
 */

const { values } = parseArgs({ options: { port: { type: "string" } } });
const port = Number(values.port);
if (!Number.isInteger(port) || port <= 0) {
  console.error("sidecar: --port <n> is required");
  process.exit(2);
}

const root = process.cwd();
const resources = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Local only: these must be set before the store and auth modules read them.
for (const key of ["SUPABASE_DB_URL", "DATABASE_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "LAB_SITE_URL", "LAB_HOST"]) {
  delete process.env[key];
}
process.env.LAB_AUTH = "off";
process.env.PLAYWRIGHT_BROWSERS_PATH ??= join(root, "browsers");
mkdirSync(process.env.PLAYWRIGHT_BROWSERS_PATH, { recursive: true });

const { log } = await import("../../packages/core/src/ops/log.ts");
const { chromium } = await import("playwright");
const { serveDashboard } = await import("./server/server.ts");

/** Download Playwright's Chromium in the background if it isn't there yet. */
function ensureChromium(): void {
  if (existsSync(chromium.executablePath())) return;
  const cli = join(resources, "node_modules", "playwright-core", "cli.js");
  log.info("desktop.chromium.installing", { into: process.env.PLAYWRIGHT_BROWSERS_PATH });
  const child = spawn(process.execPath, [cli, "install", "chromium"], { stdio: ["ignore", "inherit", "inherit"], env: process.env });
  child.on("exit", (code) => {
    if (code === 0) log.info("desktop.chromium.ready", {});
    else log.error("desktop.chromium.failed", { code });
  });
}

const server = await serveDashboard(port, { root, host: "127.0.0.1", requireAuth: false });
ensureChromium();

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
