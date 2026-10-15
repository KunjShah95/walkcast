import type Anthropic from "@anthropic-ai/sdk";
import { CREDENTIALS } from "../app/server.ts";
import type { AgentRequest, AgentResponse, ModelBackend, StagehandParams, StagehandResult } from "./gateway.ts";

/**
 * Deterministic stand-in for Claude, for validating the Stagehand plumbing offline.
 *
 * - Agent channel: a fixed policy that reads the tool results in the transcript. With the
 *   baseline prompt it trusts the success toast and retries errors blindly; with the p1
 *   prompt (detected by its text) it verifies the record and checks before retrying.
 * - Stagehand channel: resolves "type X into the Y field" / "click the Z button" / "select W
 *   from the Y dropdown" against the accessibility tree in Stagehand's real prompt.
 *
 * It is NOT a model and its behaviour is NOT evidence about any model.
 */
export class ScriptedModel implements ModelBackend {
  readonly name = "scripted-model";
  private nextId = 0;

  async agent(request: AgentRequest): Promise<AgentResponse> {
    const careful = request.system.includes("Before reporting success, open the saved record");
    const first = typeof request.messages[0]?.content === "string" ? request.messages[0].content : "";
    const reassign = first.match(/Reassign the (.+) lead to (.+)\./);
    if (reassign) return this.reassign(request, careful, reassign[1]!, reassign[2]!);
    const lookup = first.match(/Find out who owns the (.+) lead/);
    if (lookup) return this.lookup(request, careful, lookup[1]!);
    const results = toolResults(request.messages);
    const last = results.at(-1) ?? "";
    const task = taskParams(request.messages);
    const url = last.match(/URL: (\S+)/)?.[1] ?? last.match(/Now at (\S+)/)?.[1] ?? "";
    const retried = results.filter((r) => /Gateway timeout/.test(r)).length;

    if (results.length === 0) return this.tools([["navigate", { path: "/leads/new" }]]);
    if (!last.startsWith("URL:")) return this.tools([["read_page", {}]]);

    if (url.startsWith("/login")) {
      return this.tools([
        ["act", { instruction: `type ${CREDENTIALS.username} into the Username field` }],
        ["act", { instruction: `type ${CREDENTIALS.password} into the Password field` }],
        ["act", { instruction: "click the Sign in button" }],
        ["read_page", {}],
      ]);
    }

    if (/Gateway timeout/.test(last)) {
      if (careful) return this.tools([["navigate", { path: "/leads" }], ["read_page", {}]]);
      if (retried >= 2) return this.done(false, "The server returned an error twice.", null);
      return this.tools([["navigate", { path: "/leads/new" }], ["read_page", {}]]);
    }

    if (url === "/leads") {
      const row = last.split("\n").find((line) => line.includes(task.company));
      const id = row?.match(/\b(\d{4})\b/)?.[1];
      if (id) return this.tools([["navigate", { path: `/leads/${id}` }], ["read_page", {}]]);
      return this.tools([["navigate", { path: "/leads/new" }], ["read_page", {}]]);
    }

    if (url.startsWith("/leads/new")) {
      const filled = /textbox "Company" = "/.test(last);
      if (!filled) {
        const steps: [string, Record<string, unknown>][] = [
          ["act", { instruction: `type ${task.contact} into the Contact name field` }],
          ["act", { instruction: `type ${task.company} into the Company field` }],
        ];
        if (careful) return this.tools([...steps, ["read_page", {}]]);
        return this.tools([
          ...steps,
          ["act", { instruction: `select ${task.owner} from the Owner dropdown` }],
          ["act", { instruction: "click the Save lead button" }],
          ["read_page", {}],
        ]);
      }
      return this.tools([
        ["act", { instruction: `select ${task.owner} from the Owner dropdown` }],
        ["act", { instruction: "click the Save lead button" }],
        ["read_page", {}],
      ]);
    }

    const detail = url.match(/^\/leads\/(\d+)/);
    if (detail) {
      const leadId = Number(detail[1]);
      if (!careful) {
        const toast = last.includes("Lead created");
        return this.done(toast, toast ? `Created lead ${leadId}.` : "No confirmation was shown.", toast ? leadId : null);
      }
      const owner = last.match(/Owner\s*\n?\s*([^\n]+)/)?.[1]?.trim();
      return owner === task.owner
        ? this.done(true, `Created lead ${leadId}, owner ${owner} (checked on the record).`, leadId)
        : this.done(false, `Lead ${leadId} was saved with owner '${owner}', not '${task.owner}'.`, leadId);
    }
    return this.done(false, `Unexpected page ${url}.`, null);
  }

