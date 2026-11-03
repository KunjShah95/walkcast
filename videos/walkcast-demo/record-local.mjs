import "../../packages/core/src/env.ts";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { findChrome } from "../../packages/core/src/lab/chrome.ts";

const executablePath = findChrome() ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
if (!existsSync(executablePath)) throw new Error("No installed Chromium-based browser was found.");

// The packaged Playwright headless shell is absent on this machine. Reuse the installed
// Chromium browser while keeping Walkcast's own recorder, narration, captions, and zoom.
const launch = chromium.launch.bind(chromium);
chromium.launch = (options = {}) => launch({ ...options, executablePath });

const { recordSite } = await import("../../packages/core/src/record/site.ts");
const result = await recordSite({
  url: "https://walkcast.kunjshah.in",
  authorized: true,
  maxPages: 5,
  maxSeconds: 75,
  paceMs: 1000,
  outDir: resolve("recordings"),
  zoom: true,
  narration: "presenter",
  journey: ["goto /", "scroll", "goto /download", "scroll", "goto /lab", "scroll"].join("\n"),
  ttsProvider: "elevenlabs",
  ttsVoice: "cgSgspJ2msm6clMCkdW9",
});

console.log(JSON.stringify({
  id: result.id,
  dir: result.dir,
  durationMs: result.durationMs,
  pages: result.pages.map(({ url, title, status }) => ({ url, title, status })),
  media: result.media,
  narration: result.narration,
}));
