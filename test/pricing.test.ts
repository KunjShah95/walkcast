import assert from "node:assert/strict";
import { test } from "node:test";
import { estimateCost, priceFor, usd } from "../packages/core/src/llm/pricing.ts";

/**
 * What a run cost.
 *
 * The tokens are counted by the gateway and are a fact. The money is an estimate from a list
 * that says it is one, and the account's own price wins when it has set one. What must never
 * happen is a confident number for a model nobody has a price for.
 */

test("a model that can be named gets a price, and one that cannot gets nothing", () => {
  const saved = { i: process.env.LAB_PRICE_INPUT_USD_PER_MTOK, o: process.env.LAB_PRICE_OUTPUT_USD_PER_MTOK };
  delete process.env.LAB_PRICE_INPUT_USD_PER_MTOK;
  delete process.env.LAB_PRICE_OUTPUT_USD_PER_MTOK;
  try {
    assert.deepEqual(priceFor("openrouter:anthropic/claude-sonnet-5"), { input: 3, output: 15, source: "list" });
    assert.deepEqual(priceFor("anthropic/claude-opus-5-5"), { input: 15, output: 75, source: "list" });
    assert.equal(priceFor("some-model-nobody-has-heard-of"), null);
    assert.equal(priceFor(null), null);
    // No price means no money is claimed.
    assert.equal(estimateCost("some-model-nobody-has-heard-of", 1000, 1000), null);
  } finally {
    if (saved.i === undefined) delete process.env.LAB_PRICE_INPUT_USD_PER_MTOK;
    else process.env.LAB_PRICE_INPUT_USD_PER_MTOK = saved.i;
    if (saved.o === undefined) delete process.env.LAB_PRICE_OUTPUT_USD_PER_MTOK;
    else process.env.LAB_PRICE_OUTPUT_USD_PER_MTOK = saved.o;
  }
});

test("the account's own price wins over the list", () => {
  const saved = { i: process.env.LAB_PRICE_INPUT_USD_PER_MTOK, o: process.env.LAB_PRICE_OUTPUT_USD_PER_MTOK };
  process.env.LAB_PRICE_INPUT_USD_PER_MTOK = "1";
  process.env.LAB_PRICE_OUTPUT_USD_PER_MTOK = "4";
  try {
    assert.deepEqual(priceFor("anthropic/claude-sonnet-5"), { input: 1, output: 4, source: "yours" });
    // A million tokens in, a million out, at the account's own price: five dollars.
    assert.equal(estimateCost("anything-at-all", 1_000_000, 1_000_000), 5);
  } finally {
    if (saved.i === undefined) delete process.env.LAB_PRICE_INPUT_USD_PER_MTOK;
    else process.env.LAB_PRICE_INPUT_USD_PER_MTOK = saved.i;
    if (saved.o === undefined) delete process.env.LAB_PRICE_OUTPUT_USD_PER_MTOK;
    else process.env.LAB_PRICE_OUTPUT_USD_PER_MTOK = saved.o;
  }
});

test("money is written the way money is written", () => {
  assert.equal(usd(0), "$0.00");
  assert.equal(usd(0.0001), "$0.0001");
  assert.equal(usd(0.42), "$0.420");
  assert.equal(usd(12.345), "$12.35");
});
