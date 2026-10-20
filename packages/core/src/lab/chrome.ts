import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * The Chrome that Stagehand agents drive. LAB_CHROME_PATH wins; otherwise an installed Chrome, then
 * Edge (Chromium-based, and on every Windows machine), so the desktop app's Lab runs Stagehand
 * agents without anyone setting an environment variable. Playwright's own download is only the
 * headless shell, which Stagehand's launcher can't use.
 */
export function findChrome(): string | null {
  const env = process.env.LAB_CHROME_PATH;
  if (env) return existsSync(env) ? env : null;
  return candidates().find((p) => existsSync(p)) ?? null;
}

function candidates(): string[] {
  if (process.platform === "win32") {
    const roots = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter((r): r is string => Boolean(r));
    return [
      ...roots.map((r) => join(r, "Google", "Chrome", "Application", "chrome.exe")),
      ...roots.map((r) => join(r, "Microsoft", "Edge", "Application", "msedge.exe")),
    ];
  }
  if (process.platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ];
  }
  return ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge", "/snap/bin/chromium"];
}
