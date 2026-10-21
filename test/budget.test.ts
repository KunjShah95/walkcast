import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Recorder } from "../packages/core/src/capture/recorder.ts";
import { BudgetExceededError, DEFAULT_COST_BUDGET_USD, DEFAULT_TOKEN_BUDGET, RunBudget, budgetLimitsFor } from "../packages/core/src/llm/budget.ts";
import { ModelGateway, type ModelBackend } from "../packages/core/src/llm/gateway.ts";

function recorder(): Recorder {
  return new Recorder(mkdtempSync(join(tmpdir(), "walkcast-budget-")), { screenshots: false });
}

/** A backend that answers every call with the same usage. */
function backend(input: number, output: number, model = "test:model"): ModelBackend {
  return {
    name: model,
    agent: async () => ({
      content: [{ type: "text", text: "ok", citations: null }],
      stop_reason: "end_turn",
      model,
      usage: { input_tokens: input, output_tokens: output },
    }),
    stagehand: async () => ({
      role: "assistant",
      content: [{ type: "text", text: "ok" }],
      outputFormat: "text",
      usage: { inputTokens: input, outputTokens: output, totalTokens: input + output },
    }),
  };
}

test("with nothing configured, a run gets the default ceilings", () => {
  const limits = budgetLimitsFor("sh-p1", {});
  assert.equal(limits.tokens, DEFAULT_TOKEN_BUDGET);
  assert.equal(limits.usd, DEFAULT_COST_BUDGET_USD);
});

test("an agent's own ceiling wins over the global one", () => {
  const env = { LAB_AGENT_TOKEN_BUDGET: "1000", LAB_AGENT_TOKEN_BUDGET_SH_P1: "2000", LAB_AGENT_COST_BUDGET_USD: "1" };
  assert.equal(budgetLimitsFor("sh-p1", env).tokens, 2000);
  assert.equal(budgetLimitsFor("sh-p0", env).tokens, 1000);
  assert.equal(budgetLimitsFor("sh-p1", env).usd, 1);
});

test("'off' means no ceiling, a typo means the default", () => {
  assert.equal(budgetLimitsFor("sh-p1", { LAB_AGENT_TOKEN_BUDGET: "off" }).tokens, null);
  assert.equal(budgetLimitsFor("sh-p1", { LAB_AGENT_TOKEN_BUDGET: "-1" }).tokens, null);
  // A malformed value must not silently turn the guard off.
  assert.equal(budgetLimitsFor("sh-p1", { LAB_AGENT_TOKEN_BUDGET: "lots" }).tokens, DEFAULT_TOKEN_BUDGET);
  assert.equal(budgetLimitsFor("sh-p1", { LAB_AGENT_TOKEN_BUDGET: "" }).tokens, DEFAULT_TOKEN_BUDGET);
});

test("a run stops at the token ceiling, and the message names the knob", () => {
  const budget = new RunBudget({ tokens: 100, usd: null });
  budget.spend("test:model", 60, 40); // exactly at the ceiling
  assert.equal(budget.spentTokens, 100);
  assert.throws(() => budget.assertCanCall(), (error: unknown) => {
    assert.ok(error instanceof BudgetExceededError);
    assert.match(error.message, /LAB_AGENT_TOKEN_BUDGET/);
    return true;
  });
});

test("the call that goes over the ceiling is the one that stops the run", () => {
  const budget = new RunBudget({ tokens: 100, usd: null });
  assert.throws(() => budget.spend("test:model", 60, 60), BudgetExceededError);
  assert.equal(budget.exhausted, true);
  assert.equal(budget.state.spentTokens, 120);
});

test("the dollar ceiling counts the estimate, not the tokens", () => {
  const budget = new RunBudget({ tokens: null, usd: 5 });
  // Claude Opus list price: $15 per million input tokens.
  assert.throws(() => budget.spend("claude-opus-5-5", 1_000_000, 0), BudgetExceededError);
  assert.match(budget.state.reason ?? "", /LAB_AGENT_COST_BUDGET_USD/);
});

test("a live run is stopped at its ceiling, and the call that crossed it is still recorded", async () => {
  const gateway = new ModelGateway("live", backend(6, 6), recorder(), undefined, new RunBudget({ tokens: 10, usd: null }));
  await assert.rejects(() => gateway.agent({ system: "s", tools: [], messages: [] }), BudgetExceededError);
  assert.equal(gateway.entries.length, 1);
  assert.equal(gateway.status.calls, 1);
  assert.equal(gateway.budgetState?.exhausted, true);
});

test("a replay or a scripted run is never charged against a budget", async () => {
  const budget = new RunBudget({ tokens: 0, usd: 0 });
  const scripted = new ModelGateway("scripted", backend(1000, 1000), recorder(), undefined, budget);
  await scripted.agent({ system: "s", tools: [], messages: [] });
  assert.equal(scripted.status.calls, 1);
  assert.equal(budget.spentTokens, 0);
});
