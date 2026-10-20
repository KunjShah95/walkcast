import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeRecording, diffRecordings, summaryMarkdown, type RecordingFacts, type RecordingInsights } from "../packages/core/src/record/insights.ts";
import type { TraceEvent } from "../packages/core/src/capture/recorder.ts";

/**
 * What the recorder found, and what changed between two walkthroughs.
 *
 * The recorder has been capturing console errors, failed requests, page timings and the
 * controls on every page since the beginning. Nothing read them. These tests hold the
 * analysis to one rule: it reports what the trace says, and it says nothing else.
 */

/** One navigation, one page's worth of events. */
function walk(
  pages: { path: string; title: string; status: number | null; controls: { role: string; name: string }[]; loadMs: number; links: number }[],
  extras: TraceEvent[] = [],
): { facts: RecordingFacts; events: TraceEvent[] } {
  const events: TraceEvent[] = [];
  let at = 0;
  let stepId = 0;
  const factsPages: RecordingFacts["pages"] = [];
  for (const page of pages) {
    const url = `https://shop.example${page.path}`;
    stepId += 1;
    events.push({
      type: "step",
      stepId,
      tool: "goto",
      args: { path: url },
      startedAt: at,
      endedAt: at + page.loadMs,
      before: { url: "about:blank", title: "", fingerprint: "" },
      after: { url, title: page.title, fingerprint: "fp" },
    });
    const loadEnd = at + page.loadMs;
    at = loadEnd;
    stepId += 1;
    events.push({
      type: "step",
      stepId,
      tool: "observe",
      args: {},
      startedAt: at,
      endedAt: at + 40,
      before: { url, title: page.title, fingerprint: "fp" },
      after: { url, title: page.title, fingerprint: "fp" },
      result: { elements: page.controls.length, fingerprint: `fp-${page.path}`, controls: page.controls },
    });
    at += 40;
    stepId += 1;
    events.push({
      type: "step",
      stepId,
      tool: "collectLinks",
      args: {},
      startedAt: at,
      endedAt: at + 10,
      before: { url, title: page.title, fingerprint: "fp" },
      after: { url, title: page.title, fingerprint: "fp" },
      result: { links: page.links },
    });
    at += 10;
    events.push({
      type: "request",
      stepId,
      at: loadEnd - 20,
      method: "GET",
      url,
      status: page.status ?? undefined,
      respondedAt: loadEnd - 5,
    });
    factsPages.push({ url, title: page.title, status: page.status, controls: page.controls.length });
  }
  events.push(...extras);
  return {
    facts: {
      id: "walk-1",
      url: "https://shop.example/",
      createdAt: "2026-10-20T10:00:00.000Z",
      durationMs: 12_000,
      pages: factsPages,
    },
    events,
  };
}

test("the analysis reports the console errors, failed requests and page timings the trace holds", () => {
  const { facts, events } = walk(
    [
      { path: "/", title: "Shop", status: 200, controls: [{ role: "link", name: "Pricing" }], loadMs: 420, links: 12 },
      { path: "/pricing", title: "Pricing", status: 404, controls: [], loadMs: 90, links: 3 },
    ],
    [
      { type: "console", stepId: 1, at: 500, level: "error", text: "Uncaught TypeError: x is not a function" },
      { type: "request", stepId: 2, at: 900, method: "GET", url: "https://shop.example/api/quotes", status: 500, respondedAt: 940 },
    ],
  );
  const insights = analyzeRecording(facts, events);

  assert.equal(insights.pages.length, 2);
  assert.equal(insights.pages[0]!.loadMs, 420);
  assert.equal(insights.pages[0]!.firstResponseMs, 15);
  assert.equal(insights.pages[0]!.links, 12);
  assert.equal(insights.pages[0]!.requests, 1);
  assert.equal(insights.pages[1]!.status, 404);

  assert.equal(insights.totals.consoleErrors, 1);
  assert.equal(insights.failedRequests.length, 1);
  assert.equal(insights.failedRequests[0]!.status, 500);

  const said = insights.findings.map((f) => f.text).join("\n");
  assert.match(said, /1 console error/);
  assert.match(said, /Uncaught TypeError/);
  assert.match(said, /\/pricing answered 404/);
  assert.match(said, /slowest page was \/ \(0\.4 s to load\)/);
});

