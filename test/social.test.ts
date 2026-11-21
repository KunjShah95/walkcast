import assert from "node:assert/strict";
import { test } from "node:test";
import { isShape, SHAPES, socialFilter } from "../packages/core/src/record/social.ts";

/**
 * Feed exports: the finished MP4 re-framed to 9:16 or 1:1.
 *
 * The graph has to produce the shape's exact frame, keep the 16:9 video whole (never cropped),
 * and burn the captions only when there is a caption file to burn.
 */

test("only the two feed shapes are accepted", () => {
  assert.ok(isShape("vertical"));
  assert.ok(isShape("square"));
  assert.ok(!isShape("landscape"));
  assert.ok(!isShape(null));
});

test("9:16 fills a 1080×1920 frame with the video edge to edge and burns the captions", () => {
  const f = socialFilter("vertical", "captions.vtt");
  assert.match(f, /scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920/);
  assert.match(f, /\[b\]scale=1080:608\[fg\]/);
  assert.match(f, /subtitles=captions\.vtt:force_style='[^']*Alignment=2/);
  assert.match(f, /format=yuv420p\[v\]$/);
  assert.equal(SHAPES.vertical.file, "recording-vertical.mp4");
});

test("1:1 insets the video, and with no captions there is no subtitles filter", () => {
  const f = socialFilter("square", null);
  assert.match(f, /crop=1080:1080/);
  assert.match(f, /\[b\]scale=1000:562\[fg\]/);
  assert.doesNotMatch(f, /subtitles/);
  assert.match(f, /overlay=\(W-w\)\/2:\d+,format=yuv420p\[v\]$/);
});

test("a cut reads its span plainly and keeps the caption lines that fall inside it", async () => {
  const { readSpan, trimCaptions } = await import("../packages/core/src/record/trim.ts");
  assert.match(String(readSpan("", "9")), /numbers of seconds/);
  assert.match(String(readSpan("abc", "9")), /numbers of seconds/);
  assert.match(String(readSpan("-1", "9")), /before the start/);
  assert.match(String(readSpan("5", "5.2")), /at least/);
  assert.match(String(readSpan("50", "60", 40)), /past the end/);
  assert.deepEqual(readSpan("4", "100", 38), { from: 4, to: 38 });
  const captions = [
    { start: 0, end: 3, text: "Opening the site." },
    { start: 3, end: 8, text: "The headline reads this." },
    { start: 12, end: 15, text: "Clicking Pricing." },
  ];
  assert.deepEqual(trimCaptions(captions, { from: 4, to: 13 }), [
    { start: 0, end: 4, text: "The headline reads this." },
    { start: 8, end: 9, text: "Clicking Pricing." },
  ]);
});

test("caption presets change the look and the default stays the original", async () => {
  const { socialFilter, isCaptionStyle } = await import("../packages/core/src/record/social.ts");
  const clean = socialFilter("vertical", "captions.vtt");
  assert.equal(socialFilter("vertical", "captions.vtt", "clean"), clean, "the default is the clean preset");
  assert.match(clean, /BorderStyle=4/);
  const bold = socialFilter("vertical", "captions.vtt", "bold");
  assert.match(bold, /Bold=1/);
  assert.notEqual(bold, clean);
  assert.match(socialFilter("square", "captions.vtt", "minimal"), /Outline=1/);
  assert.equal(isCaptionStyle("neon"), false);
});
