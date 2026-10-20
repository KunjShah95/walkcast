import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import { log } from "../ops/log.ts";

/**
 * Playwright's Chromium, downloaded on first run by the desktop app (it is too large to ship in
 * the installer). This module owns that download and its progress, so the server can answer
 * "is the browser ready?" and refuse a recording with a clear message until it is.
 *
 * Recordings only ever launch headless, which Playwright serves from its headless shell, so that
 * (plus the FFMPEG it records video with) is all that is fetched: about 100 MB rather than the
 * 250 MB `install chromium` pulls with the full browser.
 *
 * "unmanaged" means nothing here has looked after the browser: a server or worker that was set up
 * with Chromium already present (Docker, `npm run dev`). Callers treat it like "ready".
 */
export type BrowserSetupState = "unmanaged" | "ready" | "installing" | "failed";

export interface BrowserSetup {
  state: BrowserSetupState;
  /** Download progress, 0-100, while installing. */
  percent: number | null;
  /** The file being downloaded now ("Chromium Headless Shell", "FFMPEG", ...). */
  item: string | null;
  /** How much of it has arrived, in MiB. */
  doneMb: number | null;
  /** Download size in MiB, once the installer has said. */
  totalMb: number | null;
  error: string | null;
}

/** What a headless recording needs, by Playwright registry name. */
const NEEDED = ["chromium-headless-shell", "ffmpeg"];
/** No new bytes for this long and the download is restarted; Playwright keeps finished files. */
const STALL_MS = 60_000;
const MAX_STALLS = 3;
const MiB = 1024 * 1024;

let status: BrowserSetup = { state: "unmanaged", item: null, percent: null, doneMb: null, totalMb: null, error: null };

export function browserSetup(): BrowserSetup {
  return { ...status };
}

/**
 * What the installer is fetching now. It downloads several files in turn (the headless shell,
 * FFMPEG, ...), each announced as "Downloading Chromium Headless Shell 141.0... (playwright build v1194)".
 */
export function parseInstallItem(text: string): string | null {
  const plain = text.replace(/\u001b\[[0-9;]*m/g, ""); // eslint-disable-line no-control-regex -- strips ANSI colour codes
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
    const done = status.doneMb !== null && status.totalMb ? ` (${Math.round(status.doneMb)} of ${Math.round(status.totalMb)} MB)` : "";
    return `The recording browser is still downloading${done}. It only happens once; try again when it finishes.`;
  }
  if (status.state === "failed") return `The recording browser could not be installed: ${status.error ?? "unknown error"}. Retry from the banner.`;
  return null;
}

interface Executable {
  directory: string | undefined;
  executablePath(sdkLanguage: string): string | undefined;
}

/** Everything a recording launches is on disk and finished unpacking. */
function installed(): boolean {
  try {
    const require = createRequire(import.meta.url);
    const { registry } = require("playwright-core/lib/server/registry/index") as { registry: { findExecutable(name: string): Executable | undefined } };
    return NEEDED.every((name) => {
      const exe = registry.findExecutable(name);
      const path = exe?.executablePath("javascript");
      return !!exe?.directory && !!path && existsSync(path) && existsSync(join(exe.directory, "INSTALLATION_COMPLETE"));
    });
  } catch {
    // Playwright moved its registry: fall back to the one path the public API gives.
    return existsSync(chromium.executablePath());
  }
}

/** Bytes of the archive being downloaded: Playwright writes it under the temp directory we give it. */
function downloadedBytes(dir: string): number {
  let bytes = 0;
  try {
    for (const sub of readdirSync(dir)) {
      const path = join(dir, sub);
      for (const file of statSync(path).isDirectory() ? readdirSync(path) : []) {
        if (file.endsWith(".zip")) bytes += statSync(join(path, file)).size;
      }
    }
  } catch {
    /* between attempts the directory comes and goes */
  }
  return bytes;
}

