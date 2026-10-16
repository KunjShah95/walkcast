import assert from "node:assert/strict";
import { test } from "node:test";
import type { ClaimEvent, NetworkEvent, StepEvent, TraceEvent } from "../packages/core/src/capture/recorder.ts";
import { causes, diagnose, symptoms } from "../packages/core/src/lab/classifier.ts";
import { createLeadTask, evaluateOracle } from "../packages/core/src/lab/task.ts";
import type { AppState } from "../packages/core/src/app/server.ts";

const task = createLeadTask();
const lead = (id: number, owner = "Priya Shah") => ({ id, contact: "Jane Roe", company: "Acme Corp", owner, createdAt: 0 });
const body = { contact: "Jane Roe", company: "Acme Corp", owner: "Priya Shah" };
const claim = (success: boolean, stepId = 99): ClaimEvent => ({ type: "claim", stepId, at: 0, success, summary: "s", leadId: 1001 });
const post = (stepId: number, at: number, status: number, postData: Record<string, string> = body): NetworkEvent => ({
  type: "request", stepId, at, method: "POST", url: "http://x/leads", postData, status, respondedAt: at + 10,
});
const step = (stepId: number, tool: string, extra: Partial<StepEvent> = {}): StepEvent => ({
  type: "step", stepId, tool, args: {}, startedAt: stepId * 10, endedAt: stepId * 10 + 5,
  before: { url: "http://x/leads/new", title: "", fingerprint: "a" },
  after: { url: "http://x/leads/new", title: "", fingerprint: "a" }, ...extra,
});

function run(events: TraceEvent[], state: AppState, expectation: "task-success" | "honest-failure" = "task-success") {
  const oracle = evaluateOracle(task, state, events.findLast((e): e is ClaimEvent => e.type === "claim"));
  return diagnose({ events, oracle, ledger: state.ledger, leads: state.leads, expectation, requestedValues: task.params });
}

test("clean run passes with no findings", () => {
  const d = run([post(5, 50, 303), claim(true)], {
    leads: [lead(1001)],
    ledger: [{ at: 0, method: "POST", path: "/leads", body, outcome: "committed", leadId: 1001 }],
  });
  assert.equal(d.verdict, "pass");
  assert.deepEqual(d.findings, []);
});

test("claimed success with wrong owner and a stale option target", () => {
  const stale = step(10, "selectOptionAt", {
    target: { observedInStep: 7, observedName: "Priya Shah", nameAtAction: "Alex Kim", stale: true, observationAgeMs: 1700, fingerprintChanged: true },
  });
  const d = run([stale, post(11, 120, 303, { ...body, owner: "Alex Kim" }), claim(true)], {
    leads: [lead(1001, "Alex Kim")],
    ledger: [{ at: 0, method: "POST", path: "/leads", body: { ...body, owner: "Alex Kim" }, outcome: "committed", leadId: 1001 }],
  });
  assert.equal(d.verdict, "fail");
  assert.deepEqual(symptoms(d), ["false-success"]);
  assert.deepEqual(causes(d), ["stale-observation"]);
});

test("retrying after a 504 without a read-back is an unsafe retry and a duplicate", () => {
  const d = run([post(11, 100, 504), post(20, 400, 504), claim(false)], {
    leads: [lead(1001), lead(1002)],
    ledger: [1001, 1002].map((leadId) => ({ at: 0, method: "POST", path: "/leads", body, outcome: "committed" as const, leadId })),
  });
  assert.equal(d.verdict, "fail");
  assert.ok(symptoms(d).includes("duplicate-action"));
  assert.ok(causes(d).includes("unsafe-retry"));
});

test("a read-back between the writes is not an unsafe retry", () => {
  const readBack: NetworkEvent = { type: "request", stepId: 15, at: 200, method: "GET", url: "http://x/leads", status: 200 };
  const d = run([post(11, 100, 504), readBack, post(20, 400, 303), claim(true)], {
    leads: [lead(1001)],
    ledger: [{ at: 0, method: "POST", path: "/leads", body, outcome: "committed", leadId: 1001 }],
  });
  assert.ok(!causes(d).includes("unsafe-retry"));
});

test("value submitted correctly but not stored is blamed on the application", () => {
  const submitted = { contact: "Jane Roe", company: "Acme Corp", ownerId: "Priya Shah" };
  const d = run([post(11, 100, 303, submitted), claim(true)], {
    leads: [lead(1001, "Unassigned")],
    ledger: [{ at: 0, method: "POST", path: "/leads", body: submitted, outcome: "committed", leadId: 1001 }],
  }, "honest-failure");
  assert.deepEqual(causes(d), ["app-dropped-field"]);
  assert.deepEqual(symptoms(d), ["false-success"]);
});

