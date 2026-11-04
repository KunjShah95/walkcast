import { useCallback, useEffect, useSyncExternalStore } from "react";
import { isSnapshot, type JobStatus } from "./api.ts";

/**
 * The signed-in person's one active job (record, lab run, or batch render), shared by every
 * caller. One poller serves all subscribers; it pauses while the document is hidden and polls
 * again the moment it becomes visible, so a background tab never hammers /api/jobs/mine.
 *
 * Views use it to pre-check the one-active-job limit before offering a start button:
 *   const { job, refresh } = useActiveJob();
 *   if (job) -> show "A <kind> is already running" instead of a start that the server rejects.
 */
export type ActiveJobKind = "record" | "run" | "batch-render";
export type ActiveJob = JobStatus & { kind: ActiveJobKind };

const POLL_MS = 4000;
const IDLE_POLL_MS = 15000;

let current: ActiveJob | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<void> | null = null;

function emit(next: ActiveJob | null) {
  const same =
    (current === null && next === null) ||
    (current !== null && next !== null && current.id === next.id && current.status === next.status && current.progress === next.progress && current.live === next.live && current.queue?.ahead === next.queue?.ahead);
  current = next;
  if (!same) for (const l of listeners) l();
}

function normaliseKind(raw: unknown, fallback: ActiveJobKind): ActiveJobKind {
  return raw === "run" || raw === "batch-render" || raw === "record" ? raw : fallback;
}

async function fetchMine(query: string, fallback: ActiveJobKind): Promise<{ job: ActiveJob | null; typed: boolean } | null> {
  const res = await fetch(`/api/jobs/mine${query}`, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => ({}))) as { job?: (JobStatus & { kind?: string }) | null };
  const job = body.job ?? null;
  if (!job) return { job: null, typed: false };
  if (job.status !== "queued" && job.status !== "running") return { job: null, typed: true };
  return { job: { ...job, kind: normaliseKind(job.kind, fallback) }, typed: typeof job.kind === "string" };
}

async function poll(): Promise<void> {
  if (isSnapshot || typeof window === "undefined") return;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      // `kind=any` asks for whichever kind is active. A server that predates it reads any
      // unknown kind as "record"; in that case also ask about lab runs so neither is missed.
      const first = await fetchMine("?kind=any", "record");
      if (first === null) return; // unreachable or signed out: keep the last answer, don't invent one
      if (first.job || first.typed) return emit(first.job);
      const run = await fetchMine("?kind=run", "run");
      if (run !== null) emit(run.job);
      else emit(null);
    } catch {
      // A network blip is not "idle": keep showing what we last knew.
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (listeners.size === 0 || typeof document === "undefined" || document.hidden) return;
  timer = setTimeout(async () => {
    await poll();
    schedule();
  }, current ? POLL_MS : IDLE_POLL_MS);
}

function onVisibility() {
  if (document.hidden) {
    if (timer) clearTimeout(timer);
    timer = null;
  } else {
    void poll().then(schedule);
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibility);
    void poll().then(schedule);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (timer) clearTimeout(timer);
      timer = null;
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
    }
  };
}

/** Ask now (after starting or cancelling a job) instead of waiting for the next tick. */
export function refreshActiveJob(): Promise<void> {
  return poll().then(schedule);
}

export function useActiveJob(): { job: ActiveJob | null; refresh(): void } {
  const job = useSyncExternalStore(subscribe, () => current, () => null);
  const refresh = useCallback(() => void refreshActiveJob(), []);
  // Re-arm the timer when a job appears or ends so the cadence follows it.
  useEffect(() => schedule(), [job?.id]);
  return { job, refresh };
}

/** Human label for a job kind, for chips and "already running" notices. */
export function jobKindLabel(kind: ActiveJobKind): string {
  return kind === "record" ? "Recording" : kind === "run" ? "Lab run" : "Batch render";
}
