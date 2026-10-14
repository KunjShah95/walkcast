import type { BrowserTools, Observation } from "../capture/tools.ts";
import { CREDENTIALS } from "../app/server.ts";
import type { CreateLeadTask } from "../lab/task.ts";

/**
 * Scripted stand-ins for an LLM browser agent. Each behaviour flag reproduces a failure
 * mechanism that real agents exhibit (stale indices, cached selectors, retry-on-timeout,
 * trusting a toast). They are deterministic so the harness itself can be validated before
 * spending tokens; they are NOT evidence about how any LLM behaves.
 */
export interface AgentConfig {
  id: string;
  description: string;
  /** Simulated model latency between observing and acting. */
  thinkMs: number;
  /** Wait for the DOM to stop changing before the first observation. */
  settleBeforeObserve: boolean;
  /** Re-observe immediately before each action instead of reusing the first observation. */
  reobserveBeforeAct: boolean;
  /** Address <select> options by label (true) or by observed position (false). */
  selectByLabel: boolean;
  /** Read the select back after choosing and retry once if it is wrong. */
  verifySelection: boolean;
  /** Click this selector (cached from an earlier run) instead of finding the submit button. */
  cachedSubmitSelector: string | null;
  /** How long to wait for the post-submit navigation before treating it as failed. */
  submitWaitMs: number;
  /** After an ambiguous submit error, check whether the lead already exists before resubmitting. */
  readBackBeforeRetry: boolean;
  /** After success, open the record and compare it with the request before claiming success. */
  verifyOutcome: boolean;
  /** On a login redirect mid-task: 'redo' re-authenticates and redoes the form; 'assume-saved' claims success. */
  onSessionLoss: "redo" | "assume-saved";
}

const BASE = {
  thinkMs: 1600,
  settleBeforeObserve: false,
  reobserveBeforeAct: false,
  selectByLabel: false,
  verifySelection: false,
  cachedSubmitSelector: "#save-lead",
  submitWaitMs: 10000,
  readBackBeforeRetry: false,
  verifyOutcome: false,
  onSessionLoss: "assume-saved" as const,
};

export const AGENTS: Record<string, AgentConfig> = {
  v0: {
    ...BASE,
    id: "v0",
    description: "Naive baseline: one observation, index-based targets, cached selector, retries errors blindly, trusts the toast.",
  },
  v1: {
    ...BASE,
    id: "v1",
    description: "Fixed: settle + re-observe, label targets, verify selection, read-back before retrying an ambiguous error, verify outcome, safe re-auth.",
    settleBeforeObserve: true,
    reobserveBeforeAct: true,
    selectByLabel: true,
    verifySelection: true,
    cachedSubmitSelector: null,
    readBackBeforeRetry: true,
    verifyOutcome: true,
    onSessionLoss: "redo",
  },
  v2: {
    ...BASE,
    id: "v2",
    description: "Regression of v1: the read-back before retrying a failed submit was removed (a 'latency optimisation').",
    settleBeforeObserve: true,
    reobserveBeforeAct: true,
    selectByLabel: true,
    verifySelection: true,
    cachedSubmitSelector: null,
    readBackBeforeRetry: false,
    verifyOutcome: true,
    onSessionLoss: "redo",
  },
};

export function agentConfig(id: string): AgentConfig {
  const config = AGENTS[id];
  if (!config) throw new Error(`Unknown agent '${id}'. Known: ${Object.keys(AGENTS).join(", ")}`);
  return config;
}

