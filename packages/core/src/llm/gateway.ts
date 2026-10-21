import type Anthropic from "@anthropic-ai/sdk";
import type { ClientLLM } from "@browserbasehq/stagehand";
import type { Recorder } from "../capture/recorder.ts";
import { scrub, unscrub } from "../capture/secrets.ts";
import { type BudgetState, type RunBudget } from "./budget.ts";
import { type CassetteEntry as GenericEntry, type CassetteHooks, CassettePlayer, hashRequest, promptText, readCassette as readEntries, writeCassette } from "./cassette.ts";

export { normalizeText, remapElementIds } from "./cassette.ts";

export function readCassette(path: string): CassetteEntry[] {
  return readEntries<Channel>(path);
}

/**
 * Every model call made during a run goes through this gateway, whichever component makes it:
 * - "agent": the outer tool-calling loop deciding the next browser tool,
 * - "stagehand": Stagehand's own act/observe/extract element resolution (its ClientLLM hook).
 *
 * Modes:
 * - live: call the backend (Claude) and record request + response to a cassette.
 * - replay: return the recorded responses in order, so a failed run re-executes with zero
 *   model calls and zero sampling variance. Prompt drift is detected and reported.
 * - scripted: a deterministic stand-in backend, used to test the plumbing without credentials.
 */

export type Channel = "agent" | "stagehand";
export type StagehandParams = Parameters<ClientLLM["generate"]>[0];
export type StagehandResult = Awaited<ReturnType<ClientLLM["generate"]>>;

/** The subset of a Messages API response the agent loop consumes. */
export type AgentResponse = Pick<Anthropic.Beta.BetaMessage, "content" | "stop_reason" | "model"> & {
  usage?: { input_tokens: number; output_tokens: number };
};

export interface AgentRequest {
  system: string;
  tools: Anthropic.Beta.BetaTool[];
  messages: Anthropic.Beta.BetaMessageParam[];
}

export interface ModelBackend {
  readonly name: string;
  agent(request: AgentRequest): Promise<AgentResponse>;
  stagehand(params: StagehandParams): Promise<StagehandResult>;
}

export type CassetteEntry = GenericEntry<Channel>;

/** Secrets never reach a cassette: placeholders on disk and in hashes, restored in memory. */
const HOOKS: CassetteHooks = { redact: scrub, restore: unscrub };

export type GatewayMode = "live" | "replay" | "scripted";

export interface GatewayStatus {
  mode: GatewayMode;
  calls: number;
  /** Replay only: sequence numbers whose request no longer matches the recording. */
  drifted: { channel: Channel; seq: number }[];
  /** Replay only: the run asked for more model calls than were recorded. */
  exhausted: boolean;
  inputTokens: number;
  outputTokens: number;
}

export class ModelGateway {
  readonly entries: CassetteEntry[] = [];
  readonly status: GatewayStatus;
  private seq: Record<Channel, number> = { agent: 0, stagehand: 0 };
  private player: CassettePlayer<Channel> | null = null;

  constructor(
    readonly mode: GatewayMode,
    private readonly backend: ModelBackend | null,
    private readonly recorder: Recorder,
    cassette?: CassetteEntry[],
    /**
     * What this run may spend. Enforced in live mode only: a replay spends nothing and a
     * scripted run talks to a stand-in, so neither may fail differently because a ceiling
     * was reached.
     */
    readonly budget?: RunBudget,
  ) {
    this.status = { mode, calls: 0, drifted: [], exhausted: false, inputTokens: 0, outputTokens: 0 };
    if (mode === "replay") {
      if (!cassette) throw new Error("Replay mode needs a recorded cassette");
      this.player = new CassettePlayer(cassette, HOOKS);
    } else if (!backend) {
      throw new Error(`Mode '${mode}' needs a model backend`);
    }
  }

  /** What the run has spent against its budget, or null when it has no budget. */
  get budgetState(): BudgetState | null {
    return this.budget?.state ?? null;
  }

  /** The budget, but only where it applies: a replay spends nothing. */
  private get liveBudget(): RunBudget | undefined {
    return this.mode === "live" ? this.budget : undefined;
  }

