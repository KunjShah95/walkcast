import type { LedgerEntry, Lead } from "../app/server.ts";
import type { ClaimEvent, NetworkEvent, StepEvent, TraceEvent } from "../capture/recorder.ts";
import type { OracleResult } from "./task.ts";

export type FindingKind = "symptom" | "cause" | "incident";

export type FindingLabel =
  | "false-success"
  | "missed-success"
  | "wrong-outcome"
  | "duplicate-action"
  | "stale-observation"
  | "navigation-timeout"
  | "unsafe-retry"
  | "action-failed"
  | "auth-lost"
  | "locator-not-found"
  | "app-dropped-field"
  | "app-error"
  | "agent-error"
  | "unexplained";

export interface Finding {
  label: FindingLabel;
  kind: FindingKind;
  /** oracle: confirmed by application state; rule: deterministic trace rule; needs-review: no rule explains it. */
  confidence: "oracle" | "rule" | "needs-review";
  explanation: string;
  evidenceSteps: number[];
}

export interface Diagnosis {
  verdict: "pass" | "fail";
  findings: Finding[];
}

export interface ClassifierInput {
  events: TraceEvent[];
  oracle: OracleResult;
  ledger: LedgerEntry[];
  leads: Lead[];
  expectation: "task-success" | "honest-failure";
  requestedValues: Record<string, string>;
  /** The agent threw (crash, missing API key, provider outage, replay exhausted). */
  agentError?: string | null;
}

/**
 * Deterministic diagnosis. Every finding cites the steps it is based on. Nothing here calls
 * an LLM; failures no rule explains are reported as `unexplained` for human or LLM review.
 */
