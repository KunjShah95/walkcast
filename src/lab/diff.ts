/**
 * Baseline comparison and change detection. Pure functions over two recorded runs, with no Node
 * APIs, so the CLI and the dashboard (including exported snapshots) share one implementation.
 *
 * Given a known-good baseline run and a candidate run (a new agent version, or the same agent
 * after the site changed), it reports:
 *   - where the action sequences first diverge (LCS alignment),
 *   - which baseline actions broke (succeeded before, fail now),
 *   - how each page's controls changed (removed / added / renamed),
 *   - for each broken element, the most likely replacement on the new page.
 */

export interface Control {
  role: string;
  name: string;
  selector: string;
}

interface StepLike {
  type: "step";
  stepId: number;
  tool: string;
  args: Record<string, unknown>;
  startedAt: number;
  endedAt: number;
  before: { url: string } | null;
  after: { url: string } | null;
  result?: unknown;
  error?: string;
}

interface RunLike {
  runId: string;
  agent: string;
  fault: string;
  durationMs: number;
  steps: number;
  modelCalls: number;
  diagnosis: { verdict: "pass" | "fail"; findings: { label: string; kind: string }[] };
  oracle: { taskPassed: boolean; claimHonest: boolean; checks: { name: string; passed: boolean; actual: unknown }[] };
}

export interface RecordedRun {
  result: RunLike;
  events: { type: string }[];
}

export interface Action {
  stepId: number;
  tool: string;
  /** What the action was aimed at, in words that survive a re-run (no node ids). */
  target: string;
  path: string;
  ok: boolean;
  error?: string;
}

export type AlignmentRow =
  | { op: "same"; baseline: Action; candidate: Action }
  | { op: "broke"; baseline: Action; candidate: Action }
  | { op: "fixed"; baseline: Action; candidate: Action }
  | { op: "removed"; baseline: Action }
  | { op: "added"; candidate: Action };

interface PageChange {
  path: string;
  removed: Control[];
  added: Control[];
  renamed: { from: Control; to: Control; by: "selector" | "position" }[];
}

interface BrokenTarget {
  stepId: number;
  target: string;
  error?: string;
  /** Baseline control the action used, if it could be identified. */
  was?: Control;
  /** Best replacement on the candidate's page, with why it was chosen. */
  suggestion?: { control: Control; reason: string };
}

export interface DiffReport {
  baseline: { runId: string; agent: string; fault: string; verdict: string };
  candidate: { runId: string; agent: string; fault: string; verdict: string };
  firstDivergence: number | null;
  alignment: AlignmentRow[];
  broken: BrokenTarget[];
  pages: PageChange[];
  outcome: {
    verdict: [string, string];
    taskPassed: [boolean, boolean];
    claimHonest: [boolean, boolean];
    checks: { name: string; baseline: boolean; candidate: boolean; actual: unknown }[];
    newFindings: string[];
    resolvedFindings: string[];
    durationMs: [number, number];
    steps: [number, number];
    modelCalls: [number, number];
  };
  summary: string;
}

const ACTION_TOOLS = /^(act|click|clickSelector|fill|selectOptionAt|selectByLabel|navigate|goto)$/;

function actionsOf(events: { type: string }[]): Action[] {
  return (events as StepLike[])
    .filter((e) => e.type === "step" && ACTION_TOOLS.test(e.tool))
    .map((s) => {
      const a = s.args;
      const target = String(a.instruction ?? a.selector ?? a.name ?? a.path ?? a.label ?? "");
      const value = a.value !== undefined && a.value !== "[REDACTED]" ? ` = ${String(a.value)}` : "";
      const result = s.result as { success?: unknown } | undefined;
      return {
        stepId: s.stepId,
        tool: s.tool,
        target: `${target}${value}`,
        path: pathOf(s.before?.url),
        ok: !s.error && result?.success !== false,
        ...(s.error ? { error: s.error } : {}),
      };
    });
}

/** Last observed control set per page path. */
function controlsByPage(events: { type: string }[], which: "first" | "last"): Map<string, Control[]> {
  const out = new Map<string, Control[]>();
  for (const e of events as StepLike[]) {
    if (e.type !== "step" || e.tool !== "observe") continue;
    const controls = (e.result as { controls?: Control[] } | undefined)?.controls;
    if (!controls) continue;
    const path = pathOf(e.after?.url ?? e.before?.url);
    if (which === "first" && out.has(path)) continue;
    out.set(path, controls);
  }
  return out;
}