export async function runScriptedAgent(tools: BrowserTools, task: CreateLeadTask, config: AgentConfig): Promise<void> {
  const think = () => tools.page.waitForTimeout(config.thinkMs);
  const { contact, company, owner } = task.params;

  const login = async (): Promise<void> => {
    const obs = await tools.observe();
    await tools.fill(byName(obs, "Username"), CREDENTIALS.username, obs);
    await tools.fill(byName(obs, "Password"), CREDENTIALS.password, obs);
    const before = tools.page.url();
    await tools.click(byName(obs, "Sign in"), obs);
    await tools.waitForNavigation(before, 5000).catch(() => undefined);
  };

  const onLoginPage = () => new URL(tools.page.url()).pathname === "/login";
  const leadExists = async (): Promise<number | undefined> => {
    const html = await tools.fetchText("/leads");
    const match = html.match(new RegExp(`<a href="/leads/(\\d+)">\\d+</a></td><td>${escapeRe(contact)}</td><td>${escapeRe(company)}</td>`));
    return match ? Number(match[1]) : undefined;
  };

  const fillForm = async (): Promise<void> => {
    if (config.settleBeforeObserve) await tools.waitForSettle(2000, 8000);
    let obs = await tools.observe();
    await think();
    if (config.reobserveBeforeAct) obs = await tools.observe();
    await tools.fill(byName(obs, "Contact name"), contact, obs);
    await tools.fill(byName(obs, "Company"), company, obs);
    if (config.reobserveBeforeAct) obs = await tools.observe();
    const select = byName(obs, "Owner");
    if (config.selectByLabel) {
      await tools.selectByLabel(select, owner, obs);
    } else {
      const optionIndex = obs.elements[select]?.options?.findIndex((o) => o.label === owner) ?? -1;
      await tools.selectOptionAt(select, optionIndex, obs);
    }
    if (config.verifySelection) {
      const selected = await tools.readValue("#lead-form select");
      if (selected !== owner) {
        const fresh = await tools.observe();
        await tools.selectByLabel(byName(fresh, "Owner"), owner, fresh);
      }
    }
  };

  const submit = async (): Promise<void> => {
    if (config.cachedSubmitSelector) {
      await tools.clickSelector(config.cachedSubmitSelector);
    } else {
      const obs = await tools.observe();
      const button = obs.elements.find((e) => e.tag === "button" && e.type === "submit" && e.selector !== "#sign-in");
      if (!button) throw new Error("No submit button found");
      await tools.click(button.index, obs);
    }
  };

  // ---- the task
  await tools.goto(task.startPath);
  if (onLoginPage()) await login();

  for (let attempt = 1; attempt <= 2; attempt++) {
    await fillForm();
    const formUrl = tools.page.url();
    try {
      await submit();
    } catch (error) {
      return tools.done(false, `Could not submit the form: ${(error as Error).message.split("\n")[0]}`);
    }

    const navigated = await tools.waitForNavigation(formUrl, config.submitWaitMs).then(() => true, () => false);
    if (!navigated) return tools.done(false, "The form never finished submitting.");

    const result = await tools.observe();
    if (/gateway timeout|try again/i.test(result.text)) {
      // Ambiguous failure: the write may or may not have happened.
      if (config.readBackBeforeRetry) {
        const existing = await leadExists();
        if (existing) {
          await tools.goto(`/leads/${existing}`);
          break;
        }
      }
      if (attempt === 2) return tools.done(false, "The server returned an error twice.");
      await tools.goto("/leads/new");
      continue;
    }

    if (onLoginPage()) {
      if (config.onSessionLoss === "assume-saved") {
        await login();
        return tools.done(true, `Submitted the lead for ${company}; the session was refreshed afterwards.`);
      }
      await login();
      const existing = config.readBackBeforeRetry ? await leadExists() : undefined;
      if (existing) {
        await tools.goto(`/leads/${existing}`);
      } else {
        if (new URL(tools.page.url()).pathname !== "/leads/new") await tools.goto("/leads/new");
        continue; // redo the form once
      }
    }
    break;
  }

  const path = new URL(tools.page.url()).pathname;
  const idMatch = path.match(/^\/leads\/(\d+)$/);
  const leadId = idMatch ? Number(idMatch[1]) : undefined;
  const obs = await tools.observe();

  if (!config.verifyOutcome) {
    const toast = obs.text.includes("Lead created");
    return tools.done(toast, toast ? `Lead ${leadId} created for ${company}, owner ${owner}.` : "No confirmation shown.", leadId);
  }

  const savedOwner = await tools.readValue('[data-field="owner"]');
  if (leadId === undefined || savedOwner === null) return tools.done(false, "Could not find the saved lead to verify it.");
  if (savedOwner !== owner) {
    return tools.done(false, `Lead ${leadId} was saved but its owner is '${savedOwner}', not '${owner}'.`, leadId);
  }
  return tools.done(true, `Lead ${leadId} created for ${company}, owner ${owner} (verified on the record).`, leadId);
}

function byName(obs: Observation, name: string): number {
  const element = obs.elements.find((e) => e.name === name);
  if (!element) throw new Error(`No element named '${name}' at ${obs.url}`);
  return element.index;
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
