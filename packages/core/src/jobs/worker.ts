import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import type { BudgetState } from "../llm/budget.ts";
import { scrub, scrubText, unregisterSecret } from "../capture/secrets.ts";
import { type TaskId, isTaskId, normalizeScenario } from "../app/faults.ts";
import { log } from "../ops/log.ts";
import type { MediaStore } from "../media/store.ts";
import type { Voice } from "../record/media.ts";
import { FFMPEG_TIMEOUT_MS } from "../record/media.ts";
import { RecordError, recordSite } from "../record/site.ts";
import { type FailureEvidence, type FailureReport, evidenceOf, explainFailure } from "../record/failure.ts";
import { closeWarmBrowser } from "../record/browser.ts";
import { loadFixture, replayFixture, writeFixture } from "../lab/fixture.ts";
import { runExperiment } from "../lab/experiment.ts";
import { runOnce } from "../lab/runner.ts";
import { CREDENTIALS, startApp } from "../app/server.ts";
import { SEED_LEADS } from "../lab/task.ts";
import { taskById } from "../lab/task.ts";
import { withCredentials } from "../llm/credentials.ts";
import type { Job, JobKind, Store } from "../store/types.ts";
import { progressThrottle } from "./progress.ts";
import { open } from "./secret-box.ts";

/**
 * A job must eventually end: a wedged worker otherwise holds its slot forever and the dashboard
 * shows a recording that never arrives. Guaranteeing that needs two budgets, because the two ways
 * a job fails to end are not the same shape.
 *
 *   ceiling — "will it ever finish?" Total work scales with the pages a job was asked for, so a
 *             flat cap cannot be right. A real 30-page recording spent 361 s reaching page 29 of
 *             30 (12.45 s/page) and a 360 s cap killed it one page from the end, throwing the
 *             whole recording away. Derived per job by `jobCeilingMs`.
 *
 *   stall   — "is it stuck?" Time since the last progress signal, so slow-but-working and hung are
 *             never confused. This budget must stay longer than a single ffmpeg call: the MP4 mux
 *             is a full libx264 re-encode, it reports nothing while it runs, and it is internally
 *             capped at FFMPEG_TIMEOUT_MS. A stall budget below that would abort healthy encodes.
 */
/** Flat ceiling for a lab run, which has no page dimension (and the pre-existing default cap). */
const LAB_CEILING_MS = 6 * 60_000;
/** An experiment started from the app runs every fault, then replays each failure per candidate. */
const EXPERIMENT_CEILING_MS = 20 * 60_000;
/** Fixed part of a record job's ceiling: launch, sign-in, narration, encode, upload. */
const RECORD_BASE_MS = 5 * 60_000;
/** Per-page allowance: ~3.6x the 12.45 s/page measured on a real 30-page site. */
const RECORD_PER_PAGE_MS = 45_000;
/** How long a record job may report nothing before it counts as stuck: one ffmpeg call plus margin. */
export const STALL_MS_DEFAULT = FFMPEG_TIMEOUT_MS + 30_000;
/** How often the stall guard checks. Coarse on purpose: the budget it compares against is minutes. */
const STALL_CHECK_MS = 5000;
/** The page default and cap the recorder itself applies (record/site.ts). */
const DEFAULT_PAGES = 8;
const MAX_PAGES = 50;

/** The page count a job asked for, normalized the way the recorder normalizes it. */
export function pagesAsked(maxPages: unknown): number {
  const n = Number(maxPages ?? DEFAULT_PAGES);
  return Number.isFinite(n) ? Math.max(1, Math.min(MAX_PAGES, Math.trunc(n))) : DEFAULT_PAGES;
}

/**
 * The wall-clock ceiling for one job. An explicit cap — the `deadlineMs` option or
 * `LAB_JOB_DEADLINE_MS` — wins outright, so a fleet can still impose its own hard limit.
 */
