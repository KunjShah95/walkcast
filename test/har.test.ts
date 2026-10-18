import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import { registerFault } from "../packages/core/src/app/faults.ts";
import { loadFixture, replayFixture, writeFixture } from "../packages/core/src/lab/fixture.ts";
import { closeBrowser, runOnce, thirdPartyPattern } from "../packages/core/src/lab/runner.ts";
import { createLeadTask } from "../packages/core/src/lab/task.ts";

process.env.LAB_LOG = "off";
const out = mkdtempSync(join(tmpdir(), "har-"));
after(async () => { await closeBrowser(); rmSync(out, { recursive: true, force: true }); });

test("third-party pattern matches everything but the app's own origin", () => {
  const p = thirdPartyPattern("http://127.0.0.1:4310");
  assert.ok(!p.test("http://127.0.0.1:4310/leads"));
  assert.ok(!p.test("http://127.0.0.1:4310"));
  assert.ok(p.test("http://127.0.0.1:43100/leads"), "another port is another origin");
  assert.ok(p.test("https://cdn.example/widget.js"));
  assert.ok(!p.test("data:text/plain,x"));
});

test("third-party traffic is recorded into the fixture and served from it on replay", { timeout: 120_000 }, async () => {
  // A "third-party" widget the app pages load from another origin.
  let hits = 0;
  const vendor = createServer((_req, res) => {
    hits++;
    res.writeHead(200, { "Content-Type": "text/javascript", "Access-Control-Allow-Origin": "*" });
    res.end("document.body.setAttribute('data-widget', 'loaded');");
  });
  await new Promise<void>((r) => vendor.listen(0, "127.0.0.1", r));
  const widget = `http://127.0.0.1:${(vendor.address() as AddressInfo).port}/widget.js`;
  registerFault({
    id: "har-widget-test",
    description: "Pages load a third-party widget script (test only).",
    taskPossible: true,
    transformPage: (_ctx, html) => html.replace("</body>", `<script src="${widget}"></script></body>`),
  });

  const task = createLeadTask();
  const r = await runOnce({ fault: "har-widget-test", seed: 1, agent: "v1", task, outDir: out });
  assert.equal(r.networkHar, "network.har");
  assert.ok(hits > 0, "the live run fetched the widget");
  const har = JSON.parse(readFileSync(join(r.runDir, "network.har"), "utf8")) as { log: { entries: { request: { url: string } }[] } };
  assert.ok(har.log.entries.length > 0);
  assert.ok(har.log.entries.every((e) => e.request.url.startsWith(widget)), "the app's own traffic is not in the HAR");

  const fixture = await writeFixture(r, task, join(out, "fixtures"));
  assert.ok(existsSync(join(fixture.dir, "network.har")));
  assert.equal(loadFixture(fixture.dir).manifest.environment.network, "network.har");

  // The vendor goes away; the replay still gets the widget, from the HAR.
  await new Promise<void>((r) => vendor.close(() => r()));
  const before = hits;
  const summary = await replayFixture(loadFixture(fixture.dir), "v1", 1, join(out, "replays"));
  assert.equal(hits, before, "replay never touched the vendor");
  assert.equal(summary.passes, 1);
  // The replay's own HAR shows the widget answered 200 (fulfilled by the router, not the vendor).
  const replayed = JSON.parse(readFileSync(join(summary.trials[0]!.runDir, "network.har"), "utf8")) as { log: { entries: { request: { url: string }; response: { status: number } }[] } };
  const served = replayed.log.entries.filter((e) => e.request.url.startsWith(widget));
  assert.ok(served.length > 0 && served.every((e) => e.response.status === 200), JSON.stringify(served.map((e) => e.response.status)));
});
