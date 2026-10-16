import { mkdirSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { databaseUrl } from "../store/index.ts";
import { log } from "../ops/log.ts";
import { createApp } from "../ui/server.ts";

/**
 * The whole Node server as one Vercel Function: the auth pages, /app, /api/* and /files/*. The
 * static marketing pages are served from the CDN in front of it (see vercel-build.ts).
 *
 * A function has no Chromium and no long-lived process, so nothing here takes jobs off the queue:
 * recordings and lab runs are refused with a clear message unless LAB_EXTERNAL_WORKER=1 says a
 * `lab worker` elsewhere shares the same database.
 */

// The deployment's file system is read-only; only /tmp is writable, and it is per-instance.
const root = process.env.LAB_ROOT ?? "/tmp/walkcast";
mkdirSync(root, { recursive: true });
if (!databaseUrl()) {
  log.warn("vercel.no-database", {
    message: "SUPABASE_DB_URL is not set: accounts and sessions live in /tmp and vanish between instances. Set it in the Vercel project.",
  });
}

const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
const app = createApp({
  root,
  // Not loopback: the server is reachable from anywhere, so the exposed-server rules apply.
  host: "0.0.0.0",
  siteUrl: process.env.LAB_SITE_URL ?? (productionHost ? `https://${productionHost}` : undefined),
  worker: false,
  ...(process.env.LAB_EXTERNAL_WORKER === "1"
    ? {}
    : { jobsUnavailable: "Recordings and lab runs need a real browser, which this deployment doesn't have. Run `npm run dev` locally to record." }),
  dashboardHtml: join(dirname(fileURLToPath(import.meta.url)), "dashboard.html"),
});

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  app.handler(req, res);
}
