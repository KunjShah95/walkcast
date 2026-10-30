import type { LabIndex, RecordingSummary, RunDetail } from "./types.ts";
import type { RecordingInsights } from "../../../../../packages/core/src/record/insights.ts";

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

/**
 * A failed fetch that still knows its HTTP status. The session ending is not a generic error —
 * it is the one failure the app has to react to rather than retry or show "Try again" — so the
 * status travels with the error instead of only being readable out of the message text.
 */
export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/** True when a rejection means "this session is gone" rather than "try again". */
export function isAuthError(e: unknown): boolean {
  if (e instanceof HttpError) return e.status === 401;
  if (e instanceof SignInRequired) return true;
  // Anything thrown before HttpError existed, or by a path that has no status yet.
  return /(^|\D)401(\D|$)/.test(e instanceof Error ? e.message : String(e));
}

export async function loadIndex(): Promise<LabIndex> {
  if (baked) return baked.index;
  const res = await fetch("/api/index");
  if (!res.ok) throw new HttpError(res.status, `Could not load the lab index (${res.status}).`);
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

/** One selectable voice inside a cloud TTS provider (an ElevenLabs voice id, an OpenAI voice, ...). */
export interface CloudVoice {
  id: string;
  name: string;
  note?: string;
  /** BCP-47 tag this voice speaks, when the provider needs a matching language. */
  lang?: string;
}

/** One narration provider as the server reports it: which voices it has and whether it can speak. */
export interface TtsProviderInfo {
  id: string;
  label: string;
  /** False for the offline built-in voice and an uploaded sample. */
  cloud: boolean;
  /** False when the provider's voice ids aren't a public list: the picker takes a text box. */
  hasList: boolean;
  /** The server holds credentials for this provider. */
  configured: boolean;
  defaultVoice: string;
  /** The language the default voice speaks. Empty for providers that infer it from the text. */
  defaultLanguage: string;
  /** True where a language has to be typed because the provider's voice ids don't carry one. */
  needsLanguage: boolean;
  voices: CloudVoice[];
}

export interface Capabilities {
  live: boolean;
  /** Sample-site recordings allowed (always on desktop; LAB_DEMO_SITE=1 on a shared server). */
  demoSite?: boolean;
  running?: string | null;
  queue?: number | null;
  stagehand?: boolean;
  /** Every runnable agent version; `kind` "scripted" needs no model key and no Chrome. */
  agents?: { id: string; kind: string; description: string; budget?: { tokens: number | null; usd: number | null } | null }[];
  providers?: string[];
  /** Speech-to-text providers with a key, for auto-captions. */
  sttProviders?: string[];
  liveModels?: boolean;
  limits?: { activeJobsPerUser: number; recordingsPerDay: number; runsPerDay: number };
  usage?: { recordingsToday: number };
  voices?: { available: boolean; list: Voice[]; editable: boolean };
  /** Cloud narration providers, their voices, and which of them are configured. */
  tts?: { providers: string[]; configured: string[] };
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
  result: ({ dir?: string; id?: string } & Record<string, unknown>) | null;
  startedAt?: string | null;
  createdAt?: string;
  /** Present while queued: the job's place in line. */
  queue?: { ahead: number; oldestQueuedMs: number; waitingMs: number };
}

/**
 * Submit a job and wait for it: the server answers at once (202) and the work happens on a
 * queue worker, so a recording that takes minutes never depends on one long HTTP request.
 * Two clicks on the same form share one job; the idempotency key covers a retried POST.
 */
async function submitAndWait(path: string, input: unknown, onProgress?: (s: JobStatus) => void): Promise<string> {
  const result = await submitForResult(path, input, onProgress);
  if (typeof result.dir !== "string") throw new Error("The job finished without a result.");
  return result.dir;
}

type SubmitFlight = {
  promise: Promise<NonNullable<JobStatus["result"]>>;
  listeners: Set<(s: JobStatus) => void>;
};

/** The submissions currently running, keyed by what was asked. */
const inFlight = new Map<string, SubmitFlight>();

/** "The same submission", whatever order the object's keys were written in. */
function submissionKey(path: string, input: unknown): string {
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
      return Object.fromEntries(entries.map(([k, v]) => [k, stable(v)]));
    }
    return value;
  };
  return `${path}\n${JSON.stringify(stable(input))}`;
}

