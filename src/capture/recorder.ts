import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BrowserContext, Page, Request } from "playwright";
import { scrub } from "./secrets.ts";

/** Page state snapshot taken before and after every tool call. */
export interface PageState {
  url: string;
  title: string;
  fingerprint: string;
}

/** Identity check for index-addressed actions: what the agent saw vs. what it actually hit. */
export interface TargetCheck {
  observedInStep: number;
  observedName: string;
  nameAtAction: string | null;
  stale: boolean;
  observationAgeMs: number;
  fingerprintChanged: boolean;
}

export interface StepEvent {
  type: "step";
  stepId: number;
  tool: string;
  args: Record<string, unknown>;
  startedAt: number;
  endedAt: number;
  before: PageState | null;
  after: PageState | null;
  target?: TargetCheck;
  result?: unknown;
  error?: string;
  screenshot?: string;
}

export interface NetworkEvent {
  type: "request";
  stepId: number;
  at: number;
  method: string;
  url: string;
  postData?: Record<string, string>;
  status?: number;
  respondedAt?: number;
  failure?: string;
  redirectedTo?: string;
}

export interface ConsoleEvent {
  type: "console";
  stepId: number;
  at: number;
  level: "error" | "pageerror";
  text: string;
}

/** Placeholder for LLM-driven agents: every model call is captured verbatim for replay. */
export interface ModelCallEvent {
  type: "model";
  stepId: number;
  at: number;
  model: string;
  input: unknown;
  output: unknown;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
}

export interface ClaimEvent {
  type: "claim";
  stepId: number;
  at: number;
  success: boolean;
  summary: string;
  leadId?: number;
  /** For question-answering tasks: the agent's answer. */
  answer?: string;
}

export type TraceEvent = StepEvent | NetworkEvent | ConsoleEvent | ModelCallEvent | ClaimEvent;

/** Values never written to disk. Applied to request bodies and tool arguments. */
const REDACTED_KEYS = /pass(word)?|secret|token|authorization|cookie|otp/i;

export function redact<T extends Record<string, unknown>>(record: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) out[k] = REDACTED_KEYS.test(k) ? "[REDACTED]" : v;
  return out as T;
}

/**
 * Form fields of a request body. JSON bodies are parsed as JSON (top-level fields; nested values
 * stringified) so that key-based redaction still applies; anything else is read as a form.
 */
export function parseBody(body: string, contentType: string): Record<string, string> {
  if (/json/i.test(contentType) || /^\s*[{[]/.test(body)) {
    try {
      const value = JSON.parse(body) as unknown;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
      }
      return { _body: "[non-form JSON body omitted]" };
    } catch {
      return { _body: "[unparsed body omitted]" };
    }
  }
  if (/multipart\//i.test(contentType)) return { _body: "[multipart body omitted]" };
  return Object.fromEntries(new URLSearchParams(body));
}

/**
 * Collects a single run's trace on one monotonic clock. Network and console events are
 * attributed to whichever tool call was in flight when they happened.
 */
export class Recorder {
  readonly events: TraceEvent[] = [];
  readonly t0 = performance.now();
  currentStep = 0;
  private requestIndex = new Map<Request, NetworkEvent>();

  constructor(
    readonly runDir: string,
    /** bodies: false keeps request bodies out of the trace entirely (e.g. third-party sign-in forms). */
    readonly options: { screenshots: boolean; bodies?: boolean },
  ) {
    mkdirSync(runDir, { recursive: true });
  }

  now(): number {
    return Math.round(performance.now() - this.t0);
  }

  attach(context: BrowserContext, page: Page): void {
    context.on("request", (request) => {
      if (request.resourceType() !== "document" && request.resourceType() !== "fetch" && request.resourceType() !== "xhr") return;
      const event: NetworkEvent = {
        type: "request",
        stepId: this.currentStep,
        at: this.now(),
        method: request.method(),
        url: request.url(),
      };
      const body = request.postData();
      if (body && request.method() === "POST" && this.options.bodies !== false) {
        event.postData = redact(parseBody(body, request.headers()["content-type"] ?? ""));
      }
      this.requestIndex.set(request, event);
      this.events.push(event);
    });
    context.on("response", (response) => {
      const event = this.requestIndex.get(response.request());
      if (!event) return;
      event.status = response.status();
      event.respondedAt = this.now();
      const location = response.headers()["location"];
      if (location) event.redirectedTo = location;
    });
    context.on("requestfailed", (request) => {
      const event = this.requestIndex.get(request);
      if (event) event.failure = request.failure()?.errorText ?? "failed";
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        this.events.push({ type: "console", stepId: this.currentStep, at: this.now(), level: "error", text: msg.text() });
      }
    });
    page.on("pageerror", (error) => {
      this.events.push({ type: "console", stepId: this.currentStep, at: this.now(), level: "pageerror", text: error.message });
    });
  }

  push(event: TraceEvent): void {
    this.events.push(event);
  }

  steps(): StepEvent[] {
    return this.events.filter((e): e is StepEvent => e.type === "step");
  }

  claim(): ClaimEvent | undefined {
    return this.events.findLast((e): e is ClaimEvent => e.type === "claim");
  }

  screenshotPath(stepId: number): string {
    return join(this.runDir, `step-${String(stepId).padStart(3, "0")}.jpg`);
  }

  flush(): string {
    const path = join(this.runDir, "trace.jsonl");
    writeFileSync(path, this.events.map((e) => JSON.stringify(scrub(e))).join("\n") + "\n");
    return path;
  }
}
