import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { FAULTS, type FaultId } from "../packages/core/src/app/faults.ts";
import { causes } from "../packages/core/src/lab/classifier.ts";
import { EXPECTED_CAUSES } from "../packages/core/src/lab/experiment.ts";
import { loadFixture, replayFixture, writeFixture } from "../packages/core/src/lab/fixture.ts";
import { closeBrowser, runOnce } from "../packages/core/src/lab/runner.ts";
import { createLeadTask, taskById } from "../packages/core/src/lab/task.ts";

const out = mkdtempSync(join(tmpdir(), "failure-lab-"));
const faults = (Object.keys(FAULTS) as FaultId[]).filter((f) => f !== "none");
after(closeBrowser);

describe("end to end against MiniCRM", { concurrency: 3 }, () => {
  test("baseline v0 passes the clean task", async () => {
    const r = await runOnce({ fault: "none", seed: 1, agent: "v0", outDir: out });
    assert.equal(r.diagnosis.verdict, "pass");
  });

  for (const fault of faults) {
    test(`${fault}: v0 fails with the expected cause, the fixture reproduces, v1 passes it`, async () => {
      const task = createLeadTask();
      const r = await runOnce({ fault, seed: 1, agent: "v0", task, outDir: out });
      assert.equal(r.diagnosis.verdict, "fail");
      assert.ok(causes(r.diagnosis).includes(EXPECTED_CAUSES[fault].primary!), `causes: ${causes(r.diagnosis).join(", ")}`);

      const fixture = await writeFixture(r, task, join(out, "fixtures"));
      const replayV0 = await replayFixture(loadFixture(fixture.dir), "v0", 1, out);
      assert.equal(replayV0.reproduced, 1, "fixture should reproduce with the original agent");
      const replayV1 = await replayFixture(loadFixture(fixture.dir), "v1", 1, out);
      assert.ok(replayV1.passAll, `v1 should pass: ${JSON.stringify(replayV1.trials)}`);
    });
  }

  test("v2 regresses on gateway-timeout only", async () => {
    const r = await runOnce({ fault: "gateway-timeout", seed: 1, agent: "v2", outDir: out });
    assert.equal(r.diagnosis.verdict, "fail");
    assert.ok(causes(r.diagnosis).includes("unsafe-retry"));
    const clean = await runOnce({ fault: "stale-owners", seed: 1, agent: "v2", outDir: out });
    assert.equal(clean.diagnosis.verdict, "pass");
  });
});

describe("reassign-lead and lookup-owner tasks", { concurrency: 3 }, () => {
  const cases: [string, "reassign-lead" | "lookup-owner", string, string][] = [
    ["reassign under a stale owner list", "reassign-lead", "stale-owners", "stale-observation"],
    ["reassign when the app drops the owner", "reassign-lead", "silent-owner-drop", "app-dropped-field"],
    ["reassign after a redesign", "reassign-lead", "ui-drift", "locator-not-found"],
    ["lookup when the first read times out", "lookup-owner", "gateway-timeout", "app-error"],
    ["lookup after the owner label is renamed", "lookup-owner", "ui-drift", "locator-not-found"],
  ];
  for (const [name, taskId, fault, cause] of cases) {
    test(`${name}: v0 fails with ${cause}, v1 passes`, async () => {
      const task = taskById(taskId);
      const v0 = await runOnce({ fault, seed: 1, agent: "v0", task, outDir: out });
      assert.equal(v0.diagnosis.verdict, "fail");
      assert.ok(causes(v0.diagnosis).includes(cause as never), causes(v0.diagnosis).join(", "));
      const v1 = await runOnce({ fault, seed: 1, agent: "v1", task, outDir: out });
      assert.equal(v1.diagnosis.verdict, "pass", JSON.stringify(v1.oracle.checks));
    });
  }

  test("lookup answers are checked against the database, not judged", async () => {
    const r = await runOnce({ fault: "none", seed: 1, agent: "v1", task: taskById("lookup-owner"), outDir: out });
    assert.equal(r.claim?.answer, "Sam Carter");
    assert.ok(r.oracle.checks.find((c) => c.name === "answer-correct")?.passed);
  });

  test("a fault that does not apply to a task is refused", async () => {
    await assert.rejects(runOnce({ fault: "stale-owners", seed: 1, agent: "v0", task: taskById("lookup-owner"), outDir: out }), /does not apply/);
  });
});
