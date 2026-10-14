import { mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { FAULTS, allScenarios, normalizeScenario } from "./app/faults.ts";
import { startApp } from "./app/server.ts";
import { allAgents } from "./agents/registry.ts";
import type { GatewayMode } from "./llm/gateway.ts";
import { backendFor, defaultSelection, type ModelSelection } from "./llm/model-spec.ts";
import { PROVIDERS, apiKey, baseURL } from "./llm/providers.ts";
import { causes, symptoms } from "./lab/classifier.ts";
import { runExperiment } from "./lab/experiment.ts";
import { loadFixture, replayFixture, writeFixture } from "./lab/fixture.ts";
import { closeBrowser, runOnce } from "./lab/runner.ts";
import { exportDashboard, serveDashboard } from "./ui/server.ts";
import { LabData } from "./ui/data.ts";
import { compareRuns, type DiffReport } from "./lab/diff.ts";
import { cpSync } from "node:fs";
import { createLeadTask } from "./lab/task.ts";

const HELP = `Browser Agent Failure Lab

Usage: npm run lab -- <command> [options]

Commands:
  list                                  List faults and agent versions
  app --fault <id> [--seed n] [--port p]  Serve MiniCRM for manual exploration
  run --fault <id> --agent <id> [--seed n] [--fixtures dir] [--screenshots] [--video] [--model-mode m]
                                        Run once; write trace + report; save a fixture if it fails
  replay <fixtureDir> --agent <id> [--trials k] [--model-mode m]
                                        Re-run a fixture; exits 1 unless the agent passes every trial
  compare <fixturesDir> --agents v0,v1,v2 [--trials k]
                                        pass^k table for every fixture × agent; exits 1 on any failure
                                        of the last agent listed
  experiment [--baseline id] [--candidates a,b] [--seeds n] [--trials k] [--concurrency c] [--model-mode m] [--out dir]
                                        Full validation experiment (docs/ASSESSMENT.md §7)

  ui [--port 4320]                      Dashboard and timeline viewer over runs/, fixtures/, results/
                                        (build first: npm run ui:build, or just npm run ui)
  ui-export [--out file.html] [--max-runs n] [--lean]
                                        One self-contained HTML file with the data baked in
  diff <baselineRun> <candidateRun>     Align two runs' actions, find what broke, how pages changed, and
                                        the likely replacement for each broken element; exits 1 on breakage
  baseline save <runDir> --name n       Store a passing run as a baseline (baselines/n)
  check --against <baseline> --agent a --fault f
                                        Run, then diff against the baseline (workflow regression check)
  providers                             List model providers and whether their API key is set
  check-model <provider:model>          Smoke-test a model on both channels (tool call + JSON schema)

Model selection (live mode): --agent-model and --stagehand-model take "provider:model", or a
comma-separated fallback chain ("groq:x,openrouter:y"). Env: LAB_AGENT_MODEL, LAB_STAGEHAND_MODEL.
Providers: anthropic (claude), openai, vercel (AI Gateway), openrouter, gemini, groq, mistral,
deepseek, huggingface (hf), xai (grok), together, fireworks, cerebras, ollama (local), custom
(any OpenAI-compatible URL via LAB_CUSTOM_BASE_URL).

Agents: v0/v1/v2 are scripted; sh-p0/sh-p1 are Claude + Stagehand v4 (need LAB_CHROME_PATH).
Model modes (Stagehand agents): live (Claude; needs ANTHROPIC_API_KEY), replay (recorded
model calls, $0), scripted (deterministic stand-in for plumbing tests).
`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    fault: { type: "string" },
    agent: { type: "string", default: "v0" },
    agents: { type: "string", default: "v0,v1,v2" },
    "model-mode": { type: "string" },
    "agent-model": { type: "string" },
    "stagehand-model": { type: "string" },
    baseline: { type: "string", default: "v0" },
    candidates: { type: "string", default: "v1,v2" },
    seed: { type: "string", default: "1" },
    seeds: { type: "string", default: "5" },
    trials: { type: "string", default: "3" },
    concurrency: { type: "string", default: "3" },
    port: { type: "string" },
    "max-runs": { type: "string", default: "80" },
    lean: { type: "boolean", default: false },
    fragment: { type: "boolean", default: false },
    "screenshot-runs": { type: "string" },
    scenarios: { type: "string", default: "singles" },
    name: { type: "string" },
    "against": { type: "string" },
    fixtures: { type: "string", default: "fixtures" },
    out: { type: "string" },
    screenshots: { type: "boolean", default: false },
    video: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

const [command, target] = positionals;
const runsDir = resolve("runs");

async function main(): Promise<number> {
  if (values.help || !command) {
    console.log(HELP);
    return 0;
  }
  switch (command) {
    case "list": {
      console.log("Faults (combine with +, e.g. --fault stale-owners+session-expiry):");
      for (const [id, f] of Object.entries(FAULTS)) console.log(`  ${id.padEnd(18)} ${f.description}`);
      console.log(`\nBenchmark grid: ${allScenarios("pairs").length} scenarios (control, ${allScenarios("singles").length - 1} single faults, every pair).`);
      console.log("\nAgents:");
      for (const a of allAgents()) console.log(`  ${a.id.padEnd(6)} [${a.kind}] ${a.description}`);
      return 0;
    }
    case "diff": {
      const [, a, b] = positionals;
      if (!a || !b) throw new Error("diff needs two run directories: diff <baseline> <candidate>");
      const report = diffDirs(a, b);
      printDiff(report);
      return report.broken.length || report.outcome.verdict[1] === "fail" ? 1 : 0;
    }
    case "baseline": {
      const [, sub, runDir] = positionals;
      if (sub !== "save" || !runDir || !values.name) throw new Error("usage: baseline save <runDir> --name <name>");
      const detail = new LabData().run(runDir);
      if (!detail) throw new Error(`No run at ${runDir}`);
      if (detail.summary.verdict !== "pass") throw new Error("A baseline must be a passing run.");
      const dest = join("baselines", values.name);
      if (existsSync(dest)) throw new Error(`${dest} already exists; choose another --name or delete it first.`);
      cpSync(runDir, dest, { recursive: true });
      console.log(`Saved baseline ${dest} (${detail.summary.agent} on ${detail.summary.fault}, ${detail.summary.steps} steps)`);
      return 0;
    }
    case "check": {
      const against = values.against;
      if (!against) throw new Error("check needs --against <baselineDir>, plus --agent and --fault for the new run");
      const fault = requireFault();
      const result = await runOnce({ fault, seed: Number(values.seed), agent: values.agent!, outDir: runsDir, ...(modelMode() ? { modelMode: modelMode() } : {}), ...(models() ? { models: models() } : {}) });
      const report = diffDirs(against, join("runs", result.runDir.split(/[\\/]/).pop()!));
      printDiff(report);
      return report.broken.length || report.outcome.verdict[1] === "fail" ? 1 : 0;
    }
    case "providers": {
      console.log("Provider       Key        Endpoint / notes");
      for (const p of Object.values(PROVIDERS)) {
        const key = apiKey(p) ? "set" : p.keyOptional ? "optional" : "missing";
        console.log(`  ${p.id.padEnd(12)} ${key.padEnd(9)} ${p.kind === "anthropic" ? "Anthropic SDK" : (baseURL(p) ?? `set LAB_${p.id.toUpperCase()}_BASE_URL`)}  (env: ${p.apiKeyEnv.join(" | ")}; e.g. ${p.id}:${p.exampleModel})`);
      }
      const d = defaultSelection();
      console.log(`\nCurrent selection: agent=${d.agent} stagehand=${d.stagehand}`);
      return 0;
    }
    case "check-model": {
      if (!target) throw new Error("check-model needs a spec, e.g. groq:openai/gpt-oss-120b");
      return checkModel(target);
    }
    case "ui": {
      const url = await serveDashboard(Number(values.port ?? 4320));
      console.log(`Failure Lab dashboard: ${url}  (read-only view of runs/, fixtures/, results/)`);
      await new Promise(() => undefined);
      return 0;
    }
    case "ui-export": {
      const out = resolve(values.out ?? "failure-lab.html");
      const r = exportDashboard({
        out,
        maxRuns: Number(values["max-runs"]),
        screenshots: !values.lean,
        fragment: values.fragment,
        ...(values["screenshot-runs"] ? { screenshotRuns: Number(values["screenshot-runs"]) } : {}),
      });
      console.log(`Wrote ${r.path}: ${r.runs} runs, ${(r.bytes / 1024 / 1024).toFixed(1)} MB`);
      return 0;
    }
    case "app": {
      const fault = requireFault();
      const app = await startApp({ fault, seed: Number(values.seed), port: Number(values.port ?? 4310) });
      console.log(`MiniCRM (fault=${fault}, seed=${values.seed}) at ${app.url}  — login demo / demo-pass`);
      await new Promise(() => undefined);
      return 0;
    }
    case "run": {
      const fault = requireFault();
      const task = createLeadTask();
      const result = await runOnce({
        fault,
        seed: Number(values.seed),
        agent: values.agent!,
        task,
        outDir: runsDir,
        screenshots: values.screenshots,
        video: values.video,
        ...(modelMode() ? { modelMode: modelMode() } : {}),
        ...(models() ? { models: models() } : {}),
      });
      console.log(`${result.diagnosis.verdict.toUpperCase()}  symptoms=[${symptoms(result.diagnosis).join(", ")}] causes=[${causes(result.diagnosis).join(", ")}]`);
      console.log(`report: ${join(result.runDir, "report.md")}`);
      if (result.diagnosis.verdict === "fail") {
        mkdirSync(values.fixtures!, { recursive: true });
        const fixture = await writeFixture(result, task, resolve(values.fixtures!));
        console.log(`fixture: ${fixture.dir}`);
        return 1;
      }
      return 0;
    }
    case "replay": {
      if (!target) throw new Error("replay needs a fixture directory");
      const summary = await replayFixture(loadFixture(target), values.agent!, Number(values.trials), runsDir, replayOptions());
      printReplay(summary);
      return summary.passAll ? 0 : 1;
    }
    case "compare": {
      if (!target) throw new Error("compare needs a fixtures directory");
      const dirs = readdirSync(target).map((d) => join(target, d)).filter((d) => existsSync(join(d, "manifest.json")));
      const agents = values.agents!.split(",");
      let gateFailed = false;
      for (const dir of dirs) {
        for (const agent of agents) {
          const summary = await replayFixture(loadFixture(dir), agent, Number(values.trials), runsDir, replayOptions());
          printReplay(summary);
          if (agent === agents.at(-1) && !summary.passAll) gateFailed = true;
        }
      }
      return gateFailed ? 1 : 0;
    }
    case "experiment": {
      const out = resolve(values.out ?? join("results", new Date().toISOString().replace(/[:.]/g, "-")));
      await runExperiment({
        seeds: Number(values.seeds),
        trials: Number(values.trials),
        concurrency: Number(values.concurrency),
        scenarios: values.scenarios === "pairs" ? "pairs" : "singles",
        baseline: values.baseline!,
        candidates: values.candidates!.split(","),
        ...(modelMode() ? { modelMode: modelMode() } : {}),
        outDir: out,
      });
      return 0;
    }
    default:
      console.error(`Unknown command '${command}'.\n${HELP}`);
      return 2;
  }
}

function modelMode(): GatewayMode | undefined {
  const mode = values["model-mode"];
  if (mode === undefined) return undefined;
  if (mode !== "live" && mode !== "replay" && mode !== "scripted") throw new Error("--model-mode must be live, replay or scripted");
  return mode;
}

function replayOptions() {
  const mode = modelMode();
  return { ...(mode ? { modelMode: mode } : {}), ...(models() ? { models: models() } : {}) };
}

/** --agent-model / --stagehand-model, falling back to LAB_* env vars and then Claude. */
function models(): ModelSelection | undefined {
  if (!values["agent-model"] && !values["stagehand-model"]) return undefined;
  const defaults = defaultSelection();
  const agent = values["agent-model"] ?? defaults.agent;
  return { agent, stagehand: values["stagehand-model"] ?? values["agent-model"] ?? defaults.stagehand };
}

/** Two small live calls: one agent turn that must call a tool, one schema-constrained Stagehand-style call. */
async function checkModel(spec: string): Promise<number> {
  const backend = backendFor(spec);
  let ok = true;
  try {
    const started = Date.now();
    const r = await backend.agent({
      system: "You are testing tool calling. Call the done tool.",
      tools: [{ name: "done", description: "Finish.", input_schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false } }],
      messages: [{ role: "user", content: "Call done with ok=true." }],
    });
    const call = r.content.find((b) => b.type === "tool_use");
    console.log(`agent channel:     ${call ? "tool call OK" : "NO tool call"} (${r.stop_reason}, ${Date.now() - started} ms, model ${r.model})`);
    ok &&= Boolean(call);
  } catch (error) {
    ok = false;
    console.log(`agent channel:     FAILED ${(error as Error).message.split("\n")[0]}`);
  }
  try {
    const started = Date.now();
    const r = await backend.stagehand({
      messages: [{ role: "user", content: { type: "text", text: "instruction: find the Save button\nAccessibility Tree:\n[0-1] RootWebArea: Test\n  [0-7] button: Save" } }],
      systemPrompt: "Return the element that matches the instruction.",
      responseFormat: {
        type: "json_schema",
        name: "Observation",
        schema: { type: "object", properties: { elementId: { type: "string" } }, required: ["elementId"], additionalProperties: false },
      },
    });
    const structured = r.outputFormat === "json_schema" ? r.structuredContent : null;
    const correct = JSON.stringify(structured).includes("0-7");
    console.log(`stagehand channel: ${correct ? "structured output OK" : "unexpected output"} ${JSON.stringify(structured)} (${Date.now() - started} ms)`);
    ok &&= correct;
  } catch (error) {
    ok = false;
    console.log(`stagehand channel: FAILED ${(error as Error).message.split("\n")[0]}`);
  }
  return ok ? 0 : 1;
}

