import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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
