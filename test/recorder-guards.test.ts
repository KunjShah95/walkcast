import assert from "node:assert/strict";
// Keep the browser cold per test so the node process (and Chromium) can exit cleanly.
process.env.LAB_WARM_BROWSER = "0";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { chromium } from "playwright";
import { startApp } from "../packages/core/src/app/server.ts";
import { SEED_LEADS } from "../packages/core/src/lab/task.ts";
import { OVERLAY_SCRIPT, clearOverlays } from "../packages/core/src/record/overlays.ts";
import { parseRobots, robotsAllows } from "../packages/core/src/record/robots.ts";
import { recordSite } from "../packages/core/src/record/site.ts";
import { readFocus } from "../packages/core/src/record/zoom.ts";

process.env.LAB_LOG = "off";

/** The recorder's guards: what it may visit, what it keeps out of the video, and when it stops. */

const roots: string[] = [];
const mkroot = (): string => {
  const r = mkdtempSync(join(tmpdir(), "walkcast-recorder-"));
  roots.push(r);
  return r;
};
after(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

test("robots.txt wildcards, end anchors and Allow exceptions are honoured", () => {
  const rules = parseRobots(["User-agent: googlebot", "Disallow: /", "", "User-agent: *", "Disallow: /admin/*", "Disallow: /*.pdf$", "Disallow: /private", "Allow: /private/press", "# a comment", ""].join("\n"));
  assert.equal(robotsAllows(rules, "/admin/settings"), false, "a wildcard rule matches what it covers");
  assert.equal(robotsAllows(rules, "/files/report.pdf"), false);
  assert.equal(robotsAllows(rules, "/files/report.pdf?v=2"), true, "$ anchors the end of the path");
  assert.equal(robotsAllows(rules, "/private/notes"), false);
  assert.equal(robotsAllows(rules, "/private/press/2026"), true, "the longer Allow wins over the broader Disallow");
  assert.equal(robotsAllows(rules, "/pricing"), true);
  assert.equal(robotsAllows(parseRobots("User-agent: *\nDisallow: /x\nAllow: /x"), "/x"), true, "Allow wins a tie");
  assert.equal(robotsAllows(parseRobots("User-agent: other\nDisallow: /"), "/anything"), true, "another crawler's rules do not apply");
});

test("a zoom plan with no usable frame size is no plan at all", () => {
  const dir = mkroot();
  writeFileSync(join(dir, "focus.json"), JSON.stringify({ zoom: true, width: 0, height: "tall", moments: [] }));
  assert.equal(readFocus(dir), null);
  writeFileSync(join(dir, "focus.json"), JSON.stringify({ zoom: true, width: 1920, height: 1080, moments: [] }));
  assert.ok(readFocus(dir));
});

test("consent banners, chat bubbles and newsletter pop-ups stay out of the walkthrough", async () => {
  const html = `<!doctype html><html><body>
    <h1>Pricing</h1>
    <div id="onetrust-banner-sdk"><button id="onetrust-accept-btn-handler" onclick="window.consented='onetrust'">Accept</button></div>
    <div class="site-cookie-notice"><p>We use cookies.</p><button onclick="window.generic=true;this.parentElement.remove()">Accept all</button></div>
    <div role="dialog" aria-modal="true" id="pitch"><p>Join our newsletter for 10% off</p><button aria-label="Close" onclick="document.getElementById('pitch').remove()">×</button></div>
    <div role="dialog" aria-modal="true" id="signin"><p>Subscribe? Sign in first</p><input type="password"><button aria-label="Close">×</button></div>
    <div id="intercom-container">chat</div>
    <div data-walkcast><button aria-label="Close">ours</button></div>
  </body></html>`;
  const srv = createServer((_q, res) => res.writeHead(200, { "Content-Type": "text/html" }).end(html)).listen(0, "127.0.0.1");
  await new Promise((r) => srv.once("listening", r));
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.addInitScript(OVERLAY_SCRIPT);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${(srv.address() as { port: number }).port}/`);
    // Hidden before the page paints: never in the video.
    assert.equal(await page.locator("#onetrust-banner-sdk").isVisible(), false);
    assert.equal(await page.locator("#intercom-container").isVisible(), false);
    const did = await clearOverlays(page);
    assert.equal(await page.evaluate(() => (window as unknown as { consented?: string }).consented), "onetrust", "consent given with the tool's own button");
    assert.equal(await page.locator("#pitch").count(), 0, "the newsletter pop-up was closed");
    assert.equal(await page.locator("#signin").count(), 1, "a dialog asking for a password is the site, and stays");
    assert.ok(did.includes("popup:closed"), did.join(", "));
    // A banner no list knows is found by its words, in the same pass.
    assert.ok(did.some((d) => d.includes("Accept all")), did.join(", "));
    assert.equal(await page.evaluate(() => (window as unknown as { generic?: boolean }).generic), true);
    // The next page's pass presses nothing twice.
    assert.deepEqual(await clearOverlays(page), []);
    assert.equal(await page.locator("[data-walkcast]").count(), 1, "the pointer layer is never touched");
  } finally {
    await browser.close();
    srv.close();
  }
});

test("a journey stops at the page limit the person set", { timeout: 240_000 }, async () => {
  const app = await startApp({ fault: "none", seed: 1, task: "lookup-owner", seedLeads: SEED_LEADS });
  try {
    const r = await recordSite({ url: app.url, maxPages: 2, authorized: true, outDir: mkroot(), paceMs: 50, journey: "goto /a\ngoto /b\ngoto /c\ngoto /d" });
    assert.ok(r.pages.length <= 2, `visited ${r.pages.length} pages with a limit of 2`);
    assert.ok(r.captions.some((c) => /2-page limit/.test(c.text)), "the closing line says why it stopped");
  } finally {
    await app.close();
  }
});
