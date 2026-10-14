import { existsSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { Stagehand, localBrowser } from "@browserbasehq/stagehand";
import { type Scenario, normalizeScenario, scenarioTaskPossible } from "../app/faults.ts";
import { startApp } from "../app/server.ts";
import { resolveAgent, type AgentSpec } from "../agents/registry.ts";
import { runScriptedAgent } from "../agents/scripted.ts";
import { runStagehandAgent } from "../agents/stagehand-agent.ts";
import { Recorder, type ClaimEvent } from "../capture/recorder.ts";
import { BrowserTools } from "../capture/tools.ts";
import { ModelGateway, readCassette, type GatewayMode, type GatewayStatus } from "../llm/gateway.ts";
import { ScriptedModel } from "../llm/scripted-model.ts";
import { backendForSelection, defaultSelection, type ModelSelection } from "../llm/model-spec.ts";
import { type Diagnosis, diagnose } from "./classifier.ts";
import { createLeadTask, evaluateOracle, type CreateLeadTask, type OracleResult } from "./task.ts";
import { writeRunReport } from "./report.ts";

export interface RunOptions {
  /** A fault id or a "+"-joined combination (see allScenarios()). */
  fault: Scenario;
  seed: number;
  agent: string | AgentSpec;
  outDir: string;
  task?: CreateLeadTask;
  screenshots?: boolean;
  video?: boolean;
  /** LLM agents only. Defaults to live. */
  modelMode?: GatewayMode;
  /** Replay mode: the cassette (model-calls.jsonl) to replay. */
  cassette?: string;
  /** Live mode: which provider:model serves each channel. Defaults to LAB_AGENT_MODEL / LAB_STAGEHAND_MODEL or Claude. */
  models?: ModelSelection;
}

export interface RunResult {
  runId: string;
  agent: string;
  agentSpec: AgentSpec;
  fault: Scenario;
  seed: number;
  expectation: "task-success" | "honest-failure";
  timings: { ownersRefreshMs: number; submitDelayMs: number };
  durationMs: number;
  steps: number;
  modelCalls: number;
  model: (GatewayStatus & { selection: ModelSelection | null }) | null;
  claim: ClaimEvent | null;
  oracle: OracleResult;
  diagnosis: Diagnosis;
  agentError: string | null;
  browserVersion: string;
  runDir: string;
}

/** One Playwright browser per process for scripted agents; each run gets its own context. */
let sharedBrowser: Promise<Browser> | undefined;

export function browser(): Promise<Browser> {
  sharedBrowser ??= chromium.launch({ headless: true });
  return sharedBrowser;
}

export async function closeBrowser(): Promise<void> {
  if (sharedBrowser) await (await sharedBrowser).close();
  sharedBrowser = undefined;
}

/**
 * Stagehand v4 loads its runtime as a Chrome extension over CDP (Extensions.loadUnpacked on a
 * port connection), which needs a recent Chrome. Point LAB_CHROME_PATH at Chrome for Testing.
 */
export function chromePath(): string {
  const path = process.env.LAB_CHROME_PATH;
  if (!path || !existsSync(path)) {
    throw new Error("Stagehand agents need LAB_CHROME_PATH set to a recent Chrome (for Testing) binary. See README.");
  }
  return path;
}

interface Session {
  context: BrowserContext;
  page: Page;
  run(tools: BrowserTools, task: CreateLeadTask): Promise<void>;
  close(): Promise<void>;
  browserVersion: string;
}

export async function runOnce(options: RunOptions): Promise<RunResult> {
  const spec = resolveAgent(options.agent);
  const task = options.task ?? createLeadTask();
  const runId = `${normalizeScenario(options.fault)}-s${options.seed}-${spec.id}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const runDir = join(options.outDir, runId);
  const recorder = new Recorder(runDir, { screenshots: options.screenshots ?? false });
  const app = await startApp({ fault: options.fault, seed: options.seed });

  let gateway: ModelGateway | null = null;
  let selection: ModelSelection | null = null;
  let session: Session;
  if (spec.kind === "scripted") {
    session = await scriptedSession(spec, runDir, options.video ?? false);
  } else {
    const mode = options.modelMode ?? "live";
    selection = mode === "live" ? (options.models ?? defaultSelection()) : null;
    const backend = mode === "live" ? backendForSelection(selection!) : mode === "scripted" ? new ScriptedModel() : null;
    const cassette = mode === "replay" ? readCassette(options.cassette ?? "") : undefined;
    gateway = new ModelGateway(mode, backend, recorder, cassette);
    session = await stagehandSession(spec, gateway);
  }
  await session.context.addInitScript("window.__name = (fn) => fn;");
  recorder.attach(session.context, session.page);
  const tools = new BrowserTools(session.page, recorder, app.url);

  const started = Date.now();
  let agentError: string | null = null;
  try {
    await session.run(tools, task);
  } catch (error) {
    agentError = error instanceof Error ? error.message.split("\n")[0]! : String(error);
    if (!recorder.claim()) await tools.done(false, `Agent crashed: ${agentError}`);
  }
  const durationMs = Date.now() - started;
  await session.close();
  await app.close();

  const claim = recorder.claim() ?? null;
  const oracle = evaluateOracle(task, app.state, claim ?? undefined);
  const expectation = scenarioTaskPossible(app.fault) ? "task-success" : "honest-failure";
  const diagnosis = diagnose({
    events: recorder.events,
    oracle,
    ledger: app.state.ledger,
    leads: app.state.leads,
    expectation,
    requestedValues: task.params,
  });

  recorder.flush();
  if (gateway) gateway.writeCassette(join(runDir, "model-calls.jsonl"));
  const result: RunResult = {
    runId,
    agent: spec.id,
    agentSpec: spec,
    fault: app.fault,
    seed: options.seed,
    expectation,
    timings: app.timings,
    durationMs,
    steps: recorder.steps().length,
    modelCalls: gateway?.status.calls ?? 0,
    model: gateway ? { ...gateway.status, selection } : null,
    claim,
    oracle,
    diagnosis,
    agentError,
    browserVersion: session.browserVersion,
    runDir,
  };
  writeFileSync(join(runDir, "result.json"), JSON.stringify({ ...result, appState: app.state }, null, 2));
  writeRunReport(result, recorder.events, task);
  return result;
}

async function scriptedSession(spec: AgentSpec & { kind: "scripted" }, runDir: string, video: boolean): Promise<Session> {
  const b = await browser();
  const context = await b.newContext({
    viewport: { width: 1280, height: 800 },
    serviceWorkers: "block",
    ...(video ? { recordVideo: { dir: runDir, size: { width: 1280, height: 800 } } } : {}),
  });
  const page = await context.newPage();
  return {
    context,
    page,
    browserVersion: b.version(),
    run: (tools, task) => runScriptedAgent(tools, task, spec),
    close: () => context.close(),
  };
}

/** Stagehand drives Chrome; Playwright attaches to the same browser over CDP to capture. */
async function stagehandSession(spec: AgentSpec & { kind: "stagehand" }, gateway: ModelGateway): Promise<Session> {
  const port = await freePort();
  const shBrowser = await localBrowser.launch({ headless: true, port, executablePath: chromePath(), viewport: { width: 1280, height: 800 } });
  const pw = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const stagehand = await Stagehand.create({ browser: shBrowser, model: gateway.clientLLM(), logging: { level: "off" } });
  const context = pw.contexts()[0]!;
  const known = new Set(context.pages());
  const pagePromise = context.waitForEvent("page", { predicate: (p) => !known.has(p), timeout: 10000 });
  const shPage = await shBrowser.context.newPage();
  const page = await pagePromise;
  return {
    context,
    page,
    browserVersion: pw.version(),
    run: (tools, task) => runStagehandAgent({ tools, stagehand, page: shPage, gateway }, task, spec),
    close: async () => {
      await stagehand.close().catch(() => undefined);
      await pw.close().catch(() => undefined);
      await shBrowser.close().catch(() => undefined);
    },
  };
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => (typeof address === "object" && address ? resolve(address.port) : reject(new Error("no port"))));
    });
  });
}
