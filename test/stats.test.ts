import assert from "node:assert/strict";
import { test } from "node:test";
import type { ClaimEvent, NetworkEvent, TraceEvent } from "../packages/core/src/capture/recorder.ts";
import { causes, diagnose, symptoms } from "../packages/core/src/lab/classifier.ts";
import { renderSummary } from "../packages/core/src/lab/summary.ts";
import { formatRate, scoreLabels, wilsonInterval } from "../packages/core/src/lab/stats.ts";
import { createLeadTask, evaluateOracle } from "../packages/core/src/lab/task.ts";
import type { AppState } from "../packages/core/src/app/server.ts";

test("wilson interval contains the point estimate and stays inside 0..1", () => {
  const none = wilsonInterval(0, 5);
  assert.equal(none.low, 0);
  assert.ok(none.high > 0 && none.high < 1);
  const all = wilsonInterval(5, 5);
  assert.equal(all.high, 1);
  assert.ok(all.low > 0 && all.low < 1);
  const mid = wilsonInterval(3, 6);
  assert.ok(mid.low < 0.5 && mid.high > 0.5);
  assert.match(formatRate(0, 0), /0 trials/);
  assert.match(formatRate(3, 6), /3\/6/);
});

test("labelled traces score precision, recall, and empty diagnoses", () => {
  const task = createLeadTask();
  const body = { contact: "Jane Roe", company: "Acme Corp", owner: "Priya Shah" };
  const saved: AppState = {
    leads: [{ id: 1001, contact: body.contact, company: body.company, owner: body.owner, createdAt: 0 }],
    ledger: [{ at: 0, method: "POST", path: "/leads", body, outcome: "committed", leadId: 1001 }],
  };
  const claim = (success: boolean): ClaimEvent => ({ type: "claim", stepId: 9, at: 0, success, summary: "s", leadId: 1001 });
  const post = (status: number): NetworkEvent => ({
    type: "request", stepId: 5, at: 50, method: "POST", url: "http://x/leads", postData: body, status, respondedAt: 60,
  });
  const cases: { events: TraceEvent[]; state: AppState; expectedSymptoms: string[]; expectedCauses: string[] }[] = [
    { events: [post(303), claim(true)], state: saved, expectedSymptoms: [], expectedCauses: [] },
    { events: [post(303)], state: saved, expectedSymptoms: ["missed-success"], expectedCauses: ["unexplained"] },
    { events: [], state: { leads: [], ledger: [] }, expectedSymptoms: ["wrong-outcome"], expectedCauses: ["unexplained"] },
  ];
  const symptomScores = scoreLabels(cases.map((c) => {
    const oracle = evaluateOracle(task, c.state, c.events.findLast((e): e is ClaimEvent => e.type === "claim"));
    const d = diagnose({ events: c.events, oracle, ledger: c.state.ledger, leads: c.state.leads, expectation: "task-success", requestedValues: task.params });
    return { expected: c.expectedSymptoms, predicted: symptoms(d) };
  }));
  const causeScores = scoreLabels(cases.map((c) => {
    const oracle = evaluateOracle(task, c.state, c.events.findLast((e): e is ClaimEvent => e.type === "claim"));
    const d = diagnose({ events: c.events, oracle, ledger: c.state.ledger, leads: c.state.leads, expectation: "task-success", requestedValues: task.params });
    return { expected: c.expectedCauses, predicted: causes(d) };
  }));
  assert.equal(symptomScores.micro.precision, 1);
  assert.equal(symptomScores.micro.recall, 1);
  assert.equal(symptomScores.emptyAgreements, 1);
  assert.equal(causeScores.micro.precision, 1);
  assert.equal(causeScores.micro.recall, 1);
  assert.equal(causeScores.emptyAgreements, 1);
});

test("experiment summary reports the false-success rate with an interval", () => {
  const md = renderSummary({
    meta: { startedAt: "2026-10-14T16:05:59.462Z", caveat: "scripted", trials: 3, seeds: 1, baseline: "v0", candidates: ["v1"] },
    detection: [],
    falsePositives: { baselineCleanRunsFailed: 0, baselineCleanRuns: 1, candidateCleanRunsFailed: 0, candidateCleanRuns: 1 },
    reproduction: [],
    regression: [],
    falseSuccess: { runs: 4, successClaims: 2, falseSuccesses: 1 },
    rates: { reproductionTrials: { k: 3, n: 3 }, passByAgent: [{ agent: "v1", passes: 2, trials: 3, fixturesPassed: 0, fixtures: 1 }] },
    cost: { agentRuns: 1, modelCalls: 0, liveInputTokens: 0, liveOutputTokens: 0, medianRunMs: 1, p95RunMs: 1 },
  });
  assert.match(md, /False success among those claims: 1\/2/);
  assert.match(md, /95% CI/);
  assert.match(md, /v1 trial pass rate: 2\/3/);
});
