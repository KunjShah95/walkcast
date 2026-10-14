import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { FAULTS, type FaultId } from "../app/faults.ts";
import { startApp } from "../app/server.ts";
import { agentConfig, runScriptedAgent, type AgentConfig } from "../agents/scripted.ts";
import { Recorder, type ClaimEvent } from "../capture/recorder.ts";
import { BrowserTools } from "../capture/tools.ts";
import { type Diagnosis, diagnose } from "./classifier.ts";
import { createLeadTask, evaluateOracle, type CreateLeadTask, type OracleResult } from "./task.ts";
import { writeRunReport } from "./report.ts";

export interface RunOptions {
  fault: FaultId;
  seed: number;
  agent: string | AgentConfig;
  outDir: string;
  task?: CreateLeadTask;
  screenshots?: boolean;
  video?: boolean;
}

export interface RunResult {
  runId: string;
  agent: string;
  fault: FaultId;
  seed: number;
  expectation: "task-success" | "honest-failure";
  timings: { ownersRefreshMs: number; submitDelayMs: number };
  durationMs: number;
  steps: number;
  modelCalls: number;
  claim: ClaimEvent | null;
  oracle: OracleResult;
  diagnosis: Diagnosis;
  agentError: string | null;
  runDir: string;
}

/** One browser per process; each run gets its own context and its own app instance. */
let sharedBrowser: Promise<Browser> | undefined;

export function browser(): Promise<Browser> {
  sharedBrowser ??= chromium.launch({ headless: true });
  return sharedBrowser;
}

export async function closeBrowser(): Promise<void> {
  if (sharedBrowser) await (await sharedBrowser).close();
  sharedBrowser = undefined;
}

export async function runOnce(options: RunOptions): Promise<RunResult> {
  const config = typeof options.agent === "string" ? agentConfig(options.agent) : options.agent;
  const task = options.task ?? createLeadTask();
  const runId = `${options.fault}-s${options.seed}-${config.id}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const runDir = join(options.outDir, runId);
  const recorder = new Recorder(runDir, { screenshots: options.screenshots ?? false });
  const app = await startApp({ fault: options.fault, seed: options.seed });
  const context = await (await browser()).newContext({
    viewport: { width: 1280, height: 800 },
    serviceWorkers: "block",
    ...(options.video ? { recordVideo: { dir: runDir, size: { width: 1280, height: 800 } } } : {}),
  });
  // tsx/esbuild wraps named functions in __name(); define it so page.evaluate() bodies run.
  await context.addInitScript("window.__name = (fn) => fn;");
  const page = await context.newPage();
  recorder.attach(context, page);
  const tools = new BrowserTools(page, recorder, app.url);

  const started = Date.now();
  let agentError: string | null = null;
  try {
    await runScriptedAgent(tools, task, config);
  } catch (error) {
    agentError = error instanceof Error ? error.message.split("\n")[0]! : String(error);
    if (!recorder.claim()) await tools.done(false, `Agent crashed: ${agentError}`);
  }
  const durationMs = Date.now() - started;
  await context.close();
  await app.close();

  const claim = recorder.claim() ?? null;
  const oracle = evaluateOracle(task, app.state, claim ?? undefined);
  const expectation = FAULTS[options.fault].taskPossible ? "task-success" : "honest-failure";
  const diagnosis = diagnose({
    events: recorder.events,
    oracle,
    ledger: app.state.ledger,
    leads: app.state.leads,
    expectation,
    requestedValues: task.params,
  });

  recorder.flush();
  const result: RunResult = {
    runId,
    agent: config.id,
    fault: options.fault,
    seed: options.seed,
    expectation,
    timings: app.timings,
    durationMs,
    steps: recorder.steps().length,
    modelCalls: recorder.events.filter((e) => e.type === "model").length,
    claim,
    oracle,
    diagnosis,
    agentError,
    runDir,
  };
  writeFileSync(join(runDir, "result.json"), JSON.stringify({ ...result, appState: app.state }, null, 2));
  writeRunReport(result, recorder.events, task);
  return result;
}
