/**
 * What a run cost, as far as it can honestly be said.
 *
 * The run already knows how many tokens it spent — the gateway counts them as it goes. What
 * it does not know is what the provider charged for them, because prices change and because
 * the price of a model is the account's business, not the recorder's.
 *
 * So: the tokens are the fact, and the money is an estimate from a list that lives in one
 * place and says what it is. Set LAB_PRICE_INPUT_USD_PER_MTOK and LAB_PRICE_OUTPUT_USD_PER_MTOK
 * to use your own price instead, and the estimate is yours.
 */

/** USD per million tokens, by model family. A guide, not a bill. */
const LIST_PRICES: { match: RegExp; input: number; output: number }[] = [
  { match: /claude.*opus/i, input: 15, output: 75 },
  { match: /claude.*sonnet/i, input: 3, output: 15 },
  { match: /claude.*haiku/i, input: 0.8, output: 4 },
  { match: /gpt-5/i, input: 1.25, output: 10 },
  { match: /gpt-4o/i, input: 2.5, output: 10 },
  { match: /gemini.*pro/i, input: 1.25, output: 10 },
  { match: /gemini.*flash/i, input: 0.3, output: 2.5 },
  { match: /deepseek/i, input: 0.27, output: 1.1 },
  { match: /llama-?3\.3-?70b/i, input: 0.59, output: 0.79 },
];

/** A price in dollars per million tokens. */
export interface TokenPrice {
  input: number;
  output: number;
  /** Where the price came from: the account's own, or the list. */
  source: "yours" | "list";
}

/**
 * The price for a model, if it can be named.
 *
 * A model is named by a spec ("openrouter:anthropic/claude-sonnet-5") or by the model id the
 * provider answered with ("anthropic/claude-sonnet-5"). Both are matched on the family.
 */
export function priceFor(model: string | null | undefined): TokenPrice | null {
  const own = ownPrice();
  if (own) return own;
  if (!model) return null;
  const hit = LIST_PRICES.find((p) => p.match.test(model));
  return hit ? { input: hit.input, output: hit.output, source: "list" } : null;
}

/** The price the account set for itself, if it set one. */
function ownPrice(): TokenPrice | null {
  const input = Number(process.env.LAB_PRICE_INPUT_USD_PER_MTOK);
  const output = Number(process.env.LAB_PRICE_OUTPUT_USD_PER_MTOK);
  if (!Number.isFinite(input) && !Number.isFinite(output)) return null;
  return { input: Number.isFinite(input) ? input : 0, output: Number.isFinite(output) ? output : 0, source: "yours" };
}

/** What a run's tokens cost, in dollars. `null` when the model has no price we can name. */
export function estimateCost(model: string | null | undefined, inputTokens: number, outputTokens: number): number | null {
  const price = priceFor(model);
  if (!price) return null;
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}

/** A cost, written the way money is written. Small amounts are not rounded to nothing. */
export function usd(amount: number): string {
  if (amount === 0) return "$0.00";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}
