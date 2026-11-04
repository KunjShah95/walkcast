import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { LaunchVideo } from "../../../packages/core/src/data.ts";
import { log } from "../../../packages/core/src/ops/log.ts";

/**
 * Local work the desktop app runs as a child process outside the job queue: a Launch Studio film
 * render (node + Chromium + ffmpeg) and the one-time Kokoro setup.
 *
 * Each one used to run with no time limit, survive the app closing (the renderer's Chromium kept
 * going with nobody to read its output), and leave its working folder under launch-video-work/
 * whenever the process died. Now a task has a deadline, the whole process tree is killed when it
 * passes or when the server closes, and stale working folders are swept at startup.
 */
export type DesktopTaskStatus = "running" | "complete" | "failed";
export interface DesktopTask {
  id: string;
  kind: "launch-video" | "kokoro-setup";
  owner: string | null;
  recordingId?: string;
  status: DesktopTaskStatus;
  progress: number;
  message: string;
  startedAt: string;
  updatedAt: string;
  error?: string;
  video?: LaunchVideo;
  temporaryDir?: string;
  child?: ChildProcess;
}

/** LAB_LAUNCH_RENDER_TIMEOUT_MS, default 20 minutes: a film render (or Kokoro setup) that runs longer is stuck. */
export function launchRenderTimeoutMs(): number {
  const n = Number(process.env.LAB_LAUNCH_RENDER_TIMEOUT_MS ?? 20 * 60_000);
  return Number.isFinite(n) && n > 0 ? n : 20 * 60_000;
}

export function trackDesktopTask(task: DesktopTask, chunk: Buffer | string): void {
  const text = String(chunk);
  const lines = text.split(/[\r\n]+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length) task.message = lines.at(-1)!.slice(0, 220);
  const frames = /frame\s+(\d+)\s*\/\s*(\d+)/.exec(text);
  if (frames) task.progress = Math.min(96, 24 + Math.round((Number(frames[1]) / Number(frames[2])) * 70));
  else if (/Prepared current/.test(text)) task.progress = Math.max(task.progress, 8);
  else if (/Kokoro|voice/.test(text)) task.progress = Math.max(task.progress, 17);
  else if (/score|music/i.test(text)) task.progress = Math.max(task.progress, 12);
  task.updatedAt = new Date().toISOString();
}

/**
 * Kill a child and everything it started. The film renderer launches Chromium and ffmpeg; killing
 * only the node parent left those running. Windows has no process groups to signal, so taskkill
 * walks the tree (/T) and forces it (/F). Elsewhere the child was spawned as a group leader, so a
 * signal to the negative pid reaches the whole group.
 */
export function killProcessTree(child: ChildProcess): void {
  const pid = child.pid;
  if (pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

/** Remove every working folder under <root>/launch-video-work: at startup none of them belongs to a running task. */
export function sweepLaunchWork(root: string): number {
  const dir = join(root, "launch-video-work");
  let removed = 0;
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return 0;
  }
  for (const name of names) {
    try {
      rmSync(join(dir, name), { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
      removed++;
    } catch {
      /* in use (another instance on this root?): next start */
    }
  }
  if (removed) log.info("launch_video.work_swept", { removed });
  return removed;
}

export class DesktopTasks {
  readonly tasks = new Map<string, DesktopTask>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly timeoutMs: () => number = launchRenderTimeoutMs) {}

  get(id: string): DesktopTask | undefined {
    return this.tasks.get(id);
  }

  values(): IterableIterator<DesktopTask> {
    return this.tasks.values();
  }

  /** Whether any task is still running. */
  get busy(): boolean {
    return [...this.tasks.values()].some((t) => t.status === "running");
  }

  start(task: DesktopTask, command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, complete?: () => Promise<void>): void {
    this.tasks.set(task.id, task);
    // A group leader off Windows, so killProcessTree can signal everything it starts.
    const child = spawn(command, args, { cwd, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
    task.child = child;
    child.stdout?.on("data", (chunk: Buffer) => trackDesktopTask(task, chunk));
    child.stderr?.on("data", (chunk: Buffer) => trackDesktopTask(task, chunk));
    const limit = this.timeoutMs();
    const timer = setTimeout(() => {
      if (task.status !== "running") return;
      // Kill first: the working folder can't be removed while the renderer still holds it.
      killProcessTree(child);
      this.fail(task, `Stopped after ${Math.round(limit / 60_000) || 1} min: the ${task.kind === "kokoro-setup" ? "Kokoro setup" : "launch video renderer"} took too long.`, "The local video renderer took too long and was stopped.");
    }, limit);
    timer.unref?.();
    this.timers.set(task.id, timer);
    child.once("error", (error) => {
      this.clearTimer(task.id);
      if (task.status !== "running") return;
      this.fail(task, error.message, "The local video renderer could not start.");
    });
    child.once("close", (code) => {
      this.clearTimer(task.id);
      task.child = undefined;
      if (task.status !== "running") return;
      void (async () => {
        if (code !== 0) throw new Error(`Video renderer exited with code ${code ?? "unknown"}. ${task.message}`);
        await complete?.();
        if (task.temporaryDir) rmSync(task.temporaryDir, { recursive: true, force: true });
        task.status = "complete";
        task.progress = 100;
        task.message = task.kind === "kokoro-setup" ? "Kokoro is ready." : "Launch video finished.";
        task.updatedAt = new Date().toISOString();
      })().catch((error: unknown) => {
        this.fail(task, error instanceof Error ? error.message : String(error), "Could not finish the launch video.");
      });
    });
  }

  /** Kill every running task's process tree and clean up after it (the server is closing). */
  killAll(reason = "Walkcast closed while this was running."): number {
    let killed = 0;
    for (const task of this.tasks.values()) {
      this.clearTimer(task.id);
      if (task.status !== "running") continue;
      if (task.child) killProcessTree(task.child);
      this.fail(task, reason, reason);
      killed++;
    }
    if (killed) log.info("desktop_tasks.killed", { killed });
    return killed;
  }

  private fail(task: DesktopTask, error: string, message: string): void {
    task.status = "failed";
    task.error = error;
    task.message = message;
    task.updatedAt = new Date().toISOString();
    if (task.temporaryDir) {
      try {
        rmSync(task.temporaryDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      } catch {
        /* still held by a dying process: swept at the next start */
      }
    }
  }

  private clearTimer(id: string): void {
    const t = this.timers.get(id);
    if (t) clearTimeout(t);
    this.timers.delete(id);
  }
}
