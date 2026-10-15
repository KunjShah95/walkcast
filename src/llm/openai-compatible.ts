import OpenAI from "openai";
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming, ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import type { AgentRequest, AgentResponse, ModelBackend, StagehandParams, StagehandResult } from "./gateway.ts";
import { apiKey, baseURL, type ProviderInfo } from "./providers.ts";

/**
 * Backend for any provider with an OpenAI-compatible Chat Completions API.
 *
 * The agent loop and cassettes use one canonical message format (Anthropic content blocks), so
 * this adapter translates requests out and responses back:
 *   text / tool_use / tool_result blocks  <->  content / tool_calls / role:"tool" messages.
 * Thinking blocks from other providers' turns are dropped on the way out.
 */
export class OpenAICompatibleBackend implements ModelBackend {
  readonly name: string;
  private client: OpenAI;
  /** Learned at runtime: this model rejected json_schema, use JSON mode instead. */
  private jsonSchemaUnsupported: boolean;

  constructor(
    private readonly info: ProviderInfo,
    private readonly model: string,
  ) {
    const key = apiKey(info);
    if (!key && !info.keyOptional) throw new Error(`${info.label}: set ${info.apiKeyEnv.join(" or ")} to use provider '${info.id}'.`);
    const url = baseURL(info);
    if (!url) throw new Error(`${info.label}: set LAB_${info.id.toUpperCase()}_BASE_URL.`);
    this.client = new OpenAI({ apiKey: key ?? "not-needed", baseURL: url, maxRetries: 2 });
    this.name = `${info.id}:${model}`;
    this.jsonSchemaUnsupported = info.structuredOutput === "json_object";
  }

  async agent(request: AgentRequest): Promise<AgentResponse> {
    const tools: ChatCompletionTool[] = request.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description ?? "",
        parameters: t.input_schema as Record<string, unknown>,
        ...(this.info.strictTools && t.strict ? { strict: true } : {}),
      },
    }));
    const completion = await this.complete({
      model: this.model,
      messages: [{ role: "system", content: request.system }, ...fromAnthropic(request.messages)],
      tools,
      tool_choice: "auto",
    });
    return toAgentResponse(completion, this.name);
  }

  async stagehand(params: StagehandParams): Promise<StagehandResult> {
    const format = params.responseFormat?.type === "json_schema" ? params.responseFormat : undefined;
    const tools = "tools" in params && params.tools?.length
      ? params.tools.map((t): ChatCompletionTool => ({ type: "function", function: { name: t.name, description: t.description ?? "", parameters: t.inputSchema as Record<string, unknown> } }))
      : undefined;
    const messages: ChatCompletionMessageParam[] = [
      ...(params.systemPrompt ? [{ role: "system" as const, content: params.systemPrompt }] : []),
      ...fromStagehand(params.messages),
    ];
    const base: ChatCompletionCreateParamsNonStreaming = {
      model: this.model,
      messages,
      ...(tools ? { tools } : {}),
      ...(params.stopSequences ? { stop: params.stopSequences } : {}),
    };

    if (!format) {
      const completion = await this.complete(base);
      const message = completion.choices[0]?.message;
      type TextResult = Extract<StagehandResult, { outputFormat: "text" }>;
      const content: Extract<TextResult["content"], unknown[]> = [];
      if (message?.content) content.push({ type: "text", text: message.content });
      for (const call of message?.tool_calls ?? []) {
        if (call.type === "function") content.push({ type: "tool_use", id: call.id, name: call.function.name, input: parseArgs(call.function.arguments) as Record<string, never> });
      }
      return { role: "assistant", content, outputFormat: "text", usage: stagehandUsage(completion) };
    }

    const schema = withoutMetaKeys(format.schema);
    let completion: ChatCompletion;
    if (!this.jsonSchemaUnsupported) {
      try {
        completion = await this.complete({
          ...base,
          response_format: { type: "json_schema", json_schema: { name: safeName(format.name), schema, strict: true } },
        });
      } catch (error) {
        if (!(error instanceof OpenAI.BadRequestError)) throw error;
        this.jsonSchemaUnsupported = true; // fall through to JSON mode for this and later calls
        completion = await this.jsonMode(base, schema);
      }
    } else {
      completion = await this.jsonMode(base, schema);
    }
    const text = completion.choices[0]?.message?.content ?? "";
    return {
      role: "assistant",
      content: { type: "text", text },
      outputFormat: "json_schema",
      structuredContent: parseJson(text) as Extract<StagehandResult, { outputFormat: "json_schema" }>["structuredContent"],
      usage: stagehandUsage(completion),
    };
  }

  private jsonMode(base: ChatCompletionCreateParamsNonStreaming, schema: Record<string, unknown>): Promise<ChatCompletion> {
    const instruction = `Respond with JSON only, matching this JSON Schema exactly:\n${JSON.stringify(schema)}`;
    return this.complete({
      ...base,
      messages: [...base.messages, { role: "user", content: instruction }],
      response_format: { type: "json_object" },
    });
  }

  private async complete(params: ChatCompletionCreateParamsNonStreaming): Promise<ChatCompletion> {
    return this.client.chat.completions.create(params);
  }
}

