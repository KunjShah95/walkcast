import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { NetworkEvent, StepEvent, TraceEvent } from "../capture/recorder.ts";
import type { RunResult } from "./runner.ts";
import type { CreateLeadTask } from "./task.ts";

/** Human-readable diagnostic report: verdict, findings with cited steps, then the step timeline. */
export function writeRunReport(result: RunResult, events: TraceEvent[], task: CreateLeadTask): string {
  const steps = events.filter((e): e is StepEvent => e.type === "step");
  const requests = events.filter((e): e is NetworkEvent => e.type === "request");
  const cited = new Set(result.diagnosis.findings.flatMap((f) => f.evidenceSteps));
  const lines: string[] = [];

  lines.push(`# Run ${result.runId}`, "");
  lines.push(`- **Task:** ${task.goal}`);
  lines.push(`- **Agent:** ${result.agent} · **Fault:** ${result.fault} · **Seed:** ${result.seed} · **Timings:** ${JSON.stringify(result.timings)}`);
  lines.push(`- **Verdict:** ${result.diagnosis.verdict.toUpperCase()} (expectation: ${result.expectation})`);
  lines.push(`- **Agent claim:** ${result.claim ? `${result.claim.success ? "success" : "failure"} — "${result.claim.summary}"` : "none"}`);
  lines.push(`- **Duration:** ${result.durationMs} ms · **Steps:** ${result.steps} · **Model calls:** ${result.modelCalls}`);
  if (result.agentError) lines.push(`- **Agent error:** ${result.agentError}`);
  lines.push("");

  lines.push("## Ground truth (application state)", "", "| Check | Result | Expected | Actual |", "|---|---|---|---|");
  for (const c of result.oracle.checks) {
    lines.push(`| ${c.name} | ${c.passed ? "✅" : "❌"} | \`${JSON.stringify(c.expected)}\` | \`${JSON.stringify(c.actual)}\` |`);
  }
  lines.push("");

  lines.push("## Findings", "");
  if (result.diagnosis.findings.length === 0) lines.push("None.");
  for (const f of result.diagnosis.findings) {
    lines.push(`- **${f.label}** (${f.kind}, ${f.confidence}) — ${f.explanation}${f.evidenceSteps.length ? ` _Steps: ${f.evidenceSteps.join(", ")}_` : ""}`);
  }
  lines.push("");

  lines.push("## Timeline", "", "| Step | t (ms) | Tool | Args | Before → after | Network | Notes |", "|---|---|---|---|---|---|---|");
  for (const s of steps) {
    const net = requests
      .filter((r) => r.stepId === s.stepId)
      .map((r) => `${r.method} ${new URL(r.url).pathname} → ${r.status ?? r.failure ?? "…"}`)
      .join("<br>");
    const notes = [
      s.error ? `⚠️ ${s.error}` : "",
      s.target ? `target: observed '${s.target.observedName}' (step ${s.target.observedInStep}, ${s.target.observationAgeMs} ms ago), at action '${s.target.nameAtAction}'${s.target.stale ? " **STALE**" : ""}` : "",
      s.screenshot ? `[screenshot](${basename(s.screenshot)})` : "",
    ]
      .filter(Boolean)
      .join("<br>");
    const transition = `${path(s.before?.url)} \`${s.before?.fingerprint ?? "-"}\` → ${path(s.after?.url)} \`${s.after?.fingerprint ?? "-"}\``;
    lines.push(`| ${cited.has(s.stepId) ? `**${s.stepId}**` : s.stepId} | ${s.startedAt}–${s.endedAt} | ${s.tool} | \`${JSON.stringify(s.args)}\` | ${transition} | ${net} | ${notes} |`);
  }
  const claim = events.find((e) => e.type === "claim");
  if (claim && claim.type === "claim") lines.push(`| ${claim.stepId} | ${claim.at} | done | \`${JSON.stringify({ success: claim.success, leadId: claim.leadId })}\` | | | ${claim.summary} |`);
  lines.push("");

  const file = join(result.runDir, "report.md");
  writeFileSync(file, lines.join("\n"));
  return file;
}

function path(url: string | undefined): string {
  if (!url) return "-";
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
