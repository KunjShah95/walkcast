/**
 * What stands between a visitor and the page: cookie banners, chat bubbles, newsletter pop-ups.
 *
 * On most real sites a consent banner covered the first seconds of the walkthrough, and often
 * the bottom third of every page after it. A walkthrough is meant to show the site, so:
 *
 *   - The known consent tools and chat widgets are hidden by a stylesheet that is in place
 *     before the page paints, so they never appear in the video at all.
 *   - Consent is then accepted the way a visitor would (the tool's own "accept" button), which
 *     also lifts the scroll lock some of them put on the page. A banner the list does not know
 *     is found by its words ("Accept all", "Got it") inside a cookie or consent container.
 *   - A newsletter or discount pop-up is closed with its own close button.
 *
 * None of this is narrated: it is housekeeping, not part of the tour. The pointer layer
 * (`[data-walkcast]`) is never touched. LAB_KEEP_OVERLAYS=1 leaves every page as it comes.
 */
import type { Page } from "playwright";

/** Consent tools and chat widgets, by the containers they render into. */
const HIDE = [
  // Consent tools
  "#onetrust-consent-sdk",
  "#onetrust-banner-sdk",
  "#CybotCookiebotDialog",
  "#usercentrics-root",
  "#usercentrics-cmp-ui",
  "#didomi-host",
  ".qc-cmp2-container",
  "#truste-consent-track",
  ".truste_box_overlay",
  ".osano-cm-window",
  "#hs-eu-cookie-confirmation",
  ".fc-consent-root",
  ".cc-window",
  "#cookie-law-info-bar",
  ".cky-consent-container",
  "#cmplz-cookiebanner-container",
  ".iubenda-cs-container",
  "#termly-code-snippet-support",
  "#cookiescript_injected",
  ".klaro .cookie-notice",
  // Chat widgets
  "#intercom-container",
  ".intercom-lightweight-app",
  "#drift-widget-container",
  "#drift-frame-controller",
  ".crisp-client",
  "#hubspot-messages-iframe-container",
  "#fc_frame",
  "#tidio-chat",
  ".tawk-min-container",
  "iframe[title*='chat widget' i]",
  "#chat-widget-container",
];

/** The accept buttons of the same tools. */
const ACCEPT = [
  "#onetrust-accept-btn-handler",
  "#accept-recommended-btn-handler",
  "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
  "#CybotCookiebotDialogBodyButtonAccept",
  "[data-testid='uc-accept-all-button']",
  "#didomi-notice-agree-button",
  ".qc-cmp2-summary-buttons button[mode='primary']",
  "#truste-consent-button",
  ".osano-cm-accept-all",
  "#hs-eu-confirmation-button",
  ".fc-cta-consent",
  ".cc-allow",
  ".cc-dismiss",
  ".cky-btn-accept",
  ".cmplz-accept",
  ".iubenda-cs-accept-btn",
];

export function overlaysEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LAB_KEEP_OVERLAYS !== "1";
}

/** Runs before every page's own scripts: the stylesheet that keeps the known overlays out of sight. */
export const OVERLAY_SCRIPT = `(() => {
  const css = ${JSON.stringify(`${HIDE.join(",\n")} { display: none !important; visibility: hidden !important; }`)};
  const add = () => {
    if (document.getElementById("__wc-overlays")) return;
    const style = document.createElement("style");
    style.id = "__wc-overlays";
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  };
  if (document.documentElement) add();
  else document.addEventListener("DOMContentLoaded", add, { once: true });
})();`;

/** In the page: accept consent and close a marketing pop-up. Returns what it did, for the trace. */
function clearInPage(accept: string[]): string[] {
  const did: string[] = [];
  const visible = (el: Element) => {
    const r = (el as HTMLElement).getBoundingClientRect();
    const s = getComputedStyle(el as HTMLElement);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const ours = (el: Element) => Boolean(el.closest("[data-walkcast]"));
  // Each button is pressed once: a tool's accept button often stays in the page after it worked,
  // and pressing it on every page would also hide a second banner from the steps below.
  const pressed = (el: Element) => (el as HTMLElement).dataset.wcPressed === "1";
  const press = (el: Element, what: string) => {
    if (ours(el) || pressed(el)) return false;
    (el as HTMLElement).dataset.wcPressed = "1";
    (el as HTMLElement).click();
    did.push(what);
    return true;
  };
  // 1. A known consent tool's accept button (hidden or not: the stylesheet may already hide it).
  for (const sel of accept) {
    const el = document.querySelector(sel);
    if (el && press(el, `consent:${sel}`)) break;
  }
  // 2. An unknown banner: an accept-shaped button inside a cookie or consent container.
  {
    const words = /^(accept( all)?( cookies)?|allow( all)?( cookies)?|agree|i agree|got it|ok(ay)?|i understand)$/i;
    const container = /cookie|consent|gdpr|privacy-banner|cc-banner/i;
    for (const btn of Array.from(document.querySelectorAll("button, a[role='button'], [role='button']"))) {
      const text = (btn.textContent || "").trim().replace(/\s+/g, " ");
      if (!words.test(text) || !visible(btn)) continue;
      let host: Element | null = btn;
      let match = false;
      for (let i = 0; host && i < 8; i++, host = host.parentElement) {
        if (container.test(`${host.id} ${typeof host.className === "string" ? host.className : ""} ${host.getAttribute("aria-label") || ""}`)) {
          match = true;
          break;
        }
      }
      if (match && press(btn, `consent:"${text}"`)) break;
    }
  }
  // 3. A marketing pop-up: a visible dialog about newsletters or discounts, closed by its own button.
  const pitch = /newsletter|subscribe|sign up for|discount|% off|join our|get notified/i;
  for (const dialog of Array.from(document.querySelectorAll("[role='dialog'], [aria-modal='true'], .modal.show, .popup"))) {
    if (ours(dialog) || !visible(dialog) || !pitch.test(dialog.textContent || "")) continue;
    if (dialog.querySelector("input[type='password']")) continue; // a sign-in dialog is the site, not a pitch
    const close = Array.from(dialog.querySelectorAll("button, [role='button'], a")).find((b) =>
      /close|dismiss|no thanks|not now|maybe later|^[×✕x]$/i.test(`${b.getAttribute("aria-label") || ""} ${(b.textContent || "").trim()}`.trim()),
    );
    if (close) press(close, "popup:closed");
  }
  return did;
}

/**
 * Accept the page's consent banner and close a marketing pop-up, quietly. Never throws: a page
 * that refuses is recorded as it is.
 */
export async function clearOverlays(page: Page): Promise<string[]> {
  if (!overlaysEnabled()) return [];
  // The in-page function is compiled TypeScript and may call esbuild's __name helper; make sure
  // the page has it, whoever opened the page.
  await page.evaluate("window.__name = window.__name || ((fn) => fn)").catch(() => undefined);
  const did = await page.evaluate(clearInPage, ACCEPT).catch(() => [] as string[]);
  // A consent click can reflow the page or lift a scroll lock: give it a moment to settle.
  if (did.length) await page.waitForTimeout(250).catch(() => undefined);
  return did;
}