/** submitAndWait, handing back the job's whole result rather than only its directory. */
async function submitForResult(path: string, input: unknown, onProgress?: (s: JobStatus) => void): Promise<NonNullable<JobStatus["result"]>> {
  // A double-click is two submits of the same thing. Sharing the in-flight call means the second
  // one joins the first job instead of starting a second one; the idempotency key below still
  // covers a retried POST within that one call. The entry is removed when the job settles, so a
  // deliberate re-run later starts fresh.
  const fingerprint = submissionKey(path, input);
  const running = inFlight.get(fingerprint);
  if (running) {
    if (onProgress) running.listeners.add(onProgress);
    return running.promise;
  }
  const listeners = new Set<(s: JobStatus) => void>();
  if (onProgress) listeners.add(onProgress);
  const emit = (s: JobStatus) => {
    for (const listener of listeners) listener(s);
  };
  const key = crypto.randomUUID();
  const promise = (async () => {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(input) });
    // A proxy's HTML error page is not JSON: fall back to the status rather than "Unexpected token <".
    const body = (await res.json().catch(() => ({}))) as { job?: JobStatus; error?: string };
    if (res.status === 401) throw new SignInRequired(body.error ?? "Sign in first.");
    if (!res.ok || !body.job) throw new Error(body.error ?? `Request failed (${res.status}).`);
    let job = body.job;
    emit(job);
    for (let delay = 1000; job.status === "queued" || job.status === "running"; delay = Math.min(delay * 1.3, 4000)) {
      await new Promise((r) => setTimeout(r, delay));
      // The job runs on the server whatever happens to this request: a dropped connection (the app
      // server restarting, Wi-Fi blinking) is a reason to ask again, not to report the job failed.
      let poll: Response;
      try {
        poll = await fetch(`/api/jobs/${encodeURIComponent(job.id)}`);
      } catch {
        continue;
      }
      if (poll.status === 401) throw new SignInRequired("Your session ended. Sign in again.");
      // 404/410 are permanent, not transient: the job belongs to a different account (the server
      // hides it as 404) or the queue has forgotten it. Only the 5xx/network cases are worth
      // retrying — treating 404 as transient spun the recorder forever with no error. Not a
      // sign-in problem, so not SignInRequired (that opens the create-account prompt).
      if (poll.status === 404 || poll.status === 410) {
        throw new Error("This job is no longer available. It belongs to a different account, or the server restarted.");
      }
      if (!poll.ok) continue; // transient (deploy, network); keep waiting
      const next = (await poll.json().catch(() => null)) as { job?: JobStatus } | null;
      if (!next?.job) continue;
      job = next.job;
      emit(job);
    }
    if (job.status === "cancelled") throw new JobCancelled("Cancelled.");
    if (job.status !== "succeeded" || !job.result) throw new Error(job.error ?? `The job ${job.status}.`);
    return job.result;
  })();
  const flight: SubmitFlight = { promise, listeners };
  inFlight.set(fingerprint, flight);
  try {
    return await promise;
  } finally {
    if (inFlight.get(fingerprint) === flight) inFlight.delete(fingerprint);
  }
}

/** One fixture replayed k times with one agent: the pass^k check. */
export interface ReplayResult {
  fixture: string;
  agent: string;
  passes: number;
  /** pass^k: the agent met the fixture's expectation in every trial. */
  passAll: boolean;
  /** Trials that failed with every cause the original run was diagnosed with. */
  reproduced: number;
  environmentDrift: string[];
  trials: { verdict: "pass" | "fail"; causes: string[]; durationMs: number; runDir: string }[];
}

/**
 * Replay a fixture on the server's worker and resolve with the pass^k summary.
 *
 * `modelMode` decides how the agent's model answers: the calls recorded with the fixture, the
 * deterministic stand-in, or a live model. It is what lets a browser agent be replayed on a
 * machine with no provider key.
 */
export async function startReplay(input: { fixture: string; agent: string; trials: number; modelMode?: string }, onProgress?: (s: JobStatus) => void): Promise<ReplayResult> {
  const result = await submitForResult("/api/run", { op: "replay", ...input }, onProgress);
  if (!result.replay) throw new Error("The replay finished without a result.");
  return result.replay as ReplayResult;
}

/** Run a baseline against candidate agents on every fault; resolves with the experiment's id. */
export async function startExperiment(input: { baseline: string; candidates: string[]; seeds: number; trials: number }, onProgress?: (s: JobStatus) => void): Promise<string> {
  const result = await submitForResult("/api/run", { op: "experiment", ...input }, onProgress);
  return String(result.experiment ?? "");
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
  input: { url: string; demo?: boolean; username?: string; password?: string; maxPages: number; maxSeconds?: number; authorized: boolean; voice?: Voice; ttsProvider?: string; ttsVoice?: string; ttsLanguage?: string; journey?: string; zoom?: boolean; narration?: "presenter" | "plain" },
  onProgress?: (s: JobStatus) => void,
): Promise<string> {
  return submitAndWait("/api/record", input, onProgress);
}

