import assert from "node:assert/strict";
import { test } from "node:test";
import { chaptersOf, clock, toSrt, toVtt, transcriptMarkdown } from "../packages/core/src/record/transcript.ts";

/**
 * The walkthrough as text.
 *
 * These are the forms people paste elsewhere: a caption file a player accepts, and one
 * document that carries the whole visit. Every line comes from the recording, so the only
 * thing to get wrong here is the formatting.
 */

const captions = [
  { start: 0, end: 2.5, text: "Opening the shop." },
  { start: 2.5, end: 6, text: "Here are the products." },
];

test("a time reads the way a person reads a time in a video", () => {
  assert.equal(clock(0), "0:00");
  assert.equal(clock(9), "0:09");
  assert.equal(clock(61), "1:01");
  assert.equal(clock(600), "10:00");
  assert.equal(clock(-3), "0:00");
});

test("captions come out as SRT and as VTT", () => {
  const srt = toSrt(captions);
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:02,500\nOpening the shop\./);
  assert.match(srt, /2\n00:00:02,500 --> 00:00:06,000\nHere are the products\./);
  const vtt = toVtt(captions);
  assert.ok(vtt.startsWith("WEBVTT\n\n"));
  assert.match(vtt, /00:00:00\.000 --> 00:00:02\.500/);
});

test("the pages the recorder opened are the chapters", () => {
  const chapters = chaptersOf(captions);
  assert.deepEqual(chapters, [{ start: 0, title: "the shop" }]);
  // A walkthrough with no narration still has one chapter: the site itself.
  assert.deepEqual(chaptersOf([]), []);
  assert.deepEqual(chaptersOf([{ start: 0, end: 1, text: "Hi." }], "example.com"), [{ start: 0, title: "example.com" }]);
});

test("one document carries the pages, the narration and the notes", () => {
  const doc = transcriptMarkdown({
    url: "https://shop.example/cart",
    createdAt: "2026-10-20T10:00:00.000Z",
    durationMs: 62_000,
    pages: [{ url: "https://shop.example/cart", title: "Cart", status: 200 }],
    captions,
    notes: [{ at: 3, text: "Prices are shown without VAT." }],
    findings: [{ text: "Two controls have no name." }],
  });
  assert.match(doc, /^# Walkthrough — shop\.example$/m);
  assert.match(doc, /- URL: https:\/\/shop\.example\/cart/);
  assert.match(doc, /- Length: 1:02/);
  assert.match(doc, /## Chapters\n- 0:00 — the shop/);
  assert.match(doc, /## Pages\n- Cart — https:\/\/shop\.example\/cart \(200\)/);
  assert.match(doc, /## Transcript\n\*\*0:00\*\* — Opening the shop\./);
  assert.match(doc, /## Notes\n- \*\*0:03\*\* — Prices are shown without VAT\./);
  assert.match(doc, /## What the recorder found\n- Two controls have no name\./);
});

test("a walkthrough with no narration says so instead of pretending", () => {
  const doc = transcriptMarkdown({ url: "https://quiet.example", captions: [] });
  assert.match(doc, /## Transcript\n_This walkthrough has no narration\._/);
  assert.ok(!doc.includes("## Notes"), "no notes, no notes section");
});
