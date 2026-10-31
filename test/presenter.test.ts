import assert from "node:assert/strict";
import { test } from "node:test";
import { briefLine, tourLine, actionsLine, formLine } from "../packages/core/src/record/brief.ts";
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
  assert.equal(tourLine(brief), "Further down: Inventory, Bookings, Pricing and FAQ. Prices on the page include ₹1,499/month and ₹2,999/month.");
  assert.equal(tourLine({ sections: [], prices: [] }), null);
});

test("a page that asks for something is spoken as the form it is, never as what was typed", () => {
  assert.equal(formLine({ sections: [], prices: [], fields: ["Email", "Password"] }), "It has a form asking for Email and Password.");
  assert.equal(formLine({ sections: [], prices: [], fields: ["Email"] }), "It has a form asking for Email.");
  assert.equal(formLine({ sections: [], prices: [], fields: [] }), null);
  assert.equal(formLine({ sections: [], prices: [], fields: ["Email", "{{secret:site_password}}"] }), "It has a form asking for Email.", "a field named after a credential placeholder is not spoken");
});

test("an app screen with no prose to tour is spoken as what it offers", () => {
  assert.equal(actionsLine({ sections: [], prices: [], actions: ["New lead", "Filters", "Export"] }), "On this screen: New lead, Filters and Export.");
  assert.equal(actionsLine({ sections: ["Pricing"], prices: [], actions: ["New lead", "Filters"] }), null, "a page with sections says what is further down instead");
  assert.equal(actionsLine({ sections: [], prices: [], actions: ["Only one"] }), null, "one control is not a screen worth describing");
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

test("a page that asks for input is spoken as a form as well as a headline", () => {
  const withForm: TraceEvent[] = [
    step(1, "goto", 0, { args: { path: "https://estate.test/sign-in" } }),
    step(2, "brief", 1000, { result: { ...brief, fields: ["Email", "Password"] } }),
  ];
  const lines = captionsFor(withForm, ctx).map((c) => c.text);
  assert.match(lines[1]!, /^It opens with/);
  assert.equal(lines[2], "It has a form asking for Email and Password.");
});

test("a journey's later steps are spoken as they happened, including the ones that did not", () => {
  const journey: TraceEvent[] = [
    step(1, "goto", 0, { args: { path: "https://estate.test/" } }),
    step(2, "hover", 1000, { args: { name: "Features" } }),
    step(3, "press", 2000, { args: { key: "Tab" } }),
    step(4, "expectText", 3000, { args: { text: "Saved" }, result: true }),
    step(5, "waitForText", 4000, { args: { text: "Reports" }, result: false }),
    step(6, "journeyStep", 5000, { args: { kind: "click", name: "Reports", found: false, why: "No control named “Reports” on this page" } }),
  ];
  const lines = captionsFor(journey, ctx).map((c) => c.text);
  assert.equal(lines[1], "Hovering over “Features” to open what it holds.");
  assert.equal(lines[2], "Pressing Tab.");
  assert.equal(lines[3], "The page says “Saved”.");
  assert.equal(lines[4], "Waiting for “Reports”. It never appeared.");
  assert.equal(lines[5], "No control named “Reports” on this page.");
});