export function jobCeilingMs(kind: JobKind, maxPages: unknown, explicit: number | null = null, maxSeconds: unknown = null, op: unknown = null): number {
  if (explicit !== null) return explicit;
  if (kind !== "record") return op === "experiment" ? EXPERIMENT_CEILING_MS : LAB_CEILING_MS;
  const pageBased = RECORD_BASE_MS + RECORD_PER_PAGE_MS * pagesAsked(maxPages);
  // A requested recording length is itself a budget (the walk runs that long, then narration and
  // the libx264 encode run on top), so the job ceiling must not be shorter than it — otherwise a
  // long recording gets killed mid-walk even though the user asked for it.
  const ms = Number(maxSeconds);
  const lengthBased = Number.isFinite(ms) && ms > 0 ? ms * 1000 + RECORD_BASE_MS : 0;
  return Math.max(pageBased, lengthBased);
}

export interface WorkerOptions {
  store: Store;
  media: MediaStore;
  /** Workspace root: local recordings and lab runs are written under it. */
  root: string;
  /** How long a claim lasts without a heartbeat before another worker may take the job. */
  leaseMs?: number;
  /**
   * Hard ceiling per job. Left unset, a record job's ceiling scales with the pages it asked for
   * (see `jobCeilingMs`); an explicit value is absolute and applies to every kind.
   */
  deadlineMs?: number;
  /**
   * Abort a record job that reports no progress for this long. Defaults to one ffmpeg call plus
   * margin (`STALL_MS_DEFAULT`) — the shortest budget that cannot abort a healthy encode.
   */
  stallMs?: number;
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
  /** Explicit operator ceiling, or null to derive one per job (see `jobCeilingMs`). */
  private readonly deadlineMs: number | null;
  private readonly stallMs: number;
  private readonly pollMs: number;
  private readonly maxPollMs: number;
  private readonly kind?: JobKind;

  constructor(private readonly o: WorkerOptions) {
    this.leaseMs = o.leaseMs ?? 60_000;
    // An explicit cap (option or env) is absolute; anything malformed falls through to the derived
    // ceiling rather than accidentally disabling the guard.
    const explicit = o.deadlineMs ?? Number(process.env.LAB_JOB_DEADLINE_MS ?? NaN);
    this.deadlineMs = Number.isFinite(explicit) && explicit > 0 ? explicit : null;
    const stall = o.stallMs ?? Number(process.env.LAB_JOB_STALL_MS ?? STALL_MS_DEFAULT);
    this.stallMs = Number.isFinite(stall) && stall > 0 ? stall : STALL_MS_DEFAULT;
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
    if (!this.loop) {
      if (this.o.media.kind === "local") sweepPartialRecordings(join(this.o.root, "recordings"));
      sweepOldFailures(join(this.o.root, "failures"));
    }
    this.loop ??= this.run();
    return this;
  }

  /** Look for work now instead of at the next poll (after an enqueue in the same process). */
  poke(): void {
    this.wake?.();
  }

