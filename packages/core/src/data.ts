import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import type { TraceEvent } from "./capture/recorder.ts";
import type { FixtureManifest } from "./lab/fixture.ts";
import type { RunResult } from "./lab/runner.ts";
import type { ExperimentSummary as ExperimentSummaryData } from "./lab/summary.ts";

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

interface FixtureSummary {
  id: string;
  dir: string;
  source: string;
  manifest: FixtureManifest;
}

export interface ExperimentSummary {
  id: string;
  dir: string;
  summary: ServedExperimentSummary;
}

/**
 * An experiment summary.json as stored on disk. The false-success section was added after the
 * first published experiment, so files written before it lack the field.
 */
export type StoredExperimentSummary = Omit<ExperimentSummaryData, "falseSuccess"> & {
  falseSuccess?: ExperimentSummaryData["falseSuccess"];
};

/** What the dashboard is served: `rates` is always filled in, derived if the file predates it. */
export type ServedExperimentSummary = Omit<StoredExperimentSummary, "rates"> & {
  rates: ExperimentSummaryData["rates"];
};

/**
 * Older summaries already carry the rows `rates` is aggregated from (reproduction and regression
 * per agent), so derive it rather than render an experiment whose numbers the file does contain.
 */
export function withRates(s: StoredExperimentSummary): ServedExperimentSummary {
  if (s.rates && Array.isArray(s.rates.passByAgent)) return { ...s, rates: s.rates };
  // A torn or truncated file gets empty rates rather than taking the whole dashboard down.
  const regression = Array.isArray(s.regression) ? s.regression : [];
  const reproduction = Array.isArray(s.reproduction) ? s.reproduction : [];
  const agents = [...new Set(regression.map((r) => r.agent))];
  return {
    ...s,
    rates: {
      reproductionTrials: {
        k: reproduction.reduce((n, r) => n + r.reproduced, 0),
        n: reproduction.reduce((n, r) => n + r.trials, 0),
      },
      passByAgent: agents.map((agent) => {
        const rows = regression.filter((r) => r.agent === agent);
        return {
          agent,
          passes: rows.reduce((n, r) => n + r.passes, 0),
          trials: rows.reduce((n, r) => n + r.trials, 0),
          fixturesPassed: rows.filter((r) => r.passAll).length,
          fixtures: rows.length,
        };
      }),
    },
  };
}

/** A narrated site recording (src/record), as listed by the dashboard. */
export interface RecordingSummary {
  id: string;
  /** Account that asked for it (absent for CLI recordings). */
  owner?: string;
  dir: string;
  url: string;
  createdAt: string;
  durationMs: number;
  signIn: { attempted: boolean; outcome: string; detail: string };
  pages: { url: string; title: string; status: number | null; controls: number }[];
  skipped: { url: string; reason: string }[];
  captions: { start: number; end: number; text: string }[];
  media: { video: string | null; mp4: string | null; webm?: string | null; audio: string | null; captions: string; voice: string; note: string };
}

export interface LabIndex {
  generatedAt: string;
  recordings: RecordingSummary[];
  runs: RunSummary[];
  fixtures: FixtureSummary[];
  experiments: ExperimentSummary[];
}

export class LabData {
  readonly root: string;

  constructor(root = process.cwd()) {
    this.root = resolve(root);
  }

  /** Parsed run summaries keyed by result.json path, reused while its mtime is unchanged. */
  private cache = new Map<string, { mtimeMs: number; summary: RunSummary | null }>();
  /** Parsed recordings keyed by recording.json path, reused while its mtime is unchanged. */
  private recordingCache = new Map<string, { mtimeMs: number; summary: RecordingSummary | null }>();

  /** Newest `limit` runs (all by default). Unchanged runs are served from an mtime-keyed cache. */
  index(limit = Number.POSITIVE_INFINITY): LabIndex {
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
      if (existsSync(summaryPath)) experiments.push({ id: exp, dir: `results/${exp}`, summary: withRates(readJson<StoredExperimentSummary>(summaryPath)) });
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
        if (existsSync(manifestPath)) fixtures.push({ id: name, dir: `${base}/${name}`, source, manifest: readJson(manifestPath) });
      }
    }
    runs.sort((a, b) => b.createdAt - a.createdAt);
    runs.splice(limit);
    return { generatedAt: new Date().toISOString(), recordings: this.recordings(), runs, fixtures, experiments };
  }

  recordingOwner(name: string): string | undefined {
    const path = join(this.root, "recordings", name, "recording.json");
    try {
      return existsSync(path) ? (readJson(path) as RecordingSummary).owner : undefined;
    } catch {
      return undefined;
    }
  }

  recordings(): RecordingSummary[] {
    const out: RecordingSummary[] = [];
    for (const name of this.dirs("recordings")) {
      const path = join(this.root, "recordings", name, "recording.json");
      if (!existsSync(path)) continue;
      let mtimeMs: number;
      try { mtimeMs = statSync(path).mtimeMs; } catch { continue; }
      const hit = this.recordingCache.get(path);
      let r: RecordingSummary | null;
      if (hit && hit.mtimeMs === mtimeMs) r = hit.summary;
      else {
        try { r = readJson(path) as RecordingSummary; } catch { r = null; }
        this.recordingCache.set(path, { mtimeMs, summary: r });
      }
      if (!r) continue; // half-written recording
      // `join` would give "recordings\<name>" on Windows. `dir` becomes part of a URL
      // (`/files/<dir>/<file>`), so it must use forward slashes on every platform or the
      // client's per-segment encoding turns the separator into %5C and the server 404s.
      out.push({ ...r, dir: `recordings/${name}` });
    }
    return out.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
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
    const allowed = ["runs", "results", "fixtures", "baselines", "recordings"].map((d) => join(this.root, d) + sep);
    return allowed.some((prefix) => abs.startsWith(prefix)) ? abs : null;
  }

  private runSummary(dir: string, source: string): RunSummary | null {
    const resultPath = join(this.root, dir, "result.json");
    let mtimeMs: number;
    try {
      mtimeMs = statSync(resultPath).mtimeMs;
    } catch {
      return null;
    }
    const hit = this.cache.get(resultPath);
    if (hit && hit.mtimeMs === mtimeMs) return hit.summary ? { ...hit.summary, source } : null;
    const summary = this.parseRun(dir, source, resultPath, mtimeMs);
    this.cache.set(resultPath, { mtimeMs, summary });
    return summary;
  }

  private parseRun(dir: string, source: string, resultPath: string, mtimeMs: number): RunSummary | null {
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
      // A URL path in the dashboard (`/files/<dir>/<name>`), so forward slashes on every platform.
      // `join` builds these with the OS separator, which the client's per-segment encoding turns
      // into %5C and the server then 404s. Filesystem reads below still use the native form.
      dir: dir.split(sep).join("/"),
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
      createdAt: mtimeMs,
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
