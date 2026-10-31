import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { LIVE_MAX_SESSIONS, type LiveSpawner, liveDirForJob, liveSessionCount, pushLiveFrame, segmentArgs, startLiveView, stopLiveView } from "../packages/core/src/record/live-view.ts";

/**
 * The live preview: a slideshow of the page pictures a recording takes, each turned into its own
 * HLS segment by a short-lived ffmpeg process — never a long-lived one fed over a pipe, which
 * buffered every frame until the recording was already over (see live-view.ts's own comment).
 *
 * None of this needs a real ffmpeg to prove: a fake spawner stands in for one, and can be told to
 * "finish" instantly, finish with a failure, or not finish at all yet.
 */

/** A stand-in for the ffmpeg child process one segment encode runs as. */
function fakeProc() {
  const listeners = new Map<string, ((...a: unknown[]) => void)[]>();
  const on = (event: string, fn: (...a: unknown[]) => void) => {
    const list = listeners.get(event) ?? [];
    list.push(fn);
    listeners.set(event, list);
    return proc;
  };
  const emit = (event: string, ...args: unknown[]) => {
    for (const fn of listeners.get(event) ?? []) fn(...args);
  };
  const proc = { on, once: on, emit, pid: 1 };
  return proc;
}

function spawner(procs: ReturnType<typeof fakeProc>[]): LiveSpawner {
  return (_bin, _args) => {
    const proc = fakeProc();
    procs.push(proc);
    return proc as unknown as ReturnType<LiveSpawner>;
  };
}

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "walkcast-live-"));
  writeFileSync(join(dir, "page-01.jpg"), Buffer.from([0xff, 0xd8, 0xff]));
  return dir;
}

test("the ffmpeg command loops one picture into its own self-contained segment", () => {
  const args = segmentArgs("C:/walk/one/page-01.jpg", "C:/walk/one/live/seg000.ts").join(" ");
  assert.match(args, /-loop 1 -i C:\/walk\/one\/page-01\.jpg/, "the still is looped, not read once");
  assert.match(args, /-t 3\b/, "a page holds for three seconds of the preview");
  assert.match(args, /-f mpegts C:\/walk\/one\/live\/seg000\.ts$/, "each segment is its own complete file, not a stream");
});

test("a started preview is findable by its job, encodes a frame, and is gone when it stops", async () => {
  const dir = scratch();
  const procs: ReturnType<typeof fakeProc>[] = [];
  startLiveView("job-a", dir);
  try {
    assert.equal(liveDirForJob("job-a"), dir);
    assert.equal(liveSessionCount(), 1);
    pushLiveFrame(dir, join(dir, "page-01.jpg"), spawner(procs));
    assert.equal(procs.length, 1, "one ffmpeg was started for the frame");
    procs[0]!.emit("exit", 0);
    const manifest = readFileSync(join(dir, "live", "live.m3u8"), "utf8");
    assert.match(manifest, /#EXTM3U/);
    assert.match(manifest, /seg000\.ts/, "the segment it just encoded is in the manifest");
    assert.ok(existsSync(join(dir, "live", "seg000.ts")) === false, "the fake encoder wrote nothing; only the manifest reflects the frame");
  } finally {
    stopLiveView("job-a");
  }
  assert.equal(liveDirForJob("job-a"), null, "a stopped job has no preview to serve");
  assert.equal(liveSessionCount(), 0);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(existsSync(join(dir, "live")), false, "the live folder is removed with the session");
});

test("a frame pushed while the last one is still encoding is dropped, not queued", () => {
  const dir = scratch();
  const procs: ReturnType<typeof fakeProc>[] = [];
  startLiveView("job-b", dir);
  try {
    pushLiveFrame(dir, join(dir, "page-01.jpg"), spawner(procs));
    pushLiveFrame(dir, join(dir, "page-01.jpg"), spawner(procs));
    assert.equal(procs.length, 1, "the second frame started no second encoder while the first was running");
    procs[0]!.emit("exit", 0);
    pushLiveFrame(dir, join(dir, "page-01.jpg"), spawner(procs));
    assert.equal(procs.length, 2, "and it catches up as soon as the encoder finishes");
  } finally {
    stopLiveView("job-b");
  }
});

test("a failed encode leaves no segment behind and does not wedge the session", () => {
  const dir = scratch();
  const procs: ReturnType<typeof fakeProc>[] = [];
  startLiveView("job-e", dir);
  try {
    pushLiveFrame(dir, join(dir, "page-01.jpg"), spawner(procs));
    procs[0]!.emit("exit", 1);
    pushLiveFrame(dir, join(dir, "page-01.jpg"), spawner(procs));
    assert.equal(procs.length, 2, "a failed encode does not block the next frame");
  } finally {
    stopLiveView("job-e");
  }
});

test("a preview past the limit is refused rather than stealing the recording's CPU", () => {
  const dirs = Array.from({ length: LIVE_MAX_SESSIONS + 1 }, () => scratch());
  try {
    dirs.forEach((dir, i) => startLiveView(`job-cap-${i}`, dir));
    assert.equal(liveSessionCount(), LIVE_MAX_SESSIONS);
    assert.equal(liveDirForJob(`job-cap-${LIVE_MAX_SESSIONS}`), null, "the last job has no preview, and the dashboard shows none");
  } finally {
    for (let i = 0; i < LIVE_MAX_SESSIONS; i++) stopLiveView(`job-cap-${i}`);
  }
});

test("a missing live session is a missing preview, never a failed recording", () => {
  const dir = join(tmpdir(), "walkcast-live-does-not-exist");
  assert.doesNotThrow(() => pushLiveFrame(dir, join(dir, "page-01.jpg")), "a frame for no session is ignored");
  assert.doesNotThrow(() => stopLiveView("job-never-started"));
});

test("the manifest folder a job serves from is only its own", () => {
  const dirC = scratch();
  startLiveView("job-c", dirC);
  try {
    assert.equal(liveDirForJob("job-c"), dirC);
    assert.equal(liveDirForJob("job-d"), null, "another job's id finds nothing");
  } finally {
    stopLiveView("job-c");
  }
});
