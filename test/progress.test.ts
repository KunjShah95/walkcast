import assert from "node:assert/strict";
import { test } from "node:test";
import { progressThrottle } from "../packages/core/src/jobs/progress.ts";

test("a leading value writes immediately, a burst coalesces into one trailing write of the newest", async () => {
  const writes: string[] = [];
  const t = progressThrottle((v) => writes.push(v), 40);
  t.push("a");
  t.push("b");
  t.push("c");
  assert.deepEqual(writes, ["a"]);
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(writes, ["a", "c"]);
});

test("a push after the window is another immediate value, not coalesced", async () => {
  const writes: string[] = [];
  const t = progressThrottle((v) => writes.push(v), 40);
  t.push("a");
  await new Promise((r) => setTimeout(r, 60));
  t.push("b");
  assert.deepEqual(writes, ["a", "b"]);
});

test("flush writes the pending value and waits for it", async () => {
  const writes: string[] = [];
  const t = progressThrottle(async (v) => {
    await new Promise((r) => setTimeout(r, 20));
    writes.push(v);
  }, 40);
  t.push("a"); // immediate
  t.push("b"); // pending, will win
  await t.flush();
  assert.deepEqual(writes, ["a", "b"]);
});