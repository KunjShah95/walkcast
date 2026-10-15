import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Scenario, describeScenario } from "../app/faults.ts";
import { resolveAgent, type AgentSpec } from "../agents/registry.ts";
import type { GatewayMode } from "../llm/gateway.ts";
import type { ModelSelection } from "../llm/model-spec.ts";
import { causes, symptoms, type FindingLabel } from "./classifier.ts";
import { runOnce, type RunResult } from "./runner.ts";
import type { Task } from "./task.ts";

/**
 * A regression fixture: everything needed to put a failed run's environment back together
 * and decide, from application state, whether a new agent version still fails.
 */
export interface FixtureManifest {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  task: Task;
  environment: {
    fault: Scenario;
    faultDescription: string;
    seed: number;
    timings: RunResult["timings"];
    appVersion: string;
    playwrightVersion: string;
    browserVersion: string;
  };
  /** What a fixed agent must achieve. */
  expectation: RunResult["expectation"];
  assertions: string[];
  original: {
    runId: string;
    agent: AgentSpec;
    /** LLM agents: how the original run's model calls were produced, and the recorded cassette. */
    model: {
      mode: GatewayMode;
      selection: ModelSelection | null;
      calls: number;
      inputTokens: number;
      outputTokens: number;
      cassette: string;
    } | null;
    verdict: "pass" | "fail";
    symptoms: FindingLabel[];
    causes: FindingLabel[];
    claim: RunResult["claim"];
    failedChecks: string[];
  };
  /** Stated limits of this reproduction. */
  reproduction: { mode: "controlled-simulation"; notes: string[] };
}

export interface Fixture {
  dir: string;
  manifest: FixtureManifest;
}

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "app");

export function appVersion(): string {
  const hash = createHash("sha256");
  for (const file of ["server.ts", "faults.ts"]) hash.update(readFileSync(join(APP_DIR, file)));
  return hash.digest("hex").slice(0, 12);
}

export async function writeFixture(result: RunResult, task: Task, fixturesDir: string): Promise<Fixture> {
  const diagnosisCauses = causes(result.diagnosis);
  const id = `${task.id === "create-lead" ? "" : `${task.id}.`}${result.fault}-s${result.seed}-${diagnosisCauses[0] ?? "unexplained"}`;
  const dir = join(fixturesDir, id);
  if (existsSync(dir)) throw new Error(`Fixture ${dir} already exists; refusing to overwrite.`);
  mkdirSync(dir, { recursive: true });
  const manifest: FixtureManifest = {
    schemaVersion: 1,
    id,
    createdAt: new Date().toISOString(),
    task,
    environment: {
      fault: result.fault,
      faultDescription: describeScenario(result.fault),
      seed: result.seed,
      timings: result.timings,
      appVersion: appVersion(),
      playwrightVersion: playwrightVersion(),
      browserVersion: result.browserVersion,
    },
    expectation: result.expectation,
    assertions: result.oracle.checks.map((c) => c.name),
    original: {
      runId: result.runId,
      agent: result.agentSpec,
      model: result.model
        ? { mode: result.model.mode, selection: result.model.selection, calls: result.model.calls, inputTokens: result.model.inputTokens, outputTokens: result.model.outputTokens, cassette: "model-calls.jsonl" }
        : null,
      verdict: result.diagnosis.verdict,
      symptoms: symptoms(result.diagnosis),
      causes: diagnosisCauses,
      claim: result.claim,
      failedChecks: result.oracle.checks.filter((c) => !c.passed).map((c) => c.name),
    },
    reproduction: {
      mode: "controlled-simulation",
      notes: [
        "The application, its seed data and the injected fault are rebuilt from this manifest; the original network traffic is not replayed.",
        "Fault timings are derived from the seed, so the race is re-created rather than recorded.",
        "Scripted agents are deterministic. LLM agents replay their recorded model outputs (model-calls.jsonl) for an exact, zero-cost re-run, or run live over repeated trials (pass^k) to judge a prompt or model change.",
      ],
    },
  };
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  copyFileSync(join(result.runDir, "trace.jsonl"), join(dir, "original-trace.jsonl"));
  copyFileSync(join(result.runDir, "report.md"), join(dir, "original-report.md"));
  if (result.model) copyFileSync(join(result.runDir, "model-calls.jsonl"), join(dir, "model-calls.jsonl"));
  return { dir, manifest };
}

