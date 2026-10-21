import assert from "node:assert/strict";
import { test } from "node:test";
import { checklist, checklistMarkdown } from "../packages/core/src/record/checklist.ts";
import { analyzeRecording, type RecordingFacts, type RecordingInsights } from "../packages/core/src/record/insights.ts";
import type { TraceEvent } from "../packages/core/src/capture/recorder.ts";

/**
 * What to fix, gathered from every walkthrough of a site.
 *
 * The list has to be worth reading: the things that are still broken, the things that are
 * new, and nothing that is not there. A finding that appears in every walkthrough is one
 * item, not one per walkthrough.
 */

/** A walkthrough with the given pages and console errors. */
function walk(pages: { path: string; status: number; title?: string; fields?: number }[], errors: string[] = []): RecordingInsights {
  const events: TraceEvent[] = [];
  const factsPages: RecordingFacts["pages"] = [];
  let at = 0;
  for (const page of pages) {
    const url = `https://shop.example${page.path}`;
    events.push({ type: "step", stepId: 1, tool: "goto", args: { path: url }, startedAt: at, endedAt: at + 100, before: null, after: { url, title: page.title ?? "Shop", fingerprint: "f" } });
    events.push({
      type: "step",
      stepId: 2,
      tool: "observe",
      args: {},
      startedAt: at + 100,
      endedAt: at + 140,
      before: null,
      after: { url, title: page.title ?? "Shop", fingerprint: "f" },
      result: {
        elements: 1,
        fingerprint: "f",
        controls: Array.from({ length: page.fields ?? 0 }, () => ({ role: "textbox", name: "" })),
      },
    });
    at += 200;
    for (const text of errors) events.push({ type: "console", stepId: 1, at, level: "error", text });
    factsPages.push({ url, title: page.title ?? "Shop", status: page.status, controls: 1 });
  }
  return analyzeRecording({ url: "https://shop.example/", durationMs: 1000, pages: factsPages }, events);
}

test("the same problem in two walkthroughs is one item, seen twice", () => {
  const a = walk([{ path: "/", status: 200 }], ["TypeError: x is not a function"]);
  const b = walk([{ path: "/", status: 200 }], ["TypeError: x is not a function"]);
  const items = checklist([a, b]);
  const error = items.find((i) => i.id.startsWith("console:"));
  assert.ok(error, "the console error is on the list");
  assert.equal(error!.seen, 2);
  assert.equal(error!.count, 2);
  assert.equal(error!.isNew, false, "it was in the walkthrough before the last one");
});

test("something that appeared in the latest walkthrough is new", () => {
  const before = walk([{ path: "/", status: 200 }]);
  const after = walk([{ path: "/", status: 500 }]);
  const items = checklist([before, after]);
  const broken = items.find((i) => i.id === "status:/");
  assert.ok(broken, "the broken page is on the list");
  assert.equal(broken!.isNew, true);
  assert.equal(broken!.level, "fail");
});

test("the list is ordered by what is worth doing first", () => {
  const one = walk([
    { path: "/", status: 200, fields: 2 },
    { path: "/pricing", status: 500 },
  ]);
  const items = checklist([one]);
  assert.equal(items[0]!.level, "fail", "the broken page comes first");
  assert.ok(items.some((i) => i.id === "unnamed:textbox"), "the unnamed fields are on the list");
});

test("the list as a note reads like a note", () => {
  const one = walk([{ path: "/pricing", status: 500 }]);
  const items = checklist([one]);
  const md = checklistMarkdown(items, "shop.example", 1);
  assert.match(md, /# shop\.example — what to fix/);
  assert.match(md, /- \[ \] \*\*\/pricing answers 500\*\*/);
  assert.match(md, /From 1 walkthrough of shop\.example/);

  const nothing = checklistMarkdown(checklist([walk([{ path: "/", status: 200 }])]), "shop.example", 1);
  assert.match(nothing, /Nothing to fix/);
});
