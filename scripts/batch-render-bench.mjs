/**
 * Perf benchmark for a batch-render job: how long `Worker`'s private `batchRender` path takes
 * to re-export N existing recordings end to end (read recording.json, run `socialExport`,
 * rewrite recording.json), for the batch sizes the senior review asked about (5 and 10).
 *
 * Uses tiny, real, fast-to-encode source MP4s (ffmpeg's `lavfi` color generator) so the numbers
 * are real wall-clock ffmpeg time, not a stub — just on deliberately small input so the run stays
 * quick. Real-world recordings are longer, so per-item time here is a floor, not a ceiling: the
 * fixed per-item overhead (disk I/O, process spawn, JSON read/write) this measures is the part
 * that does NOT scale with recording length, and is what `BATCH_RENDER_PER_ITEM_MS` in worker.ts
 * budgets for.
 *
 *   node --import tsx scripts/batch-render-bench.mjs [sizes...]
 *   node --import tsx scripts/batch-render-bench.mjs 5 10
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "../packages/core/src/jobs/worker.ts";

const FFMPEG = process.env.LAB_FFMPEG ?? "ffmpeg";
const SIZES = (process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n) && n > 0)) || [];
const sizes = SIZES.length ? SIZES : [5, 10];

function writeTinyMp4(file) {
  execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=160x90:d=1", "-pix_fmt", "yuv420p", file], { windowsHide: true });
}

function makeRecording(root, id, owner) {
  const dir = join(root, "recordings", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "recording.json"),
    JSON.stringify({ id, owner, url: "https://site.example/", createdAt: new Date().toISOString(), durationMs: 1000, signIn: { attempted: false, outcome: "not-attempted", detail: "" }, pages: [], skipped: [], captions: [], media: { video: null, mp4: "recording.mp4", audio: null, captions: "", voice: "none", note: "" } }),
  );
  writeTinyMp4(join(dir, "recording.mp4"));
}

async function benchOne(n) {
  const root = mkdtempSync(join(tmpdir(), `batch-bench-${n}-`));
  try {
    const ids = [];
    for (let i = 0; i < n; i++) {
      const id = `rec-${i}`;
      makeRecording(root, id, "bench-owner");
      ids.push(id);
    }
    const worker = new Worker({ store: { kind: "file" }, media: { kind: "local" }, root });
    const job = {
      id: "bench-job",
      kind: "batch-render",
      owner: "bench-owner",
      status: "running",
      input: { recordingIds: ids, shape: "vertical" },
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
    const started = performance.now();
    const result = await worker.batchRender(job, new AbortController().signal, () => undefined);
    const ms = performance.now() - started;
    return { n, ms, result };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

for (const n of sizes) {
  const { ms, result } = await benchOne(n);
  const perItem = ms / n;
  console.log(`batch-render, ${n} recording(s): ${ms.toFixed(0)} ms total, ${perItem.toFixed(1)} ms/item (succeeded=${result.succeeded} failed=${result.failed})`);
}
