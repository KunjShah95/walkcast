import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FAULTS, type FaultId } from "../app/faults.ts";
import { agentConfig, type AgentConfig } from "../agents/scripted.ts";
import { causes, symptoms, type FindingLabel } from "./classifier.ts";
import { browser, runOnce, type RunResult } from "./runner.ts";
import type { CreateLeadTask } from "./task.ts";

/**
 * A regression fixture: everything needed to put a failed run's environment back together
 * and decide, from application state, whether a new agent version still fails.
 */
export interface FixtureManifest {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  task: CreateLeadTask;
  environment: {
    fault: FaultId;
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
    agent: AgentConfig;
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

export async function writeFixture(result: RunResult, task: CreateLeadTask, fixturesDir: string): Promise<Fixture> {
  const diagnosisCauses = causes(result.diagnosis);
  const id = `${result.fault}-s${result.seed}-${diagnosisCauses[0] ?? "unexplained"}`;
  const dir = join(fixturesDir, id);
  if (existsSync(dir)) throw new Error(`Fixture ${dir} already exists; refusing to overwrite.`);
  mkdirSync(dir, { recursive: true });
  const b = await browser();
  const manifest: FixtureManifest = {
    schemaVersion: 1,
    id,
    createdAt: new Date().toISOString(),
    task,
    environment: {
      fault: result.fault,
      faultDescription: FAULTS[result.fault].description,
      seed: result.seed,
      timings: result.timings,
      appVersion: appVersion(),
      playwrightVersion: playwrightVersion(),
      browserVersion: b.version(),
    },
    expectation: result.expectation,
    assertions: result.oracle.checks.map((c) => c.name),
    original: {
      runId: result.runId,
      agent: agentConfig(result.agent),
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
        "Scripted agents are deterministic; an LLM agent must be replayed with its recorded model outputs or judged over repeated trials (pass^k).",
      ],
    },
  };
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  copyFileSync(join(result.runDir, "trace.jsonl"), join(dir, "original-trace.jsonl"));
  copyFileSync(join(result.runDir, "report.md"), join(dir, "original-report.md"));
  return { dir, manifest };
}

export function loadFixture(dir: string): Fixture {
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as FixtureManifest;
  if (manifest.schemaVersion !== 1) throw new Error(`Unsupported fixture schema ${String(manifest.schemaVersion)}`);
  return { dir, manifest };
}

export interface ReplaySummary {
  fixture: string;
  agent: string;
  trials: { verdict: "pass" | "fail"; causes: FindingLabel[]; symptoms: FindingLabel[]; durationMs: number; runDir: string }[];
  passes: number;
  /** pass^k: the agent met the fixture's expectation in every trial. */
  passAll: boolean;
  /** Trials that failed with every cause the original run was diagnosed with. */
  reproduced: number;
  environmentDrift: string[];
}

export async function replayFixture(
  fixture: Fixture,
  agent: string | AgentConfig,
  trials: number,
  outDir: string,
): Promise<ReplaySummary> {
  const { manifest } = fixture;
  const drift: string[] = [];
  if (manifest.environment.appVersion !== appVersion()) drift.push(`app changed (${manifest.environment.appVersion} → ${appVersion()})`);
  if (manifest.environment.playwrightVersion !== playwrightVersion()) drift.push(`playwright ${manifest.environment.playwrightVersion} → ${playwrightVersion()}`);

  const results: RunResult[] = [];
  for (let i = 0; i < trials; i++) {
    results.push(
      await runOnce({ fault: manifest.environment.fault, seed: manifest.environment.seed, agent, task: manifest.task, outDir }),
    );
  }
  const summaries = results.map((r) => ({
    verdict: r.diagnosis.verdict,
    causes: causes(r.diagnosis),
    symptoms: symptoms(r.diagnosis),
    durationMs: r.durationMs,
    runDir: r.runDir,
  }));
  const reproduced = summaries.filter(
    (s) => s.verdict === "fail" && manifest.original.causes.every((c) => s.causes.includes(c)),
  ).length;
  const passes = summaries.filter((s) => s.verdict === "pass").length;
  return {
    fixture: manifest.id,
    agent: typeof agent === "string" ? agent : agent.id,
    trials: summaries,
    passes,
    passAll: passes === trials,
    reproduced,
    environmentDrift: drift,
  };
}

function playwrightVersion(): string {
  const pkg = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "node_modules", "playwright", "package.json");
  return (JSON.parse(readFileSync(pkg, "utf8")) as { version: string }).version;
}