export function compareRuns(baseline: RecordedRun, candidate: RecordedRun): DiffReport {
  const a = actionsOf(baseline.events);
  const b = actionsOf(candidate.events);
  const alignment = align(a, b);
  const firstIdx = alignment.findIndex((r) => r.op !== "same");
  const firstDivergence = firstIdx < 0 ? null : stepOf(alignment[firstIdx]!);

  const basePages = controlsByPage(baseline.events, "last");
  const candPages = controlsByPage(candidate.events, "first");
  const pages: PageChange[] = [];
  for (const [path, before] of basePages) {
    const after = candPages.get(path);
    if (!after) continue;
    const change = pageChange(path, before, after);
    if (change.removed.length || change.added.length || change.renamed.length) pages.push(change);
  }

  const broken: BrokenTarget[] = [];
  for (const row of alignment) {
    const failed = row.op === "broke" ? row.candidate : row.op === "added" && !row.candidate.ok ? row.candidate : null;
    if (!failed) continue;
    const before = basePages.get(failed.path) ?? [];
    const after = candPages.get(failed.path) ?? [];
    const was = row.op === "broke" ? identify(row.baseline, before) : identify(failed, before);
    const entry: BrokenTarget = { stepId: failed.stepId, target: failed.target, ...(failed.error ? { error: failed.error } : {}) };
    if (was) {
      entry.was = was;
      const suggestion = replacement(was, before, after);
      if (suggestion) entry.suggestion = suggestion;
    }
    broken.push(entry);
  }

  const br = baseline.result;
  const cr = candidate.result;
  const findings = (r: RunLike) => new Set(r.diagnosis.findings.filter((f) => f.kind !== "incident").map((f) => f.label));
  const bf = findings(br);
  const cf = findings(cr);
  const checks = cr.oracle.checks.map((c) => ({
    name: c.name,
    baseline: br.oracle.checks.find((x) => x.name === c.name)?.passed ?? false,
    candidate: c.passed,
    actual: c.actual,
  }));

  const report: DiffReport = {
    baseline: { runId: br.runId, agent: br.agent, fault: br.fault, verdict: br.diagnosis.verdict },
    candidate: { runId: cr.runId, agent: cr.agent, fault: cr.fault, verdict: cr.diagnosis.verdict },
    firstDivergence,
    alignment,
    broken,
    pages,
    outcome: {
      verdict: [br.diagnosis.verdict, cr.diagnosis.verdict],
      taskPassed: [br.oracle.taskPassed, cr.oracle.taskPassed],
      claimHonest: [br.oracle.claimHonest, cr.oracle.claimHonest],
      checks,
      newFindings: [...cf].filter((f) => !bf.has(f)),
      resolvedFindings: [...bf].filter((f) => !cf.has(f)),
      durationMs: [br.durationMs, cr.durationMs],
      steps: [br.steps, cr.steps],
      modelCalls: [br.modelCalls, cr.modelCalls],
    },
    summary: "",
  };
  report.summary = summarize(report);
  return report;
}

// ------------------------------------------------------------------ alignment

function key(a: Action): string {
  return `${a.tool}|${a.target}`;
}

/** LCS over action keys; unmatched pairs at the same spot become broke/fixed when the target matches. */
function align(a: Action[], b: Action[]): AlignmentRow[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = key(a[i]!) === key(b[j]!) ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const rows: AlignmentRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && key(a[i]!) === key(b[j]!)) {
      const x = a[i++]!;
      const y = b[j++]!;
      rows.push(x.ok && !y.ok ? { op: "broke", baseline: x, candidate: y } : !x.ok && y.ok ? { op: "fixed", baseline: x, candidate: y } : { op: "same", baseline: x, candidate: y });
    } else if (j < m && (i >= n || dp[i]![j + 1]! >= dp[i + 1]![j]!)) {
      rows.push({ op: "added", candidate: b[j++]! });
    } else {
      rows.push({ op: "removed", baseline: a[i++]! });
    }
  }
  return rows;
}

function stepOf(row: AlignmentRow): number {
  return row.op === "added" ? row.candidate.stepId : row.op === "removed" ? row.baseline.stepId : row.candidate.stepId;
}

// ------------------------------------------------------------------ page structure

