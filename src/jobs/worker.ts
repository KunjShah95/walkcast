import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { unregisterSecret } from "../capture/secrets.ts";
import { type TaskId, isTaskId, normalizeScenario } from "../app/faults.ts";
import { log } from "../ops/log.ts";
import type { MediaStore } from "../media/store.ts";
import type { Voice } from "../record/media.ts";
import { RecordError, recordSite } from "../record/site.ts";
import { closeWarmBrowser } from "../record/browser.ts";
import { runOnce } from "../lab/runner.ts";
import { taskById } from "../lab/task.ts";
import { withCredentials } from "../llm/credentials.ts";
import type { Job, JobKind, Store } from "../store/types.ts";
import { progressThrottle } from "./progress.ts";
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
  /** Base idle poll interval; doubles on every empty poll up to maxPollMs. */
  pollMs?: number;
  /** Cap for the idle poll backoff. A busy worker resets to pollMs on the next claim or poke. */
  maxPollMs?: number;
  /** Optional kind affinity: prefer `record`/`lab` jobs when claiming; scales out dedicated fleets. */
  kind?: "record" | "lab";
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
  private readonly maxPollMs: number;
  private readonly kind?: JobKind;

  constructor(private readonly o: WorkerOptions) {
    this.leaseMs = o.leaseMs ?? 60_000;
    this.deadlineMs = o.deadlineMs ?? Number(process.env.LAB_JOB_DEADLINE_MS ?? 6 * 60_000);
    this.pollMs = o.pollMs ?? 2000;
    this.maxPollMs = o.maxPollMs ?? Number(process.env.LAB_WORKER_MAX_POLL_MS ?? 10_000);
    let kind: JobKind | undefined;
    if (o.kind === "record") kind = "record";
    else if (o.kind === "lab") kind = "run";
    else if (process.env.LAB_WORKER_KIND === "record") kind = "record";
    else if (process.env.LAB_WORKER_KIND === "lab") kind = "run";
    this.kind = kind;
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
    await closeWarmBrowser().catch(() => undefined);
    return;
  }

  private async run(): Promise<void> {
    let delay = this.pollMs;
    while (!this.stopping) {
      let job: Job | null = null;
      try {
        job = await this.o.store.claim(this.id, this.leaseMs, this.kind);
      } catch (e) {
        log.error("queue.claim_failed", { error: String(e) });
      }
      if (!job) {
        // Idle: back off so a big worker fleet does not multiply the claim queries by one per
        // poll tick. Jitter desynchronizes workers that woke on the same broadcast.
        await new Promise<void>((resolve) => {
          const wait = Math.round(delay * (0.9 + 0.2 * Math.random()));
          const t = setTimeout(resolve, wait);
          this.wake = () => {
            clearTimeout(t);
            resolve();
          };
        });
        this.wake = null;
        delay = Math.min(this.maxPollMs, delay * 2);
        continue;
      }
      delay = this.pollMs;
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
    // Progress is written at stage cadence, not on the lease beat: the app polls every 1-4 s
    // (dashboard/src/lib/api.ts), so a label that only moved every 20 s read as a frozen screen
    // for the whole time the user was watching. The throttle keeps that off the database's back.
    const progress = progressThrottle((p) => this.o.store.setProgress(job.id, this.id, p), 1000);
    // Ownership is only real while a heartbeat confirms it. `confirmed` is the last time the
    // store agreed this worker still owns the job; if the store stays silent past 80% of a lease
    // (DB stall, network partition), stop the work instead of finishing blind — a fenced finish
    // would discard the result anyway, and the work would repeat on another worker.
    let confirmed = Date.now();
    const beat = setInterval(() => {
      this.o.store.heartbeat(job.id, this.id, this.leaseMs).then(
        (mine) => {
          // Someone else owns it now (our lease lapsed): stop rather than race them.
          if (!mine) abort.abort(new Error("lease lost"));
          else confirmed = Date.now();
        },
        () => undefined,
      );
    }, Math.max(1000, this.leaseMs / 3));
    const margin = setInterval(() => {
      if (Date.now() - confirmed > this.leaseMs * 0.8) {
        abort.abort(new Error("lease unconfirmed: no heartbeat acknowledgement within the lease margin"));
      }
    }, 2000);
    const deadline = setTimeout(() => abort.abort(new Error(`took longer than ${Math.round(this.deadlineMs / 1000)} s`)), this.deadlineMs);
    // Flush before finalizing in both directions: on failure the last label is what tells the
    // user (and the log) where the job died.
    const finish = async (outcome: Parameters<Store["finish"]>[2]) => {
      await progress.flush();
      await this.o.store.finish(job.id, this.id, outcome);
    };
    try {
      const result = job.kind === "record" ? await this.record(job, abort.signal, (p) => progress.push(p)) : await this.labRun(job);
      await finish({ status: "succeeded", result });
      log.info("job.succeeded", { job: job.id, kind: job.kind, ms: Date.now() - started });
    } catch (e) {
      const message = e instanceof Error ? e.message.split("\n")[0]! : String(e);
      if (this.stopping && abort.signal.aborted) return; // handed back by stop()
      // Bad input won't get better on retry; crashes and timeouts get one more try.
      const retry = !(e instanceof RecordError) && !abort.signal.aborted;
      await finish({ status: "failed", error: abort.signal.aborted ? `Stopped: ${String(abort.signal.reason?.message ?? "aborted")}` : message, retry }).catch(() => undefined);
      log.warn("job.failed", { job: job.id, kind: job.kind, ms: Date.now() - started, error: message, retry });
    } finally {
      clearInterval(beat);
      clearInterval(margin);
      clearTimeout(deadline);
      unregisterSecret("site_password", "site_username");
    }
  }

  private async record(job: Job, signal: AbortSignal, onProgress: (p: string) => void): Promise<Record<string, unknown>> {
    const input = job.input as { url: string; username?: string; maxPages?: number; blockPrivate?: boolean; voice?: Voice };
    const password = job.secret ? open(job.secret) : undefined;
    // Object storage: record into a temp dir and upload. Local: write straight into recordings/.
    const outDir = this.o.media.kind === "local" ? join(this.o.root, "recordings") : mkdtempSync(join(tmpdir(), "walkcast-"));
    try {
      const r = await recordSite({
        url: input.url,
        ...(input.username ? { username: input.username } : {}),
        ...(password ? { password } : {}),
        maxPages: Number(input.maxPages ?? 8),
        ...(input.voice ? { voice: input.voice } : {}),
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
    // Per-job credential scope: the owner's connected keys answer the model providers' lookups
    // for this run only, so a key never leaks into other code paths of this process.
    const credentials: Parameters<typeof withCredentials>[0] = {};
    if (job.owner) {
      try {
        const u = await this.o.store.userById(job.owner);
        if (u?.openrouterKey) credentials.OPENROUTER_API_KEY = open(u.openrouterKey);
        if (u?.chatgpt) {
          const cg = await import("../site/chatgpt.ts");
          credentials.CHATGPT_ACCESS_TOKEN = await cg.ensureChatGPTAccessToken(u, this.o.store);
        }
      } catch { /* best effort */ }
    }
    return withCredentials(credentials, async () => {
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
    });
  }
}
