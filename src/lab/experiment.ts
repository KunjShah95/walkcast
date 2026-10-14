import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type FaultId, type Scenario, allScenarios, parseScenario } from "../app/faults.ts";
import { resolveAgent } from "../agents/registry.ts";
import type { GatewayMode } from "../llm/gateway.ts";
import type { ModelSelection } from "../llm/model-spec.ts";
import { causes, type FindingLabel } from "./classifier.ts";
import { replayFixture, writeFixture, type Fixture, type ReplaySummary } from "./fixture.ts";
import { runOnce, type RunResult } from "./runner.ts";
import { createLeadTask } from "./task.ts";

/** The cause each injected fault should be attributed to, and other causes that are also correct. */
/** Expected causes for a scenario: the union over its faults. A clean scenario expects none. */
export function expectedCauses(scenario: Scenario): { primary: FindingLabel[]; alsoValid: FindingLabel[] } {
  const faults = parseScenario(scenario);
  return {
    primary: faults.map((f) => EXPECTED_CAUSES[f].primary).filter((c): c is FindingLabel => c !== null),
    alsoValid: faults.flatMap((f) => EXPECTED_CAUSES[f].alsoValid),
  };
}

export const EXPECTED_CAUSES: Record<FaultId, { primary: FindingLabel | null; alsoValid: FindingLabel[] }> = {
  none: { primary: null, alsoValid: [] },
  "stale-owners": { primary: "stale-observation", alsoValid: [] },
  "gateway-timeout": { primary: "unsafe-retry", alsoValid: ["app-error"] },
  "silent-owner-drop": { primary: "app-dropped-field", alsoValid: [] },
  "session-expiry": { primary: "auth-lost", alsoValid: [] },
  "ui-drift": { primary: "locator-not-found", alsoValid: [] },
};

export interface ExperimentOptions {
  seeds: number;
  trials: number;
  concurrency: number;
  baseline: string;
  candidates: string[];
  outDir: string;
  /** Single faults only (default) or also every pair of faults. */
  scenarios?: "singles" | "pairs";
  /** LLM agents: model mode for new runs (default live). Fixture replays follow replayFixture's default. */
  modelMode?: GatewayMode;
  models?: ModelSelection;
}

