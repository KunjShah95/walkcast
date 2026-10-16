import type { AgentRequest, AgentResponse, ModelBackend, StagehandParams, StagehandResult } from "./gateway.ts";
import { RateLimiter } from "./rate-limit.ts";

// ChatGPT plan usage requires stream: true and store: false; requests cannot carry system-role
// messages, temperature, max_output_tokens, etc. System prompt goes through `instructions`.

interface ChatGPTResolved { accessToken: string; }

function accessToken(): string {
  const t = process.env.CHATGPT_ACCESS_TOKEN;
  if (!t) throw new Error("chatgpt: no access token; connect ChatGPT first (this provider requires plan usage).");
  return t;
}

function toInput(messages: unknown): unknown[] {
  const out: unknown[] = [];
  if (!Array.isArray(messages)) return out;
  for (const m of messages as any[]) {
    const role = m?.role === "assistant" ? "assistant" : "user";
    if (typeof m?.content === "string") { out.push({ role, content: m.content }); continue; }
    const parts = Array.isArray(m?.content) ? m.content : [m?.content].filter(Boolean);
    const text = parts.filter((p: any) => p?.type === "text").map((p: any) => p.text).join("\n");
    if (text) out.push({ role, content: text });
    for (const p of parts) {
      if (p?.type === "tool_use") out.push({ type: "function_call", call_id: p.id, name: p.name, arguments: JSON.stringify(p.input ?? {}) });
      if (p?.type === "tool_result") {
        const c = Array.isArray(p.content) ? p.content.filter((x: any) => x?.type === "text").map((x: any) => x.text).join("\n") : String(p.content ?? "");
        out.push({ type: "function_call_output", call_id: p.tool_use_id, output: c });
      }
    }
  }
  return out;
}

export class ChatGPTResponsesBackend implements ModelBackend {
  readonly name: string;
  private model: string;
  private limiter: RateLimiter;
  constructor(model: string) {
    this.model = model;
    this.name = `chatgpt:${model}`;
    const rpm = Number(process.env.LAB_CGPT_RPM ?? 30);
    const tpm = Number(process.env.LAB_CGPT_TPM ?? 60000);
    this.limiter = new RateLimiter({ requestsPerMinute: rpm, tokensPerMinute: tpm });
  }

  async agent(request: AgentRequest): Promise<AgentResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      instructions: request.system,
      input: toInput(request.messages),
      tools: request.tools.map((t) => ({ type: "function", name: t.name, description: t.description ?? "", parameters: t.input_schema, ...(t.strict ? { strict: true } : {}) })),
      tool_choice: "auto",
      store: false,
      stream: true,
    };
    return this.call(body);
  }

  async stagehand(params: StagehandParams): Promise<StagehandResult> {
    const format = params.responseFormat?.type === "json_schema" ? params.responseFormat : undefined;
    const tools = "tools" in params && params.tools?.length
      ? params.tools.map((t: any) => ({ type: "function", name: t.name, description: t.description ?? "", parameters: t.inputSchema }))
      : undefined;
    const base: Record<string, unknown> = {
      model: this.model,
      instructions: params.systemPrompt ?? "",
      input: toInput(params.messages as any),
      ...(tools ? { tools, tool_choice: "auto" } : {}),
      store: false,
      stream: true,
    };
    if (format) base.text = { format: { type: "json_schema", name: (format as any).name, schema: (format as any).schema, strict: true } };
    const completed = await this.raw(base, format ? 1000 : 500);
    const usage = completed?.usage ?? {};
    const input = Number(usage.input_tokens ?? 0);
    const output = Number(usage.output_tokens ?? 0);
    const out = completed?.output ?? [];
    // text
    const text = out.flatMap((it: any) => it?.type === "message" ? (it.content ?? []).filter((c: any) => c?.type === "output_text").map((c: any) => c.text) : []).join("");
    // tool calls
    const toolCalls = out.filter((it: any) => it?.type === "function_call").map((it: any) => ({ type: "tool_use", id: it.call_id, name: it.name, input: this.parseArgs(it.arguments ?? "{}") }));
    if (format) {
      return { role: "assistant", content: { type: "text", text }, outputFormat: "json_schema", structuredContent: this.parseJson(text), usage: { inputTokens: input, outputTokens: output, totalTokens: input + output } } as any;
    }
    const content: any[] = [];
    if (text) content.push({ type: "text", text });
    for (const tc of toolCalls) content.push(tc);
    return { role: "assistant", content, outputFormat: "text", usage: { inputTokens: input, outputTokens: output, totalTokens: input + output } } as any;
  }

  private async call(body: Record<string, unknown>): Promise<AgentResponse> {
    const completed = await this.raw(body, 800);
    const usage = completed?.usage ?? {};
    const input = Number(usage.input_tokens ?? 0);
    const output = Number(usage.output_tokens ?? 0);
    const out = completed?.output ?? [];
    const text = out.flatMap((it: any) => it?.type === "message" ? (it.content ?? []).filter((c: any) => c?.type === "output_text").map((c: any) => c.text) : []).join("");
    const toolCalls = out.filter((it: any) => it?.type === "function_call");
    const content: any[] = [];
    if (text) content.push({ type: "text", text, citations: null });
    for (const tc of toolCalls) content.push({ type: "tool_use", id: tc.call_id, name: tc.name, input: this.parseArgs(tc.arguments ?? "{}") });
    const finish = toolCalls.length ? "tool_calls" : "stop";
    return { content: content as any, stop_reason: finish === "tool_calls" || toolCalls.length > 0 ? "tool_use" : "end_turn", model: completed?.model ?? this.model, usage: { input_tokens: input, output_tokens: output } };
  }

  private async raw(body: Record<string, unknown>, estTokens: number): Promise<any> {
    await this.limiter.acquire(estTokens);
    const token = accessToken();
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      const error = new Error(`chatgpt Responses API ${resp.status}: ${errText.slice(0, 300)}`);
      (error as any).status = resp.status;
      throw error;
    }
    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let completed: any = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line || !line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const ev = JSON.parse(data);
          if (ev.type === "response.completed" || ev.type === "response.done") completed = ev.response ?? ev;
          else if (ev.type === "response.failed") throw new Error(`chatgpt failed: ${JSON.stringify(ev.response?.error ?? ev.error ?? ev)}`);
        } catch (e) { if (e instanceof Error && e.message.startsWith("chatgpt failed")) throw e; }
      }
    }
    if (!completed) throw new Error("chatgpt: stream ended without response.completed");
    return completed;
  }

  private parseArgs(raw: string): Record<string, unknown> {
    try { const v = JSON.parse(raw || "{}"); return v && typeof v === "object" && !Array.isArray(v) ? (v as any) : { _invalid_arguments: raw }; } catch { return { _invalid_arguments: raw }; }
  }
  private parseJson(text: string): unknown {
    try { return JSON.parse(text); } catch {
      const s = text.indexOf("{"), e = text.lastIndexOf("}");
      if (s >= 0 && e > s) return JSON.parse(text.slice(s, e + 1));
      throw new Error(`chatgpt did not return JSON: ${text.slice(0, 200)}`);
    }
  }
}