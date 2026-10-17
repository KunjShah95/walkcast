import { existsSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { Stagehand, localBrowser } from "@browserbasehq/stagehand";
import { type Scenario, assertApplicable, normalizeScenario, scenarioTaskPossible } from "../app/faults.ts";
import { CREDENTIALS, startApp } from "../app/server.ts";
import { registerSecret, scrub } from "../capture/secrets.ts";
import { resolveAgent, type AgentSpec } from "../agents/registry.ts";
import { runScriptedAgent } from "../agents/scripted.ts";
import { runStagehandAgent } from "../agents/stagehand-agent.ts";
import { Recorder, type ClaimEvent } from "../capture/recorder.ts";
import { BrowserTools } from "../capture/tools.ts";
import { ModelGateway, readCassette, type GatewayMode, type GatewayStatus } from "../llm/gateway.ts";
import { ScriptedModel } from "../llm/scripted-model.ts";
import { backendForSelection, defaultSelection, type ModelSelection } from "../llm/model-spec.ts";
import { type Diagnosis, diagnose } from "./classifier.ts";
import { createLeadTask, evaluateOracle, requestedValues, seedFor, type OracleResult, type Task } from "./task.ts";
import { writeRunReport } from "./report.ts";

export interface RunOptions {
  /** A fault id or a "+"-joined combination (see allScenarios()). */
  fault: Scenario;
  seed: number;
  agent: string | AgentSpec;
  outDir: string;
  task?: Task;
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
  task: Task;
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
  cost?: { mode: string; calls: number; inputTokens: number; outputTokens: number };
}

/** One Playwright browser per process for scripted agents; each run gets its own context. */
let sharedBrowser: Promise<Browser> | undefined;

export function browser(): Promise<Browser> {
  // The memo must never hold a rejected launch: a transient failure at first launch (no profile
  // dir, OOM) would otherwise reject every later job in this worker. Reset on failure so the next
  // caller launches again.
  sharedBrowser ??= chromium.launch({ headless: true }).catch((e) => {
    sharedBrowser = undefined;
    throw e;
  });
  return sharedBrowser;
}

export async function closeBrowser(): Promise<void> {
  if (sharedBrowser) await (await sharedBrowser).close().catch(() => undefined);
  sharedBrowser = undefined;
}

/**
 * Stagehand v4 loads its runtime as a Chrome extension over CDP (Extensions.loadUnpacked on a
 * port connection), which needs a recent Chrome. Point LAB_CHROME_PATH at Chrome for Testing.
 */
function chromePath(): string {
  const path = process.env.LAB_CHROME_PATH;
  if (!path || !existsSync(path)) {
    throw new Error("Stagehand agents need LAB_CHROME_PATH set to a recent Chrome (for Testing) binary. See README.");
  }
  return path;
}

interface Session {
  context: BrowserContext;
  page: Page;
  run(tools: BrowserTools, task: Task): Promise<void>;
  close(): Promise<void>;
  browserVersion: string;
}

registerSecret("app_password", CREDENTIALS.password);

export async function runOnce(options: RunOptions): Promise<RunResult> {
  const spec = resolveAgent(options.agent);
  const task = options.task ?? createLeadTask();
  const runId = `${task.id === "create-lead" ? "" : `${task.id}.`}${normalizeScenario(options.fault)}-s${options.seed}-${spec.id}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const runDir = join(options.outDir, runId);
  const recorder = new Recorder(runDir, { screenshots: options.screenshots ?? false });
  assertApplicable(normalizeScenario(options.fault), task.id);
  const app = await startApp({ fault: options.fault, seed: options.seed, task: task.id, seedLeads: seedFor(task) });

  let gateway = null as ModelGateway | null;
  let selection = null as ModelSelection | null;
  let session: Session;
  try {
    session = await openSession();
  } catch (error) {
    await app.close(); // never leave the test app running when the browser could not start
    throw error;
  }
  async function openSession(): Promise<Session> {
  if (spec.kind === "scripted") {
    return scriptedSession(spec, runDir, options.video ?? false);
  } else {
    const mode = options.modelMode ?? "live";
    selection = mode === "live" ? (options.models ?? defaultSelection()) : null;
    const backend = mode === "live" ? backendForSelection(selection!) : mode === "scripted" ? new ScriptedModel() : null;
    const cassette = mode === "replay" ? readCassette(options.cassette ?? "") : undefined;
    gateway = new ModelGateway(mode, backend, recorder, cassette);
    return stagehandSession(spec, gateway);
  }
  }
  const started = Date.now();
  let agentError: string | null = null;
  try {
    await session.context.addInitScript("window.__name = (fn) => fn;");
    recorder.attach(session.context, session.page);
    const tools = new BrowserTools(session.page, recorder, app.url);
    try {
      await session.run(tools, task);
    } catch (error) {
      agentError = error instanceof Error ? error.message.split("\n")[0]! : String(error);
      if (!recorder.claim()) await tools.done(false, `Agent crashed: ${agentError}`);
    }
  } finally {
    // Always release the browser and the test app, whatever happened above.
    await session.close().catch(() => undefined);
    // Scripted runs share one browser process per worker. If that process died mid-run (killed
    // browser, deadline abort), it stays memoized silently, and every later job in this worker
    // fails with "Target closed" — job succeeded from the queue's view, unrecoverable in fact.
    // When the process is dead, drop the memo so the next claim launches a fresh browser.
    if (spec.kind === "scripted") {
      const b = await browser().catch(() => undefined);
      if (!b?.isConnected()) await closeBrowser();
    }
    await app.close();
  }
  const durationMs = Date.now() - started;
  const cost = gateway
    ? { mode: gateway.status.mode, calls: gateway.status.calls, inputTokens: gateway.status.inputTokens, outputTokens: gateway.status.outputTokens }
    : { mode: options.modelMode ?? "live", calls: 0, inputTokens: 0, outputTokens: 0 };

  const claim = recorder.claim() ?? null;
  const oracle = evaluateOracle(task, app.state, claim ?? undefined);
  const expectation = scenarioTaskPossible(app.fault, task.id) ? "task-success" : "honest-failure";
  const diagnosis = diagnose({
    events: recorder.events,
    oracle,
    ledger: app.state.ledger,
    leads: app.state.leads,
    expectation,
    requestedValues: requestedValues(task),
    agentError,
  });

  recorder.flush();
  if (gateway) gateway.writeCassette(join(runDir, "model-calls.jsonl"));
  const result: RunResult = {
    runId,
    agent: spec.id,
    agentSpec: spec,
    task,
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
    cost,
  };
  writeFileSync(join(runDir, "result.json"), JSON.stringify(scrub({ ...result, appState: app.state }), null, 2));
  writeRunReport(result, recorder.events, task);
  return result;
}

async function scriptedSession(spec: AgentSpec & { kind: "scripted" }, runDir: string, video: boolean): Promise<Session> {
  const b = await browser();
  const context = await b.newContext({
    viewport: { width: 1920, height: 1080 },
    serviceWorkers: "block",
    ...(video ? { recordVideo: { dir: runDir, size: { width: 1920, height: 1080 } } } : {}),
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
  const shBrowser = await localBrowser.launch({ headless: true, port, executablePath: chromePath(), viewport: { width: 1920, height: 1080 } });
  let pw: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
  let stagehand: Stagehand | undefined;
  try {
    pw = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    stagehand = await Stagehand.create({ browser: shBrowser, model: gateway.clientLLM(), logging: { level: "off" } });
  } catch (error) {
    // Don't leave Chrome running when setup fails half-way.
    await stagehand?.close().catch(() => undefined);
    await pw?.close().catch(() => undefined);
    await shBrowser.close().catch(() => undefined);
    throw error;
  }
  return attachStagehand(spec, gateway, shBrowser, pw, stagehand);
}

async function attachStagehand(
  spec: AgentSpec & { kind: "stagehand" },
  gateway: ModelGateway,
  shBrowser: Awaited<ReturnType<typeof localBrowser.launch>>,
  pw: Awaited<ReturnType<typeof chromium.connectOverCDP>>,
  stagehand: Stagehand,
): Promise<Session> {
  const closeAll = async () => {
    await stagehand.close().catch(() => undefined);
    await pw.close().catch(() => undefined);
    await shBrowser.close().catch(() => undefined);
  };
  let shPage: Awaited<ReturnType<typeof shBrowser.context.newPage>>;
  let page: Page;
  const context = pw.contexts()[0]!;
  try {
    const known = new Set(context.pages());
    const pagePromise = context.waitForEvent("page", { predicate: (p) => !known.has(p), timeout: 10000 });
    shPage = await shBrowser.context.newPage();
    page = await pagePromise;
  } catch (error) {
    await closeAll();
    throw error;
  }
  return {
    context,
    page,
    browserVersion: pw.version(),
    run: (tools, task) => runStagehandAgent({ tools, stagehand, page: shPage, gateway }, task, spec),
    close: closeAll,
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
