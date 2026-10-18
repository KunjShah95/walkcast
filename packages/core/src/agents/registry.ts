import { log } from "../ops/log.ts";
import { AGENTS, type AgentConfig } from "./scripted.ts";
import { STAGEHAND_AGENTS, type StagehandAgentSpec } from "./stagehand-agent.ts";

type ScriptedAgentSpec = AgentConfig & { kind: "scripted" };

/**
 * An agent adapter contributed by a plugin (plugins.ts): any code that drives the browser through
 * BrowserTools, so its runs are captured, judged by the oracle and classified like the built-ins.
 */
export interface PluginAgentSpec {
  kind: "plugin";
  id: string;
  description: string;
  /** `lab` (default) when it spends money or reaches outside the app; `public` when it's a pure script. */
  exposure?: "public" | "lab";
  run(tools: import("../capture/tools.ts").BrowserTools, task: import("../lab/task.ts").Task): Promise<void>;
}

export type AgentSpec = ScriptedAgentSpec | StagehandAgentSpec | PluginAgentSpec;

const PLUGIN_AGENTS = new Map<string, PluginAgentSpec>();

export function registerAgent(agent: Omit<PluginAgentSpec, "kind">): void {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(agent.id)) throw new Error(`Agent id '${agent.id}' must be letters, digits and dashes.`);
  if (builtinAgents().some((a) => a.id === agent.id)) throw new Error(`Agent '${agent.id}' is built in and can't be replaced by a plugin.`);
  PLUGIN_AGENTS.set(agent.id, { ...agent, kind: "plugin" });
}

function builtinAgents(): AgentSpec[] {
  return [...Object.values(AGENTS).map((a) => ({ ...a, kind: "scripted" as const })), ...Object.values(STAGEHAND_AGENTS)];
}

/** Every runnable agent version, by id: built in, then plugin agents. */
export function allAgents(): AgentSpec[] {
  return [...builtinAgents(), ...PLUGIN_AGENTS.values()];
}

export function resolveAgent(agent: string | AgentSpec): AgentSpec {
  if (typeof agent !== "string") return agent;
  const spec = allAgents().find((a) => a.id === agent);
  if (!spec) {
    log.warn("agent.unknown", { requested: agent, known: allAgents().map((a) => a.id) });
    throw new Error(`Unknown agent '${agent}'. Known: ${allAgents().map((a) => a.id).join(", ")}`);
  }
  return spec;
}

/**
 * Who may run an agent. `public`: deterministic scripts, no model cost, safe on any server.
 * `lab`: drives a real model, so a live run spends provider tokens; on an exposed server live runs
 * need LAB_ALLOW_LIVE_RUNS=1, and they get their own daily ceiling (agentDailyLimit).
 */
export function agentExposure(spec: AgentSpec): "public" | "lab" {
  if (spec.kind === "plugin") return spec.exposure ?? "lab";
  return spec.kind === "scripted" ? "public" : "lab";
}

/**
 * Extra per-account daily ceiling for one agent, on top of the per-kind run quota, or null for
 * none. `LAB_AGENT_RUNS_PER_DAY_<ID>` (id upper-cased, `-` → `_`) overrides; model-backed agents
 * default to `LAB_LLM_RUNS_PER_DAY` (20), scripted ones have no extra ceiling.
 */
export function agentDailyLimit(spec: AgentSpec, env: NodeJS.ProcessEnv = process.env): number | null {
  const own = env[`LAB_AGENT_RUNS_PER_DAY_${spec.id.toUpperCase().replace(/-/g, "_")}`];
  if (own !== undefined && own.trim() !== "" && Number.isFinite(Number(own))) return Math.max(0, Math.trunc(Number(own)));
  if (spec.kind !== "stagehand") return null;
  const llm = Number(env.LAB_LLM_RUNS_PER_DAY ?? 20);
  return Number.isFinite(llm) ? Math.max(0, Math.trunc(llm)) : 20;
}