export function loadFixture(dir: string): Fixture {
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as FixtureManifest;
  if (manifest.schemaVersion !== 1) throw new Error(`Unsupported fixture schema ${String(manifest.schemaVersion)}`);
  // Fixtures written before LLM agents existed: scripted agent, no model calls.
  if (!("kind" in manifest.original.agent)) manifest.original.agent = { ...(manifest.original.agent as object), kind: "scripted" } as AgentSpec;
  manifest.original.model ??= null;
  return { dir, manifest };
}

export interface ReplaySummary {
  fixture: string;
  agent: string;
  modelMode: GatewayMode | null;
  trials: {
    verdict: "pass" | "fail";
    causes: FindingLabel[];
    symptoms: FindingLabel[];
    durationMs: number;
    runDir: string;
    modelCalls: number;
    replayDrift: number;
    replayExhausted: boolean;
  }[];
  passes: number;
  /** pass^k: the agent met the fixture's expectation in every trial. */
  passAll: boolean;
  /** Trials that failed with every cause the original run was diagnosed with. */
  reproduced: number;
  environmentDrift: string[];
}

export interface ReplayOptions {
  /**
   * LLM agents only. Default: replay the recorded model outputs when re-running the agent that
   * produced the fixture, otherwise call the model live.
   */
  modelMode?: GatewayMode;
  /** Live mode: models to use (e.g. to test whether another model fixes the failure). */
  models?: ModelSelection;
}

export async function replayFixture(
  fixture: Fixture,
  agent: string | AgentSpec,
  trials: number,
  outDir: string,
  options: ReplayOptions = {},
): Promise<ReplaySummary> {
  const { manifest } = fixture;
  const spec = resolveAgent(agent);
  const drift: string[] = [];
  if (manifest.environment.appVersion !== appVersion()) drift.push(`app changed (${manifest.environment.appVersion} → ${appVersion()})`);
  if (manifest.environment.playwrightVersion !== playwrightVersion()) drift.push(`playwright ${manifest.environment.playwrightVersion} → ${playwrightVersion()}`);
  const cassette = manifest.original.model ? join(fixture.dir, manifest.original.model.cassette) : undefined;
  const sameAgent = spec.id === manifest.original.agent.id;
  const modelMode: GatewayMode | undefined =
    spec.kind === "scripted" ? undefined : (options.modelMode ?? (sameAgent && cassette && existsSync(cassette) ? "replay" : "live"));
  if (modelMode === "replay" && !sameAgent) drift.push(`replaying ${manifest.original.agent.id}'s model calls with agent ${spec.id}`);

  const results: RunResult[] = [];
  for (let i = 0; i < trials; i++) {
    results.push(
      await runOnce({
        fault: manifest.environment.fault,
        seed: manifest.environment.seed,
        agent: spec,
        task: manifest.task,
        outDir,
        ...(modelMode ? { modelMode } : {}),
        ...(modelMode === "replay" ? { cassette } : {}),
        ...(options.models ? { models: options.models } : {}),
      }),
    );
  }
  const summaries = results.map((r) => ({
    verdict: r.diagnosis.verdict,
    causes: causes(r.diagnosis),
    symptoms: symptoms(r.diagnosis),
    durationMs: r.durationMs,
    runDir: r.runDir,
    modelCalls: r.modelCalls,
    replayDrift: r.model?.drifted.length ?? 0,
    replayExhausted: r.model?.exhausted ?? false,
  }));
  for (const s of summaries) {
    if (s.replayExhausted) drift.push("model replay ran past the recording (the run diverged)");
    else if (s.replayDrift) drift.push(`${s.replayDrift} model request(s) differed from the recording`);
  }
  const reproduced = summaries.filter(
    (s) => s.verdict === "fail" && manifest.original.causes.every((c) => s.causes.includes(c)),
  ).length;
  const passes = summaries.filter((s) => s.verdict === "pass").length;
  return {
    fixture: manifest.id,
    agent: spec.id,
    modelMode: modelMode ?? null,
    trials: summaries,
    passes,
    passAll: passes === trials,
    reproduced,
    environmentDrift: [...new Set(drift)],
  };
}

function playwrightVersion(): string {
  const pkg = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "node_modules", "playwright", "package.json");
  return (JSON.parse(readFileSync(pkg, "utf8")) as { version: string }).version;
}
