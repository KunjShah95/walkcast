import type { LabIndex, RecordingSummary, RunDetail } from "./types.ts";

/** Data source: baked into an exported file, or fetched from `lab ui`. */
interface Baked {
  index: LabIndex;
  details: Record<string, RunDetail>;
  files: Record<string, string>;
}

declare global {
  interface Window {
    __LAB_DATA__?: Baked;
  }
}

const baked = typeof window !== "undefined" ? window.__LAB_DATA__ : undefined;

export const isSnapshot = Boolean(baked);

export async function loadIndex(): Promise<LabIndex> {
  if (baked) return baked.index;
  const res = await fetch("/api/index");
  if (!res.ok) throw new Error(`Could not load the lab index (${res.status}).`);
  return (await res.json()) as LabIndex;
}

export async function loadRun(dir: string): Promise<RunDetail> {
  if (baked) {
    const detail = baked.details[dir];
    if (!detail) throw new Error("This run is not included in the snapshot.");
    return detail;
  }
  const res = await fetch(`/api/run?dir=${encodeURIComponent(dir)}`);
  if (!res.ok) throw new Error(`Could not load run ${dir} (${res.status}).`);
  return (await res.json()) as RunDetail;
}

/** URL for a run artifact (screenshot); recorder stores absolute paths, keep the file name. */
export function fileUrl(runDir: string, absolutePath: string): string | undefined {
  const name = absolutePath.split(/[\\/]/).pop() ?? "";
  const rel = `${runDir}/${name}`;
  if (baked) return baked.files[rel];
  return `/files/${rel.split("/").map(encodeURIComponent).join("/")}`;
}

export type Voice = "slt" | "awb" | "kal" | "rms";

export interface Capabilities {
  live: boolean;
  running?: string | null;
  queue?: number | null;
  stagehand?: boolean;
  providers?: string[];
  liveModels?: boolean;
  limits?: { activeJobsPerUser: number; recordingsPerDay: number; runsPerDay: number };
  usage?: { recordingsToday: number };
  voices?: { available: boolean; list: Voice[]; editable: boolean };
  /** Set when this deployment can't run recordings or lab runs at all. */
  jobsUnavailable?: string | null;
}

export async function loadCapabilities(): Promise<Capabilities> {
  if (baked) return { live: false };
  try {
    const res = await fetch("/api/capabilities");
    return res.ok ? ((await res.json()) as Capabilities) : { live: false };
  } catch {
    return { live: false };
  }
}

/** Starts a real run on the local server and resolves with its directory when it finishes. */
export interface JobStatus {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  progress: string | null;
  error: string | null;
  result: { dir?: string; id?: string } | null;
  startedAt?: string | null;
  createdAt?: string;
  /** Present while queued: the job's place in line. */
  queue?: { ahead: number; oldestQueuedMs: number; waitingMs: number };
}

/**
 * Submit a job and wait for it: the server answers at once (202) and the work happens on a
 * queue worker, so a recording that takes minutes never depends on one long HTTP request.
 * The idempotency key makes a double-click or a retried POST start one job, not two.
 */
async function submitAndWait(path: string, input: unknown, onProgress?: (s: JobStatus) => void): Promise<string> {
  const key = crypto.randomUUID();
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(input) });
  const body = (await res.json()) as { job?: JobStatus; error?: string };
  if (res.status === 401) throw new SignInRequired(body.error ?? "Sign in first.");
  if (!res.ok || !body.job) throw new Error(body.error ?? `Request failed (${res.status}).`);
  let job = body.job;
  onProgress?.(job);
  for (let delay = 1000; job.status === "queued" || job.status === "running"; delay = Math.min(delay * 1.3, 4000)) {
    await new Promise((r) => setTimeout(r, delay));
    const poll = await fetch(`/api/jobs/${encodeURIComponent(job.id)}`);
    if (poll.status === 401) throw new SignInRequired("Your session ended. Sign in again.");
    if (!poll.ok) continue; // transient (deploy, network); keep waiting
    job = ((await poll.json()) as { job: JobStatus }).job;
    onProgress?.(job);
  }
  if (job.status !== "succeeded" || !job.result?.dir) throw new Error(job.error ?? `The job ${job.status}.`);
  return job.result.dir;
}

/** Starts a real run and resolves with its directory when it finishes. */
export function startRun(input: { agent: string; fault: string; seed: number; task?: string; modelMode?: string }, onProgress?: (s: JobStatus) => void): Promise<string> {
  return submitAndWait("/api/run", input, onProgress);
}

/** URL for a recording's media file (baked as a data URI in snapshots, served by `lab ui` otherwise). */
export function mediaUrl(dir: string, file: string): string | undefined {
  if (!file) return undefined;
  const rel = `${dir}/${file}`;
  if (baked) return baked.files[rel];
  return `/files/${rel.split("/").map(encodeURIComponent).join("/")}`;
}

/** Records a site on the local server; resolves with the recording's directory when done. */
/** Records a site; resolves with the recording's directory when it is done. */
export function startRecording(
  input: { url: string; username?: string; password?: string; maxPages: number; authorized: boolean; voice?: Voice },
  onProgress?: (s: JobStatus) => void,
): Promise<string> {
  return submitAndWait("/api/record", input, onProgress);
}

export class SignInRequired extends Error {}

export interface Me {
  user: { email: string; name?: string; google?: boolean; openrouter?: boolean; chatgpt?: boolean } | null;
  google: boolean;
  openrouter?: boolean;
  chatgpt?: boolean;
  provider?: "local" | "supabase";
  authRequired: boolean;
}

export async function loadMe(): Promise<Me | null> {
  if (baked) return null;
  try {
    const res = await fetch("/api/me");
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** A short spoken sample of a narration voice. */
export function voicePreviewUrl(voice: Voice): string {
  return `/api/voices/${voice}.wav`;
}

async function recordingCall(id: string, what: "narration" | "voiceover", init: RequestInit): Promise<RecordingSummary> {
  const res = await fetch(`/api/recordings/${encodeURIComponent(id)}/${what}`, { method: "POST", ...init });
  const body = (await res.json().catch(() => ({}))) as { recording?: RecordingSummary; error?: string };
  if (res.status === 401) throw new SignInRequired(body.error ?? "Sign in first.");
  if (!res.ok || !body.recording) throw new Error(body.error ?? `Request failed (${res.status}).`);
  return body.recording;
}

/** Re-speak an edited script with a chosen voice. */
export function renarrate(id: string, captions: { start: number; end: number; text: string }[], voice: Voice): Promise<RecordingSummary> {
  return recordingCall(id, "narration", { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ captions, voice }) });
}

/** Replace the narration with the user's own recording. */
export function uploadVoiceover(id: string, audio: Blob): Promise<RecordingSummary> {
  return recordingCall(id, "voiceover", { headers: { "Content-Type": audio.type || "audio/webm" }, body: audio });
}