function pageChange(path: string, before: Control[], after: Control[]): PageChange {
  const sig = (c: Control) => `${c.role}|${c.name}|${c.selector}`;
  const afterSigs = new Set(after.map(sig));
  const beforeSigs = new Set(before.map(sig));
  let removed = before.filter((c) => !afterSigs.has(sig(c)));
  let added = after.filter((c) => !beforeSigs.has(sig(c)));
  const renamed: PageChange["renamed"] = [];

  // Same selector, new name: a relabel.
  for (const r of [...removed]) {
    const match = added.find((x) => x.selector === r.selector && x.role === r.role);
    if (match) {
      renamed.push({ from: r, to: match, by: "selector" });
      removed = removed.filter((x) => x !== r);
      added = added.filter((x) => x !== match);
    }
  }
  // Same role at the same position among its role: a replaced element (new id and label).
  for (const r of [...removed]) {
    const position = before.filter((x) => x.role === r.role).indexOf(r);
    const candidate = after.filter((x) => x.role === r.role)[position];
    if (candidate && added.includes(candidate)) {
      renamed.push({ from: r, to: candidate, by: "position" });
      removed = removed.filter((x) => x !== r);
      added = added.filter((x) => x !== candidate);
    }
  }
  return { path, removed, added, renamed };
}

/** Which baseline control an action targeted: by selector, then by name appearing in the instruction. */
function identify(action: Action, controls: Control[]): Control | undefined {
  const t = action.target.toLowerCase();
  return (
    controls.find((c) => t.includes(c.selector.toLowerCase())) ??
    controls
      .filter((c) => c.name && t.includes(c.name.toLowerCase()))
      .sort((x, y) => y.name.length - x.name.length)[0]
  );
}

function replacement(was: Control, before: Control[], after: Control[]): { control: Control; reason: string } | undefined {
  const same = after.find((c) => c.selector === was.selector && c.role === was.role);
  if (same && same.name !== was.name) return { control: same, reason: `same selector, label changed from “${was.name}” to “${same.name}”` };
  const byName = after.find((c) => c.name === was.name && c.role === was.role);
  if (byName && byName.selector !== was.selector) return { control: byName, reason: `same label, selector changed from ${was.selector} to ${byName.selector}` };
  const position = before.filter((c) => c.role === was.role).indexOf(was);
  const byPosition = position >= 0 ? after.filter((c) => c.role === was.role)[position] : undefined;
  if (byPosition && !before.some((c) => c.selector === byPosition.selector && c.name === byPosition.name)) {
    return { control: byPosition, reason: `the ${ordinal(position + 1)} ${was.role} on the page, now “${byPosition.name}” (${byPosition.selector})` };
  }
  return undefined;
}

function summarize(r: DiffReport): string {
  const parts: string[] = [];
  const [bv, cv] = r.outcome.verdict;
  parts.push(bv === cv ? `Both runs ${cv === "pass" ? "passed" : "failed"}.` : `Baseline ${bv === "pass" ? "passed" : "failed"}; candidate ${cv === "pass" ? "passed" : "failed"}.`);
  if (r.firstDivergence === null) parts.push("The action sequences are identical.");
  else parts.push(`The actions first diverge at candidate step ${r.firstDivergence}.`);
  for (const b of r.broken) {
    parts.push(
      `Step ${b.stepId} (${b.target}) broke` +
        (b.was ? ` on ${b.was.role} “${b.was.name}” (${b.was.selector})` : "") +
        (b.suggestion ? `; likely replacement: ${b.suggestion.reason}.` : "."),
    );
  }
  const changed = r.pages.reduce((n, p) => n + p.removed.length + p.added.length + p.renamed.length, 0);
  if (changed) parts.push(`${changed} control change(s) across ${r.pages.length} page(s).`);
  if (r.outcome.newFindings.length) parts.push(`New findings: ${r.outcome.newFindings.join(", ")}.`);
  if (r.outcome.resolvedFindings.length) parts.push(`Resolved: ${r.outcome.resolvedFindings.join(", ")}.`);
  return parts.join(" ");
}

function pathOf(url: string | undefined): string {
  if (!url) return "";
  const m = url.match(/^[a-z]+:\/\/[^/]+(\/[^?#]*)/i);
  return m ? m[1]! : url;
}

function ordinal(n: number): string {
  return n === 1 ? "first" : n === 2 ? "second" : n === 3 ? "third" : `${n}th`;
}
