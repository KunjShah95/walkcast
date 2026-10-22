import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { cronMinGapMs, nextCronTime, parseCron, scheduleDue } from "../packages/core/src/cron.ts";
import { newSchedule, parseInterval } from "../packages/core/src/schedules.ts";
import { FileStore, type Store, type WebhookDelivery } from "../packages/core/src/store/index.ts";
import { processOutbox } from "../packages/core/src/webhooks.ts";

process.env.LAB_LOG = "off";

/** Schedules and webhooks: the parts of Walkcast that other systems rely on to happen on time, once. */

const roots: string[] = [];
const mkroot = (): string => {
  const r = mkdtempSync(join(tmpdir(), "walkcast-integrations-"));
  roots.push(r);
  return r;
};
after(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

/** Local-time date, so the tests read the way cron does. */
const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi);

test("cron fires on its calendar, not hourly", () => {
  // 2026-10-22 is a Thursday.
  const mondayNine = parseCron("0 9 * * 1");
  assert.deepEqual(nextCronTime(mondayNine, at(2026, 10, 22, 12)), at(2026, 10, 26, 9));
  assert.deepEqual(nextCronTime(parseCron("0 0 * * *"), at(2026, 10, 22, 12)), at(2026, 10, 23, 0));
  assert.deepEqual(nextCronTime(parseCron("30 14 * * *"), at(2026, 10, 22, 14, 30)), at(2026, 10, 23, 14, 30), "strictly after");
  assert.deepEqual(nextCronTime(parseCron("*/15 * * * *"), at(2026, 10, 22, 12, 7)), at(2026, 10, 22, 12, 15));
  assert.deepEqual(nextCronTime(parseCron("@monthly"), at(2026, 10, 22)), at(2026, 11, 1));
  // Both day fields restricted: either matches (the 1st, or any Friday).
  assert.deepEqual(nextCronTime(parseCron("0 8 1 * 5"), at(2026, 10, 22, 12)), at(2026, 10, 23, 8));
  assert.equal(cronMinGapMs(mondayNine), 7 * 86_400_000);
});

test("an unreadable schedule is refused instead of guessed", () => {
  assert.throws(() => parseInterval("0 25 * * *"), /out of range/);
  assert.throws(() => parseInterval("every tuesday"), /Can't read the interval/);
  assert.equal(parseInterval("0 0 * * *"), 86_400_000);
  assert.equal(parseInterval("6h"), 6 * 3_600_000);
  assert.throws(() => newSchedule(null, { url: "https://a.example", interval: "0 9 * * 8" }), /out of range/);
});

test("a cron schedule is due at its next firing after the last run, never before", () => {
  const s = { interval: "0 9 * * 1", intervalMs: 7 * 86_400_000, createdAt: at(2026, 10, 22, 12).toISOString(), lastRunAt: null as string | null };
  assert.equal(scheduleDue(s, at(2026, 10, 22, 13)), false, "made on Thursday: not due until Monday");
  assert.equal(scheduleDue(s, at(2026, 10, 26, 9)), true);
  s.lastRunAt = at(2026, 10, 26, 9).toISOString();
  assert.equal(scheduleDue(s, at(2026, 10, 26, 10)), false, "ran Monday: not again until next Monday");
  // Interval schedules run at once, then every interval.
  assert.equal(scheduleDue({ interval: "1h", intervalMs: 3_600_000, createdAt: new Date().toISOString(), lastRunAt: null }), true);
});

test("a job failed by the lease sweep still tells its owner's webhooks", async () => {
  const store = new FileStore(join(mkroot(), "store.json"));
  await store.addWebhook("u1", "https://hooks.example/a");
  const job = await store.enqueueLimited({ kind: "record", owner: "u1", input: { url: "https://a.example" }, secret: null, idempotencyKey: null }, 5);
  assert.ok(job);
  // Claim it as many times as it may be tried, each lease lapsing at once.
  for (let i = 0; i < job.maxAttempts; i++) assert.ok(await store.claim(`w${i}`, -1));
  assert.equal(await store.claim("sweeper", 60_000), null, "the exhausted job is retired, not handed out");
  assert.equal((await store.job(job.id))?.status, "failed");
  const deliveries = await store.deliveries("u1", 10);
  assert.equal(deliveries.length, 1, "exactly one job.completed delivery");
  assert.equal(deliveries[0]!.event, "job.completed");
  await store.close();
});

test("a delivered webhook is never marked failed because the bookkeeping hiccupped", async () => {
  const delivery = { id: "d1", url: "https://hooks.example/a", event: "job.completed", payload: {}, attempts: 1 } as unknown as WebhookDelivery;
  const outcomes: { ok: boolean }[] = [];
  let failures = 1;
  const store = {
    claimDeliveries: async () => [delivery],
    completeDelivery: async (_id: string, _w: string, outcome: { ok: boolean }) => {
      if (outcome.ok && failures-- > 0) throw new Error("database blinked");
      outcomes.push(outcome);
    },
  } as unknown as Store;
  let posts = 0;
  await processOutbox(store, "w", { fetch: (async () => ((posts++), new Response("ok", { status: 200 }))) as typeof fetch });
  assert.equal(posts, 1, "sent once");
  assert.deepEqual(outcomes, [{ ok: true }], "recorded as delivered on the retry, never as failed");
});
