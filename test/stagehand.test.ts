import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { causes } from "../packages/core/src/lab/classifier.ts";
import { loadFixture, replayFixture, writeFixture } from "../packages/core/src/lab/fixture.ts";
import { runOnce } from "../packages/core/src/lab/runner.ts";
import { createLeadTask } from "../packages/core/src/lab/task.ts";

/**
 * Stagehand v4 integration, using the scripted stand-in model (no API key needed). Requires a
 * Chrome recent enough for Stagehand's extension runtime: set LAB_CHROME_PATH.
 */
const chrome = process.env.LAB_CHROME_PATH;
const out = mkdtempSync(join(tmpdir(), "failure-lab-sh-"));

describe("Claude-style tool loop + Stagehand act()", { skip: chrome ? false : "LAB_CHROME_PATH not set" }, () => {
  test("baseline prompt trusts the toast on silent-owner-drop; the fixture replays exactly from recorded model calls", async () => {
    const task = createLeadTask();
    const r = await runOnce({ fault: "silent-owner-drop", seed: 1, agent: "sh-p0", modelMode: "scripted", task, outDir: out });
    assert.equal(r.diagnosis.verdict, "fail");
    assert.ok(causes(r.diagnosis).includes("app-dropped-field"));
    assert.ok(r.modelCalls > 0);
    const cassette = readFileSync(join(r.runDir, "model-calls.jsonl"), "utf8").trim().split("\n");
    assert.equal(cassette.length, r.modelCalls);
    assert.ok(cassette.some((l) => l.includes('"channel":"stagehand"')), "Stagehand's own model calls go through the gateway");

    // The app password is handed to the agent, yet never reaches disk; replay restores it in memory.
    for (const file of ["trace.jsonl", "model-calls.jsonl", "result.json", "report.md"]) {
      const text = readFileSync(join(r.runDir, file), "utf8");
      assert.ok(!text.includes("demo-pass"), `${file} contains the password`);
    }
    assert.ok(cassette.some((l) => l.includes("{{secret:app_password}}")), "placeholder recorded instead");

    const fixture = await writeFixture(r, task, join(out, "fixtures"));
    const replay = await replayFixture(loadFixture(fixture.dir), "sh-p0", 2, out);
    assert.equal(replay.modelMode, "replay");
    assert.equal(replay.reproduced, 2);
    assert.deepEqual(replay.environmentDrift, [], "no prompt drift between recording and replay");

    const fixed = await replayFixture(loadFixture(fixture.dir), "sh-p1", 1, out, { modelMode: "scripted" });
    assert.ok(fixed.passAll, "the verification prompt reports the dropped owner honestly");
  });

  test("an act() that reports failure and is ignored is diagnosed as action-failed", async () => {
    const r = await runOnce({ fault: "ui-drift", seed: 1, agent: "sh-p0", modelMode: "scripted", outDir: out });
    assert.equal(r.diagnosis.verdict, "fail");
    assert.ok(causes(r.diagnosis).includes("action-failed"), causes(r.diagnosis).join(","));
  });
});
