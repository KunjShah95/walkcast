import assert from "node:assert/strict";
import { test } from "node:test";
import type { Caption } from "../packages/core/src/record/narration.ts";
import { acceptLine, parseLines, polishCaptions, writerWanted, type ModelRunner } from "../packages/core/src/record/script-writer.ts";

const ctx = { site: "acme.app", pages: ["Acme", "Pricing"] };
const caps = (...texts: string[]): Caption[] => texts.map((text, i) => ({ start: i * 2, end: i * 2 + 2, text }));
const reply = (lines: unknown): ModelRunner => async () => JSON.stringify(lines);

test("the writer is off unless it was asked for", () => {
  assert.equal(writerWanted(undefined, {}), false);
  assert.equal(writerWanted(undefined, { WALKCAST_NARRATION_WRITER: "claude-code" }), true);
  assert.equal(writerWanted("template", { WALKCAST_NARRATION_WRITER: "claude-code" }), false);
});

test("a rewritten line replaces the recorded one, in place", async () => {
  const input = caps("Opening acme.app.", "Opening the pricing page.");
  const r = await polishCaptions(input, ctx, reply(["We start on the Acme home page.", "Next, the pricing page."]));
  assert.deepEqual(r.captions.map((c) => c.text), ["We start on the Acme home page.", "Next, the pricing page."]);
  assert.equal(r.rewritten, 2);
  // Timing belongs to the recording, not the writer.
  assert.deepEqual(r.captions.map((c) => [c.start, c.end]), [[0, 2], [2, 4]]);
});

test("a line that drops a quoted control name keeps its recorded wording", async () => {
  const r = await polishCaptions(caps('Clicking "Start free trial".'), ctx, reply(["Then we press the main button."]));
  assert.equal(r.captions[0]!.text, 'Clicking "Start free trial".');
  assert.equal(r.rewritten, 0);
});

test("a line that invents a number keeps its recorded wording", () => {
  assert.equal(acceptLine("Scrolling through the pricing page.", "Scrolling past all 12 plans.", "Scrolling through the pricing page."), false);
  assert.equal(acceptLine("That's the tour: 6 pages.", "That's the tour, six pages... well, 6 pages.", "That's the tour: 6 pages."), true);
});

test("a line that leaves out a stated number or names something new is refused", () => {
  assert.equal(acceptLine("That is the tour: 6 pages.", "That is the tour.", "That is the tour: 6 pages."), false);
  assert.equal(acceptLine("We are in.", "We are in, on the Estate360 dashboard.", "We are in. Estate360"), false);
});

test("a line that runs far longer than the original is refused", () => {
  const long = "Here we take a long and winding walk through the page while explaining at length everything about it and more.";
  assert.equal(acceptLine("Opening the page.", long, "Opening the page."), false);
});

test("exclamations and questions are refused", () => {
  assert.equal(acceptLine("Opening the page.", "Look at this page!", "Opening the page."), false);
  assert.equal(acceptLine("Opening the page.", "Ready to see the page?", "Opening the page."), false);
});

test("a wrong line count returns the recorded script untouched", async () => {
  const input = caps("One.", "Two.");
  const r = await polishCaptions(input, ctx, reply(["Only one."]));
  assert.equal(r.captions, input);
  assert.match(r.note, /unusable/);
});

test("a failing writer never costs the recording its captions", async () => {
  const input = caps("One.");
  const r = await polishCaptions(input, ctx, async () => {
    throw new Error("not signed in");
  });
  assert.equal(r.captions, input);
  assert.equal(r.rewritten, 0);
  assert.match(r.note, /not signed in/);
});

test("a cancel is not swallowed as a writer failure", async () => {
  const ac = new AbortController();
  ac.abort(new Error("cancelled by user"));
  await assert.rejects(polishCaptions(caps("One."), ctx, async () => { throw new Error("killed"); }, ac.signal), /cancelled by user/);
});

test("the reply may arrive in a code fence or with a sentence around it", () => {
  assert.deepEqual(parseLines('```json\n["a","b"]\n```'), ["a", "b"]);
  assert.deepEqual(parseLines('Here you go: ["a"] done'), ["a"]);
  assert.equal(parseLines("nope"), null);
});

test("a long tour is written in batches, each told how the script so far ends", async () => {
  const input = caps(...Array.from({ length: 50 }, (_, i) => `Line ${i + 1}.`));
  const prompts: string[] = [];
  const run: ModelRunner = async ({ prompt }) => {
    prompts.push(prompt);
    const sent = JSON.parse(prompt.slice(prompt.lastIndexOf("Narration lines:\n") + "Narration lines:\n".length)) as string[];
    return JSON.stringify(sent.map((s) => `Now, ${s.toLowerCase()}`));
  };
  const r = await polishCaptions(input, ctx, run);
  assert.equal(prompts.length, 3, "24 + 24 + 2 lines");
  assert.doesNotMatch(prompts[0]!, /script so far/);
  assert.match(prompts[1]!, /script so far ends/);
  assert.match(prompts[1]!, /Now, line 22/);
  assert.equal(r.captions.length, 50);
  assert.equal(r.rewritten, 50);
});

test("one failed batch keeps its recorded wording and the rest are still polished", async () => {
  const input = caps(...Array.from({ length: 30 }, (_, i) => `Line ${i + 1}.`));
  let call = 0;
  const run: ModelRunner = async ({ prompt }) => {
    call++;
    if (call <= 2) throw new Error("rate limited"); // first batch, and its retry
    const sent = JSON.parse(prompt.slice(prompt.lastIndexOf("Narration lines:\n") + "Narration lines:\n".length)) as string[];
    return JSON.stringify(sent.map((s) => `Now, ${s.toLowerCase()}`));
  };
  const r = await polishCaptions(input, ctx, run);
  assert.equal(r.captions[0]!.text, "Line 1.");
  assert.equal(r.captions[29]!.text, "Now, line 30.");
  assert.equal(r.rewritten, 6);
  assert.match(r.note, /1 of 2 parts kept/);
});

test("a transient failure is retried once before a batch gives up", async () => {
  let call = 0;
  const run: ModelRunner = async () => {
    call++;
    if (call === 1) throw new Error("hiccup");
    return JSON.stringify(["Next, the pricing page."]);
  };
  const r = await polishCaptions(caps("Opening the pricing page."), ctx, run);
  assert.equal(call, 2);
  assert.equal(r.captions[0]!.text, "Next, the pricing page.");
});