export async function runExperiment(options: ExperimentOptions): Promise<string> {
  const { seeds, trials, concurrency, baseline, candidates, outDir } = options;
  const mode = { ...(options.modelMode ? { modelMode: options.modelMode } : {}), ...(options.models ? { models: options.models } : {}) };
  const runsDir = join(outDir, "runs");
  const fixturesDir = join(outDir, "fixtures");
  mkdirSync(fixturesDir, { recursive: true });
  const task = createLeadTask();
  const faults = allScenarios(options.scenarios ?? "singles");
  const startedAt = new Date();
  const log = (msg: string) => console.log(`[${((Date.now() - startedAt.getTime()) / 1000).toFixed(0)}s] ${msg}`);

  // ---- Phase 1: baseline runs, diagnosis accuracy and false positives
  log(`phase 1: ${faults.length} scenarios × ${seeds} seeds with baseline ${baseline}`);
  const jobs = faults.flatMap((fault) => Array.from({ length: seeds }, (_, i) => ({ fault, seed: i + 1 })));
  const baselineRuns = await pool(jobs, concurrency, (j) => runOnce({ fault: j.fault, seed: j.seed, agent: baseline, task, outDir: runsDir, ...mode }));

  const detection = faults.map((fault) => {
    const runs = baselineRuns.filter((r) => r.fault === fault);
    const failing = runs.filter((r) => r.diagnosis.verdict === "fail");
    const expected = expectedCauses(fault);
    // A failing run is attributed correctly when at least one of the injected faults' causes is
    // found; with two faults the agent may fail on the first before ever meeting the second.
    const correct = failing.filter((r) => expected.primary.some((c) => causes(r.diagnosis).includes(c)));
    const spurious = failing.flatMap((r) => causes(r.diagnosis).filter((c) => !expected.primary.includes(c) && !expected.alsoValid.includes(c)));
    return {
      fault,
      runs: runs.length,
      failing: failing.length,
      correctlyAttributed: correct.length,
      spuriousCauses: [...new Set(spurious)],
      unexplained: failing.filter((r) => causes(r.diagnosis).includes("unexplained")).length,
    };
  });

  // ---- Phase 2: every baseline failure becomes a fixture; replay with the same agent
  const fixtures: Fixture[] = [];
  for (const r of baselineRuns.filter((r) => r.diagnosis.verdict === "fail")) fixtures.push(await writeFixture(r, task, fixturesDir));
  log(`phase 2: replaying ${fixtures.length} fixtures × ${trials} trials with ${baseline}`);
  const reproduction = await pool(fixtures, concurrency, (f) => replayFixture(f, baseline, trials, runsDir));

  // ---- Phase 3: regression comparison across agent versions
  const comparisons: ReplaySummary[] = [...reproduction];
  for (const agent of candidates) {
    log(`phase 3: replaying ${fixtures.length} fixtures × ${trials} trials with ${agent}`);
    comparisons.push(...(await pool(fixtures, concurrency, (f) => replayFixture(f, agent, trials, runsDir, { ...(options.modelMode === "scripted" ? { modelMode: "scripted" as const } : {}), ...(options.models ? { models: options.models } : {}) }))));
  }
  log(`phase 3: control runs (fault=none) for ${candidates.join(", ")}`);
  const controlJobs = candidates.flatMap((agent) => Array.from({ length: seeds }, (_, i) => ({ agent, seed: i + 1 })));
  const controls = await pool(controlJobs, concurrency, (j) => runOnce({ fault: "none", seed: j.seed, agent: j.agent, task, outDir: runsDir, ...mode }));

  const summary = {
    meta: {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      seeds,
      trials,
      concurrency,
      baseline,
      candidates,
      agents: Object.fromEntries([baseline, ...candidates].map((a) => [a, resolveAgent(a)])),
      modelMode: options.modelMode ?? null,
      models: options.models ?? null,
      browserVersion: baselineRuns[0]?.browserVersion ?? "unknown",
      node: process.version,
      caveat: caveat([baseline, ...candidates], options.modelMode),
    },
    detection,
    falsePositives: {
      baselineCleanRunsFailed: baselineRuns.filter((r) => r.fault === "none" && r.diagnosis.verdict === "fail").length,
      baselineCleanRuns: baselineRuns.filter((r) => r.fault === "none").length,
      candidateCleanRunsFailed: controls.filter((r) => r.diagnosis.verdict === "fail").length,
      candidateCleanRuns: controls.length,
    },
    reproduction: reproduction.map((r) => ({ fixture: r.fixture, reproduced: r.reproduced, trials: r.trials.length, drift: r.environmentDrift })),
    regression: comparisons.map((c) => ({ fixture: c.fixture, agent: c.agent, passes: c.passes, trials: c.trials.length, passAll: c.passAll, causes: [...new Set(c.trials.flatMap((t) => t.causes))] })),
    cost: costSummary([...baselineRuns, ...controls], comparisons),
  };

  writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  writeFileSync(join(outDir, "summary.md"), renderSummary(summary));
  log(`done → ${join(outDir, "summary.md")}`);
  return join(outDir, "summary.md");
}

function caveat(agents: string[], mode: GatewayMode | undefined): string {
  const llm = agents.map(resolveAgent).some((a) => a.kind === "stagehand");
  if (!llm) {
    return "Agents are deterministic scripts, not LLMs. These numbers validate the harness (capture, oracle, classifier, fixtures, replay); they say nothing about LLM agent behaviour.";
  }
  if (mode === "scripted") {
    return "Stagehand agents ran against the scripted stand-in model, not Claude. These numbers validate the Stagehand integration (agent loop, act(), model gateway, record/replay); they say nothing about model behaviour.";
  }
  return "Stagehand agents ran against a live model for new runs; fixture replays of the same agent used recorded model calls. Model behaviour varies between runs: read pass^k over trials, not single runs.";
}

