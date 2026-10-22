import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, test } from "node:test";
import { replayFixture, type Fixture } from "../packages/core/src/lab/fixture.ts";
import type { ModelBackend } from "../packages/core/src/llm/gateway.ts";
import { measured, providerHealth, resetProviderHealth } from "../packages/core/src/llm/health.ts";
import { estimateCost, priceFor } from "../packages/core/src/llm/pricing.ts";
import { TokenBucket } from "../packages/core/src/llm/rate-limit.ts";
import { HttpStatusError, isRetryableStatus, llmMaxRetries, retryDelayMs, withRetry } from "../packages/core/src/llm/retry.ts";

process.env.LAB_LOG = "off";

/** What stands between a model call and a surprise: retries, health, prices, and replays that stay replays. */

const roots: string[] = [];
after(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});
afterEach(() => {
  delete process.env.LAB_PRICE_INPUT_USD_PER_MTOK;
  delete process.env.LAB_PRICE_OUTPUT_USD_PER_MTOK;
  resetProviderHealth();
});

test("a rate limit or a server error is retried, honouring Retry-After; a bad request is not", async () => {
  assert.equal(isRetryableStatus(429), true);
  assert.equal(isRetryableStatus(503), true);
  assert.equal(isRetryableStatus(400), false);
  assert.equal(retryDelayMs(1, "2"), 2000);
  assert.equal(retryDelayMs(1, "120"), 30_000, "a long Retry-After is capped: a run has a deadline");
  assert.equal(llmMaxRetries({ LAB_LLM_MAX_RETRIES: "0" }), 0);
  assert.equal(llmMaxRetries({ LAB_LLM_MAX_RETRIES: "" }), 4, "blank means the default, not zero");

  const waits: number[] = [];
  let calls = 0;
  const answer = await withRetry(
    async () => {
      calls++;
      if (calls < 3) throw new HttpStatusError("busy", 429, "1");
      return "ok";
    },
    { retries: 4, sleep: async (ms) => void waits.push(ms) },
  );
  assert.equal(answer, "ok");
  assert.deepEqual(waits, [1000, 1000]);

  let tried = 0;
  await assert.rejects(withRetry(async () => ((tried++), Promise.reject(new HttpStatusError("bad", 400))), { retries: 4, sleep: async () => undefined }), /bad/);
  assert.equal(tried, 1, "a 400 is the request's fault: sending it again changes nothing");
});

test("each provider's calls are counted, and a failing one shows as degraded", async () => {
  let fail = true;
  const backend = {
    name: "test",
    agent: async () => {
      if (fail) throw Object.assign(new Error("overloaded"), { status: 529 });
      return {} as never;
    },
    stagehand: async () => ({}) as never,
  } as ModelBackend;
  const flaky = measured(backend, "flaky");
  for (let i = 0; i < 6; i++) await flaky.agent({} as never).catch(() => undefined);
  fail = false;
  await flaky.agent({} as never);
  const [h] = providerHealth(60_000);
  assert.equal(h?.provider, "flaky");
  assert.equal(h?.calls, 7);
  assert.equal(h?.failures, 6);
  assert.equal(h?.state, "down");
  assert.equal(h?.lastError?.status, 529);
});

test("a blank or half-set price never turns the dollar ceiling off", () => {
  process.env.LAB_PRICE_INPUT_USD_PER_MTOK = "";
  process.env.LAB_PRICE_OUTPUT_USD_PER_MTOK = "";
  assert.notEqual(priceFor("anthropic:claude-sonnet-5")?.source, "yours", "blank lines are not a price of $0");
  process.env.LAB_PRICE_INPUT_USD_PER_MTOK = "3";
  assert.equal(priceFor("unknown-model"), null, "half a price is no price");
  process.env.LAB_PRICE_OUTPUT_USD_PER_MTOK = "15";
  assert.equal(estimateCost("unknown-model", 1_000_000, 1_000_000), 18);
});

test("a replay whose recorded calls are missing refuses to go live on its own", async () => {
  const dir = mkdtempSync(join(tmpdir(), "walkcast-fixture-"));
  roots.push(dir);
  const fixture = {
    dir,
    manifest: {
      environment: { fault: "none", seed: 1, appVersion: "x", playwrightVersion: "x" },
      original: { agent: { id: "sh-p0" }, model: { cassette: "model-calls.jsonl" } },
      task: { id: "create-lead" },
    },
  } as unknown as Fixture;
  await assert.rejects(replayFixture(fixture, "sh-p0", 1, dir), /recorded model calls .* are missing/);
});

test("a request bigger than the rate limit's whole budget is refused, not waited on forever", async () => {
  await assert.rejects(new TokenBucket(100, 1).acquire(500), /more than the 100/);
});
