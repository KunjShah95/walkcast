import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, test } from "node:test";
import { serveDashboard } from "../apps/desktop/server/server.ts";
import { LocalMedia, type MediaStore } from "../packages/core/src/media/store.ts";
import { FileStore } from "../packages/core/src/store/index.ts";
import type { Job, Store } from "../packages/core/src/store/types.ts";
import { Worker } from "../packages/core/src/jobs/worker.ts";

process.env.LAB_LOG = "off";

/**
 * Batch render: one job re-exports several existing recordings sequentially (see server.ts's
 * POST /api/recordings/batch-render and worker.ts's private `batchRender`). One bad recording id
 * must not sink the rest, and the final result must say exactly which ones made it.
 */

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function fresh(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

const FFMPEG = process.env.LAB_FFMPEG ?? "ffmpeg";

/** A real, tiny, fast-to-encode MP4 — small enough that `socialExport`'s libx264 pass runs in well under a second. */
function writeTinyMp4(file: string): void {
  execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=160x90:d=1", "-pix_fmt", "yuv420p", file], { windowsHide: true });
}

/** A recording this batch can act on: `<root>/recordings/<id>/{recording.json,recording.mp4}`. */
function makeRecording(root: string, id: string, owner: string | null, opts: { video?: boolean } = {}): void {
  const dir = join(root, "recordings", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "recording.json"),
    JSON.stringify({ id, owner, url: "https://site.example/", createdAt: new Date().toISOString(), durationMs: 1000, signIn: { attempted: false, outcome: "not-attempted", detail: "" }, pages: [], skipped: [], captions: [], media: { video: null, mp4: "recording.mp4", audio: null, captions: "", voice: "none", note: "" } }),
  );
  if (opts.video !== false) writeTinyMp4(join(dir, "recording.mp4"));
}

/** A `Worker` whose `store`/`media` are only ever touched for `.kind` by the private `batchRender` path tested here. */
function minimalWorker(root: string): Worker {
  return new Worker({ store: { kind: "file" } as unknown as Store, media: { kind: "local" } as unknown as MediaStore, root });
}

