import assert from "node:assert/strict";
import { test } from "node:test";
import { guideHtml, guideMarkdown, guideSteps } from "../packages/core/src/record/guide.ts";

/**
 * The step-by-step guide.
 *
 * The same visit as numbered steps with a picture each. The order has to be the order things
 * happened, a password is named but never shown, and every string from the recorded site is
 * escaped before it reaches the HTML.
 */

const pages = [
  { url: "https://shop.test/dashboard", title: "Dashboard", status: 200, screenshot: "page-01.jpg" },
  { url: "https://shop.test/orders", title: "Orders", status: 200, screenshot: "page-02.jpg" },
];
const actions = [
  { at: 1, kind: "fill" as const, name: "Email", url: "https://shop.test/login", shot: "step-01.jpg" },
  { at: 2, kind: "fill" as const, name: "Password", url: "https://shop.test/login", shot: "step-02.jpg", secret: true },
  { at: 3, kind: "click" as const, name: "Sign in", url: "https://shop.test/login", shot: "step-03.jpg" },
  { at: 9, kind: "click" as const, name: "Export", url: "https://shop.test/orders", shot: "step-04.jpg" },
];

test("the sign-in comes first, then each page and what was done on it", () => {
  const steps = guideSteps(pages, actions);
  assert.deepEqual(
    steps.map((s) => s.title),
    ["Fill in “Email”", "Enter your password in “Password”", "Click “Sign in”", "Open Dashboard", "Go to Orders", "Click “Export”"],
  );
  assert.deepEqual(steps.map((s) => s.n), [1, 2, 3, 4, 5, 6]);
  assert.equal(steps[4]!.image, "page-02.jpg");
});

test("a recording with no actions is a guide of its pages", () => {
  const steps = guideSteps(pages, []);
  assert.equal(steps.length, 2);
  assert.equal(steps[0]!.title, "Open Dashboard");
});

test("page steps carry the moment the page opened when the caller knows it", () => {
  const steps = guideSteps(
    pages.map((p, i) => ({ ...p, at: i === 0 ? 0 : 12 })),
    actions,
  );
  assert.equal(steps.find((s) => s.title === "Open Dashboard")?.at, 0);
  assert.equal(steps.find((s) => s.title === "Go to Orders")?.at, 12);
  // Action steps keep their own moment, not the page's.
  assert.equal(steps.find((s) => s.title === "Click “Export”")?.at, 9);
});

test("Markdown links each picture from where it is served", () => {
  const md = guideMarkdown({ url: "https://shop.test/", steps: guideSteps(pages, actions), imageBase: "http://127.0.0.1:4317/files/recordings/x/" });
  assert.match(md, /^# How to: shop\.test/);
  assert.match(md, /## 6\. Click “Export”/);
  assert.match(md, /!\[Step 1: Fill in “Email”\]\(http:\/\/127\.0\.0\.1:4317\/files\/recordings\/x\/step-01\.jpg\)/);
});

test("text from the site is escaped in the HTML", () => {
  const html = guideHtml({
    url: "https://shop.test/",
    steps: guideSteps([{ url: "https://shop.test/x", title: '<img src=x onerror="alert(1)">' }], []),
    imageBase: "/files/recordings/x/",
  });
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
});