export class SignInRequired extends Error {}
/** The person stopped the job themselves: not a failure to report. */
export class JobCancelled extends Error {}

/** Stop a queued or running job. */
export async function cancelJob(id: string): Promise<void> {
  const res = await fetch(`/api/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" });
  // 409: it ended on its own first, which the poll loop picks up.
  if (!res.ok && res.status !== 409) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Could not cancel (${res.status}).`);
  }
}

export interface Me {
  user: { email: string; name?: string; google?: boolean; openrouter?: boolean; chatgpt?: boolean } | null;
  google: boolean;
  openrouter?: boolean;
  chatgpt?: boolean;
  provider?: "local" | "supabase";
  authRequired: boolean;
}

/**
 * Who am I. `/api/me` answers anonymously by design: a signed-out visitor gets a 200 with
 * `user: null`, which is the honest "signed out" signal and must not be confused with a failure.
 * Anything else (network error, 5xx) is an unknown, so it throws rather than reporting
 * "signed out" — otherwise a transient blip shows the sign-in wall, and following the sign-in
 * link bounces straight back to /app because the session was never actually gone.
 */
export async function loadMe(): Promise<Me> {
  if (baked) return { user: null, google: false, openrouter: false, chatgpt: false, authRequired: false };
  const res = await fetch("/api/me");
  if (!res.ok) throw new HttpError(res.status, `Could not reach the account service (${res.status}).`);
  return (await res.json()) as Me;
}

/** A short spoken sample of a narration voice. */
export function voicePreviewUrl(voice: Voice): string {
  return `/api/voices/${voice}.wav`;
}

/** A short sample of one cloud provider's voice, synthesized by the server. */
export function cloudVoicePreviewUrl(provider: string, voice: string, language?: string): string {
  const query = new URLSearchParams({ provider, voice });
  if (language) query.set("language", language);
  return `/api/voices/preview?${query.toString()}`;
}

/** The server's voice catalog: providers, their voices, and their defaults. */
export async function loadTtsProviders(): Promise<TtsProviderInfo[]> {
  if (baked) return [];
  try {
    const res = await fetch("/api/voices");
    if (!res.ok) return [];
    const body = (await res.json()) as { providers?: TtsProviderInfo[] };
    return body.providers ?? [];
  } catch {
    return [];
  }
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

/** Re-frame the walkthrough for a feed: 9:16 or 1:1, with the captions burned in. */
export async function exportShape(id: string, shape: "vertical" | "square"): Promise<RecordingSummary> {
  const res = await fetch(`/api/recordings/${encodeURIComponent(id)}/export?shape=${shape}`, { method: "POST" });
  const body = (await res.json().catch(() => ({}))) as { recording?: RecordingSummary; error?: string };
  if (res.status === 401) throw new SignInRequired(body.error ?? "Sign in first.");
  if (!res.ok || !body.recording) throw new Error(body.error ?? `Export failed (${res.status}).`);
  return body.recording;
}

/** Build (or reuse) a no-narration copy of the recording, for downloading without the voiceover. */
export async function buildSilentCopy(id: string): Promise<RecordingSummary> {
  const res = await fetch(`/api/recordings/${encodeURIComponent(id)}/no-voice`, { method: "POST" });
  const body = (await res.json().catch(() => ({}))) as { recording?: RecordingSummary; error?: string };
  if (res.status === 401) throw new SignInRequired(body.error ?? "Sign in first.");
  if (!res.ok || !body.recording) throw new Error(body.error ?? `Couldn't build a no-voice copy (${res.status}).`);
  return body.recording;
}

/** Delete a recording and its files. */
export async function deleteRecording(id: string): Promise<void> {
  const res = await fetch(`/api/recordings/${encodeURIComponent(id)}`, { method: "DELETE" });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401) throw new SignInRequired(body.error ?? "Sign in first.");
  if (!res.ok) throw new Error(body.error ?? `Could not delete the recording (${res.status}).`);
}

/** URL for a recording's step-by-step guide: an HTML page with a picture per step, or Markdown. */
export function guideUrl(id: string, format: "html" | "md" = "html"): string {
  return `/api/recordings/${encodeURIComponent(id)}/guide?format=${format}`;
}

/** URL for a recording's transcript export in the requested format. */
export function transcriptUrl(id: string, format: "srt" | "vtt" | "json" | "md"): string {
  return `/api/recordings/${encodeURIComponent(id)}/transcript?format=${format}`;
}