/** The installer forks the actual download, so stop the whole tree, not just the CLI. */
function killTree(child: ChildProcess) {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

let run = 0;

/** Start the download unless the browser is already there or a download is running. Idempotent. */
export function installChromium(): BrowserSetup {
  if (status.state === "installing") return browserSetup();
  if (installed()) {
    status = { state: "ready", item: null, percent: null, doneMb: null, totalMb: null, error: null };
    return browserSetup();
  }
  status = { state: "installing", item: null, percent: 0, doneMb: null, totalMb: null, error: null };
  log.info("browser.install.started", { into: process.env.PLAYWRIGHT_BROWSERS_PATH ?? "default" });
  start(0);
  return browserSetup();
}

function start(stalls: number) {
  const id = ++run;
  const cli = join(dirname(createRequire(import.meta.url).resolve("playwright-core/package.json")), "cli.js");
  const temp = join(process.env.PLAYWRIGHT_BROWSERS_PATH ?? tmpdir(), ".downloading");
  rmSync(temp, { recursive: true, force: true });
  mkdirSync(temp, { recursive: true });

  const child = spawn(process.execPath, [cli, "install", "chromium", "--only-shell"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, TEMP: temp, TMP: temp, TMPDIR: temp },
    detached: process.platform !== "win32", // its own process group, so a stall can kill the fork too
    windowsHide: true,
  });
  let tail = "";
  let lastBytes = -1;
  let lastChange = Date.now();

  // The installer only prints every 10%, which on a slow line sits at 0% for minutes: measure the
  // archive on disk instead, and restart a download that has stopped moving.
  const watch = setInterval(() => {
    if (id !== run || status.state !== "installing") return clearInterval(watch);
    const bytes = downloadedBytes(temp);
    if (bytes !== lastBytes) {
      lastBytes = bytes;
      lastChange = Date.now();
    }
    if (status.totalMb) {
      const total = status.totalMb * MiB;
      const doneMb = Math.min(bytes, total) / MiB;
      const percent = Math.max(status.percent ?? 0, Math.min(99, Math.floor((bytes / total) * 100)));
      status = { ...status, doneMb: Math.round(doneMb * 10) / 10, percent };
    }
    const unpacking = status.totalMb !== null && bytes >= status.totalMb * MiB * 0.999;
    if (!unpacking && Date.now() - lastChange > STALL_MS) {
      clearInterval(watch);
      run++; // this attempt's exit is ours, not a result
      killTree(child);
      if (stalls + 1 >= MAX_STALLS) {
        status = { ...status, state: "failed", percent: null, error: "the download stopped moving" };
        log.error("browser.install.failed", { error: "stalled", stalls: stalls + 1 });
        return;
      }
      log.warn("browser.install.stalled", { item: status.item, bytes, retry: stalls + 1 });
      status = { ...status, percent: 0, doneMb: null };
      start(stalls + 1);
    }
  }, 1000);
  watch.unref();

  const read = (chunk: Buffer) => {
    const text = chunk.toString();
    tail = (tail + text).slice(-2000);
    if (id !== run || status.state !== "installing") return;
    const item = parseInstallItem(text);
    if (item && item !== status.item) {
      status = { ...status, item, percent: 0, doneMb: 0, totalMb: null };
      lastChange = Date.now();
      log.info("browser.install.downloading", { item });
    }
    const progress = parseInstallProgress(text);
    if (progress) status = { ...status, totalMb: progress.totalMb, percent: Math.max(status.percent ?? 0, progress.percent) };
  };
  child.stdout.on("data", read);
  child.stderr.on("data", read);
  child.on("error", (e) => {
    if (id !== run) return;
    clearInterval(watch);
    status = { ...status, state: "failed", percent: null, error: e.message };
    log.error("browser.install.failed", { error: e.message });
  });
  child.on("exit", (code) => {
    clearInterval(watch);
    if (id !== run || status.state !== "installing") return;
    rmSync(temp, { recursive: true, force: true });
    if (code === 0 && installed()) {
      status = { ...status, state: "ready", percent: 100, error: null };
      log.info("browser.install.ready", {});
    } else {
      const reason = tail.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).at(-1) ?? `installer exited with code ${code}`;
      status = { ...status, state: "failed", percent: null, error: reason };
      log.error("browser.install.failed", { code, error: reason });
    }
  });
}
