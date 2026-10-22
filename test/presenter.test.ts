import assert from "node:assert/strict";
import { test } from "node:test";
import { briefLine, tourLine } from "../packages/core/src/record/brief.ts";
import { registerSecret, unregisterSecret } from "../packages/core/src/capture/secrets.ts";
import { captionsFor } from "../packages/core/src/record/narration.ts";
import type { TraceEvent } from "../packages/core/src/capture/recorder.ts";

/**
 * The presenter narration.
 *
 * It reads out what each page says about itself, quoted, and nothing else. The page-opening
 * line keeps its "Opening …" shape because chapters are built from it, a credential on the page
 * is never spoken, and the plain style still says only what the browser did.
 */

const brief = {
  h1: "From first enquiry to possession, on one screen.",
  tagline: "Leads, WhatsApp, site visits and cost sheets in one place. Open it at 9 AM and it tells your team who to call.",
  cta: "Start your 14-day trial",
  sections: ["Inventory", "Bookings", "Pricing", "FAQ", "Contact"],
  prices: ["₹1,499/month", "₹2,999/month"],
};

test("the opening line quotes the headline, the first sentence under it and the main button", () => {
  assert.equal(
    briefLine(brief),
    "It opens with “From first enquiry to possession, on one screen”. Leads, WhatsApp, site visits and cost sheets in one place. The main button says “Start your 14-day trial”.",
  );
  assert.equal(briefLine({ sections: [], prices: [] }), null);
});

test("the scroll line names what is further down and the prices shown", () => {
  assert.equal(tourLine(brief), "Further down: Inventory, Bookings and Pricing. Prices on the page include ₹1,499/month and ₹2,999/month.");
  assert.equal(tourLine({ sections: [], prices: [] }), null);
});

test("a credential on the page is never read out", () => {
  registerSecret("site_username", "kunj@example.com");
  try {
    assert.equal(briefLine({ h1: "Welcome back, kunj@example.com", sections: [], prices: [] }), null);
  } finally {
    unregisterSecret("site_username");
  }
});

const ctx = { videoStart: 0, signIn: { attempted: false, outcome: "not-attempted" as const, detail: "" }, pages: [], origin: "https://estate.test" };
const step = (stepId: number, tool: string, at: number, extra: Record<string, unknown> = {}): TraceEvent =>
  ({ type: "step", stepId, tool, args: {}, startedAt: at, endedAt: at + 100, before: { url: "https://estate.test/", title: "Estate", fingerprint: "x" }, after: null, ...extra }) as unknown as TraceEvent;
const events: TraceEvent[] = [
  step(1, "goto", 0, { args: { path: "https://estate.test/" } }),
  step(2, "brief", 2000, { result: brief }),
  step(3, "scroll", 6000),
];

test("presenter is the default, and the page still opens with an “Opening” line for chapters", () => {
  const lines = captionsFor(events, ctx).map((c) => c.text);
  assert.equal(lines[0], "Opening estate.test.");
  assert.match(lines[1]!, /^It opens with “From first enquiry/);
  assert.match(lines[2]!, /^Further down: Inventory/);
  assert.match(lines.at(-1)!, /^That's the tour/);
});

test("the plain style says only what the browser did", () => {
  const lines = captionsFor(events, { ...ctx, style: "plain" }).map((c) => c.text);
  assert.equal(lines.length, 3);
  assert.match(lines[1]!, /^Scrolling through "Estate"/);
  assert.match(lines[2]!, /^Recording finished/);
});
