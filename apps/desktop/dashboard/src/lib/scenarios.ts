/** The failure library **generated at fault time**.

 * Every scenario is produced from the fault definition in `packages/core/src/app/faults.ts`
 * by mapping the fault's narrative onto the customer-facing `Scenario` shape. Nothing here is
 * hand-entered: add a fault to `FAULTS` (with its title, risk, scorecard and timeline) and the
 * failure library grows with it. The story is never duplicated between two files, so it cannot
 * drift: the only place a scenario's text lives is the fault that represents that failure.
 */

import {
  FAULTS,
  type BuiltinFaultId,
} from "../../../../../packages/core/src/app/faults.ts";

export type ScenarioTone = "info" | "warn" | "fail" | "pass";

export interface ScenarioStep {
  at: number;
  text: string;
  tone: ScenarioTone;
  nodes: string[];
  edges: string[];
}

export interface ScenarioScoreLine {
  label: string;
  points: number | null;
  why: string;
}

export type ScenarioGrade = "Brittle" | "Fragile" | "Dependable" | "Robust" | "Production-ready";

export interface Scenario {
  id: string;
  /** The name a client sees in the list. */
  title: string;
  /** What the agent was asked to do, in the customer's language. */
  task: string;
  /** The fault ids this scenario injects, for the pipeline badge. */
  faults: string[];
  /** Short label for the agent, in the customer's language. */
  agentLabel: string;
  /** Which agent id to run live for this scenario. */
  liveAgent: string;
  liveTask: string;
  /** Whether the live agent is model-driven (changes the pipeline diagram). */
  stagehand: boolean;
  verdict: "pass" | "fail";
  /** The outcome in one sentence: what the agent did and what was true. */
  headline: string;
  /** What goes wrong in the app, plainly. */
  whatHappens: string;
  /** What this costs in production, plainly. */
  risk: string;
  /** What an agent has to do to be trusted here. */
  trustworthy: string;
  score: { total: number; grade: ScenarioGrade; lines: ScenarioScoreLine[] };
  steps: ScenarioStep[];
}

interface FaultDefinition {
  description: string;
  taskPossible: boolean;
  id?: string;
  title?: string;
  task?: string;
  liveAgent?: string;
  liveTask?: string;
  stagehand?: boolean;
  verdict?: "pass" | "fail";
  headline?: string;
  whatHappens?: string;
  risk?: string;
  trustworthy?: string;
  score?: { total: number; grade: ScenarioGrade; lines: ScenarioScoreLine[] };
  steps?: ScenarioStep[];
}

const S = (at: number, text: string, tone: ScenarioStep["tone"], nodes: string[], edges: string[]): ScenarioStep => ({
  at,
  text,
  tone,
  nodes,
  edges,
});

/**
 * Built-in failures, generated at module load time from the fault definitions.
 *
 * Each fault in `FAULTS` carries the narrative the failure library needs (title, headline,
 * steps, scorecard), so adding a fault below adds a scenario above. The scenario `id` is the
 * fault's own id so a scenario can always be traced back to the fault it replays.
 */
export const SCENARIOS: Scenario[] = Object.entries(FAULTS as unknown as Record<string, FaultDefinition>)
  .filter(([faultKey]) => faultKey !== "none")
  .map(([faultKey, fault]) => ({
    id: fault.id ?? faultKey,
    title: fault.title ?? faultKey,
    task: fault.task ?? "Create the lead Acme Corp and assign it to Priya Shah",
    faults: [faultKey as BuiltinFaultId],
    agentLabel: "Model-driven agent",
    liveAgent: fault.liveAgent ?? "sh-p1",
    liveTask: fault.liveTask ?? "create-lead",
    stagehand: fault.stagehand ?? true,
    verdict: fault.verdict ?? (fault.taskPossible ? "pass" : "fail"),
    headline: fault.headline ?? fault.description,
    whatHappens: fault.whatHappens ?? fault.description,
    risk: fault.risk ?? fault.description,
    trustworthy: fault.trustworthy ?? fault.description,
    score: fault.score ?? {
      total: 20,
      grade: "Dependable",
      lines: [{ label: "Outcome", points: 10, why: fault.description }],
    },
    steps: fault.steps ?? [S(0, fault.description, "info", [], [])],
  }));

/**
 * The built-in scripted agent that plays this scenario's part when the model-driven one can't run:
 * Stagehand needs Google Chrome or Edge installed, and the desktop app only ships its own Chromium.
 * The naive v0 reproduces every "broken" outcome here and the fixed v1 every "handled" one, with
 * the same fault and the same check against the app's records.
 */
export function scriptedStandIn(s: Scenario): "v0" | "v1" {
  return s.verdict === "fail" ? "v0" : "v1";
}

export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