  async agent(request: AgentRequest): Promise<AgentResponse> {
    return (await this.call("agent", request, (b) => b.agent(request))) as AgentResponse;
  }

  /** Stagehand's ClientLLM hook: pass this object as `model` to Stagehand.create(). */
  clientLLM(): ClientLLM {
    return {
      generate: async (params) => {
        const response = (await this.call("stagehand", params, (b) => b.stagehand(params))) as StagehandResult;
        return response;
      },
    };
  }

  private async call(channel: Channel, request: unknown, live: (backend: ModelBackend) => Promise<unknown>): Promise<unknown> {
    const seq = this.seq[channel]++;
    let requestHash: string;
    const started = performance.now();
    let response: unknown;
    let model: string;
    let drift = false;

    if (this.player) {
      let played: ReturnType<CassettePlayer<Channel>["next"]>;
      try {
        played = this.player.next(channel, request, { remapIds: channel === "stagehand" });
      } catch (e) {
        this.status.exhausted = true;
        throw e;
      }
      requestHash = played.requestHash;
      drift = played.drift;
      if (drift) this.status.drifted.push({ channel, seq });
      response = played.response;
      model = `replay:${played.entry.model}`;
    } else {
      // The ceiling is checked before the call, not after: a run that has spent its budget
      // must not start a call it cannot pay for.
      this.liveBudget?.assertCanCall();
      requestHash = hashRequest(channel, request, HOOKS);
      response = await live(this.backend!);
      const routed = this.backend as Partial<{ servedBy(c: Channel): string }>;
      model = routed.servedBy ? routed.servedBy(channel) : this.backend!.name;
    }

    const latencyMs = Math.round(performance.now() - started);
    const usage = tokenUsage(channel, response);
    this.status.calls++;
    this.status.inputTokens += usage.input;
    this.status.outputTokens += usage.output;
    this.entries.push({ channel, seq, requestHash, request, response, model, latencyMs, inputTokens: usage.input, outputTokens: usage.output });
    this.recorder.push({
      type: "model",
      stepId: this.recorder.currentStep,
      at: this.recorder.now(),
      model,
      input: { channel, seq, requestHash, drift, summary: summarizeRequest(channel, request) },
      output: summarizeResponse(channel, response),
      inputTokens: usage.input,
      outputTokens: usage.output,
      latencyMs,
    });
    // Counted after the call was recorded, so the cassette keeps the call that went over the
    // ceiling: a replay of this run must show the same last call.
    this.liveBudget?.spend(model, usage.input, usage.output);
    return response;
  }

  writeCassette(path: string): void {
    writeCassette(path, this.entries, HOOKS);
  }
}

function tokenUsage(channel: Channel, response: unknown): { input: number; output: number } {
  if (channel === "agent") {
    const usage = (response as AgentResponse).usage;
    return { input: usage?.input_tokens ?? 0, output: usage?.output_tokens ?? 0 };
  }
  const usage = (response as StagehandResult).usage;
  return { input: usage?.inputTokens ?? 0, output: usage?.outputTokens ?? 0 };
}

function summarizeRequest(channel: Channel, request: unknown): unknown {
  if (channel === "agent") {
    const messages = (request as AgentRequest).messages;
    return { messages: messages.length };
  }
  const params = request as StagehandParams;
  return {
    format: params.responseFormat?.type === "json_schema" ? params.responseFormat.name : (params.responseFormat?.type ?? "text"),
    instruction: promptText(params).match(/instruction: ([^\n]*)/)?.[1]?.slice(0, 160),
  };
}

function summarizeResponse(channel: Channel, response: unknown): unknown {
  if (channel === "agent") {
    const r = response as AgentResponse;
    return {
      stop_reason: r.stop_reason,
      tool_calls: r.content.filter((b) => b.type === "tool_use").map((b) => (b.type === "tool_use" ? { name: b.name, input: b.input } : null)),
      text: r.content.filter((b) => b.type === "text").map((b) => (b.type === "text" ? b.text.slice(0, 300) : "")).join(" ") || undefined,
    };
  }
  const r = response as StagehandResult;
  return r.outputFormat === "json_schema" ? { structuredContent: r.structuredContent } : { content: r.content };
}