/**
 * What the recorder found on the site while it walked it.
 * A walkthrough made now carries its insights in its summary; an older one is read from its
 * trace by the server, which runs the same analysis. `null` means the walkthrough has no
 * trace to read (a recording kept in object storage, or a snapshot with no server behind it).
 */
export async function loadInsights(id: string): Promise<RecordingInsights | null> {
  if (isSnapshot) return null;
  try {
    const res = await fetch(`/api/recordings/${encodeURIComponent(id)}/insights`);
    if (!res.ok) return null;
    const body = (await res.json()) as { insights?: RecordingInsights };
    return body.insights ?? null;
  } catch {
    return null;
  }
}

/** A share link: the token is the permission, and the link expires. */
export interface ShareLink {
  token: string;
  createdAt: string;
  expiresAt: string;
  /** Whether this link carries the owner's notes. */
  includeNotes?: boolean;
  /** Whether this link plays the recording with no narration track. */
  silent?: boolean;
}

/**
 * Make a link that plays this walkthrough for whoever has it.
 *
 * No account, no sign-in on the other side. The link works until the day it names, and it can
 * be switched off before then.
 */
export async function createShare(id: string, days = 7, includeNotes = false, silent = false): Promise<{ url: string; share: ShareLink; shares: ShareLink[] }> {
  const res = await fetch(`/api/recordings/${encodeURIComponent(id)}/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ days, includeNotes, silent }),
  });
  const body = (await res.json().catch(() => ({}))) as { url?: string; share?: ShareLink; shares?: ShareLink[]; error?: string };
  if (res.status === 401) throw new SignInRequired(body.error ?? "Sign in first.");
  if (!res.ok || !body.url || !body.share) throw new Error(body.error ?? `Could not create the link (${res.status}).`);
  return { url: body.url, share: body.share, shares: body.shares ?? [] };
}

/** Stop a link working. Without a token, every link for this walkthrough is stopped. */
export async function revokeShare(id: string, token?: string): Promise<ShareLink[]> {
  const res = await fetch(`/api/recordings/${encodeURIComponent(id)}/share${token ? `?token=${encodeURIComponent(token)}` : ""}`, { method: "DELETE" });
  const body = (await res.json().catch(() => ({}))) as { shares?: ShareLink[]; error?: string };
  if (res.status === 401) throw new SignInRequired(body.error ?? "Sign in first.");
  if (!res.ok) throw new Error(body.error ?? `Could not stop the link (${res.status}).`);
  return body.shares ?? [];
}

/** Generate captions from the recording's audio via STT. */
export async function sttCaptions(id: string, language = "unknown"): Promise<RecordingSummary> {
  const res = await fetch(`/api/recordings/${encodeURIComponent(id)}/captions/stt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language }),
  });
  const body = (await res.json().catch(() => ({}))) as { recording?: RecordingSummary; error?: string };
  if (res.status === 401) throw new SignInRequired(body.error ?? "Sign in first.");
  if (!res.ok || !body.recording) throw new Error(body.error ?? `Request failed (${res.status}).`);
  return body.recording;
}

/**
 * A note pinned to a moment in a walkthrough.
 *
 * The walkthrough is the evidence; the note is the owner's reading of it. They belong to the
 * walkthrough's owner and stay theirs until they put them on a share link.
 */
export interface Annotation {
  id: string;
  recordingId: string;
  at: number;
  text: string;
  createdAt: string;
}

/** The notes on a walkthrough, earliest moment first. */
export async function loadAnnotations(id: string): Promise<Annotation[]> {
  if (isSnapshot) return [];
  try {
    const res = await fetch(`/api/recordings/${encodeURIComponent(id)}/annotations`);
    if (!res.ok) return [];
    const body = (await res.json().catch(() => ({}))) as { annotations?: Annotation[] };
    return body.annotations ?? [];
  } catch {
    return [];
  }
}

