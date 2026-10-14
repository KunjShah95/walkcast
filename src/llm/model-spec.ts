import { ClaudeBackend, DEFAULT_CLAUDE_OPTIONS } from "./claude.ts";
import type { AgentRequest, AgentResponse, ModelBackend, StagehandParams, StagehandResult } from "./gateway.ts";
import { OpenAICompatibleBackend } from "./openai-compatible.ts";
import { provider } from "./providers.ts";

/**
 * Model specs:
 *   "anthropic:claude-opus-5-5"                         one provider and model
 *   "groq:openai/gpt-oss-120b,openrouter:openai/gpt-oss-120b"   fallback chain, tried in order
 * A bare model id ("claude-opus-5-5") means the anthropic provider.
 */
export const DEFAULT_MODEL_SPEC = `anthropic:${DEFAULT_CLAUDE_OPTIONS.model}`;

export interface ModelSelection {
  /** The outer loop that decides each browser step. */
  agent: string;
  /** Stagehand's element resolution inside act()/observe()/extract(). */
  stagehand: string;
}

export function defaultSelection(): ModelSelection {
  const agent = process.env.LAB_AGENT_MODEL ?? DEFAULT_MODEL_SPEC;
  return { agent, stagehand: process.env.LAB_STAGEHAND_MODEL ?? agent };
}

export function backendFor(spec: string): ModelBackend {
  const specs = spec.split(",").map((s) => s.trim()).filter(Boolean);
  if (specs.length === 0) throw new Error(`Empty model spec '${spec}'`);
  // A single spec fails fast (e.g. missing key); chain members are built on first use, so a
  // provider without credentials is just a failed link and the chain moves on.
  return specs.length === 1 ? single(specs[0]!) : new FallbackBackend(specs.map((s) => new LazyBackend(s)));
}

class LazyBackend implements ModelBackend {
  private backend: ModelBackend | undefined;
  constructor(readonly name: string) {}
  private get(): ModelBackend {
    this.backend ??= single(this.name);
    return this.backend;
  }
  agent(request: AgentRequest): Promise<AgentResponse> {
    return Promise.resolve().then(() => this.get().agent(request));
  }
  stagehand(params: StagehandParams): Promise<StagehandResult> {
    return Promise.resolve().then(() => this.get().stagehand(params));
  }
}

function single(spec: string): ModelBackend {
  const colon = spec.indexOf(":");
  const [providerId, model] = colon < 0 ? ["anthropic", spec] : [spec.slice(0, colon), spec.slice(colon + 1)];
  const info = provider(providerId);
  if (!model) throw new Error(`Model spec '${spec}' needs a model, e.g. ${info.id}:${info.exampleModel}`);
  return info.kind === "anthropic" ? new ClaudeBackend({ ...DEFAULT_CLAUDE_OPTIONS, model }) : new OpenAICompatibleBackend(info, model);
}

/**
 * Tries each backend in order and moves on when one throws (missing key, rate limit, outage,
 * unsupported request). Which backend served each call is recorded by the gateway, so a run
 * that silently switched provider is visible in its trace.
 */
export class FallbackBackend implements ModelBackend {
  readonly name: string;
  lastServed: string | undefined;

  constructor(private readonly backends: ModelBackend[]) {
    this.name = backends.map((b) => b.name).join(" → ");
  }

  agent(request: AgentRequest): Promise<AgentResponse> {
    return this.tryEach((b) => b.agent(request));
  }

  stagehand(params: StagehandParams): Promise<StagehandResult> {
    return this.tryEach((b) => b.stagehand(params));
  }

  private async tryEach<T>(call: (b: ModelBackend) => Promise<T>): Promise<T> {
    const errors: string[] = [];
    for (const backend of this.backends) {
      try {
        const result = await call(backend);
        this.lastServed = backend.name;
        return result;
      } catch (error) {
        errors.push(`${backend.name}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
      }
    }
    throw new Error(`All model backends failed. ${errors.join(" | ")}`);
  }
}

/** Sends each channel to its own backend (e.g. a strong model for the loop, a fast one for act()). */
export class RoutedBackend implements ModelBackend {
  readonly name: string;

  constructor(
    private readonly agentBackend: ModelBackend,
    private readonly stagehandBackend: ModelBackend,
  ) {
    this.name = agentBackend.name === stagehandBackend.name ? agentBackend.name : `agent=${agentBackend.name}; stagehand=${stagehandBackend.name}`;
  }

  get lastServed(): string | undefined {
    return undefined;
  }

  agent(request: AgentRequest): Promise<AgentResponse> {
    return this.agentBackend.agent(request);
  }

  stagehand(params: StagehandParams): Promise<StagehandResult> {
    return this.stagehandBackend.stagehand(params);
  }

  servedBy(channel: "agent" | "stagehand"): string {
    const b = channel === "agent" ? this.agentBackend : this.stagehandBackend;
    return (b as Partial<FallbackBackend>).lastServed ?? b.name;
  }
}

export function backendForSelection(selection: ModelSelection): RoutedBackend {
  const agent = backendFor(selection.agent);
  const stagehand = selection.stagehand === selection.agent ? agent : backendFor(selection.stagehand);
  return new RoutedBackend(agent, stagehand);
}
