import assert from "node:assert/strict";
import { test } from "node:test";
import { registerSecret, scrub, scrubText, unscrub } from "../src/capture/secrets.ts";

test("secrets become placeholders on the way out and come back on replay", () => {
  registerSecret("t_pass", "hunter2-xyz");
  const event = { args: { instruction: 'type hunter2-xyz into the "Password" field', value: "hunter2-xyz" } };
  const out = scrub(event);
  assert.ok(!JSON.stringify(out).includes("hunter2-xyz"));
  assert.equal(out.args.value, "{{secret:t_pass}}");
  assert.deepEqual(unscrub(out), event);
  assert.equal(scrubText("password=hunter2-xyz"), "password={{secret:t_pass}}");
});