function costSummary(runs: RunResult[], replays: ReplaySummary[]) {
  const durations = [...runs.map((r) => r.durationMs), ...replays.flatMap((r) => r.trials.map((t) => t.durationMs))].sort((a, b) => a - b);
  return {
    agentRuns: durations.length,
    modelCalls: runs.reduce((n, r) => n + r.modelCalls, 0) + replays.reduce((n, r) => n + r.trials.reduce((m, t) => m + t.modelCalls, 0), 0),
    liveInputTokens: runs.reduce((n, r) => n + (r.model?.mode === "live" ? r.model.inputTokens : 0), 0),
    liveOutputTokens: runs.reduce((n, r) => n + (r.model?.mode === "live" ? r.model.outputTokens : 0), 0),
    medianRunMs: durations[Math.floor(durations.length / 2)] ?? 0,
    p95RunMs: durations[Math.floor(durations.length * 0.95)] ?? 0,
  };
}

type Summary = {
  meta: Record<string, unknown> & { caveat: string; trials: number; seeds: number; baseline: string; candidates: string[] };
  detection: { fault: string; runs: number; failing: number; correctlyAttributed: number; spuriousCauses: string[]; unexplained: number }[];
  falsePositives: { baselineCleanRunsFailed: number; baselineCleanRuns: number; candidateCleanRunsFailed: number; candidateCleanRuns: number };
  reproduction: { fixture: string; reproduced: number; trials: number; drift: string[] }[];
  regression: { fixture: string; agent: string; passes: number; trials: number; passAll: boolean; causes: string[] }[];
  cost: ReturnType<typeof costSummary>;
};

function renderSummary(s: Summary): string {
  const lines: string[] = [];
  lines.push("# Experiment summary", "");
  lines.push(`> ${s.meta.caveat}`, "");
  lines.push(`Seeds per fault: ${s.meta.seeds} · trials per replay: ${s.meta.trials} · baseline: ${s.meta.baseline} · candidates: ${s.meta.candidates.join(", ")}`, "");

  lines.push("## Failure detection and attribution (baseline runs)", "");
  lines.push("| Fault | Runs | Failed (oracle) | Correct primary cause | Spurious causes | Unexplained |", "|---|---|---|---|---|---|");
  for (const d of s.detection) {
    lines.push(`| ${d.fault} | ${d.runs} | ${d.failing} | ${d.fault === "none" ? "n/a" : `${d.correctlyAttributed}/${d.failing}`} | ${d.spuriousCauses.join(", ") || "none"} | ${d.unexplained} |`);
  }
  const fp = s.falsePositives;
  lines.push("", `False positives on clean runs: baseline ${fp.baselineCleanRunsFailed}/${fp.baselineCleanRuns}, candidates ${fp.candidateCleanRunsFailed}/${fp.candidateCleanRuns}.`, "");

  lines.push("## Reproduction (fixture replayed with the agent that failed)", "");
  const reproducedAll = s.reproduction.filter((r) => r.reproduced === r.trials).length;
  lines.push(`${reproducedAll}/${s.reproduction.length} fixtures reproduced the original causes in every trial.`, "");
  lines.push("| Fixture | Reproduced | Environment drift |", "|---|---|---|");
  for (const r of s.reproduction) lines.push(`| ${r.fixture} | ${r.reproduced}/${r.trials} | ${r.drift.join("; ") || "none"} |`);
  lines.push("");

  lines.push("## Regression comparison (pass^k per fixture)", "");
  const agents = [...new Set(s.regression.map((r) => r.agent))];
  const fixtures = [...new Set(s.regression.map((r) => r.fixture))];
  lines.push(`| Fixture | ${agents.join(" | ")} |`, `|---|${agents.map(() => "---").join("|")}|`);
  for (const f of fixtures) {
    const cells = agents.map((a) => {
      const r = s.regression.find((x) => x.fixture === f && x.agent === a);
      return r ? `${r.passAll ? "✅" : "❌"} ${r.passes}/${r.trials}${r.passAll ? "" : ` (${r.causes.join(", ")})`}` : "";
    });
    lines.push(`| ${f} | ${cells.join(" | ")} |`);
  }
  lines.push("", "## Cost", "", `Agent runs: ${s.cost.agentRuns} · model calls: ${s.cost.modelCalls} (live tokens in/out: ${s.cost.liveInputTokens}/${s.cost.liveOutputTokens}) · median run: ${s.cost.medianRunMs} ms · p95 run: ${s.cost.p95RunMs} ms`, "");
  return lines.join("\n");
}

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]!);
      }
    }),
  );
  return results;
}

