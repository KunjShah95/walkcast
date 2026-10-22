import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { writeFocus, zoomFilter, zoomFilterFor, zoomPlan, type Focus } from "../packages/core/src/record/zoom.ts";

/**
 * Zoom on clicks.
 *
 * The plan comes from the moments the recorder pointed at a control. What matters: a small
 * control gets a real push but never fills the screen, moments close together share one zoom,
 * zooms never overlap, and a recording with nothing to point at is encoded untouched.
 */

const W = 1920;
const H = 1080;
const at = (start: number, end: number, x: number, y: number, w = 160, h = 36, kind: Focus["kind"] = "click"): Focus => ({ start, end, box: { x, y, w, h }, kind });

test("a small button is pushed in on, and the push is capped", () => {
  const [seg] = zoomPlan([at(2, 3, 900, 500, 40, 20)], W, H);
  assert.ok(seg);
  assert.equal(seg.z, 1.7);
  assert.equal(seg.cx, 920);
  assert.equal(seg.cy, 510);
  // A wide form field still gets a visible push.
  const [wide] = zoomPlan([at(2, 3, 100, 100, 1400, 60)], W, H);
  assert.equal(wide!.z, 1.25);
});

test("two fields filled one after the other share one zoom", () => {
  const plan = zoomPlan([at(1, 2, 100, 100, 200, 30, "fill"), at(2.4, 3.5, 330, 100, 200, 30, "fill")], W, H);
  assert.equal(plan.length, 1);
  assert.equal(plan[0]!.cx, 315);
});

test("two places far apart are two zooms, and they never overlap", () => {
  const plan = zoomPlan([at(1, 2, 50, 50), at(2.5, 3, 1700, 1000)], W, H);
  assert.equal(plan.length, 2);
  assert.ok(plan[1]!.start >= plan[0]!.end);
});

test("a zoom that would not fit before the video ends is dropped", () => {
  assert.equal(zoomPlan([at(9.8, 9.9, 100, 100)], W, H, 10).length, 0);
});

test("the filter is zoompan on a constant frame rate, and nothing to zoom is no filter", () => {
  assert.equal(zoomFilter([], W, H), null);
  const f = zoomFilter(zoomPlan([at(2, 3, 900, 500)], W, H), W, H)!;
  assert.match(f, /^fps=25,zoompan=z='1\+/);
  assert.match(f, /:d=1:s=1920x1080:fps=25$/);
});

test("zoom follows the flag in focus.json and the LAB_ZOOM switch", () => {
  const dir = mkdtempSync(join(tmpdir(), "wc-zoom-"));
  try {
    assert.equal(zoomFilterFor(dir, 30), null);
    writeFocus(dir, { zoom: true, width: W, height: H, moments: [at(2, 3, 900, 500)] });
    assert.ok(zoomFilterFor(dir, 30));
    writeFocus(dir, { zoom: false, width: W, height: H, moments: [at(2, 3, 900, 500)] });
    assert.equal(zoomFilterFor(dir, 30), null);
    writeFocus(dir, { zoom: true, width: W, height: H, moments: [at(2, 3, 900, 500)] });
    process.env.LAB_ZOOM = "0";
    assert.equal(zoomFilterFor(dir, 30), null);
  } finally {
    delete process.env.LAB_ZOOM;
    rmSync(dir, { recursive: true, force: true });
  }
});
