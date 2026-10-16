import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { chromium } from "playwright";
import { serveDashboard } from "../apps/desktop/server/server.ts";
import { browserNotReady, browserSetup, installChromium, parseInstallItem, parseInstallProgress } from "../packages/core/src/record/browser-install.ts";

test("installer progress: the last bar in a chunk wins, colour codes and all", () => {
  const chunk =
    "Downloading Chromium 141.0.7390.37 (playwright build v1194)\u001b[2m from https://cdn.playwright.dev/x.zip\u001b[22m\n" +
    "|■■■■■■■■        |  10% of 148.9 MiB\n|■■■■■■■■■■■■■■■■|  20% of 148.9 MiB\n";
  assert.deepEqual(parseInstallProgress(chunk), { percent: 20, totalMb: 148.9 });
  assert.equal(parseInstallProgress("Downloading Chromium..."), null);
  assert.equal(parseInstallProgress("| 100% of 2.3 MiB")?.percent, 100);
});

test("installer progress: names the file being fetched, so a restarting bar makes sense", () => {
  assert.equal(parseInstallItem("Downloading Chromium 141.0.7390.37 (playwright build v1194)\u001b[2m from https://x\u001b[22m"), "Chromium");
  assert.equal(parseInstallItem("Downloading Chromium Headless Shell 141.0.7390.37 (playwright build v1194)"), "Chromium Headless Shell");
  assert.equal(parseInstallItem("Downloading FFMPEG playwright build v1011 from https://x"), "FFMPEG");
  assert.equal(parseInstallItem("|■■■■|  40% of 91 MiB"), null);
});

test("a server that doesn't manage its browser: unmanaged, no retry, recordings not gated", async () => {
  // Order matters in this file: nothing has called installChromium yet.
  assert.equal(browserSetup().state, "unmanaged");
  assert.equal(browserNotReady(), null);

  const root = mkdtempSync(join(tmpdir(), "lab-browser-"));
  const srv = await serveDashboard(5300 + Math.floor(Math.random() * 200), { root, unref: true, requireAuth: false, worker: false });
  try {
    const status = (await (await fetch(`${srv.url}/api/browser`)).json()) as { state: string };
    assert.equal(status.state, "unmanaged");
    assert.equal((await fetch(`${srv.url}/api/browser/install`, { method: "POST" })).status, 409);
    // Gets as far as input validation: the browser check let it through.
    const record = await fetch(`${srv.url}/api/record`, { method: "POST", body: JSON.stringify({ url: "https://site.example" }) });
    assert.equal(record.status, 400);
  } finally {
    await srv.close(100);
    rmSync(root, { recursive: true, force: true });
  }
});

test("with Chromium already present, installing is a no-op that reports ready", { skip: !existsSync(chromium.executablePath()) && "Playwright's Chromium is not installed here" }, () => {
  assert.equal(installChromium().state, "ready");
  assert.equal(browserSetup().state, "ready");
  assert.equal(browserNotReady(), null);
});
