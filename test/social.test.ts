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
