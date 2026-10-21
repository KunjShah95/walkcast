/**
 * What one agent run may spend on model calls.
 *
 * A live run was bounded only by the agent's turn cap (30) and each call's max_tokens
 * (16000). That is a ceiling on time, not on money: the worst real run in results/ spent
 * 135k tokens across 47 calls, and a loop that keeps re-reading a long page spends the same
 * money on every attempt. The per-account daily quota (LAB_LLM_RUNS_PER_DAY) bounds how
 * often a run may start, not what one run may cost.
 *
 * The budget is the missing guard: a per-run ceiling on tokens and on estimated dollars,
 * checked at every call boundary. Two rules make it honest:
 *
 *   - The tokens are the fact. The dollars are an estimate from the price list
 *     (llm/pricing.ts) and say so; a model the list does not know costs no dollar ceiling,
 *     only the token one. Set LAB_PRICE_INPUT_USD_PER_MTOK / LAB_PRICE_OUTPUT_USD_PER_MTOK
 *     to price a model yourself.
 *   - It only applies to live runs. A replay reads a recorded cassette and a scripted run
 *     talks to a stand-in: neither spends a cent, and neither may fail differently just
 *     because a budget was reached.
 */
import { estimateCost, usd } from "./pricing.ts";

export interface BudgetLimits {
  /** Total tokens (input + output) one run may spend. null = no ceiling. */
  tokens: number | null;
  /** Estimated dollars one run may spend. null = no ceiling. */
  usd: number | null;
}

export interface BudgetState {
  limitTokens: number | null;
  limitUsd: number | null;
  spentTokens: number;
  inputTokens: number;
  outputTokens: number;
  spentUsd: number;
  /** True once a ceiling was reached: the run was stopped on purpose. */
  exhausted: boolean;
  /** Why it stopped, in words. null while the budget still has room. */
  reason: string | null;
}

/** Thrown when a run reaches a ceiling. The run stops; it is not the agent's fault. */
export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetExceededError";
  }
}

/** Default ceilings for a live run. Generous enough for a real 30-turn run, tight enough
 *  that a runaway loop cannot run up a bill: the worst observed run spent 135k tokens. */
export const DEFAULT_TOKEN_BUDGET = 250_000;
export const DEFAULT_COST_BUDGET_USD = 5;

/**
 * One run's budget. `assertCanCall()` runs before a call, `spend()` after it: a ceiling is
 * enforced at the call boundary, so the last call may overshoot it by its own size and the
 * run stops there. Nothing is spent after the ceiling is reached.
 */
export class RunBudget {
  readonly limits: BudgetLimits;
  private inputTokens = 0;
  private outputTokens = 0;
  private spentUsd = 0;
  private reason: string | null = null;

  constructor(limits: BudgetLimits) {
    this.limits = limits;
  }

  get spentTokens(): number {
    return this.inputTokens + this.outputTokens;
  }

  get exhausted(): boolean {
    return this.reason !== null;
  }

  get state(): BudgetState {
    return {
      limitTokens: this.limits.tokens,
      limitUsd: this.limits.usd,
      spentTokens: this.spentTokens,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      spentUsd: this.spentUsd,
      exhausted: this.exhausted,
      reason: this.reason,
    };
  }

  /**
   * Called before a model call: refuse to start one the budget cannot pay for.
   * Throws BudgetExceededError, which stops the agent loop.
   */
  assertCanCall(): void {
    if (this.reason) throw new BudgetExceededError(this.reason);
    if (this.limits.tokens !== null && this.spentTokens >= this.limits.tokens) {
      this.exhaustTokens(false);
      throw new BudgetExceededError(this.reason!);
    }
    if (this.limits.usd !== null && this.spentUsd >= this.limits.usd) {
      this.exhaustUsd(false);
      throw new BudgetExceededError(this.reason!);
    }
  }

