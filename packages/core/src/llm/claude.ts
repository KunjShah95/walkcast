import Anthropic from "@anthropic-ai/sdk";
import type { AgentRequest, AgentResponse, ModelBackend, StagehandParams, StagehandResult } from "./gateway.ts";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ClaudeBackendOptions {
  model: string;
  /** Effort for the outer agent loop (deciding the next browser step). */
  agentEffort: Effort;
  /** Effort for Stagehand's element resolution (choosing which node an instruction means). */
  stagehandEffort: Effort;
}

export const DEFAULT_CLAUDE_OPTIONS: ClaudeBackendOptions = {
  model: process.env.LAB_MODEL ?? "claude-opus-5-5",
  agentEffort: (process.env.LAB_AGENT_EFFORT as Effort | undefined) ?? "medium",
  stagehandEffort: (process.env.LAB_STAGEHAND_EFFORT as Effort | undefined) ?? "low",
};

/**
 * Live backend. Both channels use the beta Messages endpoint so that server-side refusal
 * fallbacks are on: a declined request is re-run on a fallback model inside the same call.
 */
export class ClaudeBackend implements ModelBackend {
  readonly name: string;
  private client = new Anthropic();

  constructor(private readonly options: ClaudeBackendOptions = DEFAULT_CLAUDE_OPTIONS) {
    this.name = options.model;
  }

  async agent(request: AgentRequest): Promise<AgentResponse> {
    const response = await this.client.beta.messages.create({
      model: this.options.model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: request.system,
      tools: request.tools,
      messages: request.messages,
      output_config: { effort: this.options.agentEffort },
    });
    return {
      content: response.content,
      stop_reason: response.stop_reason,
      model: response.model,
      usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
    };
  }

  async stagehand(params: StagehandParams): Promise<StagehandResult> {
    const format = params.responseFormat;
    const jsonSchema = format?.type === "json_schema" ? format : undefined;
    const tools = "tools" in params ? params.tools : undefined;
    const response = await this.client.beta.messages.create({
      model: this.options.model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      ...(params.systemPrompt ? { system: params.systemPrompt } : {}),
      messages: params.messages.map(toAnthropicMessage),
      ...(tools?.length
        ? {
            tools: tools.map((t) => ({
              name: t.name,
              description: t.description ?? "",
              input_schema: { ...t.inputSchema, type: "object" as const },
            })),
          }
        : {}),
      ...(params.stopSequences ? { stop_sequences: params.stopSequences } : {}),
      output_config: {
        effort: this.options.stagehandEffort,
        ...(jsonSchema ? { format: { type: "json_schema" as const, schema: withoutMetaKeys(jsonSchema.schema) } } : {}),
      },
    });

    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
    };
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    if (response.stop_reason === "refusal") {
      throw new Error(`Model refused the Stagehand request (${response.stop_details?.category ?? "no category"})`);
    }
    if (jsonSchema) {
      return {
        role: "assistant",
        content: { type: "text", text },
        stopReason: response.stop_reason ?? undefined,
        usage,
        outputFormat: "json_schema",
        structuredContent: JSON.parse(text) as Extract<StagehandResult, { outputFormat: "json_schema" }>["structuredContent"],
      };
    }
    type TextResult = Extract<StagehandResult, { outputFormat: "text" }>;
    const content: Extract<TextResult["content"], unknown[]> = [];
    for (const b of response.content) {
      if (b.type === "text") content.push({ type: "text", text: b.text });
      if (b.type === "tool_use") content.push({ type: "tool_use", id: b.id, name: b.name, input: b.input as Record<string, never> });
    }
    return { role: "assistant", content, stopReason: response.stop_reason ?? undefined, usage, outputFormat: "text" };
  }
}

function toAnthropicMessage(message: StagehandParams["messages"][number]): Anthropic.Beta.BetaMessageParam {
  const parts = Array.isArray(message.content) ? message.content : [message.content];
  const content = parts.map((part): Anthropic.Beta.BetaContentBlockParam => {
    switch (part.type) {
      case "text":
        return { type: "text", text: part.text };
      case "image":
        return { type: "image", source: { type: "base64", media_type: part.mimeType as "image/png", data: part.data } };
      case "tool_use":
        return { type: "tool_use", id: part.id, name: part.name, input: part.input };
      case "tool_result":
        return {
          type: "tool_result",
          tool_use_id: part.toolUseId,
          is_error: part.isError ?? false,
          content: part.content.map((c) =>
            c.type === "text"
              ? { type: "text" as const, text: c.text }
              : { type: "image" as const, source: { type: "base64" as const, media_type: c.mimeType as "image/png", data: c.data } },
          ),
        };
    }
  });
  return { role: message.role, content };
}

/** Structured outputs take a plain JSON Schema; drop the draft marker Stagehand adds. */
function withoutMetaKeys(schema: unknown): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = schema as Record<string, unknown>;
  return rest;
}