function fakeJob(owner: string | null, input: Record<string, unknown>): Job {
  return {
    id: "job-1",
    kind: "batch-render",
    owner,
    status: "running",
    input,
    secret: null,
    result: null,
    error: null,
    progress: null,
    attempts: 1,
    maxAttempts: 1,
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
}

/** Reach into the worker's private method the same way the real `execute()` does. */
function runBatchRender(worker: Worker, job: Job, onProgress: (p: string) => void): Promise<Record<string, unknown>> {
  return (worker as unknown as { batchRender(job: Job, signal: AbortSignal, onProgress: (p: string) => void): Promise<Record<string, unknown>> }).batchRender(job, new AbortController().signal, onProgress);
}

describe("Worker.batchRender", () => {
  test("every recording succeeds: result totals, items, and recording.json are all correct", async () => {
    const root = fresh("batch-ok-");
    makeRecording(root, "rec-a", "owner-1");
    makeRecording(root, "rec-b", "owner-1");
    const progress: string[] = [];
    const result = await runBatchRender(minimalWorker(root), fakeJob("owner-1", { recordingIds: ["rec-a", "rec-b"], shape: "vertical" }), (p) => progress.push(p));

    assert.deepEqual(progress, ["rendering 1/2", "rendering 2/2"], "progress reports position in the batch, in order");
    assert.equal(result.total, 2);
    assert.equal(result.succeeded, 2);
    assert.equal(result.failed, 0);
    assert.deepEqual(result.items, [
      { recordingId: "rec-a", status: "ok", file: "recording-vertical.mp4" },
      { recordingId: "rec-b", status: "ok", file: "recording-vertical.mp4" },
    ]);
    for (const id of ["rec-a", "rec-b"]) {
      const file = join(root, "recordings", id, "recording.json");
      assert.ok(existsSync(join(root, "recordings", id, "recording-vertical.mp4")), `${id} got its export file`);
      const summary = JSON.parse(readFileSync(file, "utf8"));
      assert.equal(summary.media.exports.vertical, "recording-vertical.mp4", `${id}'s recording.json records the export`);
    }
  });

  test("square shape writes the square export under the right key", async () => {
    const root = fresh("batch-square-");
    makeRecording(root, "rec-sq", "owner-1");
    const result = await runBatchRender(minimalWorker(root), fakeJob("owner-1", { recordingIds: ["rec-sq"], shape: "square" }), () => undefined);
    assert.equal(result.succeeded, 1);
    assert.equal((result.items as { file?: string }[])[0]!.file, "recording-square.mp4", "an ok item names its export file");
    assert.ok(existsSync(join(root, "recordings", "rec-sq", "recording-square.mp4")));
    const summary = JSON.parse(readFileSync(join(root, "recordings", "rec-sq", "recording.json"), "utf8"));
    assert.equal(summary.media.exports.square, "recording-square.mp4");
    assert.equal(summary.media.exports.vertical, undefined);
  });

  test("one bad recording mid-batch does not abort the rest, and is recorded as a per-item error", async () => {
    const root = fresh("batch-mixed-");
    makeRecording(root, "rec-good-1", "owner-1");
    // "rec-missing" has no directory at all: the same shape of failure as a deleted recording.
    makeRecording(root, "rec-good-2", "owner-1");
    const progress: string[] = [];
    const result = await runBatchRender(
      minimalWorker(root),
      fakeJob("owner-1", { recordingIds: ["rec-good-1", "rec-missing", "rec-good-2"], shape: "vertical" }),
      (p) => progress.push(p),
    );

    assert.deepEqual(progress, ["rendering 1/3", "rendering 2/3", "rendering 3/3"], "every item gets a progress tick, including the failed one");
    assert.equal(result.total, 3);
    assert.equal(result.succeeded, 2);
    assert.equal(result.failed, 1);
    assert.deepEqual(result.items, [
      { recordingId: "rec-good-1", status: "ok", file: "recording-vertical.mp4" },
      { recordingId: "rec-missing", status: "error", error: "Recording not found." },
      { recordingId: "rec-good-2", status: "ok", file: "recording-vertical.mp4" },
    ]);
    // The two good ones still got their export; the batch did not stop at the bad id.
    assert.ok(existsSync(join(root, "recordings", "rec-good-1", "recording-vertical.mp4")));
    assert.ok(existsSync(join(root, "recordings", "rec-good-2", "recording-vertical.mp4")));
  });

  test("a recording whose source MP4 is missing fails that item only", async () => {
    const root = fresh("batch-novideo-");
    makeRecording(root, "rec-ok", "owner-1");
    makeRecording(root, "rec-no-mp4", "owner-1", { video: false });
    const result = await runBatchRender(minimalWorker(root), fakeJob("owner-1", { recordingIds: ["rec-ok", "rec-no-mp4"], shape: "vertical" }), () => undefined);
    assert.equal(result.succeeded, 1);
    assert.equal(result.failed, 1);
    const items = result.items as { recordingId: string; status: string; error?: string }[];
    assert.equal(items[1]!.status, "error");
    assert.match(items[1]!.error!, /no MP4 to re-frame/);
  });

  test("ownership mismatch is a per-item error, not a crash — the rest of the batch still runs", async () => {
    const root = fresh("batch-owner-");
    makeRecording(root, "rec-mine", "owner-1");
    makeRecording(root, "rec-not-mine", "owner-2"); // belongs to someone else
    const result = await runBatchRender(minimalWorker(root), fakeJob("owner-1", { recordingIds: ["rec-mine", "rec-not-mine"], shape: "vertical" }), () => undefined);
    assert.equal(result.total, 2);
    assert.equal(result.succeeded, 1);
    assert.equal(result.failed, 1);
    assert.deepEqual(result.items, [
      { recordingId: "rec-mine", status: "ok", file: "recording-vertical.mp4" },
      { recordingId: "rec-not-mine", status: "error", error: "Recording not found." },
    ]);
    // Nothing was exported for the recording that isn't this job's owner's.
    assert.ok(!existsSync(join(root, "recordings", "rec-not-mine", "recording-vertical.mp4")));
  });

  test("every item failing still returns a complete, well-shaped result (not a thrown error)", async () => {
    const root = fresh("batch-allfail-");
    const result = await runBatchRender(minimalWorker(root), fakeJob("owner-1", { recordingIds: ["ghost-1", "ghost-2"], shape: "vertical" }), () => undefined);
    assert.equal(result.total, 2);
    assert.equal(result.succeeded, 0);
    assert.equal(result.failed, 2);
    assert.equal((result.items as unknown[]).length, 2);
  });
});

describe("POST /api/recordings/batch-render (HTTP route logic)", () => {
  // Real HTTP, through serveDashboard, with the worker disabled so a 202 job sits queued and
  // never runs — this is what lets the 429 (already-active-job) case be deterministic, and lets
  // the 404 case assert that *nothing* was enqueued, not just that the response looked right.
  async function harness(requireAuth = true) {
    const root = fresh("batch-http-");
    const store = new FileStore(join(root, ".lab", "store.json"));
    const srv = await serveDashboard(0, { root, unref: true, store, media: new LocalMedia(join(root, "recordings")), worker: false, requireAuth });
    const account = async (email: string) => {
      const r = await fetch(`${srv.url}/auth/signup`, { method: "POST", body: JSON.stringify({ email, password: "a-good-password" }) });
      const cookie = r.headers.get("set-cookie")!.split(";")[0]!;
      const owner = (await store.userByEmail(email))!.id;
      return { cookie, owner };
    };
    const call = (cookie: string | null, body: unknown) =>
      fetch(`${srv.url}/api/recordings/batch-render`, { method: "POST", headers: cookie ? { cookie } : {}, body: JSON.stringify(body) });
    return { root, store, srv, account, call };
  }

  test("signed out: 401, same as every other dashboard API route", async () => {
    const { srv, call } = await harness();
    const res = await call(null, { recordingIds: ["x"], shape: "vertical" });
    assert.equal(res.status, 401);
    await srv.close(100);
  });

  test("empty recordingIds: 400", async () => {
    const { srv, account, call } = await harness();
    const { cookie } = await account("a@example.com");
    assert.equal((await call(cookie, { recordingIds: [], shape: "vertical" })).status, 400);
    assert.equal((await call(cookie, { shape: "vertical" })).status, 400, "missing recordingIds is the same as empty");
    assert.equal((await call(cookie, { recordingIds: "not-an-array", shape: "vertical" })).status, 400);
    await srv.close(100);
  });

  test("too many recordingIds: 400", async () => {
    const { srv, account, call } = await harness();
    const { cookie } = await account("a@example.com");
    const tooMany = Array.from({ length: 11 }, (_, i) => `rec-${i}`); // default LAB_MAX_BATCH_RENDER_ITEMS is 10
    const res = await call(cookie, { recordingIds: tooMany, shape: "vertical" });
    assert.equal(res.status, 400);
    assert.match(((await res.json()) as { error: string }).error, /at most 10/);
    await srv.close(100);
  });

  test("unknown shape: 400", async () => {
    const { srv, account, call } = await harness();
    const { cookie } = await account("a@example.com");
    assert.equal((await call(cookie, { recordingIds: ["rec-1"], shape: "landscape" })).status, 400);
    assert.equal((await call(cookie, { recordingIds: ["rec-1"] })).status, 400, "no shape at all");
    await srv.close(100);
  });

  test("an unowned recording id: 404, and nothing is enqueued (checked atomically, before any job starts)", async () => {
    const { root, srv, store, account, call } = await harness();
    const { owner: ownerA } = await account("a@example.com");
    const { cookie: cookieB } = await account("b@example.com");
    // Owned by a, requested by b.
    makeRecording(root, "rec-a-owns", ownerA, { video: false });
    const res = await call(cookieB, { recordingIds: ["rec-a-owns"], shape: "vertical" });
    assert.equal(res.status, 404);
    assert.match(((await res.json()) as { error: string }).error, /rec-a-owns/);
    assert.equal(await store.activeJobs((await store.userByEmail("b@example.com"))!.id), 0, "nothing was queued for b");
    await srv.close(100);
  });

  test("a mix of owned and unowned ids: still 404, and the owned one was not enqueued either", async () => {
    const { root, srv, store, account, call } = await harness();
    const { cookie, owner } = await account("a@example.com");
    makeRecording(root, "rec-mine", owner, { video: false });
    const res = await call(cookie, { recordingIds: ["rec-mine", "rec-does-not-exist"], shape: "vertical" });
    assert.equal(res.status, 404);
    assert.match(((await res.json()) as { error: string }).error, /rec-does-not-exist/);
    assert.equal(await store.activeJobs(owner), 0, "the all-or-nothing check means rec-mine's slot was never spent either");
    await srv.close(100);
  });

  test("already at the active-job limit: 429, and a 202 once that job is gone", async () => {
    const { root, srv, store, account, call } = await harness();
    const { cookie, owner } = await account("a@example.com");
    makeRecording(root, "rec-1", owner, { video: false });
    makeRecording(root, "rec-2", owner, { video: false });
    const first = await call(cookie, { recordingIds: ["rec-1"], shape: "vertical" });
    assert.equal(first.status, 202);
    const firstBody = (await first.json()) as { jobId: string };
    assert.ok(firstBody.jobId, "the bare job id, not a wrapped object");

    const second = await call(cookie, { recordingIds: ["rec-2"], shape: "vertical" });
    assert.equal(second.status, 429, "the whole batch counts as exactly one active job, same as any other");

    // Settle the first job by hand (the worker is off in this harness, so nothing else will) and
    // the limit frees up. The job was never claimed, so `cancel` (not `finish`) is what applies.
    await store.cancel(firstBody.jobId);
    const third = await call(cookie, { recordingIds: ["rec-2"], shape: "vertical" });
    assert.equal(third.status, 202);
    await srv.close(100);
  });

  test("a valid request enqueues a batch-render job carrying the recordingIds and shape", async () => {
    const { root, srv, store, account, call } = await harness();
    const { cookie, owner } = await account("a@example.com");
    makeRecording(root, "rec-1", owner, { video: false });
    makeRecording(root, "rec-2", owner, { video: false });
    const res = await call(cookie, { recordingIds: ["rec-1", "rec-2"], shape: "square" });
    assert.equal(res.status, 202);
    const { jobId } = (await res.json()) as { jobId: string };
    const job = await store.job(jobId);
    assert.equal(job?.kind, "batch-render");
    assert.equal(job?.owner, owner);
    assert.deepEqual(job?.input, { recordingIds: ["rec-1", "rec-2"], shape: "square" });
    await srv.close(100);
  });
});