test("a page with no title is a warning, and a clean walkthrough says so plainly", () => {
  const { facts, events } = walk([{ path: "/", title: "", status: 200, controls: [], loadMs: 100, links: 0 }]);
  const insights = analyzeRecording(facts, events);
  assert.ok(insights.findings.some((f) => /has no title/.test(f.text)));

  const cleanWalk = walk([{ path: "/", title: "Shop", status: 200, controls: [{ role: "link", name: "Pricing" }], loadMs: 100, links: 4 }]);
  const clean = analyzeRecording(cleanWalk.facts, cleanWalk.events);
  assert.ok(clean.findings.some((f) => /No console errors, no failed requests/.test(f.text)));
});

test("two walkthroughs of the same site show what changed", () => {
  const before = walk([
    { path: "/", title: "Shop", status: 200, controls: [{ role: "link", name: "Pricing" }, { role: "button", name: "Buy" }], loadMs: 100, links: 4 },
    { path: "/pricing", title: "Pricing", status: 200, controls: [{ role: "button", name: "Buy" }], loadMs: 100, links: 2 },
  ]);
  const after = walk([
    { path: "/", title: "Shop", status: 200, controls: [{ role: "link", name: "Pricing" }, { role: "button", name: "Buy now" }], loadMs: 100, links: 4 },
    { path: "/pricing", title: "Prices", status: 500, controls: [], loadMs: 100, links: 0 },
    { path: "/new", title: "New", status: 200, controls: [], loadMs: 100, links: 1 },
  ]);

  const a: RecordingInsights = analyzeRecording(before.facts, before.events);
  const b: RecordingInsights = analyzeRecording(after.facts, after.events);
  const diff = diffRecordings(
    { id: "old", url: before.facts.url, createdAt: "2026-10-19T10:00:00.000Z", insights: a },
    { id: "new", url: after.facts.url, createdAt: "2026-10-20T10:00:00.000Z", insights: b },
  );

  assert.deepEqual(diff.pages.added, ["/new"]);
  assert.deepEqual(diff.pages.removed, []);
  assert.equal(diff.pages.titles[0]!.path, "/pricing");
  assert.equal(diff.pages.titles[0]!.to, "Prices");
  assert.equal(diff.pages.statuses[0]!.to, 500);
  assert.ok(diff.pages.controls.some((c) => c.path === "/" && c.added.some((a) => a.includes("Buy now"))));
  assert.ok(diff.pages.controls.some((c) => c.path === "/" && c.removed.some((r) => r.includes("Buy"))));
  assert.ok(diff.changed > 0);
  assert.ok(diff.summary.some((s) => /appeared: \/new/.test(s)));
  assert.ok(diff.summary.some((s) => /now answers 500/.test(s)));
});

test("two walkthroughs that saw the same site differ in nothing", () => {
  const { facts, events } = walk([{ path: "/", title: "Shop", status: 200, controls: [{ role: "link", name: "Pricing" }], loadMs: 100, links: 4 }]);
  const insights = analyzeRecording(facts, events);
  const diff = diffRecordings(
    { id: "one", url: facts.url, createdAt: "2026-10-19T10:00:00.000Z", insights },
    { id: "two", url: facts.url, createdAt: "2026-10-20T10:00:00.000Z", insights },
  );
  assert.equal(diff.changed, 0);
  assert.match(diff.summary[0]!, /Nothing changed/);
});

test("controls a person cannot name are reported, and links that say nothing are noted", () => {
  const { facts, events } = walk([
    {
      path: "/contact",
      title: "Contact",
      status: 200,
      // Two fields with no label, a button with nothing on it, and a link that says "click here".
      controls: [
        { role: "textbox", name: "" },
        { role: "textbox", name: "" },
        { role: "button", name: "" },
        { role: "link", name: "Click here" },
        { role: "link", name: "Pricing" },
      ],
      loadMs: 100,
      links: 2,
    },
  ]);
  const insights = analyzeRecording(facts, events);
  const said = insights.findings.map((f) => f.text).join("\n");
  assert.match(said, /2 form fields with no name/);
  assert.match(said, /1 button with no name/);
  assert.match(said, /1 link whose text says nothing/);
  // The page row carries the same counts, so the table can show them.
  const page = insights.pages[0]!;
  assert.deepEqual(page.unnamed, [{ role: "textbox", count: 2 }, { role: "button", count: 1 }]);
  assert.deepEqual(page.vagueLinks, ["Click here"]);
});

test("the notes read as a note someone can paste into a ticket", () => {  const { facts, events } = walk([{ path: "/pricing", title: "Pricing", status: 200, controls: [], loadMs: 1200, links: 2 }]);
  const insights = analyzeRecording(facts, events);
  const md = summaryMarkdown(facts, insights);
  assert.match(md, /# Walkthrough — shop\.example/);
  assert.match(md, /- `\/pricing` — Pricing/);
  assert.match(md, /## What the recorder found/);
});
