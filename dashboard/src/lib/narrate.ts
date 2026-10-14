import type { ClaimEvent, ModelCallEvent, NetworkEvent, RunDetail, StepEvent } from "./types.ts";

/**
 * Event-based narration: one sentence per recorded event, built only from what the trace holds.
 * It never describes the model's intent beyond the tool call it actually made.
 */
export interface Caption {
  at: number;
  text: string;
  tone: "info" | "warn" | "fail" | "pass";
  /** Pipeline nodes this event touches, for the simulator. */
  nodes: string[];
  /** Pipeline edges to animate, as "from>to". */
  edges: string[];
}

export function narrate(detail: RunDetail, viaStagehand: boolean): Caption[] {
  const out: Caption[] = [];
  const path = (u?: string | null) => {
    try {
      return u ? new URL(u).pathname : "";
    } catch {
      return u ?? "";
    }
  };
  for (const e of detail.events) {
    if (e.type === "step") {
      const s = e as StepEvent;
      const args = s.args as Record<string, unknown>;
      const what = String(args.instruction ?? args.name ?? args.selector ?? args.path ?? "");
      const dur = `${((s.endedAt - s.startedAt) / 1000).toFixed(1)} s`;
      const toBrowser = viaStagehand && s.tool === "act" ? ["agent>stagehand", "stagehand>browser", "browser>page"] : ["agent>browser", "browser>page"];
      if (s.tool === "observe") {
        out.push({ at: s.startedAt, text: `Reads ${path(s.before?.url)}: ${(s.result as { elements?: number })?.elements ?? "?"} controls.`, tone: "info", nodes: ["browser", "page"], edges: ["page>browser", "browser>agent"] });
      } else if (/wait/i.test(s.tool)) {
        out.push({ at: s.startedAt, text: s.error ? `Waits for the page to change; gives up after ${dur}.` : `Waits ${dur} for the page to settle.`, tone: s.error ? "warn" : "info", nodes: ["browser"], edges: [] });
      } else if (/fetch|readValue/.test(s.tool)) {
        out.push({ at: s.startedAt, text: `Checks ${what || "the page"}.`, tone: "info", nodes: ["browser", "page"], edges: ["page>browser"] });
      } else {
        const stale = s.target?.stale ? ` The target had changed to “${s.target.nameAtAction}” since it was observed.` : "";
        const failed = s.error ? ` It fails: ${s.error.replace(/^page\.\w+: /, "")}` : (s.result as { success?: boolean })?.success === false ? ` It reports failure: ${(s.result as { message?: string }).message}` : "";
        out.push({
          at: s.startedAt,
          text: `${verb(s.tool)} ${what ? `“${what}”` : ""}${failed}${stale}`.trim(),
          tone: failed || stale ? "fail" : "info",
          nodes: s.error ? ["browser"] : s.target?.stale ? ["page"] : [],
          edges: toBrowser,
        });
      }
    } else if (e.type === "request") {
      const r = e as NetworkEvent;
      const write = r.method !== "GET";
      const status = r.status ?? r.failure ?? "no response";
      const bad = (r.status ?? 0) >= 400 || r.failure !== undefined;
      const login = r.redirectedTo?.startsWith("/login");
      const edges = write ? ["page>gateway", "gateway>auth", "auth>api", "api>db"] : ["page>gateway", "gateway>auth"];
      out.push({
        at: r.at,
        text: `${r.method} ${path(r.url)} → ${status}${login ? ", redirected to sign-in" : ""}${r.postData ? ` (sent ${Object.entries(r.postData).map(([k, v]) => `${k}=${v}`).join(", ")})` : ""}.`,
        tone: bad ? "fail" : login ? "warn" : "info",
        nodes: bad ? ["gateway"] : login ? ["auth"] : write ? ["db"] : [],
        edges,
      });
    } else if (e.type === "model") {
      const m = e as ModelCallEvent;
      const channel = (m.input as { channel?: string })?.channel;
      const out_ = m.output as { tool_calls?: { name: string }[]; structuredContent?: { action?: { description?: string; method?: string } | null } };
      if (channel === "stagehand") {
        const a = out_.structuredContent?.action;
        out.push({ at: m.at - m.latencyMs, text: a ? `Stagehand resolves the instruction to ${a.method} on “${a.description}”.` : a === null ? "Stagehand finds no matching element." : "Stagehand asks the model about the page.", tone: a === null ? "warn" : "info", nodes: ["model"], edges: ["stagehand>model", "model>stagehand"] });
      } else {
        const calls = (out_.tool_calls ?? []).map((t) => t.name).join(", ");
        out.push({ at: m.at - m.latencyMs, text: calls ? `The agent decides: ${calls}.` : "The agent replies without a tool call.", tone: "info", nodes: ["model"], edges: ["agent>model", "model>agent"] });
      }
    } else if (e.type === "claim") {
      const c = e as ClaimEvent;
      const honest = detail.result.oracle.claimHonest;
      out.push({ at: c.at, text: `The agent reports ${c.success ? "success" : "failure"}: “${c.summary}”`, tone: "info", nodes: ["agent"], edges: ["agent>oracle"] });
      out.push({
        at: c.at + 1,
        text: honest
          ? `The application's records agree${detail.result.oracle.taskPassed ? ": the lead is correct." : ": the task did not succeed, and the agent said so."}`
          : `The application's records disagree: ${detail.result.oracle.checks.filter((x) => !x.passed && x.name !== "claim-matches-state").map((x) => `${x.name} is ${JSON.stringify(x.actual)}`).join("; ") || "the claim does not match"}.`,
        tone: honest ? "pass" : "fail",
        nodes: ["oracle", "db"],
        edges: ["db>oracle"],
      });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

function verb(tool: string): string {
  if (tool === "navigate" || tool === "goto") return "Opens";
  if (tool === "fill") return "Types into";
  if (tool === "act") return "Acts:";
  if (/select/i.test(tool)) return "Selects";
  return "Clicks";
}
