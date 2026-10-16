import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import { log } from "../ops/log.ts";

/**
 * Playwright's Chromium, downloaded on first run by the desktop app (it is too large to ship in
 * the installer). This module owns that download and its progress, so the server can answer
 * "is the browser ready?" and refuse a recording with a clear message until it is.
 *
 * "unmanaged" means nothing here has looked after the browser: a server or worker that was set up
 * with Chromium already present (Docker, `npm run dev`). Callers treat it like "ready".
 */
export type BrowserSetupState = "unmanaged" | "ready" | "installing" | "failed";

export interface BrowserSetup {
  state: BrowserSetupState;
  /** Download progress, 0-100, while installing. */
  percent: number | null;
  /** The file being downloaded now ("Chromium", "Chromium Headless Shell", ...). */
  item: string | null;
  /** Download size in MiB, once the installer has said. */
  totalMb: number | null;
  error: string | null;
}

let status: BrowserSetup = { state: "unmanaged", item: null, percent: null, totalMb: null, error: null };

export function browserSetup(): BrowserSetup {
  return { ...status };
}

/**
 * What the installer is fetching now. It downloads several files in turn (Chromium, its headless
 * shell, FFMPEG, ...), each announced as "Downloading Chromium 141.0... (playwright build v1194)".
 */
export function parseInstallItem(text: string): string | null {
  const plain = text.replace(/\u001b\[[0-9;]*m/g, "");
  const last = [...plain.matchAll(/Downloading ([A-Za-z][A-Za-z ]*?)(?= v?\d| playwright build| \()/g)].at(-1);
  return last ? last[1]! : null;
}

/** The installer draws a bar ending in "42% of 148.9 MiB"; the last one in a chunk wins. */
export function parseInstallProgress(text: string): { percent: number; totalMb: number } | null {
  const last = [...text.matchAll(/(\d{1,3})% of ([\d.]+) MiB/g)].at(-1);
  return last ? { percent: Math.min(100, Number(last[1])), totalMb: Number(last[2]) } : null;
}

/** A message for a request that needs the browser, or null when it can go ahead. */
export function browserNotReady(): string | null {
  if (status.state === "installing") {
    const done = status.percent === null ? "" : ` (${status.percent}%)`;
    return `The recording browser is still downloading${done}. It only happens once; try again when it finishes.`;
  }
  if (status.state === "failed") return `The recording browser could not be installed: ${status.error ?? "unknown error"}. Retry from the banner.`;
  return null;
}

/** Start the download unless Chromium is already there or a download is running. Idempotent. */
export function installChromium(): BrowserSetup {
  if (status.state === "installing") return browserSetup();
  if (existsSync(chromium.executablePath())) {
    status = { state: "ready", item: null, percent: null, totalMb: null, error: null };
    return browserSetup();
  }

  const cli = join(dirname(createRequire(import.meta.url).resolve("playwright-core/package.json")), "cli.js");
  status = { state: "installing", item: null, percent: 0, totalMb: null, error: null };
  log.info("browser.install.started", { into: process.env.PLAYWRIGHT_BROWSERS_PATH ?? "default" });

  const child = spawn(process.execPath, [cli, "install", "chromium"], { stdio: ["ignore", "pipe", "pipe"], env: process.env });
  let tail = "";
  const read = (chunk: Buffer) => {
    const text = chunk.toString();
    tail = (tail + text).slice(-2000);
    if (status.state !== "installing") return;
    const item = parseInstallItem(text);
    if (item && item !== status.item) {
      status = { ...status, item, percent: 0, totalMb: null };
      log.info("browser.install.downloading", { item });
    }
    const progress = parseInstallProgress(text);
    if (progress) status = { ...status, ...progress };
  };
  child.stdout.on("data", read);
  child.stderr.on("data", read);
  child.on("error", (e) => {
    status = { ...status, state: "failed", percent: null, error: e.message };
    log.error("browser.install.failed", { error: e.message });
  });
  child.on("exit", (code) => {
    if (status.state !== "installing") return;
    if (code === 0 && existsSync(chromium.executablePath())) {
      status = { ...status, state: "ready", percent: 100, error: null };
      log.info("browser.install.ready", {});
    } else {
      const reason = tail.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).at(-1) ?? `installer exited with code ${code}`;
      status = { ...status, state: "failed", percent: null, error: reason };
      log.error("browser.install.failed", { code, error: reason });
    }
  });
  return browserSetup();
}
