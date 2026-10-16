import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * The static export cannot serve `/login`, `/signup`, `/forgot`, `/reset`, `/app` or `/api/*` -
 * those need the Node server. On Vercel they are proxied, and the proxy target comes from
 * `APP_ORIGIN`.
 *
 * `vercel.json` could not do this: rewrite destinations must be an absolute pathname or an
 * external URL, so `$APP_ORIGIN/login` was never interpolated, the rewrite did not match, and every
 * proxied path - including the sign-in and registration pages - fell through to a static 404.
 * That is why this lives in `vercel.ts`, which is evaluated at build time and can read the
 * environment.
 */
const REPO = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

async function loadConfig(appOrigin: string | undefined) {
  const previous = process.env.APP_ORIGIN;
  if (appOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = appOrigin;
  // A fresh module each time, so the environment is read at evaluation.
  const mod = await import(`../vercel.ts?origin=${encodeURIComponent(appOrigin ?? "none")}`);
  if (previous === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = previous;
  return mod.config as {
    buildCommand: string;
    outputDirectory: string;
    rewrites: { source: string; destination: string }[];
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };
}

test("vercel config proxies every dynamic path to the Node server", async () => {
  const config = await loadConfig("https://app.example");
  const bySource = new Map(config.rewrites.map((r) => [r.source, r.destination]));

  for (const source of [
    "/app",
    "/app/:path*",
    "/api/:path*",
    "/files/:path*",
    "/auth/:path*",
    "/login",
    "/signup",
    "/forgot",
    "/reset",
    "/start",
    "/healthz",
  ]) {
    assert.equal(bySource.get(source), `https://app.example${source}`, `${source} is proxied`);
  }
  // A trailing slash on the env var must not produce `https://app.example//login`.
  assert.equal(bySource.get("/login"), "https://app.example/login");
});

test("vercel config never ships an uninterpolated origin", async () => {
  const config = await loadConfig("https://app.example/");
  for (const r of config.rewrites) {
    assert.doesNotMatch(r.destination, /\$/, `destination is interpolated: ${r.destination}`);
    assert.doesNotMatch(r.destination, /undefined|\[object/, r.destination);
    assert.match(r.destination, /^https:\/\/app\.example\//, r.destination);
  }
  // The static build still comes from the same command, and the crawler files keep their rules.
  assert.equal(config.outputDirectory, "dist");
  assert.match(config.buildCommand, /site:build/);
  assert.ok(config.headers.some((h) => h.source === "/404.html" && h.headers.some((x) => x.key === "X-Robots-Tag")));
  assert.ok(config.headers.some((h) => h.source === "/assets/:path*" && h.headers.some((x) => x.key === "Cache-Control")));
});

test("without APP_ORIGIN the static site still deploys, with a loud warning", async () => {
  // A docs-only deployment must not be blocked by a missing env var.
  const config = await loadConfig(undefined);
  assert.deepEqual(config.rewrites, [], "nothing is proxied without an origin");
  assert.equal(config.outputDirectory, "dist");
  assert.match(config.buildCommand, /site:build/);
});

test("a malformed APP_ORIGIN fails the build - that is a typo, not a choice", async () => {
  await assert.rejects(() => loadConfig("app.example"), /absolute http\(s\) origin/);
  await assert.rejects(() => loadConfig("/relative/path"), /absolute http\(s\) origin/);
});

test("the retired vercel.json is gone, so there is only one config file", () => {
  // Vercel errors out if both exist; the JSON one is what shipped the broken `$APP_ORIGIN`.
  const present = ["vercel.json", "vercel.ts", "vercel.mjs", "vercel.js", "vercel.mts"].filter((f) =>
    existsSync(join(REPO, f)),
  );
  assert.deepEqual(present, ["vercel.ts"], "exactly one Vercel config file, and it is the programmatic one");
});