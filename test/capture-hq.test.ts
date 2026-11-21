import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { chromium } from "playwright";
import { encoderArgs, hqCaptureWanted, startHqCapture } from "../packages/core/src/record/capture-hq.ts";

test("high-quality capture is on unless it is switched off", () => {
  assert.equal(hqCaptureWanted({}), true);
  assert.equal(hqCaptureWanted({ WALKCAST_HQ_CAPTURE: "1" }), true);
  assert.equal(hqCaptureWanted({ WALKCAST_HQ_CAPTURE: "0" }), false);
});

test("the encoder is told to hold a constant frame rate at a bitrate Playwright's own video never reaches", () => {
  const args = encoderArgs("out.webm", { fps: 30, mbps: 8 });
  assert.ok(args.join(" ").includes("fps=30"));
  assert.ok(args.includes("8M"));
  assert.ok(args.includes("-use_wallclock_as_timestamps"));
  assert.equal(args.at(-1), "out.webm");
});

test("a page is captured at full size for as long as it was watched", { timeout: 60_000 }, async (t) => {
  let browser;
  try {
    browser = await chromium.launch();
  } catch {
    return t.skip("no Chromium on this machine");
  }
  const dir = mkdtempSync(join(tmpdir(), "hq-"));
  try {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage();
    await page.setContent(`<body style="font:20px Arial">${"<p>Walkcast records what a visitor sees.</p>".repeat(60)}</body>`);
    const file = join(dir, "hq.webm");
    const hq = await startHqCapture(ctx, page, file, { width: 1920, height: 1080 });
    if (!hq) return t.skip("ffmpeg cannot encode VP8 here");
    const began = Date.now();
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 150);
      await page.waitForTimeout(300);
    }
    const ok = await hq.stop();
    const watched = (Date.now() - began) / 1000;
    await ctx.close();
    assert.equal(ok, true);
    const probe = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", file]).toString();
    const info = JSON.parse(probe) as { streams: { width: number; height: number }[]; format: { duration: string } };
    assert.deepEqual([info.streams[0]!.width, info.streams[0]!.height], [1920, 1080]);
    assert.ok(Math.abs(Number(info.format.duration) - watched) < 0.8, `video ${info.format.duration}s against ${watched.toFixed(2)}s watched`);
  } finally {
    await browser.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