  async stagehand(params: StagehandParams): Promise<StagehandResult> {
    const prompt = params.messages
      .flatMap((m) => (Array.isArray(m.content) ? m.content : [m.content]))
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("\n");
    const instruction = prompt.match(/action: ([^\n]*?)\.\s*$/m)?.[1] ?? prompt.match(/instruction: ([^\n]*)/)?.[1] ?? "";
    const action = resolve(instruction, prompt);
    const name = params.responseFormat?.type === "json_schema" ? params.responseFormat.name : "";
    type Structured = Extract<StagehandResult, { outputFormat: "json_schema" }>["structuredContent"];
    const structured: Structured =
      name === "Observation"
        ? { elements: action ? [action] : [] }
        : name === "Act"
          ? { action, twoStep: false }
          : { completed: true, progress: "done" };
    return {
      role: "assistant",
      content: { type: "text", text: JSON.stringify(structured) },
      outputFormat: "json_schema",
      structuredContent: structured,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };
  }

  /** Reassign: list -> edit page -> choose owner -> save; careful reads before choosing and checks after. */
  private reassign(request: AgentRequest, careful: boolean, company: string, owner: string): AgentResponse {
    const results = toolResults(request.messages);
    const last = results.at(-1) ?? "";
    const url = last.match(/URL: (\S+)/)?.[1] ?? last.match(/Now at (\S+)/)?.[1] ?? "";
    const errors = results.filter((r) => /Gateway timeout/.test(r)).length;
    if (results.length === 0) return this.tools([["navigate", { path: "/leads" }]]);
    if (!last.startsWith("URL:")) return this.tools([["read_page", {}]]);
    if (url.startsWith("/login")) return this.signIn();
    const id = leadIdFor(results, company);
    if (/Gateway timeout/.test(last)) {
      if (careful && id) return this.tools([["navigate", { path: `/leads/${id}` }], ["read_page", {}]]);
      if (errors >= 2 || !id) return this.done(false, "The server returned an error twice.", null);
      return this.tools([["navigate", { path: `/leads/${id}/edit` }], ["read_page", {}]]);
    }
    if (url === "/leads") {
      return id ? this.tools([["navigate", { path: `/leads/${id}/edit` }], ["read_page", {}]]) : this.done(false, `No ${company} lead in the list.`, null);
    }
    if (/^\/leads\/\d+\/edit/.test(url)) {
      const readTwice = results.filter((r) => r.startsWith(`URL: ${url}`)).length >= 2;
      if (careful && !readTwice) return this.tools([["read_page", {}]]);
      return this.tools([
        ["act", { instruction: `select ${owner} from the Owner dropdown` }],
        ["act", { instruction: "click the Save changes button" }],
        ["read_page", {}],
      ]);
    }
    const detail = url.match(/^\/leads\/(\d+)/);
    if (detail) {
      const leadId = Number(detail[1]);
      const shown = ownerOnPage(last);
      if (!careful) {
        const toast = last.includes("Lead updated");
        return this.done(toast, toast ? `Reassigned ${company} to ${owner}.` : "No confirmation was shown.", leadId);
      }
      if (shown === owner) return this.done(true, `Reassigned ${company} to ${owner} (checked on the record).`, leadId);
      if (errors > 0 && results.filter((r) => /^URL: \/leads\/\d+\/edit/.test(r)).length < 3) {
        return this.tools([["navigate", { path: `/leads/${leadId}/edit` }], ["read_page", {}]]);
      }
      return this.done(false, `Lead ${leadId} still shows owner '${shown ?? "unknown"}', not '${owner}'.`, leadId);
    }
    return this.done(false, `Unexpected page ${url}.`, null);
  }

