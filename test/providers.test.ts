import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";
import { backendFor, backendForSelection } from "../packages/core/src/llm/model-spec.ts";
import { PROVIDERS, provider } from "../packages/core/src/llm/providers.ts";

/** A minimal OpenAI-compatible Chat Completions server, to test the adapter without network. */
let server: Server;
let bodies: Record<string, unknown>[] = [];
let rejectJsonSchema = false;

before(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw) as Record<string, unknown>;
      bodies.push(body);
      const format = body.response_format as { type?: string } | undefined;
      const reply = (status: number, value: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(value));
      };
      if (format?.type === "json_schema" && rejectJsonSchema) {
        return reply(400, { error: { message: "response_format json_schema is not supported for this model", type: "invalid_request_error" } });
      }
      const base = { id: "c1", object: "chat.completion", created: 0, model: String(body.model), usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 } };
      if (format) {
        return reply(200, { ...base, choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: '{"elementId":"0-7"}' } }] });
      }
      if (Array.isArray(body.tools) && body.tools.length) {
        const name = (body.tools[0] as { function: { name: string } }).function.name;
        return reply(200, {
          ...base,
          choices: [{ index: 0, finish_reason: "tool_calls", message: { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name, arguments: '{"ok":true}' } }] } }],
        });
      }
      return reply(200, { ...base, choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "hello" } }] });
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  for (const id of ["openai", "groq", "deepseek"]) process.env[`LAB_${id.toUpperCase()}_BASE_URL`] = url;
  process.env.OPENAI_API_KEY = "test-key";
  process.env.DEEPSEEK_API_KEY = "test-key";
  delete process.env.GROQ_API_KEY;
});

after(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => {
  bodies = [];
  rejectJsonSchema = false;
});

const DONE_TOOL = {
  name: "done",
  description: "Finish.",
  input_schema: { type: "object" as const, properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false },
  strict: true,
};

test("all requested providers are registered, with aliases", () => {
  for (const id of ["anthropic", "openai", "vercel", "openrouter", "gemini", "groq", "mistral", "deepseek", "huggingface"]) assert.ok(PROVIDERS[id], id);
  assert.equal(provider("claude").id, "anthropic");
  assert.equal(provider("hf").id, "huggingface");
  assert.equal(provider("ai-gateway").id, "vercel");
  assert.throws(() => provider("nope"), /Unknown provider/);
});

test("agent channel translates Anthropic-format history to Chat Completions and back", async () => {
  const backend = backendFor("openai:test-model");
  const response = await backend.agent({
    system: "sys",
    tools: [DONE_TOOL],
    messages: [
      { role: "user", content: "start" },
      { role: "assistant", content: [{ type: "text", text: "reading" }, { type: "tool_use", id: "toolu_1", name: "read_page", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "URL: /leads/new" }] },
    ],
  });
  const sent = bodies[0] as { messages: { role: string; tool_calls?: unknown[]; tool_call_id?: string }[]; tools: { function: { strict?: boolean } }[] };
  assert.deepEqual(sent.messages.map((m) => m.role), ["system", "user", "assistant", "tool"]);
  assert.equal(sent.messages[2]!.tool_calls?.length, 1);
  assert.equal(sent.messages[3]!.tool_call_id, "toolu_1");
  assert.equal(sent.tools[0]!.function.strict, true, "OpenAI accepts strict tools");
  assert.equal(response.stop_reason, "tool_use");
  const call = response.content.find((b) => b.type === "tool_use");
  assert.ok(call && call.type === "tool_use");
  assert.equal(call.name, "done");
  assert.deepEqual(call.input, { ok: true });
  assert.deepEqual(response.usage, { input_tokens: 11, output_tokens: 7 });
});

const OBSERVE = {
  messages: [{ role: "user" as const, content: { type: "text" as const, text: "instruction: find Save\n[0-7] button: Save" } }],
  responseFormat: { type: "json_schema" as const, name: "Observation", schema: { type: "object", properties: { elementId: { type: "string" } }, required: ["elementId"], additionalProperties: false } },
};

test("stagehand channel uses json_schema, and falls back to JSON mode once if the model rejects it", async () => {
  rejectJsonSchema = true;
  const backend = backendFor("openai:test-model");
  const first = await backend.stagehand(OBSERVE);
  assert.equal(first.outputFormat, "json_schema");
  assert.deepEqual(first.outputFormat === "json_schema" ? first.structuredContent : null, { elementId: "0-7" });
  assert.deepEqual(bodies.map((b) => (b.response_format as { type: string }).type), ["json_schema", "json_object"]);
  await backend.stagehand(OBSERVE);
  assert.equal((bodies[2]!.response_format as { type: string }).type, "json_object", "remembers that json_schema is unsupported");
});

test("JSON-mode providers put the schema in the prompt and never send json_schema", async () => {
  const backend = backendFor("deepseek:deepseek-chat");
  await backend.stagehand(OBSERVE);
  const sent = bodies[0] as { response_format: { type: string }; messages: { content: unknown }[] };
  assert.equal(sent.response_format.type, "json_object");
  assert.match(JSON.stringify(sent.messages.at(-1)!.content), /JSON Schema/);
});

test("a fallback chain skips a provider without credentials and records who served", async () => {
  const routed = backendForSelection({ agent: "groq:missing-key-model,openai:test-model", stagehand: "openai:test-model" });
  const response = await routed.agent({ system: "s", tools: [DONE_TOOL], messages: [{ role: "user", content: "go" }] });
  assert.equal(response.stop_reason, "tool_use");
  assert.equal(routed.servedBy("agent"), "openai:test-model");
});

test("a single spec without credentials fails fast; a chain where every link fails reports each", async () => {
  assert.throws(() => backendFor("groq:x"), /GROQ_API_KEY/);
  const chain = backendFor("groq:x,mistral:y");
  await assert.rejects(chain.agent({ system: "s", tools: [], messages: [{ role: "user", content: "go" }] }), /groq:x: .*GROQ_API_KEY.*mistral:y: .*MISTRAL_API_KEY/);
});
