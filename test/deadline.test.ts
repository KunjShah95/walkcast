import assert from "node:assert/strict";
import { test } from "node:test";
import { DeadlineError, withDeadline } from "../packages/core/src/record/deadline.ts";
import { MAX_WAIT_MS, parseJourney } from "../packages/core/src/record/journey.ts";

test("withDeadline passes a fast result through", async () => {
  assert.equal(await withDeadline(Promise.resolve(42), 200), 42);
});

test("withDeadline rejects a call that never answers", async () => {
  const hung = new Promise<never>(() => undefined);
  await assert.rejects(withDeadline(hung, 30, "The page"), (e) => e instanceof DeadlineError && /did not answer/.test(e.message));
});

test("withDeadline keeps the original error when the call fails first", async () => {
  await assert.rejects(withDeadline(Promise.reject(new Error("boom")), 200), /boom/);
});

test("withDeadline swallows a late failure of the abandoned call", async () => {
  const late = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("late")), 60));
  await assert.rejects(withDeadline(late, 10), DeadlineError);
  await new Promise((r) => setTimeout(r, 100)); // an unhandled rejection would fail the run here
});

test("a journey wait is clamped to the cap", () => {
  const { steps } = parseJourney("wait 600000\nwait 500");
  assert.deepEqual(steps, [
    { kind: "wait", ms: MAX_WAIT_MS },
    { kind: "wait", ms: 500 },
  ]);
});

test("the list of refused requests is deduplicated and capped", async () => {
  const { noteBlocked, BLOCKED_LIST_MAX } = await import("../packages/core/src/record/ssrf.ts");
  const list: string[] = [];
  noteBlocked(list, "http://10.0.0.1/a");
  noteBlocked(list, "http://10.0.0.1/a");
  assert.equal(list.length, 1);
  for (let i = 0; i < BLOCKED_LIST_MAX * 3; i++) noteBlocked(list, `http://10.0.0.1/${i}`);
  assert.equal(list.length, BLOCKED_LIST_MAX);
});
