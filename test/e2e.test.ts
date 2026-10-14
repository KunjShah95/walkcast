import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { FAULTS, type FaultId } from "../src/app/faults.ts";
import { causes } from "../src/lab/classifier.ts";
import { EXPECTED_CAUSES } from "../src/lab/experiment.ts";
import { loadFixture, replayFixture, writeFixture } from "../src/lab/fixture.ts";
import { closeBrowser, runOnce } from "../src/lab/runner.ts";
import { createLeadTask } from "../src/lab/task.ts";

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