  /** Abort the job now if this worker runs it (cancel); otherwise its next heartbeat will. */
  cancel(jobId: string): void {
    if (this.current?.job.id === jobId) this.current.abort.abort(new Error(CANCELLED));
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
      const finished = await Promise.race([cur.done.then(() => true).catch(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), graceMs))]);
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
      // stop() ran while the claim was in flight: it saw no current job, so it will not wait on
      // or abort this one. Hand it straight back instead of starting work nobody will stop.
      if (this.stopping) {
        await this.o.store.release(job.id, this.id).catch(() => undefined);
        log.info("job.released", { job: job.id, reason: "stopping" });
        break;
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
    // Every progress signal doubles as proof of life for the stall guard below: that guard measures
    // silence between signals, never total elapsed time, so a slow recording is not a stuck one.
    let lastProgressAt = Date.now();
    let stage: string | null = null;
    const onProgress = (p: string) => {
      lastProgressAt = Date.now();
      stage = p;
      progress.push(p);
    };
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
        (e) => {
          // A failed heartbeat is indistinguishable from a lost lease from the worker's point
          // of view, so treat it as unconfirmed (the margin check aborts if it persists) but
          // keep the reason in the log instead of swallowing it silently.
          log.warn("job.heartbeat_failed", { job: job.id, error: String(e) });
        },
      );
    }, Math.max(1000, this.leaseMs / 3));
    const margin = setInterval(() => {
      if (Date.now() - confirmed > this.leaseMs * 0.8) {
        abort.abort(new Error("lease unconfirmed: no heartbeat acknowledgement within the lease margin"));
      }
    }, 2000);
    const ceilingMs = jobCeilingMs(job.kind, job.input.maxPages, this.deadlineMs, job.input.maxSeconds, job.input.op);
    const deadline = setTimeout(() => abort.abort(new Error(`took longer than ${Math.round(ceilingMs / 1000)} s`)), ceilingMs);
    // Stall guard: only a record job reports progress, so only a record job has a liveness signal to
    // measure. A lab run keeps its flat ceiling and gets no stall check, exactly as before.
    const stall =
      job.kind === "record"
        ? setInterval(() => {
            const silentMs = Date.now() - lastProgressAt;
            if (silentMs > this.stallMs) abort.abort(new Error(`no progress for ${Math.round(silentMs / 1000)} s`));
          }, STALL_CHECK_MS)
        : null;
    // Flush before finalizing in both directions: on failure the last label is what tells the
    // user (and the log) where the job died.
    const finish = async (outcome: Parameters<Store["finish"]>[2]) => {
      // Flushing progress is best-effort: a failed flush must not prevent the terminal transition
      // (the job would otherwise stay "running" until its lease lapses and get re-run).
      try { await progress.flush(); } catch (e) { log.warn("job.progress_flush_failed", { job: job.id, error: String(e) }); }
      await this.o.store.finish(job.id, this.id, outcome);
      // Persist terminal state immediately on the FileStore (PgStore commits synchronously), so a
      // crash right after completion cannot lose the result in the debounced-write window.
      await this.o.store.flush().catch((e) => log.warn("job.store_flush_failed", { job: job.id, error: String(e) }));
    };
    try {
      const result = job.kind === "record" ? await this.record(job, abort.signal, onProgress) : await untilAborted(this.labRun(job, abort.signal, onProgress), abort.signal);
      await finish({ status: "succeeded", result });
      // An earlier attempt's evidence is moot once a retry made the recording.
      if (job.kind === "record") rmSync(failureDir(this.o.root, job.id), { recursive: true, force: true });
      log.info("job.succeeded", { job: job.id, kind: job.kind, ms: Date.now() - started });
    } catch (e) {
      const message = e instanceof Error ? e.message.split("\n")[0]! : String(e);
      if (this.stopping && abort.signal.aborted) return; // handed back by stop()
      // Cancelled by its owner, or taken over after a lost lease: the store already has the
      // outcome (or someone else is working on it), so there is nothing to record here.
      const why = abort.signal.aborted ? String(abort.signal.reason?.message ?? "") : "";
      if (why === CANCELLED || why === "lease lost") {
        rmSync(failureDir(this.o.root, job.id), { recursive: true, force: true });
        log.info("job.abandoned", { job: job.id, kind: job.kind, reason: why });
        return;
      }
      // Bad input won't get better on retry, nor will an address that doesn't resolve or a bad
      // certificate; crashes and timeouts get one more try.
      const permanent = job.kind === "record" && ["address", "not-allowed", "certificate"].includes(explainFailure(message).category);
      const retry = !(e instanceof RecordError) && !abort.signal.aborted && !permanent;
      // Errors can quote a URL or form value; the site's credentials must not land in the job row.
      const err = scrubText(abort.signal.aborted ? `Stopped: ${String(abort.signal.reason?.message ?? "aborted")}` : message);
      await finish({ status: "failed", error: err, retry }).catch(() => undefined);
      // The last attempt leaves a report the Lab lists: why, where, and what was on screen.
      if (job.kind === "record" && (!retry || job.attempts >= job.maxAttempts)) {
        try {
          writeFailureReport(this.o.root, job, err, stage, evidenceOf(e), Date.now() - started);
        } catch (we) {
          log.warn("job.failure_report_failed", { job: job.id, error: String(we) });
        }
      }
      log.warn("job.failed", { job: job.id, kind: job.kind, ms: Date.now() - started, error: message, retry });
    } finally {
      clearInterval(beat);
      clearInterval(margin);
      if (stall) clearInterval(stall);
      clearTimeout(deadline);
      unregisterSecret("site_password", "site_username");
    }
  }

  private async record(job: Job, signal: AbortSignal, onProgress: (p: string) => void): Promise<Record<string, unknown>> {
    const input = job.input as { url: string; demo?: boolean; username?: string; maxPages?: number; maxSeconds?: number; blockPrivate?: boolean; voice?: Voice; ttsProvider?: string; ttsVoice?: string; ttsLanguage?: string; journey?: string; zoom?: boolean; narration?: string };
    // Sample-site job: this worker runs its own MiniCRM on loopback and records it, so the demo
    // works wherever the worker runs (desktop in-process, or a separate fleet machine).
    const sample = input.demo ? await startApp({ fault: "none", seed: 1, task: "create-lead", seedLeads: SEED_LEADS }) : null;
    if (sample) Object.assign(input, { url: `${sample.url}/login`, username: CREDENTIALS.username, blockPrivate: false });
    const password = sample ? CREDENTIALS.password : job.secret ? open(job.secret) : undefined;
    // Object storage: record into a temp dir and upload. Local: write straight into recordings/.
    const outDir = this.o.media.kind === "local" ? join(this.o.root, "recordings") : mkdtempSync(join(tmpdir(), "walkcast-"));
    try {
      const r = await recordSite({
        url: input.url,
        ...(input.username ? { username: input.username } : {}),
        ...(password ? { password } : {}),
        maxPages: Number(input.maxPages ?? 8),
        ...(input.maxSeconds ? { maxSeconds: Number(input.maxSeconds) } : {}),
        ...(input.voice ? { voice: input.voice } : {}),
        ...(input.ttsProvider ? { ttsProvider: input.ttsProvider } : {}),
        ...(input.ttsVoice ? { ttsVoice: input.ttsVoice } : {}),
        ...(input.ttsLanguage ? { ttsLanguage: input.ttsLanguage } : {}),
        ...(input.journey ? { journey: String(input.journey) } : {}),
        ...(input.zoom === false ? { zoom: false } : {}),
        ...(input.narration === "plain" ? { narration: "plain" as const } : {}),
        authorized: true,
        outDir,
        blockPrivate: Boolean(input.blockPrivate),
        ...(job.owner ? { owner: job.owner } : {}),
        jobId: job.id,
        signal,
        onProgress,
      });
      onProgress("Saving");
      // The page pictures travel with the recording: a walkthrough in object storage without
      // them can only be watched, never skimmed. The step pictures are what the written guide
      // links to, and focus.json is the zoom plan a re-encode needs: upload them all.
      const pictures = r.pages.map((p) => p.screenshot).filter((f): f is string => Boolean(f));
      const steps = (r.actions ?? []).map((a) => a.shot).filter((f): f is string => Boolean(f));
      const files = [
        r.media.mp4,
        r.media.webm,
        r.media.captions,
        r.media.audio,
        r.media.mp4 || r.media.webm ? null : r.media.video,
        ...pictures,
        ...steps,
        "focus.json",
        "recording.json",
      ].filter((f): f is string => Boolean(f));
      await this.o.media.publish(r.id, r.dir, files);
      // The scrubbed copy written by the recorder is what gets indexed.
      const summary = JSON.parse(readFileSync(join(r.dir, "recording.json"), "utf8")) as Record<string, unknown>;
      delete summary.dir;
      await this.o.store.saveRecording({ id: r.id, owner: job.owner, url: r.url, createdAt: r.createdAt, summary });
      return { id: r.id, dir: `recordings/${r.id}` };
    } catch (e) {
      // Keep the evidence (screenshot, partial video) beside the report, and drop the half-made
      // recording folder, which otherwise sat in recordings/ forever without a recording.json.
      const ev = evidenceOf(e);
      if (ev?.dir) {
        stashEvidence(this.o.root, job.id, ev);
        rmSync(ev.dir, { recursive: true, force: true });
      }
      throw e;
    } finally {
      if (this.o.media.kind !== "local" && existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
      await sample?.close().catch(() => undefined);
    }
  }

  private async labRun(job: Job, signal: AbortSignal, onProgress: (p: string) => void): Promise<Record<string, unknown>> {
    const input = job.input as {
      op?: "run" | "replay" | "experiment";
      agent: string;
      fault: string;
      seed: number;
      task: string;
      modelMode?: "live" | "replay" | "scripted";
      fixture?: string;
      trials?: number;
      baseline?: string;
      candidates?: string[];
    };
    // Per-job credential scope: the owner's connected keys answer the model providers' lookups
    // for this run only, so a key never leaks into other code paths of this process.
    const credentials: Parameters<typeof withCredentials>[0] = {};
    if (job.owner) {
      try {
        const u = await this.o.store.userById(job.owner);
        if (u?.openrouterKey) credentials.OPENROUTER_API_KEY = open(u.openrouterKey);
        if (u?.chatgpt?.refreshToken) {
          const cg = await import("../llm/chatgpt-oauth.ts");
          credentials.CHATGPT_ACCESS_TOKEN = await cg.ensureChatGPTAccessToken(u, this.o.store);
        }
      } catch { /* best effort */ }
    }
    // Output made for an account is stamped as that account's (data.ts, OWNER_FILE).
    const owner = job.owner ? { owner: job.owner } : {};
    return withCredentials(credentials, async () => {
      // Replay a fixture k times with one agent: the pass^k check `lab replay` runs, from the app.
      if (input.op === "replay" && input.fixture) {
        const trials = input.trials ?? 3;
        onProgress(`Replaying ${trials} time${trials === 1 ? "" : "s"}`);
        const summary = await replayFixture(loadFixture(join(this.o.root, input.fixture)), input.agent, trials, join(this.o.root, "runs"), { ...(input.modelMode ? { modelMode: input.modelMode } : {}), signal, ...owner });
        const rel = (d: string) => `runs/${d.split(/[\\/]/).pop()}`;
        return { replay: { ...summary, fixture: input.fixture, trials: summary.trials.map((t) => ({ ...t, runDir: rel(t.runDir) })) } };
      }
      // Baseline against candidates on every fault, as `lab experiment` does; the Experiments page
      // reads it from results/.
      if (input.op === "experiment") {
        const id = `app-${new Date().toISOString().replace(/[:.]/g, "-")}`;
        onProgress("Running every fault with the baseline, then replaying each failure with the candidates");
        await runExperiment({
          seeds: input.seed,
          trials: input.trials ?? 1,
          concurrency: 1,
          baseline: input.baseline ?? "v0",
          candidates: input.candidates ?? ["v1", "v2"],
          task: isTaskId(input.task) ? (input.task as TaskId) : "create-lead",
          outDir: join(this.o.root, "results", id),
          signal,
          ...owner,
        });
        return { experiment: id };
      }
      const task = taskById(isTaskId(input.task) ? (input.task as TaskId) : "create-lead");
      const r = await runOnce({
        fault: normalizeScenario(input.fault),
        seed: input.seed,
        agent: input.agent,
        task,
        outDir: join(this.o.root, "runs"),
        screenshots: true,
        ...(input.modelMode ? { modelMode: input.modelMode } : {}),
        signal,
        ...owner,
        // A live run's spend, as the job's progress line, so the app shows it while it runs.
        onSpend: (b) => onProgress(spendLine(b)),
      });
      // A failure the agent caused becomes a regression fixture, as `lab run` does. Runs started
      // from the app never saved one, so the Fixtures page stayed empty in the desktop app. A
      // harness error is not agent behaviour; the same fault, seed and cause is already captured.
      let fixture: string | undefined;
      if (r.diagnosis.verdict === "fail" && !r.agentError) {
        const fixturesDir = join(this.o.root, "runs", "_fixtures");
        try {
          mkdirSync(fixturesDir, { recursive: true });
          fixture = `runs/_fixtures/${(await writeFixture(r, task, fixturesDir, job.owner ?? undefined)).dir.split(/[\\/]/).pop()}`;
        } catch (e) {
          if (!/already exists/.test(String(e))) log.warn("fixture.save_failed", { job: job.id, error: String(e) });
        }
      }
      return { dir: `runs/${r.runDir.split(/[\\/]/).pop()}`, ...(fixture ? { fixture } : {}) };
    });
  }
}

