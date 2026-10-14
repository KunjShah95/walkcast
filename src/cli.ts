import { mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { FAULTS, isFaultId } from "./app/faults.ts";
import { startApp } from "./app/server.ts";
import { allAgents } from "./agents/registry.ts";
import type { GatewayMode } from "./llm/gateway.ts";
import { backendFor, defaultSelection, type ModelSelection } from "./llm/model-spec.ts";
import { PROVIDERS, apiKey, baseURL } from "./llm/providers.ts";
import { causes, symptoms } from "./lab/classifier.ts";
import { runExperiment } from "./lab/experiment.ts";
import { loadFixture, replayFixture, writeFixture } from "./lab/fixture.ts";
import { closeBrowser, runOnce } from "./lab/runner.ts";
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
    port: { type: "string", default: "4310" },
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
      console.log("Faults:");
      for (const [id, f] of Object.entries(FAULTS)) console.log(`  ${id.padEnd(18)} ${f.description}`);
      console.log("\nAgents:");
      for (const a of allAgents()) console.log(`  ${a.id.padEnd(6)} [${a.kind}] ${a.description}`);
      return 0;
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
    case "app": {
      const fault = requireFault();
      const app = await startApp({ fault, seed: Number(values.seed), port: Number(values.port) });
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

function requireFault() {
  const fault = values.fault ?? "";
  if (!isFaultId(fault)) throw new Error(`--fault must be one of: ${Object.keys(FAULTS).join(", ")}`);
  return fault;
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
