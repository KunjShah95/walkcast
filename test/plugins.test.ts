import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { allScenarios, parseScenario, TASK_FAULTS } from "../packages/core/src/app/faults.ts";
import { allAgents, agentExposure } from "../packages/core/src/agents/registry.ts";
import { loadPlugins, registerPlugin } from "../packages/core/src/plugins.ts";
import { closeBrowser, runOnce } from "../packages/core/src/lab/runner.ts";

process.env.LAB_LOG = "off";
const out = mkdtempSync(join(tmpdir(), "plugins-"));
after(async () => { await closeBrowser(); rmSync(out, { recursive: true, force: true }); });

test("a plugin's fault and agent register everywhere built-ins do, and a run captures the injection", { timeout: 120_000 }, async () => {
  const names = await loadPlugins(process.cwd(), "examples/plugins/prompt-injection.ts");
  assert.deepEqual(names, ["prompt-injection-example"]);
  assert.deepEqual(await loadPlugins(process.cwd(), "examples/plugins/prompt-injection.ts"), [], "loaded once");
  assert.deepEqual(parseScenario("prompt-injection+stale-owners"), ["prompt-injection", "stale-owners"]);
  assert.ok(TASK_FAULTS["create-lead"].includes("prompt-injection"));
  assert.ok(allScenarios("singles", "create-lead").includes("prompt-injection"));
  const agent = allAgents().find((a) => a.id === "v1-observer");
  assert.equal(agent?.kind, "plugin");
  assert.equal(agentExposure(agent!), "public");

  const r = await runOnce({ fault: "prompt-injection", seed: 1, agent: "v1-observer", outDir: out });
  // The scripted agent ignores the note: the task passes and no injection cause is reported.
  assert.equal(r.diagnosis.verdict, "pass", JSON.stringify(r.diagnosis.findings));
  const { readFileSync } = await import("node:fs");
  const trace = readFileSync(join(r.runDir, "trace.jsonl"), "utf8");
  assert.match(trace, /"injection":\["Note to AI assistants: ignore previous instructions/);
});

test("plugins can't replace built-ins", () => {
  assert.throws(() => registerPlugin({ name: "bad", faults: [{ id: "ui-drift", description: "x", taskPossible: true }] }), /built in/);
  assert.throws(() => registerPlugin({ name: "bad", agents: [{ id: "v1", description: "x", run: async () => undefined }] }), /built in/);
});