  /** Called after a model call: count it, and stop the run when it went over a ceiling. */
  spend(model: string | null, input: number, output: number): void {
    this.inputTokens += input;
    this.outputTokens += output;
    const cost = estimateCost(model, input, output);
    if (cost !== null) this.spentUsd += cost;
    if (this.limits.tokens !== null && this.spentTokens > this.limits.tokens) {
      this.exhaustTokens(true);
      throw new BudgetExceededError(this.reason!);
    }
    if (this.limits.usd !== null && this.spentUsd > this.limits.usd) {
      this.exhaustUsd(true);
      throw new BudgetExceededError(this.reason!);
    }
  }

  private exhaustTokens(over: boolean): void {
    const spent = this.spentTokens.toLocaleString("en-US");
    const limit = this.limits.tokens!.toLocaleString("en-US");
    this.reason ??= `Model budget exhausted: this run spent ${spent} tokens, ${over ? "over" : "at"} its ceiling of ${limit}. Raise LAB_AGENT_TOKEN_BUDGET (or the agent's own LAB_AGENT_TOKEN_BUDGET_<ID>) for a higher ceiling, or replay a recorded run, which costs nothing.`;
  }

  private exhaustUsd(over: boolean): void {
    const spent = usd(this.spentUsd);
    const limit = usd(this.limits.usd!);
    this.reason ??= `Model budget exhausted: this run spent an estimated ${spent}, ${over ? "over" : "at"} its ceiling of ${limit}. Raise LAB_AGENT_COST_BUDGET_USD (or the agent's own LAB_AGENT_COST_BUDGET_USD_<ID>) for a higher ceiling, or replay a recorded run, which costs nothing.`;
  }
}

/**
 * The ceiling for one agent, from the environment:
 *   LAB_AGENT_TOKEN_BUDGET_SH_P1   per agent (id upper-cased, '-' -> '_')
 *   LAB_AGENT_TOKEN_BUDGET          the default for every model-backed agent
 *   LAB_AGENT_COST_BUDGET_USD_SH_P1 / LAB_AGENT_COST_BUDGET_USD, the same way
 *
 * "off" (or a negative number) means no ceiling. A malformed value is ignored, so a typo
 * falls back to the default instead of silently turning the budget off.
 */
export function budgetLimitsFor(agentId: string, env: NodeJS.ProcessEnv = process.env): BudgetLimits {
  const suffix = agentId.toUpperCase().replace(/-/g, "_");
  const tokens = resolve(env[`LAB_AGENT_TOKEN_BUDGET_${suffix}`], env.LAB_AGENT_TOKEN_BUDGET);
  const dollars = resolve(env[`LAB_AGENT_COST_BUDGET_USD_${suffix}`], env.LAB_AGENT_COST_BUDGET_USD);
  return {
    tokens: tokens.set ? tokens.value : DEFAULT_TOKEN_BUDGET,
    usd: dollars.set ? dollars.value : DEFAULT_COST_BUDGET_USD,
  };
}

/** The budget for one agent, ready to be handed to the gateway. */
export function budgetFor(agentId: string, env: NodeJS.ProcessEnv = process.env): RunBudget {
  return new RunBudget(budgetLimitsFor(agentId, env));
}

/**
 * A ceiling from an environment value.
 *
 * `set: false` means "nothing said" — the value was absent, empty or malformed, and the
 * next source is used. `set: true, value: null` means "no ceiling" on purpose. The two must
 * not be confused: a typo that fell through to "no ceiling" would leave a live run
 * uncapped, which is exactly the failure this guard exists to prevent.
 */
function cap(raw: string | undefined): { set: boolean; value: number | null } {
  if (raw === undefined) return { set: false, value: null };
  const value = raw.trim().toLowerCase();
  if (value === "") return { set: false, value: null };
  if (value === "off" || value === "none" || value === "unlimited" || value === "no" || value === "false") return { set: true, value: null };
  const n = Number(value);
  if (!Number.isFinite(n)) return { set: false, value: null };
  if (n < 0) return { set: true, value: null };
  return { set: true, value: Math.trunc(n) };
}

/** The first source that said something wins. */
function resolve(...sources: (string | undefined)[]): { set: boolean; value: number | null } {
  for (const source of sources) {
    const c = cap(source);
    if (c.set) return c;
  }
  return { set: false, value: null };
}
