import { AGENTS, type AgentConfig } from "./scripted.ts";
import { STAGEHAND_AGENTS, type StagehandAgentSpec } from "./stagehand-agent.ts";

type ScriptedAgentSpec = AgentConfig & { kind: "scripted" };
export type AgentSpec = ScriptedAgentSpec | StagehandAgentSpec;

/** Every runnable agent version, by id. */
export function allAgents(): AgentSpec[] {
  return [...Object.values(AGENTS).map((a) => ({ ...a, kind: "scripted" as const })), ...Object.values(STAGEHAND_AGENTS)];
}

export function resolveAgent(agent: string | AgentSpec): AgentSpec {
  if (typeof agent !== "string") return agent;
  const spec = allAgents().find((a) => a.id === agent);
  if (!spec) throw new Error(`Unknown agent '${agent}'. Known: ${allAgents().map((a) => a.id).join(", ")}`);
  return spec;
}