// ------------------------------------------------------------------ translation

type AnthropicMessage = AgentRequest["messages"][number];

export function fromAnthropic(messages: AnthropicMessage[]): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [];
  for (const message of messages) {
    if (typeof message.content === "string") {
      out.push({ role: message.role, content: message.content });
      continue;
    }
    if (message.role === "assistant") {
      const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
      const toolCalls = message.content.flatMap((b) =>
        b.type === "tool_use" ? [{ id: b.id, type: "function" as const, function: { name: b.name, arguments: JSON.stringify(b.input) } }] : [],
      );
      out.push({ role: "assistant", content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
      continue;
    }
    const text: string[] = [];
    for (const block of message.content) {
      if (block.type === "tool_result") {
        const content = typeof block.content === "string" ? block.content : (block.content ?? []).flatMap((c) => (c.type === "text" ? [c.text] : [])).join("\n");
        out.push({ role: "tool", tool_call_id: block.tool_use_id, content: block.is_error ? `ERROR: ${content}` : content });
      } else if (block.type === "text") {
        text.push(block.text);
      }
    }
    if (text.length) out.push({ role: "user", content: text.join("\n") });
  }
  return out;
}

function fromStagehand(messages: StagehandParams["messages"]): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [];
  for (const message of messages) {
    const parts = Array.isArray(message.content) ? message.content : [message.content];
    if (message.role === "assistant") {
      const text = parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n");
      const toolCalls = parts.flatMap((p) => (p.type === "tool_use" ? [{ id: p.id, type: "function" as const, function: { name: p.name, arguments: JSON.stringify(p.input) } }] : []));
      out.push({ role: "assistant", content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
      continue;
    }
    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
    for (const part of parts) {
      if (part.type === "text") content.push({ type: "text", text: part.text });
      else if (part.type === "image") content.push({ type: "image_url", image_url: { url: `data:${part.mimeType};base64,${part.data}` } });
      else if (part.type === "tool_result") {
        out.push({ role: "tool", tool_call_id: part.toolUseId, content: part.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("\n") });
      }
    }
    if (content.length) out.push({ role: "user", content });
  }
  return out;
}

function toAgentResponse(completion: ChatCompletion, name: string): AgentResponse {
  const choice = completion.choices[0];
  const message = choice?.message;
  const content: unknown[] = [];
  if (message?.content) content.push({ type: "text", text: message.content, citations: null });
  for (const call of message?.tool_calls ?? []) {
    if (call.type === "function") content.push({ type: "tool_use", id: call.id, name: call.function.name, input: parseArgs(call.function.arguments) });
  }
  const finish = choice?.finish_reason;
  const stop_reason = finish === "tool_calls" || (message?.tool_calls?.length ?? 0) > 0 ? "tool_use" : finish === "length" ? "max_tokens" : finish === "content_filter" ? "refusal" : "end_turn";
  return {
    content: content as AgentResponse["content"],
    stop_reason,
    model: completion.model ?? name,
    usage: { input_tokens: completion.usage?.prompt_tokens ?? 0, output_tokens: completion.usage?.completion_tokens ?? 0 },
  };
}

function stagehandUsage(completion: ChatCompletion) {
  const input = completion.usage?.prompt_tokens ?? 0;
  const output = completion.usage?.completion_tokens ?? 0;
  return { inputTokens: input, outputTokens: output, totalTokens: input + output };
}

/** Tool arguments arrive as a JSON string; a malformed one becomes a visible error, not a crash. */
function parseArgs(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw || "{}") as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : { _invalid_arguments: raw };
  } catch {
    return { _invalid_arguments: raw };
  }
}

/** Some models wrap JSON in prose or code fences; take the outermost object. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error(`Model did not return JSON: ${text.slice(0, 200)}`);
  }
}

function withoutMetaKeys(schema: unknown): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = schema as Record<string, unknown>;
  return rest;
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "response";
}
