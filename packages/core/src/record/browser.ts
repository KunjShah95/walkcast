/**
 * A single, warm Chromium instance shared for the lifetime of the worker/process.
 *
 * `chromium.launch()` alone costs ~1–2 s; reuse costs nothing for a worker that records a whole
 * site, and it is the difference between a recording that "starts" instantly (docs/SCALING.md §4.3).
 * Isolation per recording is provided by the context (`browser.newContext()`), so sharing the browser
 * loses no isolation. Set `LAB_WARM_BROWSER=0` to disable (useful in tests).
 */
import { chromium, type Browser } from "playwright";

let browser: Browser | null = null;
let launching: Promise<Browser> | null = null;

export function warmBrowserEnabled(): boolean {
  if (process.env.LAB_WARM_BROWSER === "0") return false;
  if (process.env.LAB_WARM_BROWSER === "1") return true;
  // Default warm for long-running workers; everything else opts in explicitly.
  return process.env.LAB_WORKER !== "off";
}

export async function getBrowser(): Promise<Browser> {
  if (!warmBrowserEnabled()) {
    return chromium.launch({ headless: true, chromiumSandbox: process.env.LAB_CHROMIUM_SANDBOX === "1" });
  }
  if (browser && browser.isConnected()) return browser;
  if (launching) return launching;
  launching = chromium
    .launch({ headless: true, chromiumSandbox: process.env.LAB_CHROMIUM_SANDBOX === "1" })
    .then((b) => {
      browser = b;
      b.on("disconnected", () => {
        browser = null;
      });
      return b;
    })
    .finally(() => {
      launching = null;
    });
  return launching;
}

export async function closeWarmBrowser(): Promise<void> {
  if (browser) {
    await browser.close().catch(() => undefined);
    browser = null;
  }
  launching = null;
}

// Make sure a warm Chromium child does not keep a one-shot process alive (or leak on exit).
let closingBrowser = false;
process.on("beforeExit", (code) => {
  if (closingBrowser) return;
  closingBrowser = true;
  closeWarmBrowser().catch(() => undefined).finally(() => process.exit(code));
});
