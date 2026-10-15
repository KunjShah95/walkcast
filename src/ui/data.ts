import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import type { TraceEvent } from "../capture/recorder.ts";
import type { FixtureManifest } from "../lab/fixture.ts";
import type { RunResult } from "../lab/runner.ts";

/**
 * Read-only index over what the lab writes to disk: runs (runs/, results/<exp>/runs/),
 * fixtures (fixtures/, runs/_fixtures/, results/<exp>/fixtures/) and experiment summaries.
 * The dashboard never writes.
 */

export interface RunSummary {
  id: string;
  /** Path relative to the workspace root; the run's stable key. */
  dir: string;
  source: string;
  agent: string;
  agentKind: "scripted" | "stagehand";
  task: string;
  fault: string;
  seed: number;
  expectation: string;
  verdict: "pass" | "fail";
  /** Ground truth: the application state is correct. */
  taskPassed: boolean;
  /** The agent's claim matches the application state. */
  claimHonest: boolean;
  symptoms: string[];
  causes: string[];
  incidents: string[];
  claim: { success: boolean; summary: string } | null;
  durationMs: number;
  steps: number;
  modelCalls: number;
  modelMode: string | null;
  createdAt: number;
  screenshots: number;
}

export interface RunDetail {
  summary: RunSummary;
  result: RunResult & { appState?: { leads: unknown[]; ledger: unknown[] } };
  events: TraceEvent[];
  report: string;
}

export interface FixtureSummary {
  id: string;
  dir: string;
  source: string;
  manifest: FixtureManifest;
}

export interface ExperimentSummary {
  id: string;
  dir: string;
  summary: Record<string, unknown>;
}

export interface LabIndex {
  generatedAt: string;
  runs: RunSummary[];
  fixtures: FixtureSummary[];
  experiments: ExperimentSummary[];
}

export class LabData {
  readonly root: string;

  constructor(root = process.cwd()) {
    this.root = resolve(root);
  }

  index(): LabIndex {
    const runs: RunSummary[] = [];
    const fixtures: FixtureSummary[] = [];
    const experiments: ExperimentSummary[] = [];

    const runRoots: [string, string][] = [["runs", "runs"], ["baselines", "baseline"]];
    const fixtureRoots: [string, string][] = [["fixtures", "fixtures"], [join("runs", "_fixtures"), "runs"]];
    for (const exp of this.dirs("results")) {
      const expDir = join("results", exp);
      runRoots.push([join(expDir, "runs"), `experiment:${exp}`]);
      fixtureRoots.push([join(expDir, "fixtures"), `experiment:${exp}`]);
      const summaryPath = join(this.root, expDir, "summary.json");
      if (existsSync(summaryPath)) experiments.push({ id: exp, dir: expDir, summary: readJson(summaryPath) });
    }

    for (const [base, source] of runRoots) {
      for (const name of this.dirs(base)) {
        if (name.startsWith("_")) continue;
        const summary = this.runSummary(join(base, name), source);
        if (summary) runs.push(summary);
      }
    }
    for (const [base, source] of fixtureRoots) {
      for (const name of this.dirs(base)) {
        const manifestPath = join(this.root, base, name, "manifest.json");
        if (existsSync(manifestPath)) fixtures.push({ id: name, dir: join(base, name), source, manifest: readJson(manifestPath) });
      }
    }
    runs.sort((a, b) => b.createdAt - a.createdAt);
    return { generatedAt: new Date().toISOString(), runs, fixtures, experiments };
  }

  run(dir: string): RunDetail | null {
    const abs = this.safe(dir);
    if (!abs || !existsSync(join(abs, "result.json"))) return null;
    const summary = this.runSummary(relative(this.root, abs), "runs");
    if (!summary) return null;
    const tracePath = join(abs, "trace.jsonl");
    const events = existsSync(tracePath)
      ? (readFileSync(tracePath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) as TraceEvent[])
      : [];
    const reportPath = join(abs, "report.md");
    return {
      summary,
      result: readJson(join(abs, "result.json")),
      events,
      report: existsSync(reportPath) ? readFileSync(reportPath, "utf8") : "",
    };
  }

  /** Resolve a workspace-relative path, refusing anything outside the lab's output folders. */
  safe(path: string): string | null {
    const abs = resolve(this.root, path);
    const allowed = ["runs", "results", "fixtures", "baselines"].map((d) => join(this.root, d) + sep);
    return allowed.some((prefix) => abs.startsWith(prefix)) ? abs : null;
  }

  private runSummary(dir: string, source: string): RunSummary | null {
    const resultPath = join(this.root, dir, "result.json");
    if (!existsSync(resultPath)) return null;
    let r: RunResult;
    try {
      r = readJson(resultPath);
    } catch {
      return null;
    }
    const findings = r.diagnosis?.findings ?? [];
    const labels = (kind: string) => [...new Set(findings.filter((f) => f.kind === kind).map((f) => f.label))];
    const files = readdirSync(join(this.root, dir));
    return {
      id: r.runId,
      dir,
      source,
      agent: r.agent,
      agentKind: (r.agentSpec?.kind as RunSummary["agentKind"]) ?? "scripted",
      task: r.task?.id ?? "create-lead",
      fault: r.fault,
      seed: r.seed,
      expectation: r.expectation,
      verdict: r.diagnosis.verdict,
      taskPassed: r.oracle?.taskPassed ?? false,
      claimHonest: r.oracle?.claimHonest ?? false,
      symptoms: labels("symptom"),
      causes: labels("cause"),
      incidents: labels("incident"),
      claim: r.claim ? { success: r.claim.success, summary: r.claim.summary } : null,
      durationMs: r.durationMs,
      steps: r.steps,
      modelCalls: r.modelCalls ?? 0,
      modelMode: r.model?.mode ?? null,
      createdAt: statSync(resultPath).mtimeMs,
      screenshots: files.filter((f) => f.endsWith(".jpg")).length,
    };
  }

  private dirs(base: string): string[] {
    const abs = join(this.root, base);
    if (!existsSync(abs)) return [];
    return readdirSync(abs, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  }
}

function readJson<T = Record<string, unknown>>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
