import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeText, remapElementIds } from "../src/llm/gateway.ts";

const req = (tree: string) => ({ messages: [{ role: "user", content: { type: "text", text: `instruction: x\nAccessibility Tree:\n${tree}` } }] });

test("replayed Stagehand responses follow the element, not the session-local node id", () => {
  const recorded = req("[0-1] RootWebArea: New lead\n  [0-44] textbox: Contact name\n  [0-80] button: Save lead");
  const replayed = req("[0-1] RootWebArea: New lead\n  [0-12] textbox: Contact name\n  [0-33] button: Save lead");
  const response = { structuredContent: { action: { elementId: "0-80", method: "click" } } };
  assert.deepEqual(remapElementIds(recorded, replayed, response), { structuredContent: { action: { elementId: "0-33", method: "click" } } });
});

test("duplicate labels are matched by occurrence order", () => {
  const recorded = req("[0-5] button: Delete\n[0-9] button: Delete");
  const replayed = req("[0-50] button: Delete\n[0-90] button: Delete");
  assert.deepEqual(remapElementIds(recorded, replayed, { elementId: "0-9" }), { elementId: "0-90" });
});

test("ports and node ids do not count as prompt drift", () => {
  assert.equal(normalizeText("http://127.0.0.1:41234/leads [0-17]"), normalizeText("http://127.0.0.1:5000/leads [0-99]"));
});