export function diagnose(input: ClassifierInput): Diagnosis {
  const { events, oracle, ledger, leads, expectation, requestedValues, agentError } = input;
  const steps = events.filter((e): e is StepEvent => e.type === "step");
  const requests = events.filter((e): e is NetworkEvent => e.type === "request");
  const claim = events.findLast((e): e is ClaimEvent => e.type === "claim");
  const findings: Finding[] = [];
  // An impossible task passes only if the agent says so honestly AND leaves no collateral damage.
  const records = oracle.checks.find((c) => c.name === "exactly-one-lead")?.actual;
  const noDuplicates = typeof records !== "number" || records <= 1;
  // A crashed agent never passes: its "failure" claim was written by the harness, not the agent.
  const passed = !agentError && (expectation === "task-success" ? oracle.taskPassed && oracle.claimHonest : oracle.claimHonest && noDuplicates);

  // ---- symptoms, confirmed against application state
  if (claim?.success && !oracle.taskPassed) {
    findings.push({
      label: "false-success",
      kind: "symptom",
      confidence: "oracle",
      explanation: `Agent claimed success ("${claim.summary}") but ${failedChecks(oracle)}.`,
      evidenceSteps: [claim.stepId],
    });
  } else if (oracle.taskPassed && (!claim || !claim.success)) {
    findings.push({
      label: "missed-success",
      kind: "symptom",
      confidence: "oracle",
      explanation: claim
        ? `Agent reported failure ("${claim.summary}") but the application's records show the task was completed.`
        : "Agent made no claim, but the application's records show the task was completed.",
      evidenceSteps: claim ? [claim.stepId] : [],
    });
  } else if (!oracle.taskPassed && expectation === "task-success") {
    findings.push({
      label: "wrong-outcome",
      kind: "symptom",
      confidence: "oracle",
      explanation: `Task outcome incorrect: ${failedChecks(oracle)}.`,
      evidenceSteps: claim ? [claim.stepId] : [],
    });
  }

  const committed = ledger.filter((e) => e.outcome === "committed");
  const byKey = groupBy(committed, (e) => JSON.stringify([e.path, e.body.company ?? "", e.body.contact ?? ""]));
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const postSteps = requests
      // Every POST to that path: under a gateway timeout each one returned 5xx yet committed.
      .filter((r) => r.method === "POST" && new URL(r.url).pathname === group[0]!.path)
      .map((r) => r.stepId);
    findings.push({
      label: "duplicate-action",
      kind: "symptom",
      confidence: "oracle",
      explanation: `${group.length} records were committed for the same request (${group[0]!.body.company}); lead ids ${group.map((e) => e.leadId).join(", ")}.`,
      evidenceSteps: unique(postSteps),
    });
  }

  // ---- causes, from trace rules
  for (const step of steps) {
    if (step.target?.stale) {
      findings.push({
        label: "stale-observation",
        kind: "cause",
        confidence: "rule",
        explanation: `Step ${step.stepId} (${step.tool}) targeted '${step.target.observedName}' from the observation in step ${step.target.observedInStep}, ${step.target.observationAgeMs} ms old, but the element at that position was '${step.target.nameAtAction}' when the action ran.`,
        evidenceSteps: [step.target.observedInStep, step.stepId],
      });
    }
  }

  const navTimeouts = steps.filter((s) => s.tool === "waitForNavigation" && s.error && /timeout/i.test(s.error));
  for (const step of navTimeouts) {
    const retried = steps.some((s) => s.stepId > step.stepId && /click/i.test(s.tool) && s.before?.url === step.before?.url);
    const postInFlight = requests.some(
      (r) => r.method === "POST" && r.at < step.endedAt && (r.respondedAt === undefined || r.respondedAt > step.endedAt),
    );
    findings.push({
      label: "navigation-timeout",
      kind: "cause",
      confidence: "rule",
      explanation:
        `Step ${step.stepId} gave up waiting for navigation after ${String(step.args.timeoutMs)} ms` +
        (postInFlight ? " while a submitted request was still in flight" : "") +
        (retried ? "; the agent then submitted again." : "."),
      evidenceSteps: [step.stepId],
    });
  }

  // A write repeated after an ambiguous failure (5xx, network failure) with no read in between.
  const writes = requests.filter((r) => r.method === "POST" && !new URL(r.url).pathname.startsWith("/login"));
  for (let i = 1; i < writes.length; i++) {
    const previous = writes[i - 1]!;
    const current = writes[i]!;
    const ambiguous = (previous.status ?? 0) >= 500 || previous.failure !== undefined;
    const sameRequest = JSON.stringify(previous.postData) === JSON.stringify(current.postData);
    // Overlapping writes are a double submit, not a retry: the later request must start after the
    // earlier one has a recorded response (or a recorded network failure).
    const finishedAt = previous.respondedAt ?? (previous.failure !== undefined ? previous.at : undefined);
    const afterPreviousSettled = finishedAt !== undefined && current.at >= finishedAt;
    // A read-back is a page load of the list/detail, or a fetchText step (page.request reads
    // don't appear as browser requests).
    const readBetween =
      requests.some((r) => r.method === "GET" && r.at > previous.at && r.at < current.at && /^\/leads(\/\d+)?$/.test(new URL(r.url).pathname)) ||
      steps.some((st) => st.tool === "fetchText" && st.startedAt > previous.at && st.startedAt < current.at);
    if (ambiguous && sameRequest && !readBetween && afterPreviousSettled) {
      findings.push({
        label: "unsafe-retry",
        kind: "cause",
        confidence: "rule",
        explanation: `The write in step ${previous.stepId} ended ambiguously (${previous.status ?? previous.failure}); step ${current.stepId} sent the same write again without first reading back whether the first one had succeeded.`,
        evidenceSteps: [previous.stepId, current.stepId],
      });
    }
  }

  // The framework reported an action as failed and the agent carried on without redoing it.
  for (const step of steps) {
    const outcome = step.result as { success?: unknown; message?: unknown } | undefined;
    if (step.tool !== "act" || outcome?.success !== false) continue;
    const redone = steps.some(
      (s) => s.stepId > step.stepId && s.tool === "act" && s.args.instruction === step.args.instruction && (s.result as { success?: unknown } | undefined)?.success === true,
    );
    if (!redone) {
      findings.push({
        label: "action-failed",
        kind: "cause",
        confidence: "rule",
        explanation: `Step ${step.stepId} ("${String(step.args.instruction)}") reported failure (${String(outcome.message)}) and was never successfully retried; the agent continued anyway.`,
        evidenceSteps: [step.stepId],
      });
    }
  }

  const authRejected = ledger.filter((e) => e.outcome === "rejected-auth");
  // Redirects to /login count only once the agent has signed in successfully: the first trip to
  // the login page is the normal start of the task, whichever step it happens in.
  const firstLogin = requests.find((r) => r.method === "POST" && new URL(r.url).pathname === "/login" && (r.status ?? 500) < 400);
  const loginRedirects = firstLogin ? requests.filter((r) => r.redirectedTo?.startsWith("/login") && r.at > firstLogin.at) : [];
  if (authRejected.length > 0 || loginRedirects.length > 0) {
    findings.push({
      label: "auth-lost",
      kind: "cause",
      confidence: "rule",
      explanation: `Session was lost mid-task: ${authRejected.length} write(s) rejected for authentication; redirected to login at step(s) ${unique(loginRedirects.map((r) => r.stepId)).join(", ") || "n/a"}.`,
      evidenceSteps: unique(loginRedirects.map((r) => r.stepId)),
    });
  }

  for (const step of steps) {
    const hadEffect =
      requests.some((r) => r.stepId === step.stepId) ||
      (step.before !== null && step.after !== null && step.before.fingerprint !== step.after.fingerprint);
    // A timed-out action that still sent a request or changed the page found its target.
    const emptyRead = step.tool === "readValue" && step.result === null && typeof step.args.selector === "string";
    if (emptyRead) {
      findings.push({
        label: "locator-not-found",
        kind: "cause",
        confidence: "rule",
        explanation: `Step ${step.stepId} read ${String(step.args.selector)}, which no longer exists on the page; the agent got nothing back.`,
        evidenceSteps: [step.stepId],
      });
      continue;
    }
    if (step.error && !hadEffect && /(click|fill|select)/i.test(step.tool) && /timeout|waiting for|no element/i.test(step.error)) {
      findings.push({
        label: "locator-not-found",
        kind: "cause",
        confidence: "rule",
        explanation: `Step ${step.stepId} (${step.tool} ${JSON.stringify(step.args.selector ?? step.args.name ?? "")}) found no matching element: ${step.error}`,
        evidenceSteps: [step.stepId],
      });
    }
  }

  // One finding per dropped field, citing every write that submitted the value.
  const writesWithBody = requests.filter((r) => r.method === "POST" && r.postData);
  for (const [field, requested] of Object.entries(requestedValues)) {
    const dropped = ledger
      .filter((e) => e.outcome === "committed" || e.outcome === "updated")
      .filter((e) => {
        const lead = leads.find((l) => l.id === e.leadId);
        const submitted = Object.values(e.body).includes(requested);
        return lead && submitted && (lead as unknown as Record<string, unknown>)[field] !== requested;
      });
    if (dropped.length === 0) continue;
    const entry = dropped[0]!;
    const submittedUnder = Object.entries(entry.body).find(([, v]) => v === requested)?.[0];
    const stored = (leads.find((l) => l.id === entry.leadId) as unknown as Record<string, unknown>)[field];
    findings.push({
      label: "app-dropped-field",
      kind: "cause",
      confidence: "oracle",
      explanation: `The browser submitted ${field}='${requested}' (as form field '${submittedUnder}')${dropped.length > 1 ? ` ${dropped.length} times` : ""} but the application stored '${String(stored)}'. The agent's input was correct; the application ignored it.`,
      evidenceSteps: unique(writesWithBody.filter((r) => Object.values(r.postData!).includes(requested)).map((r) => r.stepId)),
    });
  }

  const serverErrors = requests.filter((r) => (r.status ?? 0) >= 500);
  const pageErrors = events.filter((e) => e.type === "console" && e.level === "pageerror");
  if (serverErrors.length > 0 || pageErrors.length > 0) {
    findings.push({
      label: "app-error",
      kind: "cause",
      confidence: "rule",
      explanation: `${serverErrors.length} server error response(s) and ${pageErrors.length} uncaught page error(s).`,
      evidenceSteps: unique([...serverErrors, ...pageErrors].map((e) => e.stepId)),
    });
  }

  if (agentError) {
    findings.push({
      label: "agent-error",
      kind: "cause",
      confidence: "rule",
      explanation: `The agent stopped with an error before finishing: ${agentError}. This is a harness or infrastructure failure (crash, missing API key, provider outage, exhausted replay), not a judgement of the agent's behaviour.`,
      evidenceSteps: claim ? [claim.stepId] : [],
    });
  }

  // Causes on a passing run were handled by the agent: report them as incidents, not failures.
  if (passed) {
    for (const f of findings) if (f.kind === "cause") f.kind = "incident";
    return { verdict: "pass", findings: findings.filter((f) => f.kind === "incident") };
  }
  if (!findings.some((f) => f.kind === "cause")) {
    findings.push({
      label: "unexplained",
      kind: "cause",
      confidence: "needs-review",
      explanation: "The run failed but no deterministic rule explains why. Candidate for LLM-assisted or human review.",
      evidenceSteps: [],
    });
  }
  return { verdict: "fail", findings };
}

export function causes(diagnosis: Diagnosis): FindingLabel[] {
  return unique(diagnosis.findings.filter((f) => f.kind === "cause").map((f) => f.label));
}

export function symptoms(diagnosis: Diagnosis): FindingLabel[] {
  return unique(diagnosis.findings.filter((f) => f.kind === "symptom").map((f) => f.label));
}

function failedChecks(oracle: OracleResult): string {
  return oracle.checks
    .filter((c) => !c.passed && c.name !== "claim-matches-state")
    .map((c) => `${c.name} (expected ${JSON.stringify(c.expected)}, got ${JSON.stringify(c.actual)})`)
    .join("; ");
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
  return map;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