function diffDirs(a: string, b: string): DiffReport {
  const data = new LabData();
  const base = data.run(a);
  const cand = data.run(b);
  if (!base) throw new Error(`No run at ${a}`);
  if (!cand) throw new Error(`No run at ${b}`);
  return compareRuns({ result: base.result, events: base.events }, { result: cand.result, events: cand.events });
}

function printDiff(r: DiffReport): void {
  console.log(`baseline  ${r.baseline.agent} on ${r.baseline.fault}: ${r.baseline.verdict}`);
  console.log(`candidate ${r.candidate.agent} on ${r.candidate.fault}: ${r.candidate.verdict}`);
  console.log(`\n${r.summary}\n`);
  for (const b of r.broken) {
    console.log(`BROKEN step ${b.stepId}: ${b.target}${b.error ? `  (${b.error})` : ""}`);
    if (b.was) console.log(`  was:        ${b.was.role} "${b.was.name}" ${b.was.selector}`);
    if (b.suggestion) console.log(`  try:        ${b.suggestion.control.role} "${b.suggestion.control.name}" ${b.suggestion.control.selector}  (${b.suggestion.reason})`);
  }
  for (const p of r.pages) {
    console.log(`PAGE ${p.path}`);
    for (const x of p.renamed) console.log(`  ~ ${x.from.role} "${x.from.name}" ${x.from.selector}  ->  "${x.to.name}" ${x.to.selector}  [by ${x.by}]`);
    for (const x of p.removed) console.log(`  - ${x.role} "${x.name}" ${x.selector}`);
    for (const x of p.added) console.log(`  + ${x.role} "${x.name}" ${x.selector}`);
  }
}

function requireFault() {
  if (!values.fault) throw new Error(`--fault is required: one of ${Object.keys(FAULTS).join(", ")}, or several joined with "+"`);
  return normalizeScenario(values.fault);
}

function printReplay(s: Awaited<ReturnType<typeof replayFixture>>): void {
  const causesSeen = [...new Set(s.trials.flatMap((t) => t.causes))];
  console.log(
    `${s.passAll ? "PASS" : "FAIL"}  ${s.fixture.padEnd(42)} agent=${s.agent} pass=${s.passes}/${s.trials.length} reproduced=${s.reproduced}/${s.trials.length}` +
      (causesSeen.length ? ` causes=[${causesSeen.join(", ")}]` : "") +
      (s.modelMode ? ` model=${s.modelMode} calls=${s.trials.reduce((n, t) => n + t.modelCalls, 0)}` : "") +
      (s.environmentDrift.length ? ` DRIFT: ${s.environmentDrift.join("; ")}` : ""),
  );
}

main()
  .then(async (code) => {
    await closeBrowser();
    process.exitCode = code;
  })
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    await closeBrowser();
    process.exitCode = 2;
  });
