import type { ReplaySummary } from "./fixture.ts";

/**
 * A gate: run the fixtures and say whether anything regressed.
 *
 * The lab can already replay a fixture and say pass or fail. What it could not do was
 * answer the question a pull request asks — "did this change break anything that used to
 * work?" — because nothing remembered what used to work. The baseline is that memory: a
 * file in the repository saying, for each fixture, what the agent did last time.
 *
 * The rules are deliberately plain:
 *   - a fixture that passed and now fails is a regression, and the gate fails;
 *   - a fixture that failed and still fails is a known failure, and the gate does not fail
 *     (it is already red; failing the build for it teaches people to ignore the gate);
 *   - a fixture that failed and now passes is a fix, and the baseline should be updated;
 *   - a fixture with no baseline entry is new: it passes, or it blocks.
 */

/** What the gate remembers about each fixture. */
export interface GateBaseline {
  /** fixture id → what it did last time. */
  [fixtureId: string]: {
    agent: string;
    verdict: "pass" | "fail";
    trials: number;
    updatedAt: string;
  };
}

export type GateVerdict = "ok" | "regression" | "fixed" | "known-failure" | "new-broken";

export interface GateRow {
  fixture: string;
  agent: string;
  expected: "pass" | "fail" | "new";
  actual: "pass" | "fail";
  passes: number;
  trials: number;
  verdict: GateVerdict;
  /** The causes of the failures, when it failed. */
  causes: string[];
  note?: string;
}

export interface GateResult {
  agent: string;
  trials: number;
  rows: GateRow[];
  regressions: number;
  fixed: number;
  newBroken: number;
  /** The gate fails when something that worked stopped working, or something new is broken. */
  failed: boolean;
}

/** What one replay means next to what the baseline remembers. */
export function judge(expected: "pass" | "fail" | "new", actual: "pass" | "fail"): GateVerdict {
  if (expected === "new") return actual === "pass" ? "ok" : "new-broken";
  if (expected === actual) return actual === "pass" ? "ok" : "known-failure";
  return actual === "fail" ? "regression" : "fixed";
}

/**
 * The gate's verdict on a set of replays.
 *
 * The baseline is keyed by fixture id and agent, because the same fixture is expected to
 * behave differently for different agents.
 */
export function gate(replays: ReplaySummary[], baseline: GateBaseline, agent: string, trials: number): GateResult {
  const rows: GateRow[] = replays.map((r) => {
    const key = `${r.fixture}@${r.agent}`;
    const known = baseline[key] ?? baseline[r.fixture];
    const expected: GateRow["expected"] = known ? known.verdict : "new";
    const actual = r.passAll ? "pass" : "fail";
    const causes = [...new Set(r.trials.flatMap((t) => t.causes))];
    return {
      fixture: r.fixture,
      agent: r.agent,
      expected,
      actual,
      passes: r.passes,
      trials: r.trials.length,
      verdict: judge(expected, actual),
      causes,
      ...(r.environmentDrift.length ? { note: `the environment drifted: ${r.environmentDrift.join(", ")}` } : {}),
    };
  });
  const regressions = rows.filter((r) => r.verdict === "regression").length;
  const newBroken = rows.filter((r) => r.verdict === "new-broken").length;
  return {
    agent,
    trials,
    rows,
    regressions,
    fixed: rows.filter((r) => r.verdict === "fixed").length,
    newBroken,
    failed: regressions > 0 || newBroken > 0,
  };
}

/** The baseline a set of replays should be remembered as. */
export function baselineFrom(replays: ReplaySummary[]): GateBaseline {
  const out: GateBaseline = {};
  const now = new Date().toISOString();
  for (const r of replays) {
    out[`${r.fixture}@${r.agent}`] = { agent: r.agent, verdict: r.passAll ? "pass" : "fail", trials: r.trials.length, updatedAt: now };
  }
  return out;
}

/** The gate, in words. Written for a terminal, and for a pull-request comment. */
export function summariseGate(result: GateResult): string[] {
  const lines: string[] = [];
  const mark = { ok: "✓", regression: "✗", fixed: "★", "known-failure": "·", "new-broken": "✗" } as const;
  for (const row of result.rows) {
    const expected = row.expected === "new" ? "new" : row.expected === "pass" ? "pass" : "fail";
    const detail = row.actual === "fail" && row.causes.length ? ` — ${row.causes.join(", ")}` : "";
    lines.push(`${mark[row.verdict]} ${row.fixture} (${row.agent}) expected ${expected}, got ${row.actual}${detail}`);
  }
  if (result.regressions) lines.push(`${result.regressions} regression${result.regressions === 1 ? "" : "s"}: something that used to work stopped working.`);
  if (result.newBroken) lines.push(`${result.newBroken} new fixture${result.newBroken === 1 ? "" : "s"} failed.`);
  if (result.fixed) lines.push(`${result.fixed} fixture${result.fixed === 1 ? "" : "s"} now pass${result.fixed === 1 ? "es" : ""} — update the baseline.`);
  if (!result.regressions && !result.newBroken) lines.push("Nothing regressed.");
  return lines;
}
