import assert from "node:assert/strict";
import { test } from "node:test";
import { alarmState, startQueueMonitor } from "../packages/core/src/ops/queue-monitor.ts";
import type { Store } from "../packages/core/src/store/types.ts";

process.env.LAB_LOG = "off";

test("queue alarm fires when the oldest job waits past the threshold, once per window", async () => {
  assert.equal(alarmState(1000, 5000), "ok");
  assert.equal(alarmState(6000, 5000), "alarm");
  let oldest = 10_000;
  const store = { queueStats: async () => ({ depth: 3, oldestQueuedMs: oldest }) } as unknown as Store;
  const fired: number[] = [];
  const m = startQueueMonitor(store, { intervalMs: 60_000, alarmMs: 5000, onAlarm: (s) => fired.push(s.oldestQueuedMs) });
  try {
    await m.check();
    await m.check(); // still alarming, inside the re-alert window: no second page
    assert.deepEqual(fired, [10_000]);
    oldest = 0;
    await m.check(); // cleared
    oldest = 9000;
    await m.check(); // new incident pages again
    assert.deepEqual(fired, [10_000, 9000]);
  } finally {
    m.stop();
  }
});
