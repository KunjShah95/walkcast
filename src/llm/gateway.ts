import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type Anthropic from "@anthropic-ai/sdk";
import type { ClientLLM } from "@browserbasehq/stagehand";
import type { Recorder } from "../capture/recorder.ts";
import { scrub, unscrub } from "../capture/secrets.ts";

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

export interface CassetteEntry {
  channel: Channel;
  seq: number;
  requestHash: string;
  request: unknown;
  response: unknown;
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

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

class ReplayExhaustedError extends Error {
  constructor(channel: Channel, seq: number) {
    super(`Replay cassette has no recorded ${channel} call #${seq}; the run diverged from the recording.`);
  }
}

export class ModelGateway {
  readonly entries: CassetteEntry[] = [];
  readonly status: GatewayStatus;
  private seq: Record<Channel, number> = { agent: 0, stagehand: 0 };
  private recorded: Record<Channel, CassetteEntry[]> = { agent: [], stagehand: [] };

  constructor(
    readonly mode: GatewayMode,
    private readonly backend: ModelBackend | null,
    private readonly recorder: Recorder,
    cassette?: CassetteEntry[],
  ) {
    this.status = { mode, calls: 0, drifted: [], exhausted: false, inputTokens: 0, outputTokens: 0 };
    if (mode === "replay") {
      if (!cassette) throw new Error("Replay mode needs a recorded cassette");
      for (const entry of cassette) this.recorded[entry.channel].push(entry);
    } else if (!backend) {
      throw new Error(`Mode '${mode}' needs a model backend`);
    }
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
    const requestHash = hashRequest(channel, request);
    const started = performance.now();
    let response: unknown;
    let model: string;
    let drift = false;

    if (this.mode === "replay") {
      const entry = this.recorded[channel][seq];
      if (!entry) {
        this.status.exhausted = true;
        throw new ReplayExhaustedError(channel, seq);
      }
      if (entry.requestHash !== requestHash) {
        drift = true;
        this.status.drifted.push({ channel, seq });
      }
      // Cassettes hold placeholders, never secrets; restore them only in memory.
      const recordedResponse = unscrub(entry.response);
      response = channel === "stagehand" ? remapElementIds(unscrub(entry.request), request, recordedResponse) : recordedResponse;
      model = `replay:${entry.model}`;
    } else {
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
    return response;
  }

  writeCassette(path: string): void {
    writeFileSync(path, this.entries.map((e) => JSON.stringify(scrub(e))).join("\n") + "\n");
  }
}

export function readCassette(path: string): CassetteEntry[] {
  if (!existsSync(path)) throw new Error(`No cassette at ${path}`);
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CassetteEntry);
}

// ------------------------------------------------------------------ normalisation

/** Session-local values that legitimately differ between runs and must not count as drift. */
export function normalizeText(text: string): string {
  return text
    .replace(/https?:\/\/127\.0\.0\.1:\d+/g, "<app>")
    .replace(/\[\d+-\d+\]/g, "[id]")
    .replace(/\b0-\d+\b/g, "<id>");
}

function hashRequest(channel: Channel, request: unknown): string {
  const normalized = normalizeText(JSON.stringify(stripVolatile(scrub(request))));
  return createHash("sha256").update(channel + normalized).digest("hex").slice(0, 16);
}

/** Thinking blocks carry opaque signatures that change every call; ignore them for drift. */
function stripVolatile(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripVolatile);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.type === "thinking" || record.type === "redacted_thinking") return { type: record.type };
    return Object.fromEntries(Object.entries(record).filter(([k]) => k !== "id" && k !== "tool_use_id").map(([k, v]) => [k, stripVolatile(v)]));
  }
  return value;
}

/**
 * Stagehand addresses elements by backend node id ("0-17"), which is session-local. Map each id in
 * the recorded response to the accessibility-tree line it referred to in the recorded prompt, then
 * to the id that the same line has in the replayed prompt.
 */
export function remapElementIds(recordedRequest: unknown, newRequest: unknown, response: unknown): unknown {
  const before = treeIndex(promptText(recordedRequest));
  const after = treeLookup(promptText(newRequest));
  const remap = (id: string): string => {
    const key = before.get(id);
    return (key && after.get(key)) ?? id;
  };
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, k === "elementId" && typeof v === "string" ? remap(v) : walk(v)]),
      );
    }
    return value;
  };
  return walk(response);
}

function promptText(request: unknown): string {
  const messages = (request as StagehandParams | undefined)?.messages ?? [];
  return messages
    .flatMap((m) => (Array.isArray(m.content) ? m.content : [m.content]))
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("\n");
}

/** id -> "label#occurrence" for every "[0-17] role: name" line. */
function treeIndex(text: string): Map<string, string> {
  const map = new Map<string, string>();
  const seen = new Map<string, number>();
  for (const match of text.matchAll(/\[(\d+-\d+)\]\s*([^\n]*)/g)) {
    const label = match[2]!.trim();
    const n = seen.get(label) ?? 0;
    seen.set(label, n + 1);
    map.set(match[1]!, `${label}#${n}`);
  }
  return map;
}

function treeLookup(text: string): Map<string, string> {
  const inverse = new Map<string, string>();
  for (const [id, key] of treeIndex(text)) inverse.set(key, id);
  return inverse;
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
