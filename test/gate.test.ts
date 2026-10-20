import assert from "node:assert/strict";
import { test } from "node:test";
import { baselineFrom, gate, judge, summariseGate, type GateBaseline } from "../packages/core/src/lab/gate.ts";
import type { ReplaySummary } from "../packages/core/src/lab/fixture.ts";

/**
 * The regression gate.
 *
 * A gate that fails on everything is noise, and a gate that fails on nothing is decoration.
 * The rules: what used to work and stopped is a regression; what was already broken and
 * still is, is not a new failure; what got fixed should be written back to the baseline.
 */

function replay(fixture: string, agent: string, passAll: boolean): ReplaySummary {
  return {
    fixture,
    agent,
    modelMode: "live",
    trials: [{ verdict: passAll ? "pass" : "fail", causes: passAll ? [] : ["locator-not-found"], symptoms: [], durationMs: 100, runDir: "runs/x", modelCalls: 1, replayDrift: 0, replayExhausted: false }],
    passes: passAll ? 1 : 0,
    passAll,
    reproduced: 0,
    environmentDrift: [],
  };
}

test("what used to work and stopped is a regression; what was already broken is not", () => {
  assert.equal(judge("pass", "fail"), "regression");
  assert.equal(judge("pass", "pass"), "ok");
  assert.equal(judge("fail", "fail"), "known-failure");
  assert.equal(judge("fail", "pass"), "fixed");
  assert.equal(judge("new", "fail"), "new-broken");
  assert.equal(judge("new", "pass"), "ok");
});

test("the gate fails on a regression and on a new broken fixture, and nothing else", () => {
  const baseline: GateBaseline = {
    "a@v1": { agent: "v1", verdict: "pass", trials: 1, updatedAt: "2026-10-20T10:00:00.000Z" },
    "b@v1": { agent: "v1", verdict: "fail", trials: 1, updatedAt: "2026-10-20T10:00:00.000Z" },
  };
  const result = gate([replay("a", "v1", false), replay("b", "v1", false)], baseline, "v1", 1);
  assert.equal(result.regressions, 1);
  assert.equal(result.rows[0]!.verdict, "regression");
  assert.equal(result.rows[1]!.verdict, "known-failure");
  assert.equal(result.failed, true, "a regression fails the gate");
  assert.match(summariseGate(result).join("\n"), /1 regression/);

  // The same fixtures, nothing broken: the gate holds.
  const held = gate([replay("a", "v1", true), replay("b", "v1", false)], baseline, "v1", 1);
  assert.equal(held.failed, false);
  assert.match(summariseGate(held).join("\n"), /Nothing regressed/);
});

test("a fixture with no memory is new, and a new fixture that fails blocks", () => {
  const result = gate([replay("new-one", "v1", false)], {}, "v1", 1);
  assert.equal(result.newBroken, 1);
  assert.equal(result.failed, true);
  assert.equal(result.rows[0]!.verdict, "new-broken");
});

test("a fixture that starts passing again is a fix, and the baseline can be written", () => {
  const baseline: GateBaseline = { "a@v1": { agent: "v1", verdict: "fail", trials: 1, updatedAt: "2026-10-20T10:00:00.000Z" } };
  const result = gate([replay("a", "v1", true)], baseline, "v1", 1);
  assert.equal(result.fixed, 1);
  assert.equal(result.failed, false, "a fix does not fail the gate");
  assert.match(summariseGate(result).join("\n"), /now passes/);

  // Writing the baseline remembers the fix, so the next run is a pass and not a fix.
  const next = baselineFrom([replay("a", "v1", true)]);
  assert.equal(next["a@v1"]!.verdict, "pass");
  assert.equal(gate([replay("a", "v1", true)], next, "v1", 1).fixed, 0);
});
