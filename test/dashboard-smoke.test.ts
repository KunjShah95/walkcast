import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { chromium, type Browser } from "playwright";
import { closeBrowser, runOnce } from "../src/lab/runner.ts";
import { createLeadTask } from "../src/lab/task.ts";
import { serveDashboard, type Running } from "../src/ui/server.ts";

/**
 * Opens every dashboard view on real run data in a real browser and fails on any uncaught page
 * error or an empty page. (A step whose result was a plain string once blanked the run view.)
 */
process.env.LAB_LOG = "off";
let root: string;
let srv: Running;
let browser: Browser;
let failDir: string;
let cleanDir: string;

before(async () => {
  root = mkdtempSync(join(tmpdir(), "smoke-"));
  const outDir = join(root, "runs");
  const fail = await runOnce({ fault: "stale-owners", seed: 1, agent: "v0", task: createLeadTask(), outDir, screenshots: true });
  const clean = await runOnce({ fault: "none", seed: 1, agent: "v0", task: createLeadTask(), outDir });
  failDir = `runs/${fail.runDir.split(/[\\/]/).pop()}`;
  cleanDir = `runs/${clean.runDir.split(/[\\/]/).pop()}`;
  srv = await serveDashboard(5800 + Math.floor(Math.random() * 150), { root, unref: true, requireAuth: false, worker: false });
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  await srv?.close(100);
  await closeBrowser();
  rmSync(root, { recursive: true, force: true });
});

test("every dashboard view renders without page errors", { timeout: 120_000 }, async () => {
  const views = [
    "/app",
    "/app#simulator",
    "/app#record",
    "/app#runs",
    "/app#fixtures",
    "/app#experiments",
    `/app#run/${encodeURIComponent(failDir)}`,
    `/app#run/${encodeURIComponent(cleanDir)}`,
    `/app#compare/${encodeURIComponent(cleanDir)}|${encodeURIComponent(failDir)}`,
  ];
  for (const scheme of ["light", "dark"] as const) {
    for (const view of views) {
      const page = await browser.newPage({ colorScheme: scheme });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(srv.url + view);
      await page.waitForSelector("main h1", { timeout: 15_000 }).catch(() => undefined);
      await page.waitForTimeout(300);
      assert.deepEqual(errors, [], `${view} (${scheme})`);
      const text = (await page.locator("main").innerText()).trim();
      assert.ok(text.length > 40, `${view} (${scheme}) rendered content`);
      await page.close();
    }
  }
});

/**
 * Sign-in and registration must be reachable from the dashboard itself, even on a self-hosted
 * server where accounts are optional (the default). Otherwise there is no way in at all.
 */
test("the dashboard header offers sign in and create account", { timeout: 60_000 }, async () => {
  const page = await browser.newPage();
  await page.goto(srv.url + "/app#runs");
  const signIn = page.locator("header a:has-text('Sign in')").first();
  const register = page.locator("header a:has-text('Create account')").first();
  await signIn.waitFor({ timeout: 15_000 });
  await register.waitFor({ timeout: 15_000 });
  const signInHref = (await signIn.getAttribute("href")) ?? "";
  const registerHref = (await register.getAttribute("href")) ?? "";
  assert.match(signInHref, /^\/login\?next=/);
  assert.match(registerHref, /^\/signup\?next=/);
  // The return trip keeps you on the view you were looking at.
  assert.match(decodeURIComponent(signInHref), /\/app#runs$/);

  // Both targets really serve the auth form with the expected heading.
  for (const [href, heading] of [[signInHref, "Sign in"], [registerHref, "Start recording"]] as const) {
    const res = await page.request.get(srv.url + href);
    assert.equal(res.status(), 200);
    const html = await res.text();
    assert.match(html, /<form id="auth"/, `${href} serves the sign-in form`);
    assert.ok(html.includes(heading), `${href} heading is "${heading}"`);
  }
  await page.close();
});
