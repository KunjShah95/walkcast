import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { LabData } from "../src/ui/data.ts";

function workspace() {
  const root = mkdtempSync(join(tmpdir(), "lab-ui-"));
  const run = join(root, "runs", "none-s1-v0-abc");
  mkdirSync(run, { recursive: true });
  writeFileSync(
    join(run, "result.json"),
    JSON.stringify({
      runId: "none-s1-v0-abc",
      agent: "v0",
      agentSpec: { kind: "scripted", id: "v0" },
      fault: "none",
      seed: 1,
      expectation: "task-success",
      durationMs: 1200,
      steps: 3,
      modelCalls: 0,
      model: null,
      claim: { success: true, summary: "Created lead 1001." },
      oracle: { taskPassed: false, claimHonest: false, checks: [] },
      diagnosis: { verdict: "fail", findings: [{ label: "false-success", kind: "symptom", confidence: "oracle", explanation: "x", evidenceSteps: [3] }] },
    }),
  );
  writeFileSync(join(run, "trace.jsonl"), JSON.stringify({ type: "claim", stepId: 3, at: 10, success: true, summary: "Created lead 1001." }) + "\n");
  return root;
}

test("index summarises runs with the oracle's verdict and findings", () => {
  const data = new LabData(workspace());
  const { runs } = data.index();
  assert.equal(runs.length, 1);
  assert.equal(runs[0]!.verdict, "fail");
  assert.equal(runs[0]!.taskPassed, false);
  assert.deepEqual(runs[0]!.symptoms, ["false-success"]);
  const detail = data.run(runs[0]!.dir);
  assert.equal(detail?.events.length, 1);
});

test("file access is confined to the lab's output folders", () => {
  const data = new LabData(workspace());
  assert.ok(data.safe("runs/none-s1-v0-abc/step-001.jpg"));
  assert.equal(data.safe("../../etc/passwd"), null);
  assert.equal(data.safe("runs/../../secret"), null);
  assert.equal(data.safe("package.json"), null);
  assert.equal(data.run("../.."), null);
});

test("summaries written before the rates section still get pass rates", () => {
  const root = mkdtempSync(join(tmpdir(), "lab-ui-old-"));
  try {
    mkdirSync(join(root, "results", "old"), { recursive: true });
    writeFileSync(
      join(root, "results", "old", "summary.json"),
      JSON.stringify({
        meta: { startedAt: "2026-10-01T00:00:00.000Z", caveat: "c", seeds: 1, trials: 3, baseline: "v0", candidates: ["v1"] },
        detection: [],
        falsePositives: { baselineCleanRunsFailed: 0, baselineCleanRuns: 1, candidateCleanRunsFailed: 0, candidateCleanRuns: 1 },
        reproduction: [{ fixture: "f1", reproduced: 2, trials: 3, drift: [] }],
        regression: [
          { fixture: "f1", agent: "v0", passes: 0, trials: 3, passAll: false, causes: ["unexplained"] },
          { fixture: "f1", agent: "v1", passes: 3, trials: 3, passAll: true, causes: [] },
        ],
        cost: { agentRuns: 1, modelCalls: 0, liveInputTokens: 0, liveOutputTokens: 0, medianRunMs: 1, p95RunMs: 1 },
      }),
    );
    const summary = new LabData(root).index().experiments[0]!.summary;
    assert.deepEqual(summary.rates.reproductionTrials, { k: 2, n: 3 });
    assert.deepEqual(
      summary.rates.passByAgent.map((r) => [r.agent, r.passes, r.trials, r.fixturesPassed, r.fixtures]),
      [
        ["v0", 0, 3, 0, 1],
        ["v1", 3, 3, 1, 1],
      ],
    );
    assert.equal(summary.falseSuccess, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