const CANCELLED = "cancelled by its owner";

/** "Model spend: 142k of 250k tokens · ≈ $0.41 of $5.00" */
export function spendLine(b: BudgetState): string {
  const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  const tokens = `${k(b.spentTokens)}${b.limitTokens === null ? "" : ` of ${k(b.limitTokens)}`} tokens`;
  const usd = b.spentUsd > 0 ? ` · ≈ $${b.spentUsd.toFixed(2)}${b.limitUsd === null ? "" : ` of $${b.limitUsd.toFixed(2)}`}` : "";
  return `Model spend: ${tokens}${usd}`;
}

/**
 * Settle with `work`, or reject the moment `signal` fires. A lab run closes its own browser when
 * the signal fires, but the worker must not wait on that: a run that hangs in a step that never
 * returns would otherwise hold the worker past its deadline and keep every other job waiting.
 */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

/** Where a failed recording job's report and evidence live: <root>/failures/<job id>/. */
export function failureDir(root: string, jobId: string): string {
  return join(root, "failures", jobId);
}

function stashEvidence(root: string, jobId: string, ev: FailureEvidence): void {
  const dest = failureDir(root, jobId);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const name of [ev.screenshot, ev.video]) {
    if (name && ev.dir && existsSync(join(ev.dir, name))) copyFileSync(join(ev.dir, name), join(dest, name));
  }
}