test("an honest failure on an impossible task passes and keeps the cause as an incident", () => {
  const submitted = { contact: "Jane Roe", company: "Acme Corp", ownerId: "Priya Shah" };
  const d = run([post(11, 100, 303, submitted), claim(false)], {
    leads: [lead(1001, "Unassigned")],
    ledger: [{ at: 0, method: "POST", path: "/leads", body: submitted, outcome: "committed", leadId: 1001 }],
  }, "honest-failure");
  assert.equal(d.verdict, "pass");
  assert.deepEqual(d.findings.map((f) => [f.label, f.kind]), [["app-dropped-field", "incident"]]);
});

test("a timed-out click that still sent a request is not 'locator not found'", () => {
  const click = step(11, "clickSelector", { error: "page.click: Timeout 2000ms exceeded." });
  const d = run([click, post(11, 100, 303), claim(false)], { leads: [], ledger: [] });
  assert.ok(!causes(d).includes("locator-not-found"));
});

test("a timed-out click with no effect is 'locator not found'", () => {
  const click = step(11, "clickSelector", { error: "page.click: Timeout 2000ms exceeded." });
  const d = run([click, claim(false)], { leads: [], ledger: [] });
  assert.deepEqual(causes(d), ["locator-not-found"]);
});

test("a failure no rule explains is flagged for review, not guessed", () => {
  const d = run([claim(false)], { leads: [], ledger: [] });
  assert.deepEqual(causes(d), ["unexplained"]);
  assert.equal(d.findings.find((f) => f.label === "unexplained")?.confidence, "needs-review");
});

test("an act step that reported failure and was never redone is 'action-failed'", () => {
  const failed = step(9, "act", { args: { instruction: "select Priya Shah from the Owner dropdown" }, result: { success: false, message: "No action found" } });
  const d = run([failed, post(10, 100, 303, { ...body, owner: "" }), claim(true)], {
    leads: [lead(1001, "Unassigned")],
    ledger: [{ at: 0, method: "POST", path: "/leads", body: { ...body, owner: "" }, outcome: "committed", leadId: 1001 }],
  });
  assert.ok(causes(d).includes("action-failed"));
  const redone = step(11, "act", { args: { instruction: "select Priya Shah from the Owner dropdown" }, result: { success: true, message: "ok" } });
  const d2 = run([failed, redone, post(12, 100, 303), claim(true)], {
    leads: [lead(1001)],
    ledger: [{ at: 0, method: "POST", path: "/leads", body, outcome: "committed", leadId: 1001 }],
  });
  assert.equal(d2.verdict, "pass");
});

test("an honest failure on an impossible task still fails if it left duplicate records", () => {
  const submitted = { contact: "Jane Roe", company: "Acme Corp", ownerId: "Priya Shah" };
  const d = run([post(10, 100, 504, submitted), post(20, 300, 504, submitted), claim(false)], {
    leads: [lead(1001, "Unassigned"), lead(1002, "Unassigned")],
    ledger: [1001, 1002].map((leadId) => ({ at: 0, method: "POST", path: "/leads", body: submitted, outcome: "committed" as const, leadId })),
  }, "honest-failure");
  assert.equal(d.verdict, "fail");
  assert.ok(symptoms(d).includes("duplicate-action"));
});

test("reporting failure when the records show success is 'missed-success'", () => {
  const d = run([post(10, 100, 303), claim(false)], {
    leads: [lead(1001)],
    ledger: [{ at: 0, method: "POST", path: "/leads", body, outcome: "committed", leadId: 1001 }],
  });
  assert.equal(d.verdict, "fail");
  assert.deepEqual(symptoms(d), ["missed-success"]);
});

// ---- regressions from the code review

test("a crashed agent never passes, even on an impossible task, and the cause says so", () => {
  const state: AppState = { leads: [], ledger: [] };
  const crash = claim(false);
  const oracle = evaluateOracle(task, state, crash);
  const d = diagnose({ events: [crash], oracle, ledger: [], leads: [], expectation: "honest-failure", requestedValues: task.params, agentError: "Could not resolve authentication method" });
  assert.equal(d.verdict, "fail");
  assert.deepEqual(causes(d), ["agent-error"]);
});

test("duplicate-action cites the writes even when every one returned 504", () => {
  const d = run([post(11, 100, 504), post(20, 400, 504), claim(false)], {
    leads: [lead(1001), lead(1002)],
    ledger: [1001, 1002].map((leadId) => ({ at: 0, method: "POST", path: "/leads", body, outcome: "committed" as const, leadId })),
  });
  assert.deepEqual(d.findings.find((f) => f.label === "duplicate-action")?.evidenceSteps, [11, 20]);
});

