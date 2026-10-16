import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "rolldown";
import { prerender } from "../site/prerender.ts";

/**
 * Builds the whole site for Vercel with the Build Output API (.vercel/output), so one deployment
 * serves everything `npm run dev` does, with no separate server:
 *
 *   static/              the prerendered marketing pages and assets, served from the CDN
 *   functions/index.func the Node server (src/deploy/vercel-function.ts) bundled into one file,
 *                        answering every path the CDN has no file for: /login, /signup, /app,
 *                        /auth/*, /api/*, /files/*, ...
 *
 * Run after `npm run ui:build` (the dashboard is copied into the function).
 */

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(REPO, ".vercel", "output");
const FUNC = join(OUT, "functions", "index.func");

const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
const siteUrl = (process.env.LAB_SITE_URL ?? (host ? `https://${host}` : "http://localhost:4320")).replace(/\/+$/, "");

rmSync(OUT, { recursive: true, force: true });

const pages = prerender({ siteUrl, outDir: join(OUT, "static") });
console.log(`Prerendered ${pages.length} files for ${siteUrl}`);

const noBrowser = join(REPO, "src", "deploy", "no-browser.ts");
await build({
  input: join(REPO, "src", "deploy", "vercel-function.ts"),
  platform: "node",
  resolve: { alias: { playwright: noBrowser, "@browserbasehq/stagehand": noBrowser } },
  logLevel: "warn",
  output: {
    file: join(FUNC, "index.mjs"),
    format: "esm",
    codeSplitting: false,
    // Bundled CommonJS dependencies still call require() for Node built-ins.
    banner: 'import { createRequire as __walkcastRequire } from "node:module"; const require = __walkcastRequire(import.meta.url);',
  },
});
copyFileSync(join(REPO, "dashboard", "dist", "index.html"), join(FUNC, "dashboard.html"));
writeFileSync(
  join(FUNC, ".vc-config.json"),
  JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false, maxDuration: 60 }, null, 2),
);

const security = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "SAMEORIGIN" };
writeFileSync(
  join(OUT, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "/assets/(.*)", headers: { "Cache-Control": "public, max-age=31536000, immutable" }, continue: true },
        { src: "/(.*)", headers: security, continue: true },
        // A file in static/ wins; everything else is the server.
        { handle: "filesystem" },
        { src: "/(.*)", dest: "/index" },
      ],
    },
    null,
    2,
  ),
);
console.log(`Bundled the server into ${FUNC}`);
