import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { unregisterSecret } from "../capture/secrets.ts";
import { type TaskId, isTaskId, normalizeScenario } from "../app/faults.ts";
import { log } from "../ops/log.ts";
import type { MediaStore } from "../media/store.ts";
import { RecordError, recordSite } from "../record/site.ts";
import { runOnce } from "../lab/runner.ts";
import { taskById } from "../lab/task.ts";
import type { Job, Store } from "../store/types.ts";
import { open } from "./secret-box.ts";

export interface WorkerOptions {
  store: Store;
  media: MediaStore;
  /** Workspace root: local recordings and lab runs are written under it. */
  root: string;
  /** How long a claim lasts without a heartbeat before another worker may take the job. */
  leaseMs?: number;
  /** Hard limit per job; the browser is killed when it passes. */
  deadlineMs?: number;
  pollMs?: number;
}

/**
 * Takes jobs from the queue one at a time. One job per worker process is deliberate: Chromium and
 * ffmpeg are CPU/memory heavy, and the secrets registry that keeps credentials out of files is
 * process-wide. Scale out by running more workers (each claims with FOR UPDATE SKIP LOCKED).
 */
export class Worker {
  readonly id = `${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
  private stopping = false;
  private current: { job: Job; abort: AbortController; done: Promise<void> } | null = null;
  private loop: Promise<void> | null = null;
  private wake: (() => void) | null = null;
  private readonly leaseMs: number;
  private readonly deadlineMs: number;
  private readonly pollMs: number;

  constructor(private readonly o: WorkerOptions) {
    this.leaseMs = o.leaseMs ?? 60_000;
    this.deadlineMs = o.deadlineMs ?? Number(process.env.LAB_JOB_DEADLINE_MS ?? 6 * 60_000);
    this.pollMs = o.pollMs ?? 2000;
  }

  start(): this {
    this.loop ??= this.run();
    return this;
  }

  /** Look for work now instead of at the next poll (after an enqueue in the same process). */
  poke(): void {
    this.wake?.();
  }

  get busy(): boolean {
    return this.current !== null;
  }

  /**
   * Stop claiming. The running job gets `graceMs` to finish; otherwise it is aborted and handed
   * back to the queue, so a deploy never loses work.
   */
  async stop(graceMs = 30_000): Promise<void> {
    this.stopping = true;
    this.wake?.();
    const cur = this.current;
    if (cur) {
      const finished = await Promise.race([cur.done.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), graceMs))]);
      if (!finished) {
        cur.abort.abort(new Error("worker shutting down"));
        await cur.done.catch(() => undefined);
        await this.o.store.release(cur.job.id, this.id).catch(() => undefined);
        log.info("job.released", { job: cur.job.id });
      }
    }
    await this.loop;
  }

  private async run(): Promise<void> {
    while (!this.stopping) {
      let job: Job | null = null;
      try {
        job = await this.o.store.claim(this.id, this.leaseMs);
      } catch (e) {
        log.error("queue.claim_failed", { error: String(e) });
      }
      if (!job) {
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, this.pollMs);
          this.wake = () => {
            clearTimeout(t);
            resolve();
          };
        });
        this.wake = null;
        continue;
      }
      const abort = new AbortController();
      const done = this.execute(job, abort);
      this.current = { job, abort, done };
      await done;
      this.current = null;
    }
  }

  private async execute(job: Job, abort: AbortController): Promise<void> {
    const started = Date.now();
    log.info("job.started", { job: job.id, kind: job.kind, attempt: job.attempts, worker: this.id });
    let progress: string | undefined;
    const beat = setInterval(() => {
      this.o.store.heartbeat(job.id, this.id, this.leaseMs, progress).then(
        (mine) => {
          // Someone else owns it now (our lease lapsed): stop rather than race them.
          if (!mine) abort.abort(new Error("lease lost"));
        },
        () => undefined,
      );
    }, Math.max(1000, this.leaseMs / 3));
    const deadline = setTimeout(() => abort.abort(new Error(`took longer than ${Math.round(this.deadlineMs / 1000)} s`)), this.deadlineMs);
    try {
      const result = job.kind === "record" ? await this.record(job, abort.signal, (p) => (progress = p)) : await this.labRun(job);
      await this.o.store.finish(job.id, this.id, { status: "succeeded", result });
      log.info("job.succeeded", { job: job.id, kind: job.kind, ms: Date.now() - started });
    } catch (e) {
      const message = e instanceof Error ? e.message.split("\n")[0]! : String(e);
      if (this.stopping && abort.signal.aborted) return; // handed back by stop()
      // Bad input won't get better on retry; crashes and timeouts get one more try.
      const retry = !(e instanceof RecordError) && !abort.signal.aborted;
      await this.o.store.finish(job.id, this.id, { status: "failed", error: abort.signal.aborted ? `Stopped: ${String(abort.signal.reason?.message ?? "aborted")}` : message, retry }).catch(() => undefined);
      log.warn("job.failed", { job: job.id, kind: job.kind, ms: Date.now() - started, error: message, retry });
    } finally {
      clearInterval(beat);
      clearTimeout(deadline);
      unregisterSecret("site_password", "site_username");
    }
  }

  private async record(job: Job, signal: AbortSignal, onProgress: (p: string) => void): Promise<Record<string, unknown>> {
    const input = job.input as { url: string; username?: string; maxPages?: number; blockPrivate?: boolean };
    const password = job.secret ? open(job.secret) : undefined;
    // Object storage: record into a temp dir and upload. Local: write straight into recordings/.
    const outDir = this.o.media.kind === "local" ? join(this.o.root, "recordings") : mkdtempSync(join(tmpdir(), "walkcast-"));
    try {
      const r = await recordSite({
        url: input.url,
        ...(input.username ? { username: input.username } : {}),
        ...(password ? { password } : {}),
        maxPages: Number(input.maxPages ?? 8),
        authorized: true,
        outDir,
        blockPrivate: Boolean(input.blockPrivate),
        ...(job.owner ? { owner: job.owner } : {}),
        signal,
        onProgress,
      });
      onProgress("Saving");
      const files = [r.media.mp4, r.media.webm, r.media.captions, r.media.audio, r.media.mp4 || r.media.webm ? null : r.media.video, "recording.json"].filter((f): f is string => Boolean(f));
      await this.o.media.publish(r.id, r.dir, files);
      // The scrubbed copy written by the recorder is what gets indexed.
      const summary = JSON.parse(readFileSync(join(r.dir, "recording.json"), "utf8")) as Record<string, unknown>;
      delete summary.dir;
      await this.o.store.saveRecording({ id: r.id, owner: job.owner, url: r.url, createdAt: r.createdAt, summary });
      return { id: r.id, dir: `recordings/${r.id}` };
    } finally {
      if (this.o.media.kind !== "local" && existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
    }
  }

  private async labRun(job: Job): Promise<Record<string, unknown>> {
    const input = job.input as { agent: string; fault: string; seed: number; task: string; modelMode?: "live" | "replay" | "scripted" };
    // Per-user credentials: when the job owner connected OpenRouter, run models on their key.
    const prevOR = process.env.OPENROUTER_API_KEY;
    if (job.owner) {
      try {
        const u = await this.o.store.userById(job.owner);
        if (u?.openrouterKey) {
          const { open: openSecret } = await import("./secret-box.ts");
          process.env.OPENROUTER_API_KEY = openSecret(u.openrouterKey);
        }
      } catch { /* best effort */ }
    }
    try {
    const r = await runOnce({
      fault: normalizeScenario(input.fault),
      seed: input.seed,
      agent: input.agent,
      task: taskById(isTaskId(input.task) ? (input.task as TaskId) : "create-lead"),
      outDir: join(this.o.root, "runs"),
      screenshots: true,
      ...(input.modelMode ? { modelMode: input.modelMode } : {}),
    });
    return { dir: `runs/${r.runDir.split(/[\\/]/).pop()}` };
    } finally {
      // Restore previous environment so per-user credentials don't leak between jobs.
      if (prevOR === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = prevOR;
    }
  }
}