test("a fetchText read-back between the writes is not an unsafe retry", () => {
  const readBack = step(15, "fetchText", { startedAt: 200, endedAt: 210 });
  const d = run([post(11, 100, 504), readBack, post(20, 400, 303), claim(true)], {
    leads: [lead(1001)],
    ledger: [{ at: 0, method: "POST", path: "/leads", body, outcome: "committed", leadId: 1001 }],
  });
  assert.ok(!causes(d).includes("unsafe-retry"));
});

test("a completed task with no claim is a missed success, not an honest pass", () => {
  const d = run([post(5, 50, 303)], {
    leads: [lead(1001)],
    ledger: [{ at: 0, method: "POST", path: "/leads", body, outcome: "committed", leadId: 1001 }],
  });
  assert.equal(d.verdict, "fail");
  assert.deepEqual(symptoms(d), ["missed-success"]);
});

test("a failed task with no claim is a wrong outcome and stays unexplained", () => {
  const d = run([], { leads: [], ledger: [] });
  assert.equal(d.verdict, "fail");
  assert.deepEqual(symptoms(d), ["wrong-outcome"]);
  assert.deepEqual(causes(d), ["unexplained"]);
});

test("two unrelated writes are not a duplicate action", () => {
  const other = { contact: "Ada Lovelace", company: "Other Co", owner: "Priya Shah" };
  const d = run([post(10, 100, 303), post(12, 200, 303, other), claim(true)], {
    leads: [lead(1001)],
    ledger: [
      { at: 0, method: "POST", path: "/leads", body, outcome: "committed", leadId: 1001 },
      { at: 1, method: "POST", path: "/leads", body: other, outcome: "committed", leadId: 1002 },
    ],
  });
  assert.ok(!symptoms(d).includes("duplicate-action"));
});

test("an overlapping resubmit is a duplicate, not an unsafe retry", () => {
  const first = post(11, 100, 504);
  first.respondedAt = 500;
  const second = post(12, 150, 504);
  const d = run([first, second, claim(false)], {
    leads: [lead(1001), lead(1002)],
    ledger: [1001, 1002].map((leadId) => ({ at: 0, method: "POST", path: "/leads", body, outcome: "committed" as const, leadId })),
  });
  assert.ok(symptoms(d).includes("duplicate-action"));
  assert.ok(!causes(d).includes("unsafe-retry"));
});

test("a 400 followed by the same write is not an unsafe retry", () => {
  const d = run([post(11, 100, 400), post(20, 400, 303), claim(true)], {
    leads: [lead(1001)],
    ledger: [{ at: 0, method: "POST", path: "/leads", body, outcome: "committed", leadId: 1001 }],
  });
  assert.ok(!causes(d).includes("unsafe-retry"));
});

test("a different body after a 504 is not an unsafe retry", () => {
  const d = run([post(11, 100, 504), post(20, 400, 303, { ...body, owner: "Alex Kim" }), claim(false)], {
    leads: [lead(1001, "Alex Kim")],
    ledger: [{ at: 0, method: "POST", path: "/leads", body: { ...body, owner: "Alex Kim" }, outcome: "committed", leadId: 1001 }],
  });
  assert.ok(!causes(d).includes("unsafe-retry"));
});

test("a login redirect after a successful sign-in is auth-lost", () => {
  const signIn: NetworkEvent = { type: "request", stepId: 4, at: 40, method: "POST", url: "http://x/login", status: 303, postData: { username: "demo" } };
  const expired: NetworkEvent = { type: "request", stepId: 12, at: 200, method: "POST", url: "http://x/leads", status: 303, redirectedTo: "/login", postData: body };
  const d = run([signIn, expired, claim(false)], { leads: [], ledger: [] });
  assert.ok(causes(d).includes("auth-lost"));
});

test("the first trip to the login page is not auth-lost, whichever step it happens in", () => {
  const toLogin: NetworkEvent = { type: "request", stepId: 2, at: 20, method: "GET", url: "http://x/leads/new", status: 303, redirectedTo: "/login?next=%2Fleads%2Fnew" };
  const signIn: NetworkEvent = { type: "request", stepId: 4, at: 40, method: "POST", url: "http://x/login", status: 303, postData: { username: "demo" } };
  const d = run([step(1, "observe"), toLogin, signIn, post(11, 100, 303), claim(true)], {
    leads: [lead(1001)],
    ledger: [{ at: 0, method: "POST", path: "/leads", body, outcome: "committed", leadId: 1001 }],
  });
  assert.equal(d.verdict, "pass");
  assert.deepEqual(d.findings, []);
});
