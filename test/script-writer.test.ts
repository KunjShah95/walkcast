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

import { acceptTitle, titleChapters } from "../packages/core/src/record/script-writer.ts";
import { chapterTitle } from "../packages/core/src/record/narration.ts";
import { chaptersOf } from "../packages/core/src/record/transcript.ts";

const chaptered = (): Caption[] => [
  { start: 0, end: 2, text: "Opening acme.app.", chapter: "Acme" },
  { start: 2, end: 4, text: "The page is headed Pricing." },
  { start: 4, end: 6, text: "Opening the pricing page.", chapter: "Pricing" },
];

test("a chapter's working title comes from its page, not from the sentence that opens it", () => {
  assert.equal(chapterTitle("/", "acme.app"), "acme.app");
  assert.equal(chapterTitle("/pricing", "acme.app"), "Pricing");
  assert.equal(chapterTitle("/leads/1002", "acme.app"), "Leads 1002");
  assert.equal(chapterTitle("/get-started?x=1", "acme.app"), "Get started");
});

test("chapters survive the line that opens them being reworded", () => {
  const reworded = chaptered().map((c) => (c.chapter ? { ...c, text: "Now, over to the next page." } : c));
  assert.deepEqual(chaptersOf(reworded), [{ start: 0, title: "Acme" }, { start: 4, title: "Pricing" }]);
  // A recording from before chapters were named still reads them from its "Opening" lines.
  assert.deepEqual(chaptersOf([{ start: 1, end: 2, text: "Opening the pricing page." }]), [{ start: 1, title: "the pricing page" }]);
});

test("Claude Code titles each chapter and an unusable title keeps the working one", async () => {
  const r = await titleChapters(chaptered(), ctx, async () => JSON.stringify(["Acme Home", "Pricing: Plans!"]));
  assert.equal(r.captions[0]!.chapter, "Acme Home");
  assert.equal(r.captions[2]!.chapter, "Pricing");
  assert.equal(r.titled, 1);
});

test("a title may not carry a number the chapter never said", () => {
  assert.equal(acceptTitle("Pricing Plans", "Pricing"), true);
  assert.equal(acceptTitle("Top 10 Plans", "Pricing"), false);
  assert.equal(acceptTitle("A very long chapter title that goes on and on forever", "x"), false);
});

test("chapter titles never cost a recording its chapters when the writer fails", async () => {
  const input = chaptered();
  const r = await titleChapters(input, ctx, async () => {
    throw new Error("offline");
  });
  assert.equal(r.captions, input);
  assert.equal(r.titled, 0);
});

test("a polished line keeps the chapter it opens", async () => {
  const r = await polishCaptions([{ start: 0, end: 2, text: "Opening the pricing page.", chapter: "Pricing" }], ctx, reply(["Next, the pricing page."]));
  assert.equal(r.captions[0]!.text, "Next, the pricing page.");
  assert.equal(r.captions[0]!.chapter, "Pricing");
});

test("a reply that echoes each chapter as an object still gives its title", async () => {
  const r = await titleChapters(chaptered(), ctx, async () => JSON.stringify([{ working: "Acme", title: "Acme Home" }, { working: "Pricing", title: "Pricing Plans" }]));
  assert.deepEqual(r.captions.filter((c) => c.chapter).map((c) => c.chapter), ["Acme Home", "Pricing Plans"]);
});