  /** Lookup: list -> lead page -> read the owner; careful retries a failed read and reads by meaning. */
  private lookup(request: AgentRequest, careful: boolean, company: string): AgentResponse {
    const results = toolResults(request.messages);
    const last = results.at(-1) ?? "";
    const url = last.match(/URL: (\S+)/)?.[1] ?? last.match(/Now at (\S+)/)?.[1] ?? "";
    if (results.length === 0) return this.tools([["navigate", { path: "/leads" }]]);
    if (!last.startsWith("URL:")) return this.tools([["read_page", {}]]);
    if (url.startsWith("/login")) return this.signIn();
    const id = leadIdFor(results, company);
    if (url === "/leads") return id ? this.tools([["navigate", { path: `/leads/${id}` }], ["read_page", {}]]) : this.done(false, `No ${company} lead in the list.`, null);
    if (/Gateway timeout/.test(last)) {
      const errors = results.filter((r) => /Gateway timeout/.test(r)).length;
      if (careful && id && errors < 3) return this.tools([["navigate", { path: `/leads/${id}` }], ["read_page", {}]]);
      return this.done(false, `The ${company} lead page did not load.`, null);
    }
    if (/^\/leads\/\d+/.test(url)) {
      const strict = last.match(/\bOwner\s*\n\s*([^\n]+)/)?.[1]?.trim();
      const anyLabel = ownerOnPage(last);
      if (careful) return anyLabel ? this.answer(true, `${company} is owned by ${anyLabel}.`, anyLabel) : this.answer(false, "No owner shown.", null);
      // The naive policy looks for the word "Owner" only, and reports whatever it found.
      return this.answer(true, `${company} is owned by ${strict ?? "(not shown)"}.`, strict ?? "");
    }
    return this.done(false, `Unexpected page ${url}.`, null);
  }

  private signIn(): AgentResponse {
    return this.tools([
      ["act", { instruction: `type ${CREDENTIALS.username} into the Username field` }],
      ["act", { instruction: `type ${CREDENTIALS.password} into the Password field` }],
      ["act", { instruction: "click the Sign in button" }],
      ["read_page", {}],
    ]);
  }

  private answer(success: boolean, summary: string, answer: string | null): AgentResponse {
    return this.tools([["done", { success, summary, lead_id: null, answer }]]);
  }

  private tools(calls: [string, Record<string, unknown>][]): AgentResponse {
    const content = calls.map(([name, input]) => ({ type: "tool_use", id: `toolu_scripted_${this.nextId++}`, name, input }));
    return { content: content as unknown as AgentResponse["content"], stop_reason: "tool_use", model: this.name, usage: { input_tokens: 0, output_tokens: 0 } };
  }

  private done(success: boolean, summary: string, leadId: number | null): AgentResponse {
    return this.tools([["done", { success, summary, lead_id: leadId, answer: null }]]);
  }
}

function resolve(instruction: string, prompt: string): { elementId: string; description: string; method: string; arguments: string[] } | null {
  const find = (role: string, name: string) => {
    const re = new RegExp(`\\[(\\d+-\\d+)\\] ${role}: ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m");
    return prompt.match(re)?.[1];
  };
  let m: RegExpMatchArray | null;
  if ((m = instruction.match(/^type (.+) into the (.+) field$/))) {
    const id = find("textbox", m[2]!);
    return id ? { elementId: id, description: `${m[2]} field`, method: "fill", arguments: [m[1]!] } : null;
  }
  if ((m = instruction.match(/^click the (.+) button$/))) {
    const id = find("button", m[1]!);
    return id ? { elementId: id, description: `${m[1]} button`, method: "click", arguments: [] } : null;
  }
  if ((m = instruction.match(/^select (.+) from the (.+) dropdown$/))) {
    const id = find("(?:select|combobox)", m[2]!);
    return id ? { elementId: id, description: `${m[2]} dropdown`, method: "selectOptionFromDropdown", arguments: [m[1]!] } : null;
  }
  return null;
}

/** The lead id for a company, from a leads-list page read earlier ("1002\tHank Scorpio\tGlobex"). */
function leadIdFor(results: string[], company: string): number | undefined {
  for (const r of results) {
    const line = r.split("\n").find((l) => l.includes(company) && /\b\d{4}\b/.test(l));
    const id = line?.match(/\b(\d{4})\b/)?.[1];
    if (id) return Number(id);
  }
  return undefined;
}

function ownerOnPage(text: string): string | undefined {
  return text.match(/\b(?:Owner|Account manager|Assigned to)\s*\n\s*([^\n]+)/)?.[1]?.trim();
}

function toolResults(messages: Anthropic.Beta.BetaMessageParam[]): string[] {
  return messages.flatMap((m) =>
    m.role === "user" && Array.isArray(m.content)
      ? m.content.flatMap((b) => (b.type === "tool_result" ? [typeof b.content === "string" ? b.content : ""] : []))
      : [],
  );
}

function taskParams(messages: Anthropic.Beta.BetaMessageParam[]): { contact: string; company: string; owner: string } {
  const first = typeof messages[0]?.content === "string" ? messages[0].content : "";
  const m = first.match(/Create a lead for (.+) \(contact (.+)\) assigned to (.+), then/);
  return { company: m?.[1] ?? "", contact: m?.[2] ?? "", owner: m?.[3] ?? "" };
}
