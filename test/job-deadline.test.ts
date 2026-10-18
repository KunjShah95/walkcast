import assert from "node:assert/strict";
import { test } from "node:test";
import { FFMPEG_TIMEOUT_MS } from "../packages/core/src/record/media.ts";
import { STALL_MS_DEFAULT, jobCeilingMs, pagesAsked } from "../packages/core/src/jobs/worker.ts";

/**
 * A real 30-page recording (lattice.kunjshah.in) reported "Page 29 of up to 30" and was aborted at
 * 361 s by a flat 360 s job deadline, discarding every page it had already walked. A flat cap can
 * only be wrong, because the work scales with the pages a job asked for.
 *
 * These tests pin the two budgets that replaced it to the measurements from that failure, so the
 * same recording cannot be killed off one page from the end again.
 */

/** What the incident measured: 29 pages walked in 361 s. */
const MEASURED_PER_PAGE_MS = 361_000 / 29;
/** The flat cap that killed it. */
const INCIDENT_CAP_MS = 360_000;

test("a 30-page record job is allowed longer than a flat cap", () => {
  const ceiling = jobCeilingMs("record", 30);
  assert.ok(ceiling > INCIDENT_CAP_MS, `30 pages gets ${ceiling} ms, still at or under the cap that killed the job`);
  assert.ok(ceiling > MEASURED_PER_PAGE_MS * 30, "the walk alone must fit inside the ceiling");
  // Narration synthesis and the libx264 re-encode both run after the last page, on the same budget,
  // so the ceiling needs headroom well past the walk rather than a hair above it.
  assert.ok(ceiling > 2 * MEASURED_PER_PAGE_MS * 30, "narration and encoding need room after the walk, not a hair over it");
});

test("the ceiling grows with the pages asked for", () => {
  const ceilings = [1, 8, 30].map((p) => jobCeilingMs("record", p));
  for (let i = 1; i < ceilings.length; i++) {
    assert.ok(ceilings[i]! > ceilings[i - 1]!, "more pages must never mean less time");
  }
  const perPage = jobCeilingMs("record", 20) - jobCeilingMs("record", 10);
  assert.ok(perPage > 0, "each page adds time");
  assert.equal(jobCeilingMs("record", 30) - jobCeilingMs("record", 20), perPage, "the per-page allowance is linear");
});

test("a lab run keeps the flat ceiling it always had", () => {
  // Lab runs have no page dimension, so there is nothing to scale by.
  assert.equal(jobCeilingMs("run", 30), jobCeilingMs("run", 1));
  assert.equal(jobCeilingMs("run", undefined), 6 * 60_000);
  assert.equal(jobCeilingMs("run", 30), 6 * 60_000);
});

test("an explicit cap wins for every kind of job", () => {
  // A fleet must still be able to impose its own hard limit, page count or not.
  assert.equal(jobCeilingMs("record", 30, 60_000), 60_000);
  assert.equal(jobCeilingMs("run", 1, 90_000), 90_000);
  assert.equal(jobCeilingMs("record", 30, 60_000), 60_000, "and it does not scale");
});

test("pagesAsked normalizes the way the recorder normalizes it", () => {
  assert.equal(pagesAsked(undefined), 8, "the recorder's default");
  assert.equal(pagesAsked("30"), 30, "a form value arrives as a string");
  assert.equal(pagesAsked(7.9), 7);
  assert.equal(pagesAsked(0), 1);
  assert.equal(pagesAsked(-5), 1);
  assert.equal(pagesAsked(999), 50, "capped like record/site.ts");
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, "abc", {}]) {
    assert.equal(pagesAsked(bad), 8, `${String(bad)} falls back to the default instead of producing a NaN ceiling`);
  }
});

test("the stall budget can never abort a healthy encode", () => {
  // The MP4 mux is a full libx264 re-encode that reports no progress while it runs and is capped
  // internally at FFMPEG_TIMEOUT_MS. A stall budget at or below that cap would kill exactly the
  // healthy recordings this change exists to protect, so the coupling is asserted rather than
  // left as a comment.
  assert.ok(STALL_MS_DEFAULT > FFMPEG_TIMEOUT_MS, `stall ${STALL_MS_DEFAULT} ms must exceed one ffmpeg call (${FFMPEG_TIMEOUT_MS} ms)`);
});

test("a job can always stall before it hits the ceiling", () => {
  // The stall guard is what catches a wedged job early; if the ceiling were the shorter of the two
  // for some page count, the guard could never fire and the flat-cap behaviour would creep back.
  for (const pages of [1, 8, 30, 50]) {
    assert.ok(jobCeilingMs("record", pages) > STALL_MS_DEFAULT, `${pages} page(s): ceiling must outlast the stall budget`);
  }
});