/** Pin a note to a moment in the video. */
export async function createAnnotation(id: string, at: number, text: string): Promise<Annotation> {
  const res = await fetch(`/api/recordings/${encodeURIComponent(id)}/annotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ at, text }),
  });
  const body = (await res.json().catch(() => ({}))) as { annotation?: Annotation; error?: string };
  if (res.status === 401) throw new SignInRequired(body.error ?? "Sign in first.");
  if (!res.ok || !body.annotation) throw new Error(body.error ?? `Could not save the note (${res.status}).`);
  return body.annotation;
}

/** Take a note back. */
export async function deleteAnnotation(id: string, noteId: string): Promise<void> {
  const res = await fetch(`/api/recordings/${encodeURIComponent(id)}/annotations/${encodeURIComponent(noteId)}`, { method: "DELETE" });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401) throw new SignInRequired(body.error ?? "Sign in first.");
  if (!res.ok) throw new Error(body.error ?? `Could not delete the note (${res.status}).`);
}

/**
 * A recurring recording. The server keeps the interval as it was written ("6h",
 * "0 9 * * 1") and the shortest gap in milliseconds, which is what the shared-server
 * minimum is checked against.
 */
export interface Schedule {
  id: string;
  url: string;
  interval: string;
  intervalMs: number;
  authorized: boolean;
  createdAt: string;
  lastRunAt: string | null;
}

export async function loadSchedules(): Promise<Schedule[]> {
  const res = await fetch("/api/schedules");
  const body = (await res.json().catch(() => ({}))) as { schedules?: Schedule[]; error?: string };
  if (res.status === 401) throw new SignInRequired(body.error ?? "Sign in first.");
  if (!res.ok) throw new Error(body.error ?? `Could not load schedules (${res.status}).`);
  return body.schedules ?? [];
}

export async function createSchedule(input: { url: string; interval: string; authorized: boolean }): Promise<Schedule[]> {
  const res = await fetch("/api/schedules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await res.json().catch(() => ({}))) as { schedules?: Schedule[]; error?: string };
  if (res.status === 401) throw new SignInRequired(body.error ?? "Sign in first.");
  if (!res.ok) throw new Error(body.error ?? `Could not add the schedule (${res.status}).`);
  return body.schedules ?? [];
}

export async function deleteSchedule(id: string): Promise<Schedule[]> {
  const res = await fetch(`/api/schedules/${encodeURIComponent(id)}`, { method: "DELETE" });
  const body = (await res.json().catch(() => ({}))) as { schedules?: Schedule[]; error?: string };
  if (res.status === 401) throw new SignInRequired(body.error ?? "Sign in first.");
  if (!res.ok) throw new Error(body.error ?? `Could not remove the schedule (${res.status}).`);
  return body.schedules ?? [];
}

/** An endpoint that receives a `job.completed` POST when a walkthrough or lab run ends. */
export interface Webhook {
  id: string;
  owner: string | null;
  url: string;
  createdAt: string;
}

/** One attempt at one event: the outbox row the dispatcher leases and retries. */
export interface WebhookDelivery {
  id: string;
  webhookId: string | null;
  owner: string | null;
  url: string;
  event: string;
  payload: Record<string, unknown>;
  status: "pending" | "done" | "failed";
  attempts: number;
  nextAt: string;
  lastError: string | null;
  createdAt: string;
}

export async function loadWebhooks(): Promise<Webhook[]> {
  const res = await fetch("/api/webhooks");
  const body = (await res.json().catch(() => ({}))) as { items?: Webhook[]; error?: string };
  if (res.status === 401) throw new SignInRequired(body.error ?? "Sign in first.");
  if (!res.ok) throw new Error(body.error ?? `Could not load webhooks (${res.status}).`);
  return body.items ?? [];
}

export async function createWebhook(url: string): Promise<Webhook[]> {
  const res = await fetch("/api/webhooks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const body = (await res.json().catch(() => ({}))) as { items?: Webhook[]; error?: string };
  if (res.status === 401) throw new SignInRequired(body.error ?? "Sign in first.");
  if (!res.ok) throw new Error(body.error ?? `Could not add the endpoint (${res.status}).`);
  return body.items ?? [];
}

export async function deleteWebhook(id: string): Promise<Webhook[]> {
  const res = await fetch(`/api/webhooks/${encodeURIComponent(id)}`, { method: "DELETE" });
  const body = (await res.json().catch(() => ({}))) as { items?: Webhook[]; error?: string };
  if (res.status === 401) throw new SignInRequired(body.error ?? "Sign in first.");
  if (!res.ok) throw new Error(body.error ?? `Could not remove the endpoint (${res.status}).`);
  return body.items ?? [];
}

export async function loadWebhookDeliveries(limit = 50): Promise<WebhookDelivery[]> {
  const res = await fetch(`/api/webhooks/deliveries?limit=${encodeURIComponent(String(limit))}`);
  const body = (await res.json().catch(() => ({}))) as { deliveries?: WebhookDelivery[]; error?: string };
  if (res.status === 401) throw new SignInRequired(body.error ?? "Sign in first.");
  if (!res.ok) throw new Error(body.error ?? `Could not load deliveries (${res.status}).`);
  return body.deliveries ?? [];
}
