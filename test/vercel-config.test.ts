import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

/**
 * Vercel serves the marketing site only: the build (apps/web/build.ts --vercel) writes the
 * prerendered pages as static files and no function. Sign-in, the dashboard and the API are the
 * desktop app's, so nothing from apps/desktop may end up in the deployment.
 */
const REPO = resolve(import.meta.dirname, "..");

test("vercel config builds the static site and nothing else", async () => {
  const { config } = (await import("../vercel.ts")) as { config: Record<string, unknown> };
  assert.equal(config.buildCommand, "npm run vercel:build");
  assert.equal(config.framework, null);
  for (const key of ["rewrites", "outputDirectory"]) assert.ok(!(key in config), `${key} is not set`);

  const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as { scripts: Record<string, string> };
  assert.match(pkg.scripts["vercel:build"]!, /apps\/web\/build\.ts --vercel/);
  assert.doesNotMatch(pkg.scripts["vercel:build"]!, /ui:build/, "the dashboard is not part of the website");
});

test("the retired vercel.json is gone, so there is only one config file", () => {
  // Vercel errors out if both exist.
  const present = ["vercel.json", "vercel.ts", "vercel.mjs", "vercel.js", "vercel.mts"].filter((f) =>
    existsSync(join(REPO, f)),
  );
  assert.deepEqual(present, ["vercel.ts"], "exactly one Vercel config file, and it is the programmatic one");
});

test("the Vercel build output is static files and routes, with no function", () => {
  execFileSync(process.execPath, ["--import", "tsx", "apps/web/build.ts", "--vercel"], {
    cwd: REPO,
    env: { PATH: process.env.PATH ?? "", LAB_SITE_URL: "https://walkcast.example" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const out = join(REPO, ".vercel", "output");
  assert.ok(existsSync(join(out, "static", "index.html")));
  assert.ok(existsSync(join(out, "static", "download", "index.html")));
  assert.equal(existsSync(join(out, "functions")), false, "no server function is deployed");
  const config = JSON.parse(readFileSync(join(out, "config.json"), "utf8")) as { routes: { src?: string; dest?: string; status?: number }[] };
  const fallback = config.routes.at(-1)!;
  assert.equal(fallback.status, 404);
  assert.equal(fallback.dest, "/404.html");
});
