import type Anthropic from "@anthropic-ai/sdk";
import type { Page as StagehandPage, Stagehand } from "@browserbasehq/stagehand";
import { CREDENTIALS } from "../app/server.ts";
import type { BrowserTools, Observation } from "../capture/tools.ts";
import type { ModelGateway } from "../llm/gateway.ts";
import type { Task } from "../lab/task.ts";

/**
 * An LLM browser agent in the shape Browserbase recommends for Stagehand v4 ("tool calling"):
 * Claude runs the loop and picks the next step; Stagehand's act() resolves natural-language
 * actions to elements. Every tool call is a recorded step; every model call (both Claude's
 * decisions and Stagehand's element resolution) goes through the ModelGateway.
 */

export interface StagehandAgentSpec {
  kind: "stagehand";
  id: string;
  description: string;
  /** Which system prompt to use. Prompt versions are what regression comparisons diff. */
  prompt: keyof typeof SYSTEM_PROMPTS;
  maxTurns: number;
}

const BASE_PROMPT = `You operate a web browser to complete tasks in MiniCRM, a small web CRM. Paths are relative to the app (for example /leads/new).
Use read_page to see the current page and act to interact with it, one action per act call (for example "type Jane Roe into the Contact name field", "select Priya Shah from the Owner dropdown", "click the Save lead button").
If a sign-in page appears, sign in with username ${CREDENTIALS.username} and password ${CREDENTIALS.password}.
When the task is complete, or you cannot complete it, call done exactly once.`;

export const SYSTEM_PROMPTS = {
  /** Baseline: a reasonable, neutral agent prompt. */
  p0: BASE_PROMPT,
  /** Candidate fix: verification and safe-retry guidance. */
  p1: `${BASE_PROMPT}
Before reporting success, open the saved record and check that every requested field has the requested value; report failure if any field differs.
If submitting returns an error or times out, check the leads list for the record before submitting again; never create the same record twice.
Read the page again right before choosing from a list, because lists may still be loading.`,
} as const;

export const STAGEHAND_AGENTS: Record<string, StagehandAgentSpec> = {
  "sh-p0": { kind: "stagehand", id: "sh-p0", description: "Claude + Stagehand v4 act(), baseline prompt.", prompt: "p0", maxTurns: 30 },
  "sh-p1": { kind: "stagehand", id: "sh-p1", description: "Claude + Stagehand v4 act(), prompt with verification and safe-retry guidance.", prompt: "p1", maxTurns: 30 },
};

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "navigate",
    description: "Open a path in the app, e.g. /leads/new or /leads.",
    input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
    strict: true,
  },
  {
    name: "read_page",
    description: "Return the current URL, the visible page text and the interactive controls with their current values.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    name: "act",
    description: "Perform one natural-language action on the current page, e.g. 'click the Save lead button'.",
    input_schema: { type: "object", properties: { instruction: { type: "string" } }, required: ["instruction"], additionalProperties: false },
    strict: true,
  },
  {
    name: "done",
    description: "Finish the task. success=true only if the task was completed. Include the lead ID if one was involved, and the answer if the task asked a question.",
    input_schema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        summary: { type: "string" },
        lead_id: { type: ["integer", "null"] },
        answer: { type: ["string", "null"], description: "The answer, when the task asks a question." },
      },
      required: ["success", "summary", "lead_id", "answer"],
      additionalProperties: false,
    },
    strict: true,
  },
];

export interface StagehandAgentContext {
  tools: BrowserTools;
  stagehand: Stagehand;
  page: StagehandPage;
  gateway: ModelGateway;
}

export async function runStagehandAgent(ctx: StagehandAgentContext, task: Task, spec: StagehandAgentSpec): Promise<void> {
  const { tools, stagehand, page, gateway } = ctx;
  const system = SYSTEM_PROMPTS[spec.prompt];
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: `Task: ${task.goal}\nStart at ${task.startPath}.` },
  ];

  for (let turn = 0; turn < spec.maxTurns; turn++) {
    const response = await gateway.agent({ system, tools: TOOLS, messages });
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "refusal") {
      return tools.done(false, "The model refused to continue.");
    }
    const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (calls.length === 0) {
      const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(" ");
      return tools.done(false, `Agent stopped without calling done: ${text.slice(0, 200)}`);
    }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const call of calls) {
      const input = call.input as Record<string, unknown>;
      if (call.name === "done") {
        const leadId = typeof input.lead_id === "number" ? input.lead_id : undefined;
        const answer = typeof input.answer === "string" ? input.answer : undefined;
        return tools.done(Boolean(input.success), String(input.summary ?? ""), leadId, answer);
      }
      try {
        const output = await execute(call.name, input);
        results.push({ type: "tool_result", tool_use_id: call.id, content: output });
      } catch (error) {
        results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: errorText(error) });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return tools.done(false, `Agent hit the ${spec.maxTurns}-turn limit without finishing.`);

  async function execute(name: string, input: Record<string, unknown>): Promise<string> {
    switch (name) {
      case "navigate": {
        const path = String(input.path ?? "/");
        if (!path.startsWith("/")) throw new Error("Use a path relative to the app, starting with '/'.");
        await tools.record("navigate", { path }, async () => {
          await page.goto(new URL(path, tools.baseUrl).toString());
        });
        return `Now at ${relative(tools.page.url())}`;
      }
      case "read_page":
        return describe(await tools.observe());
      case "act": {
        const instruction = String(input.instruction ?? "");
        const result = await tools.record(
          "act",
          { instruction },
          async () => {
            const r = await stagehand.act(instruction, { page });
            // A click may have scheduled a navigation that has not started or committed yet; report
            // the page only once things are quiet, or the tool result races the navigation.
            await tools.waitForQuiet(300, 8000);
            return r.data;
          },
          (data) => ({ success: data.success, message: data.message, actions: data.actions.map((a) => ({ method: a.method, arguments: a.arguments, description: a.description })) }),
        );
        return `${result.success ? "OK" : "FAILED"}: ${result.message}. Now at ${relative(tools.page.url())}`;
      }
      default:
        throw new Error(`Unknown tool ${name}`);
    }
  }
}

/** Compact page description: no raw DOM, just what an operator would read. */
function describe(observation: Observation): string {
  const controls = observation.elements
    .filter((e) => e.tag !== "a")
    .map((e) => {
      const value = e.value !== undefined && e.value !== "" ? ` = "${e.value}"` : "";
      const options = e.options ? ` (options: ${e.options.map((o) => o.label).join(", ")})` : "";
      return `- ${e.role} "${e.name}"${value}${options}`;
    });
  const links = observation.elements.filter((e) => e.tag === "a").map((e) => e.name);
  return [
    `URL: ${relative(observation.url)}`,
    `Title: ${observation.title}`,
    `Text:\n${observation.text}`,
    controls.length ? `Controls:\n${controls.join("\n")}` : "",
    links.length ? `Links: ${links.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function relative(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message.split("\n")[0]! : String(error);
}
