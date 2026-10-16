import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { prerender } from "./src/prerender.ts";

/**
 * Builds the marketing site: static files and nothing else. The site has no server, no accounts
 * and no API; the product is the desktop app (apps/desktop).
 *
 *   npm run web:build -- --out dist/web            plain static export, for any static host
 *   npm run web:build -- --vercel                  Build Output API (.vercel/output/static)
 *
 * `LAB_SITE_URL` (or --site-url) sets the canonical origin, and it is baked into every canonical
 * tag, the sitemap, robots.txt and the JSON-LD — so a build without it publishes a site whose every
 * self-reference points at localhost. That is invisible locally and destroys the site's
 * indexability in production, so unless --allow-localhost is passed the build fails instead.
 * On Vercel the deployment's own production host stands in when LAB_SITE_URL is unset.
 */

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const { values } = parseArgs({
  options: {
    out: { type: "string" },
    vercel: { type: "boolean", default: false },
    "site-url": { type: "string" },
    "allow-localhost": { type: "boolean", default: false },
  },
});

const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
const explicit = values["site-url"] ?? process.env.LAB_SITE_URL ?? (values.vercel && vercelHost ? `https://${vercelHost}` : undefined);
const siteUrl = (explicit ?? "http://localhost:4320").replace(/\/+$/, "");
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(siteUrl);
if (isLocal && !values["allow-localhost"]) {
  console.error(
    `web:build needs a real origin: LAB_SITE_URL is ${explicit ? `"${siteUrl}"` : "unset"}, so every canonical tag, ` +
      "the sitemap and robots.txt would point at localhost. Set LAB_SITE_URL to the deployed origin " +
      "(https://...), pass --site-url for a one-off build, or --allow-localhost if you really want a local export.",
  );
  process.exit(1);
}

if (values.vercel) {
  const out = join(REPO, ".vercel", "output");
  rmSync(out, { recursive: true, force: true });
  const written = prerender({ siteUrl, outDir: join(out, "static") });
  const security = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "SAMEORIGIN" };
  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, "config.json"),
    JSON.stringify(
      {
        version: 3,
        routes: [
          { src: "/assets/(.*)", headers: { "Cache-Control": "public, max-age=31536000, immutable" }, continue: true },
          { src: "/(.*)", headers: security, continue: true },
          { handle: "filesystem" },
          { src: "/(.*)", status: 404, dest: "/404.html" },
        ],
      },
      null,
      2,
    ),
  );
  console.log(`Prerendered ${written.length} files to ${join(out, "static")} for ${siteUrl}`);
} else {
  const outDir = resolve(values.out ?? join("dist", "web"));
  const written = prerender({ siteUrl, outDir });
  if (isLocal) console.warn(`  [walkcast] exporting for ${siteUrl} — these URLs must not be deployed`);
  console.log(`Prerendered ${written.length} files to ${outDir} for ${siteUrl}`);
}
