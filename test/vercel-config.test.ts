import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp } from "../src/ui/server.ts";

/**
 * One Vercel deployment serves the whole site, the same as `npm run dev`: the build
 * (src/deploy/vercel-build.ts) writes the marketing pages as static files and bundles the Node
 * server into a function that answers everything else. There is no separate server and no
 * `APP_ORIGIN` to proxy to - a missing one is what used to 404 `/login` and `/signup`.
 */
const REPO = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

test("vercel config builds the static pages and the server function together", async () => {
  const { config } = (await import("../vercel.ts")) as { config: Record<string, unknown> };
  assert.equal(config.buildCommand, "npm run vercel:build");
  assert.equal(config.framework, null);
  // Build Output API: routes come from the build, and nothing points at another origin.
  for (const key of ["rewrites", "outputDirectory"]) assert.ok(!(key in config), `${key} is not set`);
  assert.doesNotMatch(readFileSync(join(REPO, "vercel.ts"), "utf8"), /APP_ORIGIN/);

  const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as { scripts: Record<string, string> };
  assert.match(pkg.scripts["vercel:build"]!, /ui:build/);
  assert.match(pkg.scripts["vercel:build"]!, /src\/deploy\/vercel-build\.ts/);
});

test("the retired vercel.json is gone, so there is only one config file", () => {
  // Vercel errors out if both exist.
  const present = ["vercel.json", "vercel.ts", "vercel.mjs", "vercel.js", "vercel.mts"].filter((f) =>
    existsSync(join(REPO, f)),
  );
  assert.deepEqual(present, ["vercel.ts"], "exactly one Vercel config file, and it is the programmatic one");
});

test("the server as a plain handler serves the auth pages and refuses jobs it can't run", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "walkcast-fn-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dashboard = join(root, "dashboard.html");
  writeFileSync(dashboard, "<!doctype html><title>dashboard</title>");

  const app = createApp({ root, host: "0.0.0.0", requireAuth: false, worker: false, jobsUnavailable: "No browser here.", dashboardHtml: dashboard });
  const server = createServer(app.handler);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise<void>((r) => server.close(() => r())));
  const { port } = server.address() as { port: number };
  const base = `http://127.0.0.1:${port}`;

  for (const path of ["/login", "/signup", "/app", "/healthz"]) {
    assert.equal((await fetch(`${base}${path}`, { redirect: "manual" })).status, 200, path);
  }
  const record = await fetch(`${base}/api/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ authorized: true, url: "https://example.com" }),
  });
  assert.equal(record.status, 503);
  assert.deepEqual(await record.json(), { error: "No browser here." });
  await app.store.close();
});
