import { formatRate } from "./stats.ts";

export interface ExperimentSummary {
  meta: Record<string, unknown> & { startedAt: string; caveat: string; trials: number; seeds: number; baseline: string; candidates: string[] };
  detection: { fault: string; runs: number; failing: number; correctlyAttributed: number; spuriousCauses: string[]; unexplained: number }[];
  falsePositives: { baselineCleanRunsFailed: number; baselineCleanRuns: number; candidateCleanRunsFailed: number; candidateCleanRuns: number };
  reproduction: { fixture: string; reproduced: number; trials: number; drift: string[] }[];
  regression: { fixture: string; agent: string; passes: number; trials: number; passAll: boolean; causes: string[] }[];
  falseSuccess: { runs: number; successClaims: number; falseSuccesses: number };
  rates: { reproductionTrials: { k: number; n: number }; passByAgent: { agent: string; passes: number; trials: number; fixturesPassed: number; fixtures: number }[] };
  cost: { agentRuns: number; modelCalls: number; liveInputTokens: number; liveOutputTokens: number; medianRunMs: number; p95RunMs: number };
}

export function renderSummary(s: ExperimentSummary): string {
  const lines: string[] = [];
  lines.push("# Experiment summary", "");
  lines.push(`> ${s.meta.caveat}`, "");
  lines.push("## Model", "");
lines.push(`Model selection: ${typeof s.meta.models === "object" && s.meta.models ? `agent=${(s.meta.models as any).agent}, stagehand=${(s.meta.models as any).stagehand}` : "defaults from LAB_AGENT_MODEL/LAB_STAGEHAND_MODEL"}`, "");
lines.push(`Model mode: ${s.meta.modelMode ?? "default (scripted for replay)"}. Live-token accounting only applies to runs whose mode is "live".`, "");

lines.push("## Run shape", "");
lines.push(`Seeds per fault: ${s.meta.seeds} · trials per replay: ${s.meta.trials} · baseline: ${s.meta.baseline} · candidates: ${s.meta.candidates.join(", ")}`, "");

  lines.push("## Failure detection and attribution (baseline runs)", "");
  lines.push("| Fault | Runs | Failed (oracle) | Correct primary cause | Spurious causes | Unexplained |", "|---|---|---|---|---|---|");
  for (const d of s.detection) {
    lines.push(`| ${d.fault} | ${d.runs} | ${d.failing} | ${d.fault === "none" ? "n/a" : `${d.correctlyAttributed}/${d.failing}`} | ${d.spuriousCauses.join(", ") || "none"} | ${d.unexplained} |`);
  }
  const fp = s.falsePositives;
  lines.push("", `False positives on clean runs: baseline ${fp.baselineCleanRunsFailed}/${fp.baselineCleanRuns}, candidates ${fp.candidateCleanRunsFailed}/${fp.candidateCleanRuns}.`, "");
  const fs = s.falseSuccess;
  lines.push("## False success (baseline)", "");
  lines.push(`Success claims: ${fs.successClaims}/${fs.runs}. False success among those claims: ${formatRate(fs.falseSuccesses, fs.successClaims)}.`, "");
  lines.push("A false success is a run where the agent claimed the task worked and the application's records disagree.", "");
  lines.push("## Rates", "");
  lines.push(`Reproduction of the original causes: ${formatRate(s.rates.reproductionTrials.k, s.rates.reproductionTrials.n)}.`, "");
  for (const row of s.rates.passByAgent) {
    lines.push(`- ${row.agent} trial pass rate: ${formatRate(row.passes, row.trials)}; fixtures passing every trial: ${formatRate(row.fixturesPassed, row.fixtures)}.`);
  }
  lines.push("");

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
  lines.push("", "## Cost", "", `Agent runs: ${s.cost.agentRuns} · model calls: ${s.cost.modelCalls} · live tokens in/out: ${s.cost.liveInputTokens}/${s.cost.liveOutputTokens} · median run: ${s.cost.medianRunMs} ms · p95 run: ${s.cost.p95RunMs} ms`, "");
  return lines.join("\n");
}