function writeFailureReport(root: string, job: Job, error: string, stage: string | null, ev: FailureEvidence | null, durationMs: number): void {
  const dest = failureDir(root, job.id);
  mkdirSync(dest, { recursive: true });
  const has = (name: string | null) => (name && existsSync(join(dest, name)) ? name : null);
  const input = job.input as { url?: string; demo?: boolean };
  const report: FailureReport = {
    jobId: job.id,
    url: input.demo ? "Sample site" : String(input.url ?? ""),
    owner: job.owner,
    createdAt: job.createdAt,
    failedAt: new Date().toISOString(),
    attempts: job.attempts,
    error,
    stage,
    ...explainFailure(error),
    pages: ev?.pages ?? [],
    signIn: ev?.signIn ?? null,
    skipped: ev?.skipped ?? [],
    durationMs: ev?.durationMs ?? durationMs,
    files: { screenshot: has(ev?.screenshot ?? null), video: has(ev?.video ?? null) },
  };
  writeFileSync(join(dest, "failure.json"), JSON.stringify(scrub(report), null, 2));
}

/** A folder this old with no recording.json is a recording that died before reports existed. */
const PARTIAL_MAX_AGE_MS = 24 * 60 * 60_000;

/**
 * Failed recordings used to leave their working folder (a partial video, often tens of MB) in
 * recordings/ for good: the Library skips it, nothing else removes it. Clear the old ones; a
 * recording in progress is minutes old, never a day.
 */
export function sweepPartialRecordings(dir: string, now = Date.now()): number {
  let removed = 0;
  try {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      try {
        const st = statSync(path);
        if (!st.isDirectory() || existsSync(join(path, "recording.json")) || now - st.mtimeMs < PARTIAL_MAX_AGE_MS) continue;
        rmSync(path, { recursive: true, force: true });
        removed++;
      } catch {
        /* in use or vanished: leave it for next time */
      }
    }
  } catch {
    return 0; // no recordings folder yet
  }
  if (removed) log.info("recordings.partial_swept", { removed });
  return removed;
}

/** Failure reports go when their job does: the store ages finished jobs off after 30 days. */
const FAILURE_MAX_AGE_MS = 30 * 24 * 60 * 60_000;

export function sweepOldFailures(dir: string, now = Date.now()): number {
  let removed = 0;
  try {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      try {
        if (now - statSync(path).mtimeMs < FAILURE_MAX_AGE_MS) continue;
        rmSync(path, { recursive: true, force: true });
        removed++;
      } catch {
        /* vanished */
      }
    }
  } catch {
    return 0;
  }
  return removed;
}
