import assert from "node:assert/strict";
import { test } from "node:test";
import { allScenarios, normalizeScenario, parseScenario, scenarioTaskPossible } from "../packages/core/src/app/faults.ts";
import { compareRuns, type RecordedRun } from "../packages/core/src/lab/diff.ts";

test("scenarios are canonical, validated, and the grid has the control, singles and every pair", () => {
  assert.equal(normalizeScenario("ui-drift+stale-owners"), "stale-owners+ui-drift");
  assert.equal(normalizeScenario("none"), "none");
  assert.deepEqual(parseScenario("session-expiry+session-expiry"), ["session-expiry"]);
  assert.throws(() => parseScenario("ui-drift+bogus"), /Unknown fault 'bogus'/);
  assert.equal(scenarioTaskPossible("silent-owner-drop+ui-drift"), false);
  assert.equal(scenarioTaskPossible("stale-owners+ui-drift"), true);
  assert.equal(allScenarios("singles").length, 6);
  assert.equal(allScenarios("pairs").length, 16);
});

const form = (submit: { name: string; selector: string }) => [
  { role: "textbox", name: "Contact name", selector: "#contact" },
  { role: "textbox", name: "Company", selector: "#company" },
  { role: "combobox", name: "Owner", selector: "#owner" },
  { role: "button", ...submit },
];

function run(id: string, verdict: "pass" | "fail", submit: { name: string; selector: string }, clickError?: string): RecordedRun {
  const url = "http://127.0.0.1:1/leads/new";
  const step = (stepId: number, tool: string, args: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    type: "step",
    stepId,
    tool,
    args,
    startedAt: stepId * 10,
    endedAt: stepId * 10 + 5,
    before: { url, title: "", fingerprint: "x" },
    after: { url, title: "", fingerprint: "x" },
    ...extra,
  });
  return {
    result: {
      runId: id,
      agent: "v0",
      fault: verdict === "pass" ? "none" : "ui-drift",
      durationMs: 1000,
      steps: 4,
      modelCalls: 0,
      diagnosis: { verdict, findings: verdict === "pass" ? [] : [{ label: "locator-not-found", kind: "cause" }] },
      oracle: { taskPassed: verdict === "pass", claimHonest: true, checks: [{ name: "exactly-one-lead", passed: verdict === "pass", actual: verdict === "pass" ? 1 : 0 }] },
    },
    events: [
      step(1, "observe", {}, { result: { elements: 4, fingerprint: "x", controls: form(submit) } }),
      step(2, "fill", { index: 0, name: "Contact name", value: "Jane Roe" }),
      step(3, "clickSelector", { selector: "#save-lead" }, clickError ? { error: clickError } : {}),
    ],
  };
}

test("a site change: the broken click, the relabelled button, and the suggested replacement", () => {
  const baseline = run("base", "pass", { name: "Save lead", selector: "#save-lead" });
  const candidate = run("cand", "fail", { name: "Create", selector: "#create-lead-v2" }, "page.click: Timeout 2000ms exceeded.");
  const r = compareRuns(baseline, candidate);
  assert.equal(r.firstDivergence, 3);
  assert.equal(r.broken.length, 1);
  assert.equal(r.broken[0]!.was?.selector, "#save-lead");
  assert.equal(r.broken[0]!.suggestion?.control.selector, "#create-lead-v2");
  assert.equal(r.pages[0]!.renamed[0]!.to.name, "Create");
  assert.deepEqual(r.outcome.newFindings, ["locator-not-found"]);
  assert.match(r.summary, /likely replacement/);
});

test("identical runs report no divergence and no breakage", () => {
  const a = run("a", "pass", { name: "Save lead", selector: "#save-lead" });
  const r = compareRuns(a, run("b", "pass", { name: "Save lead", selector: "#save-lead" }));
  assert.equal(r.firstDivergence, null);
  assert.deepEqual(r.broken, []);
  assert.deepEqual(r.pages, []);
});
