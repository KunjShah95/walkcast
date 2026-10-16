import assert from "node:assert/strict";
import { test } from "node:test";
import { ALL_TELLS, auditPrompt, GROUPS, score, verdict } from "../dashboard/src/lib/vibecode.ts";

test("the checklist holds all 30 tells, numbered once each", () => {
  assert.equal(ALL_TELLS.length, 30);
  assert.deepEqual(
    ALL_TELLS.map((t) => t.n),
    Array.from({ length: 30 }, (_, i) => i + 1),
  );
});

test("score counts down from 100 and verdicts follow it", () => {
  assert.equal(score([]), 100);
  assert.equal(verdict(score([])), "clean");
  assert.equal(score([1, 2, 3]), 90);
  assert.equal(verdict(score([1, 2, 3])), "clean");
  assert.equal(score([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]) + 0, 57);
  assert.equal(verdict(57), "close");
  assert.equal(verdict(20), "vibecoded");
});

test("the prompt separates what to fix from what to leave alone", () => {
  const prompt = auditPrompt([1, 22]);
  assert.match(prompt, /- \[ \] 1\. harsh gradients/);
  assert.match(prompt, /- \[ \] 22\. radial orbs/);
  // already-handled items are named, so the model doesn't touch them
  const already = prompt.slice(prompt.indexOf("Already handled"));
  assert.match(already, /- \[ \] 3\. pure white background/);
  assert.ok(!already.includes("radial orbs"), "ticked items must not repeat in the handled section");
});

test("every tell carries a fix", () => {
  for (const g of GROUPS) for (const t of g.tells) assert.ok(t.fix.length > 10, `${t.n} needs a fix`);
});