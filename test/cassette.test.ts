import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { CassettePlayer, CassetteRecorder, ReplayExhaustedError, hashRequest, readCassette } from "../packages/core/src/llm/cassette.ts";

const ask = (port: number, id: string) => ({ messages: [{ role: "user", content: [{ type: "text", text: `page http://127.0.0.1:${port}/leads\n[${id}] button: Save` }] }] });

test("record, write, read, replay: same responses in order, session noise isn't drift", () => {
  const dir = mkdtempSync(join(tmpdir(), "cassette-"));
  try {
    const rec = new CassetteRecorder<"stagehand">({ redact: (v) => JSON.parse(JSON.stringify(v).replaceAll("hunter2", "{{secret:pw}}")) });
    rec.add({ channel: "stagehand", seq: rec.nextSeq("stagehand"), request: ask(4100, "0-17"), response: { elementId: "0-17", note: "hunter2" }, model: "m", latencyMs: 5 });
    rec.write(join(dir, "c.jsonl"));
    const entries = readCassette<"stagehand">(join(dir, "c.jsonl"));
    assert.ok(!JSON.stringify(entries).includes("hunter2"), "secrets never hit disk");

    const player = new CassettePlayer(entries, { restore: (v) => JSON.parse(JSON.stringify(v).replaceAll("{{secret:pw}}", "hunter2")) });
    // Different port and node id in the live session: not drift, and the id is remapped.
    const played = player.next("stagehand", ask(5200, "0-42"), { remapIds: true });
    assert.equal(played.drift, false);
    assert.deepEqual(played.response, { elementId: "0-42", note: "hunter2" });
    assert.throws(() => player.next("stagehand", ask(5200, "0-42")), ReplayExhaustedError);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a changed prompt is reported as drift", () => {
  const entry = { channel: "agent", seq: 0, requestHash: hashRequest("agent", { messages: [{ content: "create lead" }] }), request: {}, response: "ok", model: "m", latencyMs: 1 };
  const player = new CassettePlayer([entry]);
  assert.equal(player.next("agent", { messages: [{ content: "delete lead" }] }).drift, true);
});

test("a call that finished late is matched by its sequence number, not its position in the file", () => {
  const first = { channel: "agent" as const, seq: 0, request: { messages: [{ content: "first" }] }, response: "first-response", model: "m", latencyMs: 1 };
  const second = { channel: "agent" as const, seq: 1, request: { messages: [{ content: "second" }] }, response: "second-response", model: "m", latencyMs: 1 };
  const entries = [
    { ...first, requestHash: hashRequest("agent", first.request) },
    { ...second, requestHash: hashRequest("agent", second.request) },
  ];
  // The recorder reserves seq before awaiting: seq 1 can reach the file before seq 0.
  const player = new CassettePlayer([entries[1]!, entries[0]!]);
  assert.equal(player.next("agent", first.request).response, "first-response");
  assert.equal(player.next("agent", second.request).response, "second-response");
});

test("two calls that complete out of order each get their own recorded response", () => {
  const first = { channel: "agent" as const, seq: 0, request: { messages: [{ content: "first" }] }, response: "first-response", model: "m", latencyMs: 1 };
  const second = { channel: "agent" as const, seq: 1, request: { messages: [{ content: "second" }] }, response: "second-response", model: "m", latencyMs: 1 };
  const entries = [
    { ...second, requestHash: hashRequest("agent", second.request) },
    { ...first, requestHash: hashRequest("agent", first.request) },
  ];
  // The replay asks second first; it must not be handed the first call's answer.
  const player = new CassettePlayer(entries);
  const played = player.next("agent", second.request);
  assert.equal(played.response, "second-response");
  assert.equal(played.drift, false);
  assert.equal(player.next("agent", first.request).drift, false);
  assert.throws(() => player.next("agent", first.request), ReplayExhaustedError);
});
