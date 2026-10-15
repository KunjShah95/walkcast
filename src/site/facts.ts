/**
 * The numbers the public pages quote. What the code fixes — the benchmark grid, the provider
 * routes — is counted; what the experiment measures — correct causes, false alarms, false
 * success — is read from the newest published experiment under `results/`, so the site cannot
 * claim a number the data does not back. A checkout without `results/` falls back to the
 * committed copy in pages.ts.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { TASK_IDS, allScenarios } from "../app/faults.ts";
import { PROVIDERS } from "../llm/providers.ts";
import { withRates, type ServedExperimentSummary, type StoredExperimentSummary } from "../ui/data.ts";

export interface ExperimentFacts {
  id: string;
  /** The run's date (YYYY-MM-DD), so published numbers can carry one. */
  at: string | null;
  /** Injected-fault runs where the classifier named the right primary cause. */
  detected: { k: number; n: number };
  /** Fault-free runs the classifier flagged as failures. */
  falseAlarms: { k: number; n: number };
  /** Runs that claimed success where the application's records disagreed; null when not recorded. */
  falseSuccess: { k: number; n: number } | null;
  agents: string[];
  /** Every agent was one of the scripted v0–v2 agents, not an LLM. */
  scripted: boolean;
}

export interface SiteFacts {
  /** The benchmark grid: the control, each single fault and every applicable pair, summed over the tasks. */
  scenarios: number;
  /** Model provider routes behind the one gateway. */
  providers: number;
  experiment: ExperimentFacts | null;
}

const cache = new Map<string, SiteFacts>();

/** The facts for a checkout, computed once per process: published numbers do not move under a running server. */
export function siteFacts(root = process.cwd()): SiteFacts {
  const key = resolve(root);
  let facts = cache.get(key);
  if (!facts) {
    facts = {
      scenarios: TASK_IDS.reduce((n, task) => n + allScenarios("pairs", task).length, 0),
      providers: Object.keys(PROVIDERS).length,
      experiment: newestExperiment(key),
    };
    cache.set(key, facts);
  }
  return facts;
}

/** The newest `results/<id>/summary.json`, by file time, so a re-run becomes the published one. */
function newestExperiment(root: string): ExperimentFacts | null {
  const results = join(root, "results");
  if (!existsSync(results)) return null;
  let newest: { id: string; mtimeMs: number; summary: ServedExperimentSummary } | null = null;
  for (const id of readdirSync(results)) {
    const path = join(results, id, "summary.json");
    try {
      const mtimeMs = statSync(path).mtimeMs;
      if (newest && mtimeMs <= newest.mtimeMs) continue;
      newest = { id, mtimeMs, summary: withRates(JSON.parse(readFileSync(path, "utf8")) as StoredExperimentSummary) };
    } catch {
      // no summary.json in this directory, or a half-written one: try the next
    }
  }
  return newest ? factsOf(newest.id, newest.summary) : null;
}

function factsOf(id: string, s: ServedExperimentSummary): ExperimentFacts | null {
  const injected = (s.detection ?? []).filter((d) => d.fault !== "none");
  const detected = {
    k: injected.reduce((n, d) => n + (d.correctlyAttributed ?? 0), 0),
    n: injected.reduce((n, d) => n + (d.failing ?? 0), 0),
  };
  const clean = s.falsePositives ?? { baselineCleanRunsFailed: 0, baselineCleanRuns: 0, candidateCleanRunsFailed: 0, candidateCleanRuns: 0 };
  const falseAlarms = {
    k: clean.baselineCleanRunsFailed + clean.candidateCleanRunsFailed,
    n: clean.baselineCleanRuns + clean.candidateCleanRuns,
  };
  // An experiment with no injected or no clean runs behind it is nothing to publish.
  if (detected.n === 0 || falseAlarms.n === 0) return null;
  const agents = [s.meta?.baseline, ...(s.meta?.candidates ?? [])].filter((a): a is string => typeof a === "string");
  return {
    id,
    at: typeof s.meta?.startedAt === "string" ? s.meta.startedAt.slice(0, 10) : null,
    detected,
    falseAlarms,
    falseSuccess: s.falseSuccess && s.falseSuccess.successClaims > 0 ? { k: s.falseSuccess.falseSuccesses, n: s.falseSuccess.successClaims } : null,
    agents,
    scripted: agents.length > 0 && agents.every((a) => /^v\d+$/.test(a)),
  };
}
