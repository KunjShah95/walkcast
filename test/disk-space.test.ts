import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { DISK_FULL_MESSAGE, checkFreeSpace, freeBytes, isDiskFull, minFreeDiskBytes, notEnoughDiskMessage } from "../packages/core/src/ops/disk.ts";
import { failureReason } from "../packages/core/src/record/media.ts";
import { explainFailure } from "../packages/core/src/record/failure.ts";
import { Worker } from "../packages/core/src/jobs/worker.ts";
import { LocalMedia } from "../packages/core/src/media/store.ts";
import { FileStore } from "../packages/core/src/store/index.ts";

process.env.LAB_LOG = "off";

const dirs: string[] = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

test("freeBytes reads the volume, walking up from a folder that doesn't exist yet", async () => {
  const free = await freeBytes(join(tmpdir(), "does-not-exist-yet", "deeper"));
  assert.ok(typeof free === "number" && free > 0);
});

test("checkFreeSpace passes with room and fails with the numbers without", async () => {
  assert.equal((await checkFreeSpace(tmpdir(), 0)).ok, true);
  const tooMuch = await checkFreeSpace(tmpdir(), Number.MAX_SAFE_INTEGER);
  assert.equal(tooMuch.ok, false);
  assert.match(tooMuch.message!, /^Not enough free disk space \(\d+ MB free, need \d+ MB\)\.$/);
});

test("LAB_MIN_FREE_DISK_MB configures the minimum (default 1024 MB)", () => {
  const saved = process.env.LAB_MIN_FREE_DISK_MB;
  delete process.env.LAB_MIN_FREE_DISK_MB;
  assert.equal(minFreeDiskBytes(), 1024 * 1024 * 1024);
  process.env.LAB_MIN_FREE_DISK_MB = "5";
  assert.equal(minFreeDiskBytes(), 5 * 1024 * 1024);
  if (saved === undefined) delete process.env.LAB_MIN_FREE_DISK_MB;
  else process.env.LAB_MIN_FREE_DISK_MB = saved;
  assert.equal(notEnoughDiskMessage(10 * 1048576, 1024 * 1048576), "Not enough free disk space (10 MB free, need 1024 MB).");
});

test("ENOSPC anywhere in the media pipeline reads as a full disk", () => {
  const enospc = Object.assign(new Error("ENOSPC: no space left on device, write"), { code: "ENOSPC" });
  assert.ok(isDiskFull(enospc));
  assert.ok(isDiskFull(new Error("Command failed: ffmpeg ...\nav_interleaved_write_frame(): No space left on device")));
  assert.ok(!isDiskFull(new Error("Conversion failed!")));
  assert.equal(failureReason(enospc), DISK_FULL_MESSAGE);
  assert.equal(explainFailure(DISK_FULL_MESSAGE).category, "disk");
  assert.equal(explainFailure(notEnoughDiskMessage(1, 2)).category, "disk");
});

test("the worker fails a batch-render job up front, with the numbers, when the disk is too full", async () => {
  const root = mkdtempSync(join(tmpdir(), "disk-"));
  dirs.push(root);
  mkdirSync(join(root, "recordings"), { recursive: true });
  const store = new FileStore(join(root, ".lab", "store.json"));
  const job = await store.enqueueLimited({ kind: "batch-render", owner: null, input: { recordingIds: ["r1"], shape: "vertical" } }, 5);
  const worker = new Worker({ store, media: new LocalMedia(join(root, "recordings")), root, pollMs: 50, minFreeDiskBytes: Number.MAX_SAFE_INTEGER }).start();
  try {
    let state = await store.job(job!.id);
    for (let i = 0; i < 100 && state && (state.status === "queued" || state.status === "running"); i++) {
      await new Promise((r) => setTimeout(r, 50));
      state = await store.job(job!.id);
    }
    assert.equal(state?.status, "failed");
    assert.match(state!.error ?? "", /^Not enough free disk space \(\d+ MB free, need \d+ MB\)\.$/);
    assert.equal(state!.attempts, 1, "not retried: freeing space is a person's job");
  } finally {
    await worker.stop(500);
    await store.close();
  }
});
