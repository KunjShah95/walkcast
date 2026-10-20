import { randomUUID, createHash } from "node:crypto";
import { chmodSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { LabData, type LabIndex, type RecordingSummary, type RunDetail } from "../../../packages/core/src/data.ts";
import { type TaskId, allScenarios, isTaskId, normalizeScenario } from "../../../packages/core/src/app/faults.ts";
import { agentDailyLimit, agentExposure, allAgents, resolveAgent } from "../../../packages/core/src/agents/registry.ts";
import { seal, sharedKeyConfigured } from "../../../packages/core/src/jobs/secret-box.ts";
import { Worker, failureDir } from "../../../packages/core/src/jobs/worker.ts";
import { findChrome } from "../../../packages/core/src/lab/chrome.ts";
import { type FailureReport, type RunFailure, explainFailure } from "../../../packages/core/src/record/failure.ts";
import { PROVIDERS, apiKey, baseURL, configuredProviders } from "../../../packages/core/src/llm/providers.ts";
import { createMedia, type MediaStore } from "../../../packages/core/src/media/store.ts";
import { browserNotReady, browserSetup, installChromium } from "../../../packages/core/src/record/browser-install.ts";
import { VOICES, canNarrate, isVoice, renarrate, voiceover, voicePreview, cloudVoicePreview, clearVoicePreviews, generateCaptionsFromAudio } from "../../../packages/core/src/record/media.ts";
import { configuredCloudProviders, engineFor } from "../../../packages/core/src/record/voice.ts";
import { credentialFor, defaultLanguageFor, defaultVoiceFor, isCloudProvider, needsLanguageInput, providerLabel, voicesFor } from "../../../packages/core/src/record/voices.ts";
import { log } from "../../../packages/core/src/ops/log.ts";
import { Auth, AuthError, publicUser, safeNext, type User } from "./auth.ts";
import { SupabaseAuth, supabaseAuthConfig } from "./supabase-auth.ts";
import { FAVICON, fontPath } from "../../../packages/brand/src/index.ts";
import { openExternal } from "./open-external.ts";
import { authPage, continueInBrowserPage, messagePage, notFoundPage, sharePage } from "./pages.ts";
import { newShareToken } from "./share.ts";
import { webManifest, SERVICE_WORKER } from "./pwa.ts";
import { createStore, type Job, type QueuePosition, type Store } from "../../../packages/core/src/store/index.ts";
import { importLegacyWebhooks, startWebhookDispatcher, webhookUrlProblem } from "../../../packages/core/src/webhooks.ts";
import { blockedHost } from "../../../packages/core/src/record/ssrf.ts";
import { analyzeRecording, hostOf } from "../../../packages/core/src/record/insights.ts";
import type { TraceEvent } from "../../../packages/core/src/capture/recorder.ts";
import { configuredSttProviders } from "../../../packages/core/src/record/stt.ts";
import { loadPlugins } from "../../../packages/core/src/plugins.ts";
import { checkForUpdate } from "../../../packages/core/src/ops/updates.ts";
import { alarmState, queueAlarmMs, startQueueMonitor } from "../../../packages/core/src/ops/queue-monitor.ts";
import { importLegacySchedules, newSchedule, startScheduler } from "../../../packages/core/src/schedules.ts";

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dashboard", "dist", "index.html");
const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".wav": "audio/wav",
  ".vtt": "text/vtt; charset=utf-8",
  ".json": "application/json",
};

function dashboardHtml(path = DIST): string {
  if (!existsSync(path)) throw new Error("Dashboard not built. Run: npm run ui:build");
  return readFileSync(path, "utf8");
}

export interface ServeOptions {
  root?: string;
  /** Interface to bind; 127.0.0.1 unless LAB_HOST says otherwise. */
  host?: string;
  /** Public origin used for canonical URLs, sitemaps and OAuth redirects. */
  siteUrl?: string;
  /** Require a signed-in account to use the dashboard (default on; LAB_AUTH=off disables). */
  requireAuth?: boolean;
  /** Don't keep the process alive just for this server (tests). */
  unref?: boolean;
  /** Accounts, sessions, queue and recordings index (default: from the environment). */
  store?: Store;
  media?: MediaStore;
  /**
   * Run a queue worker inside this process (default on; LAB_WORKER=off for a web-only service
   * when separate `lab worker` processes do the work).
   */
  worker?: boolean;
  /** Set when nothing will ever take jobs off the queue: recordings and runs are refused with this. */
  jobsUnavailable?: string;
  /** The built dashboard (default: apps/desktop/dashboard/dist/index.html). */
  dashboardHtml?: string;
  /**
   * Running inside the desktop app: Google sign-in goes through the system browser, and pages the
   * system browser lands on (email links) explain themselves instead of starting a session there.
   */
  desktop?: boolean;
  /** How the desktop server opens a URL in the system browser (tests pass a stub). */
  openExternal?: (url: string) => void;
}

/** The request handler and what it owns, without a listening socket (a serverless function). */
export interface App {
  handler: (req: IncomingMessage, res: ServerResponse) => void;
  store: Store;
  media: MediaStore;
  worker: Worker | null;
  auth: string;
  requireAuth: boolean;
  /** Refuse new jobs and fail readiness: the process is shutting down. */
  drain(): void;
}

export interface Running {
  url: string;
  store: Store;
  /** Stop accepting requests, let in-flight work finish (or hand it back to the queue), close. */
  close(graceMs?: number): Promise<void>;
}

/** Per-user limits on expensive work (shared across instances through the store). */
const LIMITS = {
  activeJobsPerUser: Number(process.env.LAB_MAX_ACTIVE_JOBS ?? 1),
  recordingsPerDay: Number(process.env.LAB_RECORDINGS_PER_DAY ?? 20),
  runsPerDay: Number(process.env.LAB_RUNS_PER_DAY ?? 100),
};

/**
 * The web server: the public landing page and crawler files at /, accounts under /auth, and the
 * dashboard at /app. Expensive work (recordings, lab runs) goes on the job queue: the request
 * returns 202 with a job id at once and the browser polls /api/jobs/:id, so nothing depends on a
 * request staying open for minutes behind a load balancer.
 */
/** What a credential is for, so the panel groups them instead of running one long list. */
export type CredentialGroup = "Model" | "Voice" | "Storage";

export const CREDENTIAL_KEYS: { env: string; label: string; group: CredentialGroup }[] = [
  { env: "ANTHROPIC_API_KEY", label: "Anthropic API key", group: "Model" },
  { env: "OPENAI_API_KEY", label: "OpenAI API key", group: "Model" },
  { env: "OPENROUTER_API_KEY", label: "OpenRouter API key", group: "Model" },
  { env: "AI_GATEWAY_API_KEY", label: "Vercel AI Gateway key", group: "Model" },
  { env: "GEMINI_API_KEY", label: "Google Gemini API key", group: "Model" },
  { env: "GOOGLE_API_KEY", label: "Google API key (alt)", group: "Model" },
  { env: "GROQ_API_KEY", label: "Groq API key", group: "Model" },
  { env: "MISTRAL_API_KEY", label: "Mistral API key", group: "Model" },
  { env: "DEEPSEEK_API_KEY", label: "DeepSeek API key", group: "Model" },
  { env: "HF_TOKEN", label: "Hugging Face token", group: "Model" },
  { env: "XAI_API_KEY", label: "xAI API key", group: "Model" },
  { env: "TOGETHER_API_KEY", label: "Together AI API key", group: "Model" },
  { env: "FIREWORKS_API_KEY", label: "Fireworks API key", group: "Model" },
  { env: "CEREBRAS_API_KEY", label: "Cerebras API key", group: "Model" },
  { env: "OLLAMA_API_KEY", label: "Ollama API key (local models)", group: "Model" },
  { env: "SARVAM_API_KEY", label: "Sarvam API key", group: "Voice" },
  { env: "BHASHINI_API_KEY", label: "Bhashini API key", group: "Voice" },
  { env: "BHASHINI_USER_ID", label: "Bhashini user id", group: "Voice" },
  { env: "ELEVENLABS_API_KEY", label: "ElevenLabs API key", group: "Voice" },
  { env: "GOOGLE_TTS_API_KEY", label: "Google Cloud TTS API key", group: "Voice" },
  { env: "AZURE_TTS_KEY", label: "Azure TTS key", group: "Voice" },
  { env: "AZURE_TTS_REGION", label: "Azure TTS region", group: "Voice" },
  { env: "AWS_ACCESS_KEY_ID", label: "AWS access key id (Polly and S3)", group: "Voice" },
  { env: "AWS_SECRET_ACCESS_KEY", label: "AWS secret access key (Polly and S3)", group: "Voice" },
  { env: "AWS_SESSION_TOKEN", label: "AWS session token (temporary keys only)", group: "Voice" },
  { env: "AWS_REGION", label: "AWS region (Polly)", group: "Voice" },
  { env: "MEDIA_S3_BUCKET", label: "Media bucket (S3 storage)", group: "Storage" },
  { env: "MEDIA_S3_REGION", label: "Media region (S3 storage)", group: "Storage" },
  { env: "MURF_API_KEY", label: "Murf API key", group: "Voice" },
  { env: "REVERIE_API_KEY", label: "Reverie API key", group: "Voice" },
  { env: "REVERIE_APP_ID", label: "Reverie app id", group: "Voice" },
  { env: "LAB_TTS_API_KEY", label: "Custom TTS API key", group: "Voice" },
  { env: "LAB_TTS_ENDPOINT", label: "Custom TTS endpoint", group: "Voice" },
  { env: "LAB_STT_BASE_URL", label: "Custom speech-to-text base URL", group: "Voice" },
  { env: "LAB_STT_API_KEY", label: "Custom speech-to-text API key", group: "Voice" },
  { env: "LAB_CUSTOM_API_KEY", label: "Custom LLM API key", group: "Model" },
  { env: "LAB_CUSTOM_BASE_URL", label: "Custom LLM base URL", group: "Model" },
];

/**
 * Names the same credential goes by.
 *
 * A provider reads one name; people paste the key under another. A key saved as
 * GOOGLE_CLOUD_API_KEY worked while the Settings row for it said "not set", and the Google voice
 * picker showed the provider as unconfigured while the recording spoke with it perfectly well.
 * Saving a credential therefore writes every name in its group, and clearing it clears them all.
 */
export const CREDENTIAL_ALIASES: Record<string, string[]> = {
  AI_GATEWAY_API_KEY: ["VERCEL_OIDC_TOKEN"],
  HF_TOKEN: ["HUGGINGFACE_HUB_TOKEN"],
  BHASHINI_API_KEY: ["ULCA_API_KEY"],
  BHASHINI_USER_ID: ["ULCA_USER_ID"],
  GOOGLE_TTS_API_KEY: ["GOOGLE_CLOUD_API_KEY"],
  AZURE_TTS_KEY: ["AZURE_SPEECH_KEY"],
  AZURE_TTS_REGION: ["AZURE_SPEECH_REGION"],
  ANTHROPIC_API_KEY: ["ANTHROPIC_AUTH_TOKEN"],
};

/** Every name a credential is known by: its own, plus the aliases it answers to. */
function credentialNames(env: string): string[] {
  return [env, ...(CREDENTIAL_ALIASES[env] ?? [])];
}

/** Whether a credential is set, under any of the names it is known by. */
export function credentialSet(env: string): boolean {
  return credentialNames(env).some((name) => Boolean(process.env[name]));
}

/**
 * The providers the person themselves connected, which live on their account rather than in the
 * server's environment.
 *
 * The capabilities payload said "no providers" to someone who had signed in to OpenRouter, so
 * the app quietly fell back to the scripted model and told them their key was missing. The key
 * is theirs and it works; it just is not in this process's environment.
 */
function connectedProviders(user: { openrouterKey?: string; chatgpt?: { refreshToken?: string } } | null): string[] {
  const out: string[] = [];
  if (user?.openrouterKey) out.push("openrouter");
  if (user?.chatgpt?.refreshToken) out.push("chatgpt");
  return out;
}

/** Every narration provider the dashboard may select, local ones first. */
const TTS_PROVIDERS = ["flite", "none", "elevenlabs", "openai", "google", "azure", "awspolly", "sarvam", "bhashini", "murf", "reverie", "custom", "custom-voice"] as const;

const TTS_PROVIDER_LABEL: Record<string, string> = {
  flite: "Basic offline voice (robotic, works offline)",
  none: "No voice (captions only)",
  sarvam: "Sarvam (Indian)",
  bhashini: "Bhashini (Indian, govt)",
  custom: "Custom / Maya",
  "custom-voice": "Custom voice (uploaded sample)",
  ...Object.fromEntries(["elevenlabs", "openai", "google", "azure", "awspolly", "murf", "reverie"].map((p) => [p, providerLabel(p)])),
};

function credentialsPath(root: string): string {
  return join(root, ".walkcast-credentials.json");
}

/**
 * Read the saved credentials into this process's environment.
 *
 * Exported because a worker that runs on its own (the web service with LAB_WORKER=off) never
 * calls createApp, and so never saw the keys the person saved in Settings: the recording came
 * out with no voice, and the run said the provider was unconfigured. The file is the one the
 * Settings panel writes; the worker reads the same one.
 */
export function applyCredentialsFile(root: string): void {
  const p = credentialsPath(root);
  if (!existsSync(p)) return;
  try {
    const data = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === "string" && CREDENTIAL_KEYS.some((c) => c.env === k)) setCredential(k, v);
    }
  } catch { /* ignore */ }
}

/**
 * A key as people paste it: copied with its quotes from a .env file, with "Bearer " from a curl
 * example, or with a trailing newline. Providers reject all of those, and the key then looked
 * saved but never worked.
 */
export function cleanCredential(value: string): string {
  let v = value.trim();
  const quoted = /^(["'`])([\s\S]*)\1$/.exec(v);
  if (quoted) v = quoted[2]!.trim();
  return v.replace(/^Bearer\s+/i, "").trim();
}

/**
 * Put a credential into the environment under every name it is known by.
 *
 * The Anthropic pair is the awkward one: ANTHROPIC_API_KEY and ANTHROPIC_AUTH_TOKEN are two
 * different ways to authenticate, and a request carrying both is rejected. So the two are
 * mutually exclusive — setting one clears the other — while every other alias is the same key
 * under a second name, and gets the same value.
 */
function setCredential(env: string, value: string): void {
  const names = credentialNames(env);
  process.env[env] = value;
  for (const name of names.slice(1)) {
    if (env === "ANTHROPIC_API_KEY" && name === "ANTHROPIC_AUTH_TOKEN") delete process.env[name];
    else process.env[name] = value;
  }
}

/** Remove a credential, under every name it is known by. */
function clearCredential(env: string): void {
  for (const name of credentialNames(env)) delete process.env[name];
}

function saveCredential(root: string, env: string, value: string): void {
  const p = credentialsPath(root);
  let data: Record<string, string> = {};
  if (existsSync(p)) try { data = JSON.parse(readFileSync(p, "utf8")) as Record<string, string>; } catch { data = {}; }
  if (value) data[env] = value; else delete data[env];
  // The file holds the keys in plain text, so it is readable by its owner only.
  writeFileSync(p, JSON.stringify(data, null, 2), { mode: 0o600 });
  try {
    chmodSync(p, 0o600);
  } catch {
    /* a filesystem without POSIX permissions (Windows) has nothing to tighten */
  }
  if (value) setCredential(env, value); else clearCredential(env);
  // Capabilities depend on which credentials are set; drop cached responses, and voice samples
  // spoken with the old key.
  capabilitiesCache.clear();
  clearVoicePreviews();
}

/** The narration provider each voice credential belongs to (OpenAI's key is checked as a model key). */
const TTS_FOR_KEY: Record<string, string> = {
  ELEVENLABS_API_KEY: "elevenlabs", GOOGLE_TTS_API_KEY: "google", AZURE_TTS_KEY: "azure", AZURE_TTS_REGION: "azure",
  AWS_ACCESS_KEY_ID: "awspolly", AWS_SECRET_ACCESS_KEY: "awspolly", AWS_SESSION_TOKEN: "awspolly", AWS_REGION: "awspolly",
  SARVAM_API_KEY: "sarvam", BHASHINI_API_KEY: "bhashini", BHASHINI_USER_ID: "bhashini", MURF_API_KEY: "murf",
  REVERIE_API_KEY: "reverie", REVERIE_APP_ID: "reverie", LAB_TTS_API_KEY: "custom", LAB_TTS_ENDPOINT: "custom",
};

/**
 * Ask the provider whether a saved key works: list models for a model key (free), speak one short
 * sample for a voice key. "Saved" only ever meant "present"; a mistyped key used to surface minutes
 * into a recording or a run.
 */
async function testCredential(env: string): Promise<{ ok: boolean; message: string }> {
  const llm = Object.values(PROVIDERS).find((p) => p.apiKeyEnv.includes(env) || (p.id === "custom" && env === "LAB_CUSTOM_BASE_URL"));
  if (llm && llm.kind !== "chatgpt-responses") {
    const key = apiKey(llm);
    if (!key && !llm.keyOptional) return { ok: false, message: `No ${env} saved.` };
    const url = llm.kind === "anthropic" ? `${(process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com").replace(/\/$/, "")}/v1/models` : `${(baseURL(llm) ?? "").replace(/\/$/, "")}/models`;
    if (!/^https?:\/\//.test(url)) return { ok: false, message: `${llm.label} has no base URL set.` };
    const headers: Record<string, string> = llm.kind === "anthropic" ? { "x-api-key": key ?? "", "anthropic-version": "2023-06-01" } : key ? { authorization: `Bearer ${key}` } : {};
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
      if (res.ok) return { ok: true, message: `${llm.label} accepted the key.` };
      const body = await res.text().catch(() => "");
      const why = /"message"\s*:\s*"([^"]{1,200})"/.exec(body)?.[1] ?? body.slice(0, 200);
      return { ok: false, message: `${llm.label} refused the key (${res.status})${why ? `: ${why}` : "."}` };
    } catch (e) {
      return { ok: false, message: `Couldn't reach ${llm.label}: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  const tts = TTS_FOR_KEY[env];
  if (tts) {
    if (!configuredCloudProviders().includes(tts)) return { ok: false, message: `${providerLabel(tts)} needs ${credentialFor(tts)}; something is still missing.` };
    try {
      await cloudVoicePreview(tts);
      return { ok: true, message: `${providerLabel(tts)} spoke a test line with this key.` };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }
  return { ok: credentialSet(env), message: credentialSet(env) ? "Saved. This one can't be tested from here." : `No ${env} saved.` };
}

export async function serveDashboard(port: number, options: ServeOptions | string = {}): Promise<Running> {
  const o = typeof options === "string" ? { root: options } : options;
  await loadPlugins(o.root ?? process.cwd());
  const host = o.host ?? process.env.LAB_HOST ?? "127.0.0.1";
  const app = createApp({ ...o, host, siteUrl: o.siteUrl ?? process.env.LAB_SITE_URL ?? `http://127.0.0.1:${port}` });
  const { store, media, worker } = app;
  const server = createServer(app.handler);
  // Keep-alive longer than the ALB's idle timeout (60 s) so the balancer never reuses a closed socket.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 30_000;

  await new Promise<void>((r) => server.listen(port, host, r));
  if (o.unref) server.unref();
  const address = `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`;
  log.info("server.started", { url: address, store: store.kind, media: media.kind, worker: Boolean(worker), auth: app.requireAuth ? app.auth : "off" });
  return {
    url: address,
    store,
    async close(graceMs = 30_000) {
      app.drain();
      // Stop accepting; idle keep-alive sockets close now, active requests finish.
      const closed = new Promise<void>((r) => server.close(() => r()));
      server.closeIdleConnections();
      await worker?.stop(graceMs);
      await withTimeout(closed, 10_000).catch(() => server.closeAllConnections());
      if (!o.store) await store.close();
      log.info("server.stopped", {});
    },
  };
}

/**
 * Everything `serveDashboard` serves, as a plain `(req, res)` handler: the dashboard at /app, its
 * API, sign-in, and the recordings on disk. The marketing site is a separate static build.
 */
export function createApp(o: ServeOptions = {}): App {
  const root = o.root ?? process.cwd();
  applyCredentialsFile(root);
  const host = o.host ?? process.env.LAB_HOST ?? "127.0.0.1";
  const siteUrl = (o.siteUrl ?? process.env.LAB_SITE_URL ?? "http://127.0.0.1:4320").replace(/\/$/, "");
  const requireAuth = o.requireAuth ?? process.env.LAB_AUTH !== "off";
  // Credentials are a single process-global set (they land in process.env, so they are used by
  // every tenant). There is no admin/operator concept, so "is there a session" was the only gate:
  // any self-registered user could repoint LAB_CUSTOM_BASE_URL at their own host, exfiltrating
  // page content from everyone's runs, or delete the operator's keys. Fail closed — writing them
  // is refused whenever accounts exist unless an operator explicitly opts back in. Reading which
  // keys are set stays open; it exposes no values.
  // The desktop app is deliberately excluded: it runs one account on that person's own machine and
  // writes the keys to their own app-data directory, so Settings must keep working there even
  // though releases set WALKCAST_REQUIRE_ACCOUNTS=1. The restriction targets a *hosted* server
  // shared between accounts.
  const credentialsEditable = !requireAuth || Boolean(o.desktop) || process.env.LAB_CREDENTIALS_EDITABLE === "1";
  const store = o.store ?? createStore(root);
  const media = o.media ?? createMedia(root);
  const data = new LabData(root);
  // Supabase Auth when SUPABASE_URL + SUPABASE_ANON_KEY are set; otherwise built-in accounts.
  const forceLocal = process.env.LAB_AUTH === "local" || process.env.LAB_AUTH === "off";
  const supabaseCfg = forceLocal ? null : supabaseAuthConfig();
  const auth: Auth | SupabaseAuth = supabaseCfg ? new SupabaseAuth(store, siteUrl, supabaseCfg) : new Auth(store, siteUrl);
  const authOptions = async () =>
    auth.kind === "supabase"
      ? // Desktop: a reset link opens in the system browser, which can't hand the reset back to the app.
        // OpenRouter and ChatGPT sign-in exist only in the local auth mode.
        { ...(await auth.options()), openrouter: false, chatgpt: false, ...(o.desktop ? { forgot: false } : {}) }
      : { google: Boolean(auth.google), openrouter: true, chatgpt: true, forgot: false, confirmEmail: false, signupDisabled: false };
  const html = dashboardHtml(o.dashboardHtml);
  const exposed = !["127.0.0.1", "localhost", "::1"].includes(host);
  const allowLiveRuns = !exposed || process.env.LAB_ALLOW_LIVE_RUNS === "1";
  const worker = (o.worker ?? process.env.LAB_WORKER !== "off") ? new Worker({ store, media, root }).start() : null;
  // Both run on every instance: the store hands each due schedule and each delivery to exactly
  // one of them. Private targets are refused whenever the server is reachable from elsewhere.
  const blockPrivate = exposed && process.env.LAB_ALLOW_PRIVATE !== "1";
  void Promise.all([importLegacySchedules(root, store), importLegacyWebhooks(root, store)]).catch((e: unknown) => log.warn("legacy.import_failed", { error: String(e) }));
  const webhookDispatcher = startWebhookDispatcher(store, { blockPrivate });
  const scheduler = startScheduler(store, { blockPrivate, onEnqueued: () => worker?.poke() });
  const queueMonitor = startQueueMonitor(store);

  let draining = false;

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    const started = Date.now();
    // Behind an ALB the trace id ties our log line to the load balancer's.
    const requestId = String(req.headers["x-amzn-trace-id"] ?? req.headers["x-request-id"] ?? randomUUID());
    res.setHeader("X-Request-Id", requestId);
    res.on("finish", () => {
      const path = (req.url ?? "/").split("?")[0];
      if (path === "/healthz") return;
      log.info("http", { id: requestId, method: req.method, path, status: res.statusCode, ms: Date.now() - started });
    });
    handle(req, res).catch((error: unknown) => {
      const status = error instanceof AuthError ? error.status : 500;
      if (status >= 500) log.error("http.error", { id: requestId, error: error instanceof Error ? (error.stack ?? error.message) : String(error) });
      if (res.headersSent) return void res.end();
      // Internal details stay in the log; the client gets the request id to quote.
      const message = status >= 500 ? `Something went wrong (request ${requestId}).` : error instanceof Error ? error.message : String(error);
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ error: message }));
    });
  };

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    const json = (status: number, value: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(value));
    };
    // HTTPS + security headers, only when this deployment is served over TLS. Local http dev is
    // left alone: HSTS on a plain-http host strands the browser.
    const secure = siteUrl.startsWith("https://");
    const securityHeaders: Record<string, string> = {
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "SAMEORIGIN",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      ...(secure ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" } : {}),
    };
    const send = (status: number, type: string, body: string, cache = "no-cache") => {
      res.writeHead(status, { "Content-Type": type, "Cache-Control": cache, ...securityHeaders });
      res.end(body);
    };
    const redirect = (location: string) => {
      res.writeHead(302, { Location: location, ...securityHeaders });
      res.end();
    };

    // Canonical host + scheme: one URL per page, https, no trailing-slash duplicates.
    if (secure && req.headers["x-forwarded-proto"] === "http") {
      return redirect(`${siteUrl}${url.pathname}${url.search}`);
    }
    if ((req.method === "GET" || req.method === "HEAD") && url.pathname !== "/" && url.pathname.endsWith("/") && !url.pathname.startsWith("/app")) {
      return redirect(`${url.pathname.replace(/\/+$/, "")}${url.search}`);
    }

    // ---------------------------------------------------------------- health
    // Liveness: the process answers. Readiness: it can reach its database and isn't shutting down.
    if (url.pathname === "/healthz") {
      // Public liveness, readable cross-origin so the mobile companion can check an address
      // before opening it. Carries nothing but { ok: true }.
      res.setHeader("Access-Control-Allow-Origin", "*");
      return json(200, { ok: true });
    }
    if (url.pathname === "/readyz") {
      if (draining) return json(503, { ok: false, reason: "shutting down" });
      try {
        await withTimeout(store.ping(), 2000);
        return json(200, { ok: true, store: store.kind, media: media.kind, worker: worker ? (worker.busy ? "busy" : "idle") : "off" });
      } catch (e) {
        return json(503, { ok: false, reason: `store unreachable: ${e instanceof Error ? e.message : String(e)}` });
      }
    }

    // Cross-site state changes are refused (the session cookie is SameSite=Lax as a second line).
    // This has to cover every mutating verb: DELETE /api/credentials and friends were unprotected
    // because only POST was checked.
    if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH" || req.method === "DELETE") {
      const origin = req.headers.origin;
      let sameSite = true;
      try {
        sameSite = !origin || new URL(origin).host === req.headers.host;
      } catch {
        sameSite = false;
      }
      if (!sameSite) return json(403, { error: "Cross-site request refused." });
    }
    const user = await auth.user(req);

    // ---------------------------------------------------------------- app shell
    if (url.pathname === "/" && (req.method === "GET" || req.method === "HEAD")) return redirect("/app");
    if (url.pathname === "/favicon.svg" || url.pathname === "/favicon.ico") return send(200, "image/svg+xml", FAVICON, "max-age=86400");
    if (url.pathname === "/manifest.webmanifest" || url.pathname === "/manifest.json") return send(200, "application/manifest+json; charset=utf-8", webManifest({ siteUrl }), "max-age=3600");
    if (url.pathname === "/sw.js") return send(200, "application/javascript; charset=utf-8", SERVICE_WORKER, "no-cache");
    if (url.pathname.startsWith("/assets/")) {
      const font = fontPath(url.pathname.slice("/assets/".length));
      if (!font) return json(404, { error: "not found" });
      return streamFile(req, res, font, "font/woff2", "public, max-age=86400");
    }
    if (url.pathname === "/signup" || url.pathname === "/login" || url.pathname === "/forgot" || url.pathname === "/reset") {
      const mode = url.pathname.slice(1) as "signup" | "login" | "forgot" | "reset";
      if ((mode === "forgot" || mode === "reset") && auth.kind !== "supabase") return send(404, "text/plain; charset=utf-8", "Password reset needs Supabase Auth on this server.");
      const target = url.searchParams.get("url");
      const next = safeNext(url.searchParams.get("next") ?? (target ? `/app#record?url=${encodeURIComponent(target)}` : null));
      if (user && mode !== "reset") return redirect(next);
      const opts = await authOptions();
      const notice = url.searchParams.get("notice") ?? undefined;
      return send(
        200,
        "text/html; charset=utf-8",
        authPage(mode, { skip: Boolean(o.desktop) && !requireAuth, google: opts.google, openrouter: opts.openrouter, chatgpt: opts.chatgpt, forgot: opts.forgot, provider: auth.kind, next, ...(target ? { url: target } : {}), ...(notice ? { notice: notice.slice(0, 300) } : {}) }),
      );
    }

    // ---------------------------------------------------------------- accounts
    if (url.pathname === "/auth/signup" && req.method === "POST") {
      const b = await readJson(req);
      const next = safeNext(typeof b.next === "string" ? b.next : null);
      const name = typeof b.name === "string" ? b.name : undefined;
      if (auth.kind === "supabase") {
        const r = await auth.signUp(res, String(b.email ?? ""), String(b.password ?? ""), name, clientIp(req), next);
        // The confirmation link necessarily opens in the mail client's browser, which does not share this
        // app's cookies, so telling the user to open it "in this browser" sent them to a dead-end
        // 400 page. The address is confirmed by opening it anywhere; they then sign in here.
        if ("confirmEmail" in r) return json(200, { message: "Check your email: we sent you a link to confirm your address. Open the link in your normal browser, then sign in here with your email and password." });
        await auth.startSession(res, r.user);
        return json(201, { user: publicUser(r.user), next });
      }
      const created = await auth.signUp(String(b.email ?? ""), String(b.password ?? ""), name, clientIp(req));
      await auth.startSession(res, created);
      return json(201, { user: publicUser(created), next });
    }
    if (url.pathname === "/auth/login" && req.method === "POST") {
      const b = await readJson(req);
      const found = await auth.signIn(String(b.email ?? ""), String(b.password ?? ""), clientIp(req));
      await auth.startSession(res, found);
      return json(200, { user: publicUser(found), next: safeNext(typeof b.next === "string" ? b.next : null) });
    }
    if (url.pathname === "/auth/forgot" && req.method === "POST" && auth.kind === "supabase") {
      const b = await readJson(req);
      await auth.forgot(res, String(b.email ?? ""), clientIp(req));
      return json(200, { message: "If an account exists for that address, we've emailed a link to reset the password. Open it in this browser." });
    }
    if (url.pathname === "/auth/reset" && req.method === "POST" && auth.kind === "supabase") {
      const b = await readJson(req);
      const updated = await auth.resetPassword(req, res, String(b.password ?? ""));
      await auth.startSession(res, updated);
      return json(200, { user: publicUser(updated), next: "/app#record" });
    }
    if (url.pathname === "/auth/logout" && req.method === "POST") {
      // POST only. As a GET this was a cross-site request forgery: any page could sign the user
      // out with an <img src=".../auth/logout">, and SameSite=Lax does not help because a
      // top-level navigation is exactly the case that still sends the cookie.
      await auth.endSession(req, res);
      return redirect("/");
    }
    if (url.pathname === "/auth/google") {
      if (auth.kind === "supabase" && !(await auth.options()).google) throw new AuthError(503, "Google sign-in isn't turned on in this Supabase project.");
      if (o.desktop && auth.kind === "supabase") {
        const flow = auth.desktopGoogleStart(url.searchParams.get("next") ?? "/app#record");
        (o.openExternal ?? openExternal)(flow.url);
        if (flow.mode === "link") {
          // Nothing is listening on this tab: the browser is about to be handed to the OS, which
          // opens Walkcast with the code. Tell the user what to expect instead of showing the
          // loopback "waiting" page, which would never finish.
          return send(200, "text/html; charset=utf-8", messagePage("Check Walkcast", "Sign-in continues in the Walkcast window. You can close this tab.", { ok: true }));
        }
        return send(200, "text/html; charset=utf-8", continueInBrowserPage(flow.state, flow.url));
      }
      return auth.googleRedirect(res, url.searchParams.get("next") ?? "/app#record");
    }
    if (url.pathname === "/auth/openrouter") {
      if (auth.kind !== "local") throw new AuthError(503, "OpenRouter sign-in requires the local auth mode (not Supabase).");
      return auth.openrouterRedirect(res, url.searchParams.get("next") ?? "/app#record");
    }
    if (url.pathname === "/auth/chatgpt") {
      if (auth.kind !== "local") throw new AuthError(503, "ChatGPT sign-in requires the local auth mode (not Supabase).");
      return auth.chatgptRedirect(res, url.searchParams.get("next") ?? "/app#record");
    }
    // Supabase Auth sends the browser back here after Google, an email confirmation or a reset link.
    // ---------------------------------------------------------------- desktop sign-in via the system browser
    const desktopCallback = /^\/auth\/desktop\/callback\/([\w-]{20,64})$/.exec(url.pathname);
    if (desktopCallback && o.desktop && auth.kind === "supabase") {
      try {
        await auth.desktopCallback(desktopCallback[1]!, url);
        return send(200, "text/html; charset=utf-8", messagePage("You're signed in", "Go back to Walkcast: it has carried on without you. You can close this tab.", { ok: true }));
      } catch (e) {
        if (!(e instanceof AuthError)) throw e;
        return send(400, "text/html; charset=utf-8", messagePage("Sign-in didn't finish", `${e.message} Go back to Walkcast to try again.`, { ok: false }));
      }
    }
    const desktopPoll = /^\/auth\/desktop\/poll\/([\w-]{20,64})$/.exec(url.pathname);
    if (desktopPoll && req.method === "POST" && o.desktop && auth.kind === "supabase") {
      const claim = auth.desktopClaim(desktopPoll[1]!);
      if (!claim) return json(404, { error: "This sign-in has expired. Start again." });
      if ("pending" in claim) return json(202, { pending: true });
      if ("error" in claim) return json(400, { error: claim.error });
      await auth.startSession(res, claim.user);
      return json(200, { next: safeNext(claim.next) });
    }
    // The walkcast:// return, delivered by the OS to the app window. Same-origin, so the session
    // cookie this sets is one the app already sends.
    if (url.pathname === "/auth/desktop/exchange" && req.method === "POST" && o.desktop && auth.kind === "supabase") {
      const b = await readJson(req);
      const state = String(b.state ?? "");
      const code = String(b.code ?? "");
      if (!/^[\w-]{20,64}$/.test(state) || !code) return json(400, { error: "That sign-in link is incomplete." });
      try {
        const r = await auth.desktopDeepLinkCallback(state, code);
        await auth.startSession(res, r.user);
        return json(200, { next: safeNext(r.next) });
      } catch (e) {
        if (!(e instanceof AuthError)) throw e;
        return json(400, { error: e.message });
      }
    }
    if (url.pathname === "/auth/callback" && auth.kind === "supabase") {
      try {
        const r = await auth.callback(req, res, url);
        if ("recovery" in r) return redirect("/reset");
        await auth.startSession(res, r.user);
        return redirect(safeNext(r.next));
      } catch (e) {
        if (!(e instanceof AuthError)) throw e;
        // Desktop: email links open in the system browser, not the app; say what to do next there.
        if (o.desktop) return send(400, "text/html; charset=utf-8", messagePage("Back to Walkcast", `${e.message} Do that in the Walkcast app.`, { ok: true }));
        return redirect(`/login?notice=${encodeURIComponent(e.message)}`);
      }
    }
    if (url.pathname === "/auth/google/callback" && auth.kind === "local") {
      try {
        const { user: signedIn, next } = await auth.googleCallback(req, url);
        await auth.startSession(res, signedIn);
        return redirect(safeNext(next));
      } catch (e) {
        if (res.headersSent) return void res.end();
        return send(e instanceof AuthError ? e.status : 500, "text/plain; charset=utf-8", e instanceof Error ? e.message : String(e));
      }
    }
    if (url.pathname === "/auth/openrouter/callback" && auth.kind === "local") {
      try {
        const { user: signedIn, next } = await auth.openrouterCallback(req, url);
        await auth.startSession(res, signedIn);
        return redirect(safeNext(next));
      } catch (e) {
        if (res.headersSent) return void res.end();
        return send(e instanceof AuthError ? e.status : 500, "text/plain; charset=utf-8", e instanceof Error ? e.message : String(e));
      }
    }
    if (url.pathname === "/auth/chatgpt/callback" && auth.kind === "local") {
      try {
        const { user: signedIn, next } = await auth.chatgptCallback(req, url);
        await auth.startSession(res, signedIn);
        return redirect(safeNext(next));
      } catch (e) {
        if (res.headersSent) return void res.end();
        return send(e instanceof AuthError ? e.status : 500, "text/plain; charset=utf-8", e instanceof Error ? e.message : String(e));
      }
    }
    if (url.pathname === "/api/me") return json(200, { user: publicUser(user), google: (await authOptions()).google, openrouter: (await authOptions()).openrouter, chatgpt: (await authOptions()).chatgpt, provider: auth.kind, authRequired: requireAuth });

    // Everything below is the dashboard: its data (recordings of signed-in pages, traces) and its
    // actions need an account when accounts are on.
    if (requireAuth && !user && (url.pathname.startsWith("/api/") || url.pathname.startsWith("/files/"))) {
      return json(401, { error: "Sign in to use the dashboard.", signIn: `/login?next=${encodeURIComponent("/app")}` });
    }
    // A recording is visible to the account that made it; ones made from the CLI (no owner) only
    // on a server that isn't reachable from other machines.
    const canSee = (owner: string | null | undefined) => (owner ? !requireAuth || owner === user?.id : !exposed);
    const owner = user?.id ?? null;

    // ---------------------------------------------------------------- dashboard API
    if (url.pathname === "/api/index") {
      const limit = clampInt(url.searchParams.get("limit"), 1, 2000, 500);
      const index = data.index(limit);
      const scope = requireAuth ? (user?.id ?? "-") : null;
      const failed = await Promise.all([store.failedJobs(scope, "record", 200), store.failedJobs(scope, "run", 200)]).then((l) => l.flat(), () => []);
      return json(200, { ...index, recordings: (await listRecordings(user)).filter((r) => canSee(r.owner)), failedRecordings: failed.filter((j) => canSee(j.owner)).length });
    }
    // Recordings that failed, for the Lab: the job's error and last stage, plus the report and
    // evidence (screenshot, partial video, pages reached) the worker kept when it could.
    if (url.pathname === "/api/failures" && req.method === "GET") {
      const scope = requireAuth ? (user?.id ?? "-") : null;
      const [jobs, runs] = await Promise.all([store.failedJobs(scope, "record", 200), store.failedJobs(scope, "run", 200)]);
      return json(200, { failures: jobs.filter((j) => canSee(j.owner)).map((j) => failureFor(j)), runs: runs.filter((j) => canSee(j.owner)).map((j) => runFailureFor(j)) });
    }
    const failureFile = /^\/api\/failures\/([0-9a-f-]{36})\/(failure\.png|video\.webm)$/i.exec(url.pathname);
    if (failureFile && (req.method === "GET" || req.method === "HEAD")) {
      const [, id, file] = failureFile as unknown as [string, string, string];
      const job = await store.job(id);
      if (!job || job.kind !== "record" || !canSee(job.owner)) return json(404, { error: "not found" });
      const abs = join(failureDir(root, id), file);
      if (!existsSync(abs)) return json(404, { error: "not found" });
      return streamFile(req, res, abs, TYPES[extname(file).toLowerCase()] ?? "application/octet-stream", "private, max-age=3600");
    }
    // The recording browser's first-run download (desktop app); "unmanaged" everywhere else.
    if (url.pathname === "/api/browser" && (req.method === "GET" || req.method === "HEAD")) return json(200, browserSetup());
    if (url.pathname === "/api/browser/install" && req.method === "POST") {
      if (browserSetup().state === "unmanaged") return json(409, { error: "This server does not manage its browser." });
      return json(202, installChromium());
    }
    if (url.pathname === "/api/capabilities") {
      const cacheKey = user?.id ?? "__anon__";
      const cached = capabilitiesCache.get(cacheKey);
      if (cached && Date.now() - cached.at < CAPABILITIES_TTL_MS) {
        // LRU touch: re-insert so recently used entries survive eviction.
        capabilitiesCache.delete(cacheKey);
        capabilitiesCache.set(cacheKey, cached);
        return json(200, cached.payload);
      }
      const payload = {
        live: true,
        running: worker?.busy ? "a job" : null,
        queue: await store.queueDepth().catch(() => null),
        user: publicUser(user),
        authRequired: requireAuth,
        stagehand: findChrome() !== null,
        liveModels: allowLiveRuns,
        providers: [...new Set([...configuredProviders().map((p) => p.id), ...connectedProviders(user)])],
        sttProviders: configuredSttProviders(),
        demoSite: demoSiteEnabled(exposed),
        agents: allAgents().map((a) => ({ id: a.id, kind: a.kind, description: a.description, exposure: agentExposure(a), dailyLimit: agentDailyLimit(a) })),
        scenarios: allScenarios("pairs"),
        limits: LIMITS,
        usage: { recordingsToday: (await listRecordings(user)).filter((r) => canSee(r.owner) && Date.now() - Date.parse(r.createdAt) < 86_400_000).length },
        voices: { available: canNarrate(), list: VOICES, editable: media.kind === "local" },
        tts: { providers: TTS_PROVIDERS, configured: configuredCloudProviders() },
        jobsUnavailable: o.jobsUnavailable ?? null,
      };
      if (capabilitiesCache.size >= CAPABILITIES_CACHE_MAX) {
        const first = capabilitiesCache.keys().next().value;
        if (first) capabilitiesCache.delete(first);
      }
      capabilitiesCache.set(cacheKey, { payload, at: Date.now() });
      return json(200, payload);
    }
    // ---------------------------------------------------------------- credentials
    if (url.pathname === "/api/credentials" && req.method === "GET") {
      if (requireAuth && !user) return json(401, { error: "Sign in first." });
      return json(200, { editable: credentialsEditable, keys: CREDENTIAL_KEYS.map((k) => ({ env: k.env, label: k.label, group: k.group, set: credentialSet(k.env) })) });
    }
    if (url.pathname === "/api/credentials" && req.method === "POST") {
      if (requireAuth && !user) return json(401, { error: "Sign in first." });
      if (!credentialsEditable) return json(403, { error: "Server credentials are set by the operator of this server." });
      const b = await readJson(req);
      const env = String(b.env ?? "");
      const value = String(b.value ?? "");
      if (!CREDENTIAL_KEYS.some((k) => k.env === env)) return json(400, { error: "Unknown credential." });
      saveCredential(root, env, cleanCredential(value));
      return json(200, { ok: true, set: credentialSet(env) });
    }
    if (url.pathname === "/api/credentials/test" && req.method === "POST") {
      if (requireAuth && !user) return json(401, { error: "Sign in first." });
      const env = String((await readJson(req)).env ?? "");
      if (!CREDENTIAL_KEYS.some((k) => k.env === env)) return json(400, { error: "Unknown credential." });
      return json(200, await testCredential(env));
    }
    if (url.pathname === "/api/credentials" && req.method === "DELETE") {
      if (requireAuth && !user) return json(401, { error: "Sign in first." });
      if (!credentialsEditable) return json(403, { error: "Server credentials are set by the operator of this server." });
      const env = url.searchParams.get("env") ?? "";
      if (!CREDENTIAL_KEYS.some((k) => k.env === env)) return json(400, { error: "Unknown credential." });
      saveCredential(root, env, "");
      return json(200, { ok: true });
    }

    // ---------------------------------------------------------------- custom voice upload/list
    const voicesDir = join(root, "data", "voices");
    if (url.pathname === "/api/voices/custom" && req.method === "GET") {
      if (requireAuth && !user) return json(401, { error: "Sign in first." });
      if (!existsSync(voicesDir)) return json(200, { voices: [] });
      const files = readdirSync(voicesDir);
      const voices = files
        .filter((f) => /\.(wav|mp3|ogg|m4a)$/i.test(f))
        .map((f) => ({ id: basename(f, extname(f)), name: f, url: `/api/voices/custom/${basename(f, extname(f))}` }));
      return json(200, { voices });
    }
    if (url.pathname === "/api/voices/custom" && req.method === "POST") {
      if (requireAuth && !user) return json(401, { error: "Sign in first." });
      const tmp = await readBodyToTemp(req, 40_000_000, "voice");
      const nameHeader = String(req.headers["x-file-name"] ?? "");
      const ext = extname(nameHeader) || ".bin";
      const id = randomUUID();
      mkdirSync(voicesDir, { recursive: true });
      const dest = join(voicesDir, `${id}${ext}`);
      renameSync(tmp, dest);
      capabilitiesCache.clear();
      return json(201, { id, name: basename(dest), url: `/api/voices/custom/${id}` });
    }
    const customVoiceMatch = /^\/api\/voices\/custom\/([\w-]+)$/.exec(url.pathname);
    if (customVoiceMatch && (req.method === "GET" || req.method === "HEAD")) {
      if (requireAuth && !user) return json(401, { error: "Sign in first." });
      if (!existsSync(voicesDir)) return json(404, { error: "Not found." });
      const id = customVoiceMatch[1]!;
      const files = readdirSync(voicesDir).filter((f) => basename(f, extname(f)) === id);
      if (files.length === 0) return json(404, { error: "Not found." });
      const abs = join(voicesDir, files[0]!);
      const ct = TYPES[extname(abs).toLowerCase()] ?? "application/octet-stream";
      return void streamFile(req, res, abs, ct, "private, max-age=3600");
    }
    if (customVoiceMatch && req.method === "DELETE") {
      if (requireAuth && !user) return json(401, { error: "Sign in first." });
      if (!existsSync(voicesDir)) return json(404, { error: "Not found." });
      const id = customVoiceMatch[1]!;
      const files = readdirSync(voicesDir).filter((f) => basename(f, extname(f)) === id);
      for (const f of files) rmSync(join(voicesDir, f), { force: true });
      capabilitiesCache.clear();
      return json(200, { ok: true });
    }

    // ---------------------------------------------------------------- voice preview (cloud providers)
    // The voice catalog the TTS picker renders: each provider's voices, its default, and whether
    // the server holds credentials for it. Providers with no public list (Murf, custom) are typed in.
    if (url.pathname === "/api/voices" && req.method === "GET") {
      return json(200, {
        providers: TTS_PROVIDERS.map((p) => {
          const cloud = isCloudProvider(p);
          const voices = voicesFor(p);
          return {
            id: p,
            label: TTS_PROVIDER_LABEL[p] ?? p,
            cloud,
            /** A provider with credentials, so a choice here can actually speak. */
            configured: !cloud || configuredCloudProviders().includes(p),
            /** False when the provider's voice ids aren't a public list: the picker takes a text box. */
            hasList: voices.length > 0,
            defaultVoice: cloud ? defaultVoiceFor(p) : (p === "flite" ? VOICES[0] : ""),
            /** The language the default voice speaks, and whether the picker asks for one. */
            defaultLanguage: cloud ? defaultLanguageFor(p) : "",
            needsLanguage: cloud && needsLanguageInput(p),
            voices,
          };
        }),
      });
    }
    if (url.pathname === "/api/voices/preview" && (req.method === "GET" || req.method === "HEAD")) {
      const provider = (url.searchParams.get("provider") ?? "").trim();
      const voice = (url.searchParams.get("voice") ?? "").trim();
      const language = (url.searchParams.get("language") ?? "").trim().slice(0, 20);
      if (!provider) return json(400, { error: "provider is required." });
      try {
        const buf = await cloudVoicePreview(provider, voice, language || undefined);
        const ct = buf.length >= 4 && buf.toString("ascii", 0, 4) === "RIFF" ? "audio/wav"
          : buf.length >= 3 && buf.toString("ascii", 0, 3) === "ID3" ? "audio/mpeg"
          : buf.length >= 4 && buf.toString("ascii", 0, 4) === "OggS" ? "audio/ogg"
          : "audio/wav";
        res.writeHead(200, { "Content-Type": ct, "Content-Length": buf.length, "Cache-Control": "private, max-age=300" });
        return void res.end(buf);
      } catch (e) {
        return json(503, { error: e instanceof Error ? e.message : String(e) });
      }
    }
    // ---------------------------------------------------------------- narration
    const voiceMatch = /^\/api\/voices\/(\w+)\.wav$/.exec(url.pathname);
    if (voiceMatch) {
      if (!isVoice(voiceMatch[1])) return json(404, { error: "Unknown voice." });
      if (!canNarrate()) return json(503, { error: "Voice previews need ffmpeg, plus its flite voice or Windows speech." });
      const wav = await voicePreview(voiceMatch[1]);
      res.writeHead(200, { "Content-Type": "audio/wav", "Content-Length": wav.length, "Cache-Control": "private, max-age=86400" });
      return void res.end(wav);
    }
    const narrationMatch = /^\/api\/recordings\/([\w.-]+)\/(narration|voiceover)$/.exec(url.pathname);
    if (narrationMatch && req.method === "POST") {
      const [, id, what] = narrationMatch as unknown as [string, string, "narration" | "voiceover"];
      const row = await findRecording(id);
      if (!row || !canSee(row.owner)) return json(404, { error: "Recording not found." });
      if (media.kind !== "local") return json(501, { error: "Editing narration needs recordings kept on this server's disk." });
      const dir = join(root, "recordings", id);
      const file = join(dir, "recording.json");
      if (!existsSync(file)) return json(404, { error: "Recording not found." });
      const summary = JSON.parse(readFileSync(file, "utf8")) as RecordingSummary & Record<string, unknown>;
      let result;
      if (what === "narration") {
        const b = await readJson(req, 500_000);
        const captions = validateCaptions(b.captions);
        const voice = isVoice(b.voice) ? b.voice : "slt";
        // Re-speak with the voice the recording was made in ("elevenlabs:<voice id>"), so fixing
        // one line doesn't swap a natural voice for the offline one.
        const spoke = typeof (summary as { narration?: { spoke?: unknown } }).narration?.spoke === "string" ? String((summary as { narration: { spoke: string } }).narration.spoke) : "";
        const [spokeProvider = "", ...spokeVoice] = spoke.split(":");
        const cloud = spokeProvider && isCloudProvider(spokeProvider) ? engineFor(spokeProvider, voice, spokeVoice.join(":") || undefined) : null;
        result = await renarrate(dir, captions, voice, cloud);
        summary.captions = captions;
      } else {
        const audioPath = await readBodyToTemp(req, 40_000_000, "voiceover");
try {
  result = await voiceover(dir, audioPath, summary.captions);
} finally {
  rmSync(audioPath, { force: true });
}
      }
      summary.media = { ...summary.media, ...result, video: summary.media.video };
      writeFileSync(file, JSON.stringify(summary, null, 2));
      if (store.kind !== "file") {
        const { dir: _dir, ...rest } = summary;
        await store.saveRecording({ id, owner: row.owner, url: summary.url, createdAt: summary.createdAt, summary: rest });
      }
      return json(200, { recording: { ...summary, id, dir: `recordings/${id}` } });
    }
    // Share a walkthrough: a link that plays it for whoever has it, until it expires.
    //
    // The token is the permission and it lives in the walkthrough's own summary, so revoking
    // a link is removing it from there. There is no account on the other side of the link:
    // that is the whole point of sending someone one.
    const shareApi = /^\/api\/recordings\/([\w.-]+)\/share$/.exec(url.pathname);
    if (shareApi && (req.method === "POST" || req.method === "DELETE")) {
      const id = shareApi[1]!;
      const row = await findRecording(id);
      if (!row || !canSee(row.owner)) return json(404, { error: "Recording not found." });
      const summary = row.summary ?? (await listRecordings(user)).find((r) => r.id === id);
      if (!summary) return json(404, { error: "Recording not found." });
      const shares = (summary.shares ?? []).filter((s) => Date.parse(s.expiresAt) > Date.now());
      if (req.method === "DELETE") {
        const token = url.searchParams.get("token");
        const kept = token ? shares.filter((s) => s.token !== token) : [];
        summary.shares = kept;
        await saveRecordingSummary(id, row.owner, summary);
        return json(200, { ok: true, shares: kept });
      }
      const body = (await readJson(req).catch(() => ({}))) as { days?: number };
      const days = clampInt(body.days, 1, 90, 7);
      const share = { token: newShareToken(), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + days * 86_400_000).toISOString() };
      summary.shares = [...shares, share];
      await saveRecordingSummary(id, row.owner, summary);
      log.info("recording.shared", { id, owner, until: share.expiresAt });
      return json(200, { share, url: `${siteUrl}/share/${encodeURIComponent(id)}/${share.token}`, shares: summary.shares });
    }
    // The public side of a share link: the page, and the media it plays.
    const shareView = /^\/share\/([\w.-]+)\/([A-Za-z0-9_-]{20,64})\/?$/.exec(url.pathname);
    const shareFile = /^\/share\/([\w.-]+)\/([A-Za-z0-9_-]{20,64})\/([\w.-]+)$/.exec(url.pathname);
    if ((shareView || shareFile) && (req.method === "GET" || req.method === "HEAD")) {
      const [, id, token, file] = (shareFile ?? shareView) as unknown as [string, string, string, string | undefined];
      const found = await findRecording(id);
      const summary = found?.summary;
      if (!summary) return json(404, { error: "This link is not valid." });
      const share = (summary.shares ?? []).find((s) => s.token === token);
      if (!share || Date.parse(share.expiresAt) <= Date.now()) return json(404, { error: "This link has expired." });
      if (file) {
        // Only the files this walkthrough published can be fetched through the link.
        const allowed = new Set(
          [summary.media.mp4, summary.media.webm, summary.media.video, summary.media.captions, summary.media.audio].filter((f): f is string => Boolean(f)),
        );
        if (!allowed.has(file)) return json(404, { error: "not found" });
        const where = await media.locate(id, file);
        if (!where) return json(404, { error: "not found" });
        if ("redirect" in where) return redirect(where.redirect);
        return streamFile(req, res, where.path, TYPES[extname(file).toLowerCase()] ?? "application/octet-stream", "private, max-age=3600");
      }
      const base = `/share/${encodeURIComponent(id)}/${token}`;
      const sources = [
        summary.media.mp4 ? { url: `${base}/${summary.media.mp4}`, type: "video/mp4" } : null,
        summary.media.webm ? { url: `${base}/${summary.media.webm}`, type: "video/webm" } : null,
        summary.media.mp4 || summary.media.webm ? null : summary.media.video ? { url: `${base}/${summary.media.video}`, type: "video/webm" } : null,
      ].filter((s): s is { url: string; type: string } => s !== null);
      if (sources.length === 0) return json(404, { error: "This walkthrough has no video to share." });
      const captions = summary.captions ?? [];
      // A chapter starts where the recorder opened a page, exactly as it does in the app.
      const chapters = captions.flatMap((c) => (/^Opening\b/.test(c.text) ? [{ start: c.start, title: c.text.replace(/^Opening\s+/, "").replace(/\.$/, "") }] : []));
      return send(
        200,
        "text/html; charset=utf-8",
        sharePage({
          title: hostOf(summary.url),
          host: summary.url,
          recorded: summary.createdAt,
          pages: summary.pages.length,
          durationMs: summary.durationMs,
          sources,
          captions: summary.media.captions ? `${base}/${summary.media.captions}` : null,
          chapters: chapters.length ? chapters : captions.length ? [{ start: 0, title: hostOf(summary.url) }] : [],
          transcript: captions.map((c) => ({ start: c.start, text: c.text })),
          expiresAt: share.expiresAt.slice(0, 10),
          ...(summary.media.note && /failed|instead|could not reach/i.test(summary.media.note) ? { note: summary.media.note } : {}),
        }),
      );
    }
    // What the recorder found on the site while it walked it.
    //
    // A walkthrough made now carries its insights in its summary. One made before this existed
    // still has its trace on disk, and the trace is where the truth is: the same analysis runs
    // over it here, so an old walkthrough is not a blank page.
    const insightsMatch = /^\/api\/recordings\/([\w.-]+)\/insights$/.exec(url.pathname);
    if (insightsMatch && req.method === "GET") {
      const id = insightsMatch[1]!;
      const row = await findRecording(id);
      if (!row || !canSee(row.owner)) return json(404, { error: "Recording not found." });
      const summary = (await listRecordings(user)).find((r) => r.id === id);
      if (summary?.insights) return json(200, { insights: summary.insights });
      if (media.kind !== "local") return json(501, { error: "This walkthrough's trace is not on this server, so it cannot be read here." });
      const trace = join(root, "recordings", id, "trace.jsonl");
      if (!existsSync(trace)) return json(404, { error: "This walkthrough has no trace to read." });
      const facts = {
        id,
        url: summary?.url ?? "",
        createdAt: summary?.createdAt,
        durationMs: summary?.durationMs ?? 0,
        pages: summary?.pages ?? [],
        skipped: summary?.skipped ?? [],
        stopped: summary?.stopped,
      };
      const events = readFileSync(trace, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line) as TraceEvent;
          } catch {
            return null; // a half-written line is not a reason to fail the whole read
          }
        })
        .filter((e): e is TraceEvent => e !== null);
      return json(200, { insights: analyzeRecording(facts, events) });
    }
    // Delete a recording: its files (local folder, or its objects in the bucket) and its index row.
    const deleteMatch = /^\/api\/recordings\/([\w.-]+)$/.exec(url.pathname);
    if (deleteMatch && req.method === "DELETE") {
      const id = deleteMatch[1]!;
      if (id.startsWith(".")) return json(404, { error: "Recording not found." }); // never "..": this ends in a delete
      const row = await findRecording(id);
      if (!row || !canSee(row.owner)) return json(404, { error: "Recording not found." });
      // The files it published (worker.ts): the media names in its summary, plus recording.json.
      const summary = (await listRecordings(user)).find((r) => r.id === id);
      const m = (summary?.media ?? {}) as Partial<Record<"mp4" | "webm" | "video" | "audio" | "captions", string | null>>;
      const files = [m.mp4, m.webm, m.video, m.audio, m.captions, "recording.json"].filter((f): f is string => Boolean(f));
      try {
        await media.remove(id, files);
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        // Windows: the video is still open (playing in a tab). The index row stays, so nothing is half-deleted.
        if (code === "EBUSY" || code === "EPERM") return json(409, { error: "The recording is in use and couldn't be deleted. Stop playing it and try again." });
        return json(502, { error: `Couldn't delete the recording's files: ${e instanceof Error ? e.message : String(e)}` });
      }
      await store.deleteRecording(id);
      capabilitiesCache.clear();
      log.info("recording.deleted", { id, owner });
      return json(200, { ok: true });
    }
    const sttMatch = /^\/api\/recordings\/([\w.-]+)\/captions\/stt$/.exec(url.pathname);
    if (sttMatch && req.method === "POST") {
      const id = sttMatch[1]!;
      const row = await findRecording(id);
      if (!row || !canSee(row.owner)) return json(404, { error: "Recording not found." });
      if (media.kind !== "local") return json(501, { error: "STT needs recordings kept on this server's disk." });
      const dir = join(root, "recordings", id);
      const file = join(dir, "recording.json");
      if (!existsSync(file)) return json(404, { error: "Recording not found." });
      const summary = JSON.parse(readFileSync(file, "utf8")) as RecordingSummary & Record<string, unknown>;
      const b = await readJson(req).catch(() => ({}));
      const language = typeof (b as any)?.language === "string" ? (b as any).language : "unknown";
      let audioFile = (summary.media as any)?.audio ?? "narration.wav";
      if (!existsSync(join(dir, audioFile))) {
        if (existsSync(join(dir, "video.webm"))) audioFile = "video.webm";
        else return json(400, { error: "No audio available for this recording." });
      }
      // No speech-to-text key is the person's to fix in Settings, not a server failure.
      if (configuredSttProviders().length === 0) return json(400, { error: "Auto-captions need a speech-to-text key. Add an OpenAI, Groq, ElevenLabs or Sarvam key in Settings." });
      try {
        const captions = await generateCaptionsFromAudio(join(dir, audioFile), language, typeof (b as any)?.provider === "string" ? (b as any).provider : null);
        summary.captions = captions;
        const { toWebVtt } = await import("../../../packages/core/src/record/narration.ts");
        writeFileSync(join(dir, "captions.vtt"), toWebVtt(captions as any));
        summary.media = { ...summary.media, captions: "captions.vtt" };
        writeFileSync(file, JSON.stringify(summary, null, 2));
        if (store.kind !== "file") {
          const { dir: _dir, ...rest } = summary;
          await store.saveRecording({ id, owner: row.owner, url: summary.url, createdAt: summary.createdAt, summary: rest });
        }
        return json(200, { recording: { ...summary, id, dir: `recordings/${id}` }, captions });
      } catch (e) {
        return json(500, { error: e instanceof Error ? e.message : String(e) });
      }
    }
    if ((url.pathname === "/api/run" || url.pathname === "/api/record") && req.method === "POST") {
      const kind = url.pathname === "/api/run" ? "run" : "record";
      const b = await readJson(req);
      // A recording turned away before it could start is still a failed recording to the person
      // who asked: keep it, so the Lab lists it with the reason. Quotas and "already running" are
      // not failures of the site and aren't kept.
      const refuse = async (status: number, error: string): Promise<void> => {
        if (kind === "record") await noteRefusal(owner, b.demo === true ? "" : String(b.url ?? ""), error, b.demo === true).catch((e) => log.warn("job.refusal_not_kept", { error: String(e) }));
        return json(status, { error });
      };
      if (draining) return refuse(503, "The server is restarting. Try again in a moment.");
      if (o.jobsUnavailable) return refuse(503, o.jobsUnavailable);
      const notReady = browserNotReady();
      if (notReady) return refuse(503, notReady);
      let input: Record<string, unknown>;
      try {
        input = kind === "run" ? validateRun(b, allowLiveRuns, root) : validateRecord(b, exposed);
      } catch (e) {
        // An unfinished form (no URL, box not ticked) is not a failed recording; a bad address is.
        if (e instanceof AuthError && e.status === 400) return /^(Confirm that you own|Paste the site's URL)/.test(e.message) ? json(400, { error: e.message }) : refuse(400, e.message);
        throw e;
      }
      // A cloud voice this process can't reach would quietly ship with no voice, which reads as "I picked ElevenLabs and got something else". When we hold the worker we can say so up front,
      // instead of returning a video in the wrong voice minutes later.
      if (kind === "record" && worker && typeof input.ttsProvider === "string" && isCloudProvider(input.ttsProvider) && !configuredCloudProviders().includes(input.ttsProvider)) {
        const id = TTS_PROVIDER_LABEL[input.ttsProvider] ?? input.ttsProvider;
        const env = credentialFor(input.ttsProvider);
        return refuse(400, `${id} is selected but this server has no ${env}, so the recording would not use it. Add the key in Settings, or pick the basic offline voice.`);
      }
      // A retried submit (double-click, network retry) gets the job it already created.
      const idempotencyKey = typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"].slice(0, 100) : null;
      if (idempotencyKey) {
        const existing = await store.jobByKey(owner, idempotencyKey);
        if (existing) return json(202, { job: await withQueue(store, existing) });
      }
      // Per-user limits, enforced atomically in the store so they hold across instances: the
      // daily quota and the active-job ceiling are single statements, not reads the caller races.
      // Refuse "already running" before charging the daily quota: a click while a job runs used to
      // spend one of the day's recordings on a request that was turned away. enqueueLimited below
      // still enforces the ceiling atomically; this only keeps the common case from costing quota.
      if ((await store.activeJobs(owner)) >= LIMITS.activeJobsPerUser) throw new AuthError(429, "You already have a job running. Wait for it to finish.");
      const perDay = kind === "record" ? LIMITS.recordingsPerDay : LIMITS.runsPerDay;
      if ((await store.hit(`quota:${kind}:${owner ?? "local"}`, 86_400_000)) > perDay) {
        throw new AuthError(429, `Daily limit reached (${perDay} ${kind === "record" ? "recordings" : "runs"}). Try again tomorrow.`);
      }
      if (kind === "run") {
        // Model-backed agents spend provider tokens on a live run: they get their own ceiling.
        const spec = resolveAgent(String(input.agent));
        const perAgent = agentDailyLimit(spec);
        const free = input.modelMode === "replay" || input.modelMode === "scripted";
        if (perAgent !== null && !free && (await store.hit(`quota:agent:${spec.id}:${owner ?? "local"}`, 86_400_000)) > perAgent) {
          throw new AuthError(429, `Daily limit reached for agent ${spec.id} (${perAgent} runs). Try again tomorrow, or replay a fixture instead (no model cost).`);
        }
      }
      let secret: string | null = null;
      if (kind === "record" && typeof b.password === "string" && b.password) {
        if (!worker && !sharedKeyConfigured()) throw new AuthError(503, "This server is missing LAB_SECRET_KEY, which separate workers need to receive sign-in details. Ask the operator to set it.");
        secret = seal(b.password);
      }
      const job = await store.enqueueLimited({ kind, owner, input, secret, idempotencyKey }, LIMITS.activeJobsPerUser);
      if (!job) throw new AuthError(429, "You already have a job running. Wait for it to finish.");
      worker?.poke();
      log.info("job.enqueued", { job: job.id, kind, owner });
      return json(202, { job: await withQueue(store, job) });
    }
    // Cancel a queued or running job (its owner only). The worker aborts at once when it is in this
    // process, else at its next heartbeat; the partial recording is discarded.
    const cancelMatch = /^\/api\/jobs\/([\w-]+)\/cancel$/.exec(url.pathname);
    if (cancelMatch && req.method === "POST") {
      const id = cancelMatch[1]!;
      const job = await store.job(id);
      if (!job || (requireAuth && job.owner !== owner)) return json(404, { error: "job not found" });
      const cancelled = await store.cancel(id);
      if (!cancelled) return json(409, { error: `The job already ${job.status}.`, job: await withQueue(store, job) });
      worker?.cancel(id);
      statusCache.delete(id);
      capabilitiesCache.delete(user?.id ?? "__anon__");
      log.info("job.cancelled", { job: id, owner });
      return json(200, { job: await withQueue(store, cancelled) });
    }
    const jobMatch = /^\/api\/jobs\/([\w-]+)$/.exec(url.pathname);
    if (jobMatch) {
      const id = jobMatch[1]!;
      const ifNone = req.headers["if-none-match"];
      const cached = statusCache.get(id);
      // The cache is shared by every caller, so a hit is only served to the job's owner; anyone
      // else falls through to the store lookup and its 404.
      if (cached && Date.now() - cached.at < STATUS_TTL_MS && (!requireAuth || cached.owner === owner)) {
        if (ifNone && String(ifNone).trim() === cached.etag) {
          res.writeHead(304, { ...securityHeaders, ETag: cached.etag, "Cache-Control": "private, max-age=1" });
          return void res.end();
        }
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", ...securityHeaders, ETag: cached.etag, "Cache-Control": "private, max-age=1" });
        return void res.end(cached.body);
      }
      const job = await store.job(id);
      if (!job || (requireAuth && job.owner !== owner)) {
        statusCache.delete(id);
        return json(404, { error: "job not found" });
      }
      // A finished job changes "recordings used today": drop this viewer's cached capabilities so
      // the next read isn't up to 5 s stale.
      if (job.status === "succeeded" || job.status === "failed") capabilitiesCache.delete(user?.id ?? "__anon__");
      const payload = { job: await withQueue(store, job) };
      const body = JSON.stringify(payload);
      const etag = `"${createHash("sha1").update(body).digest("hex").slice(0, 16)}"`;
      setStatusCache(id, body, etag, job.owner ?? null);
      if (ifNone && String(ifNone).trim() === etag) {
        res.writeHead(304, { ...securityHeaders, ETag: etag, "Cache-Control": "private, max-age=1" });
        return void res.end();
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", ...securityHeaders, ETag: etag, "Cache-Control": "private, max-age=1" });
      return void res.end(body);
    }
    if (url.pathname === "/api/update" && req.method === "GET") {
      // The newest published release vs. what this server runs. The desktop app installs updates
      // itself (Tauri updater); servers and source checkouts get a link to the release.
      return json(200, await checkForUpdate());
    }
    if (url.pathname === "/api/agents/usage" && req.method === "GET") {
      let windowMs = 86_400_000;
      const q = url.searchParams.get("windowMs");
      if (q) {
        const n = Number(q);
        if (!Number.isFinite(n) || n <= 0 || n > 31 * 86_400_000) return json(400, { error: "windowMs must be 1ms..31 days" });
        windowMs = n;
      }
      // Aggregate counts per agent id across every account: no inputs, owners or results.
      const usage = await store.agentUsage(windowMs);
      const known = new Map(allAgents().map((a) => [a.id, a]));
      return json(200, {
        windowMs,
        agents: usage.map((u) => {
          const spec = known.get(u.agent);
          return { ...u, kind: spec?.kind ?? "unknown", exposure: spec ? agentExposure(spec) : "unknown", dailyLimit: spec ? agentDailyLimit(spec) : null };
        }),
      });
    }
    if (url.pathname === "/api/metrics") {
      let windowMs = 86_400_000;
      const q = url.searchParams.get("windowMs");
      if (q) {
        const n = Number(q);
        if (!Number.isFinite(n) || n <= 0 || n > 31 * 86_400_000) return json(400, { error: "windowMs must be 1ms..31 days" });
        windowMs = n;
      }
      const snap = await store.metrics(windowMs);
      const alarmMs = queueAlarmMs();
      // Open to operators; authed users only see queue-level aggregates (no per-tenant content).
      return json(200, { ...snap, alarm: { state: alarmState(snap.queue.oldestQueuedMs, alarmMs), thresholdMs: alarmMs } });
    }
    // ---------------------------------------------------------------- webhooks (owner-scoped)
    if (url.pathname === "/api/webhooks" && req.method === "GET") {
      const items = await store.webhooks(owner);
      return json(200, { webhooks: items.map((w) => w.url), items });
    }
    if (url.pathname === "/api/webhooks" && req.method === "POST") {
      const b = await readJson(req);
      const u = String((b as any)?.url ?? "").trim();
      if (!u) return json(400, { error: "url required" });
      const problem = await webhookUrlProblem(u, blockPrivate);
      if (problem) return json(400, { error: problem });
      if ((await store.webhooks(owner)).length >= 10) return json(400, { error: "At most 10 webhooks per account." });
      const webhook = await store.addWebhook(owner, u);
      const items = await store.webhooks(owner);
      return json(201, { webhook, webhooks: items.map((w) => w.url), items });
    }
    if (url.pathname === "/api/webhooks/deliveries" && req.method === "GET") {
      return json(200, { deliveries: await store.deliveries(owner, clampInt(url.searchParams.get("limit"), 1, 200, 50)) });
    }
    const webhookDeleteMatch = /^\/api\/webhooks(?:\/(.+))?$/.exec(url.pathname);
    if (webhookDeleteMatch && req.method === "DELETE") {
      const target = webhookDeleteMatch[1] ? decodeURIComponent(webhookDeleteMatch[1]) : String(((await readJson(req).catch(() => ({}))) as any)?.url ?? "").trim();
      if (!target) return json(400, { error: "url or id required" });
      const removed = await store.removeWebhook(owner, target);
      const items = await store.webhooks(owner);
      return json(removed ? 200 : 404, { webhooks: items.map((w) => w.url), items, ...(removed ? {} : { error: "webhook not found" }) });
    }
    // ---------------------------------------------------------------- schedules (owner-scoped)
    if (url.pathname === "/api/schedules" && req.method === "GET") {
      return json(200, { schedules: await store.schedules(owner) });
    }
    if (url.pathname === "/api/schedules" && req.method === "POST") {
      const b = (await readJson(req).catch(() => ({}))) as any;
      let sched;
      try {
        sched = newSchedule(owner, { url: b?.url, interval: b?.interval ?? b?.cron ?? b?.every, intervalMs: b?.intervalMs, authorized: b?.authorized === true });
      } catch (e) {
        return json(400, { error: e instanceof Error ? e.message : String(e) });
      }
      if (blockPrivate) {
        const blocked = await blockedHost(new URL(sched.url).hostname);
        if (blocked) return json(400, { error: blocked });
      }
      // Exposed servers: a schedule must not recur faster than every 15 minutes or exceed 20 per account.
      if (exposed && sched.intervalMs < 15 * 60_000) return json(400, { error: "Schedules on a shared server run at most every 15 minutes." });
      if ((await store.schedules(owner)).length >= 20) return json(400, { error: "At most 20 schedules per account." });
      await store.addSchedule(sched);
      return json(201, { schedule: sched, schedules: await store.schedules(owner) });
    }
    const scheduleDeleteMatch = /^\/api\/schedules(?:\/(.+))?$/.exec(url.pathname);
    if (scheduleDeleteMatch && req.method === "DELETE") {
      const id = scheduleDeleteMatch[1] ? decodeURIComponent(scheduleDeleteMatch[1]) : String(((await readJson(req).catch(() => ({}))) as any)?.id ?? url.searchParams.get("id") ?? "");
      if (!id) return json(400, { error: "id required" });
      const removed = await store.removeSchedule(id, owner);
      return json(removed ? 200 : 404, { schedules: await store.schedules(owner), ...(removed ? {} : { error: "schedule not found" }) });
    }
    if (url.pathname === "/api/run") {
      const detail = data.run(url.searchParams.get("dir") ?? "");
      return detail ? json(200, detail) : json(404, { error: "run not found" });
    }
    const transcriptMatch = /^\/api\/recordings\/([\w.-]+)\/transcript$/.exec(url.pathname);
    if (transcriptMatch && req.method === "GET") {
      const id = transcriptMatch[1]!;
      const row = await findRecording(id);
      if (!row || !canSee(row.owner)) return json(404, { error: "not found" });
      const located = await media.locate(id, "recording.json");
      if (!located || "redirect" in located) {
        // For s3, fetch via redirect not handled; fall back to 404 for now.
        if (located && "redirect" in located) return redirect(located.redirect);
        return json(404, { error: "not found" });
      }
      let summary: { captions?: { start: number; end: number; text: string }[] } = {};
      try { summary = JSON.parse(readFileSync(located.path, "utf8")); } catch { return json(500, { error: "bad recording" }); }
      const caps = summary.captions ?? [];
      const format = (url.searchParams.get("format") ?? "json").toLowerCase();
      if (format === "json") return json(200, { captions: caps });
      const fmt = (s: number) => {
        const totalMs = Math.round(s * 1000);
        const h = Math.floor(totalMs / 3600000);
        const m = Math.floor((totalMs % 3600000) / 60000);
        const sec = Math.floor((totalMs % 60000) / 1000);
        const ms = totalMs % 1000;
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
      };
      if (format === "srt") {
        const body = caps.map((c, i) => `${i + 1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${c.text}\n`).join("\n");
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
        return void res.end(body);
      }
      if (format === "vtt") {
        const body = "WEBVTT\n\n" + caps.map((c) => `${fmt(c.start).replace(",", ".")} --> ${fmt(c.end).replace(",", ".")}\n${c.text}\n`).join("\n");
        res.writeHead(200, { "Content-Type": "text/vtt; charset=utf-8", "Cache-Control": "no-store" });
        return void res.end(body);
      }
      return json(400, { error: "unknown format" });
    }

    if (url.pathname.startsWith("/files/")) {
      let rel: string;
      try {
        rel = decodeURIComponent(url.pathname.slice("/files/".length));
      } catch {
        return json(400, { error: "bad path" });
      }
      // Accept a backslash as a separator too: recordings indexed before this was normalised on
      // Windows carry "recordings\<id>" in their `dir`, and those are already on disk.
      const rec = /^recordings[\\/]([^\\/]+)[\\/]([^\\/]+)$/.exec(rel);
      if (rec) {
        const [, id, file] = rec as unknown as [string, string, string];
        const row = await findRecording(id);
        if (!row || !canSee(row.owner)) return json(404, { error: "not found" });
        const where = await media.locate(id, file);
        if (!where) return json(404, { error: "not found" });
        if ("redirect" in where) return redirect(where.redirect);
        return streamFile(req, res, where.path, TYPES[extname(file).toLowerCase()] ?? "application/octet-stream", "private, max-age=3600");
      }
      const abs = data.safe(rel);
      const type = abs ? TYPES[extname(abs).toLowerCase()] : undefined;
      const inRecordings = !!abs && (abs === join(data.root, "recordings") || abs.startsWith(join(data.root, "recordings") + sep));
      if (!abs || !type || !existsSync(abs) || inRecordings) return json(404, { error: "not found" });
      return streamFile(req, res, abs, type, "private, max-age=3600");
    }
    if (url.pathname === "/app" || url.pathname === "/app/") {
      // Nothing of the app is shown before sign-in when accounts are required: not even the shell.
      if (requireAuth && !user) return redirect(`/login?next=${encodeURIComponent("/app")}`);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "X-Robots-Tag": "noindex, nofollow",
      });
      return void res.end(html);
    }
    {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache", ...securityHeaders, "X-Robots-Tag": "noindex, follow" });
      return void res.end(notFoundPage());
    }
  }

  /** Postgres: the recordings table. Local files: recordings/*\/recording.json (CLI ones included). */
  /** One failed recording job as the Lab shows it: the stored report when there is one. */
  function failureFor(job: Job): FailureReport {
    const path = join(failureDir(root, job.id), "failure.json");
    if (existsSync(path)) {
      try {
        return JSON.parse(readFileSync(path, "utf8")) as FailureReport;
      } catch {
        /* torn write: fall back to the job row */
      }
    }
    // No report: the worker died mid-job (app closed, crash) or this predates reports.
    const error = job.error ?? "The recording failed without an error message.";
    const input = job.input as { url?: string; demo?: boolean; refused?: boolean };
    return {
      ...(input.refused ? { refused: true } : {}),
      jobId: job.id,
      url: input.demo ? "Sample site" : String(input.url ?? ""),
      owner: job.owner,
      createdAt: job.createdAt,
      failedAt: job.finishedAt ?? job.createdAt,
      attempts: job.attempts,
      error,
      stage: job.progress,
      ...explainFailure(error),
      pages: [],
      signIn: null,
      skipped: [],
      durationMs: job.startedAt && job.finishedAt ? Date.parse(job.finishedAt) - Date.parse(job.startedAt) : null,
      files: { screenshot: null, video: null },
    };
  }

  /**
   * Keep a refused recording request as a failed job. The same refusal again within a couple of
   * minutes (repeated clicks while the browser downloads) is one entry, not a pile of them.
   */
  async function noteRefusal(owner: string | null, url: string, error: string, demo = false): Promise<void> {
    const recent = await store.failedJobs(owner, "record", 5);
    const now = Date.now();
    if (recent.some((j) => j.error === error && (j.input as { url?: unknown }).url === url && now - Date.parse(j.finishedAt ?? j.createdAt) < 2 * 60_000)) return;
    // Only the address: never the password or anything else from the request.
    await store.insertFailed({ kind: "record", owner, input: { url, refused: true, ...(demo ? { demo: true } : {}) } }, error);
  }

  /** A Lab agent run that never produced a result: its job row is all there is. */
  function runFailureFor(job: Job): RunFailure {
    const input = job.input as { agent?: string; fault?: string; task?: string; seed?: number; modelMode?: string };
    const error = job.error ?? "The run failed without an error message.";
    return {
      jobId: job.id,
      agent: String(input.agent ?? ""),
      fault: String(input.fault ?? "none"),
      task: String(input.task ?? "create-lead"),
      seed: Number(input.seed ?? 0),
      modelMode: input.modelMode ?? null,
      createdAt: job.createdAt,
      failedAt: job.finishedAt ?? job.createdAt,
      attempts: job.attempts,
      error,
      ...explainFailure(error),
    };
  }

  async function listRecordings(user: User | null): Promise<RecordingSummary[]> {
    if (store.kind === "file") return data.recordings();
    const rows = await store.recordings(requireAuth ? (user?.id ?? "-") : null, 100);
    return rows.map((r) => ({ ...(r.summary as unknown as RecordingSummary), id: r.id, owner: r.owner ?? undefined, dir: `recordings/${r.id}` }));
  }
  async function findRecording(id: string): Promise<{ owner: string | null; summary?: RecordingSummary } | null> {
    if (store.kind === "file") {
      const r = data.recordings().find((x) => x.id === id || basename(x.dir) === id);
      return r ? { owner: r.owner ?? null, summary: r } : null;
    }
    const row = await store.recording(id);
    return row ? { owner: row.owner ?? null, summary: row.summary as unknown as RecordingSummary } : null;
  }

  /**
   * Write a walkthrough's summary back, wherever it is kept.
   *
   * A summary lives in two places on a shared server: the file on disk and the row in the
   * database. Both are written, or the next reader sees one of them and not the other.
   */
  async function saveRecordingSummary(id: string, owner: string | null, summary: RecordingSummary): Promise<void> {
    if (media.kind === "local") {
      const file = join(root, "recordings", id, "recording.json");
      if (existsSync(file)) writeFileSync(file, JSON.stringify(summary, null, 2));
    }
    if (store.kind !== "file") {
      const { dir: _dir, ...rest } = summary;
      await store.saveRecording({ id, owner, url: summary.url, createdAt: summary.createdAt, summary: rest });
    }
  }

  return {
    handler,
    store,
    media,
    worker,
    auth: auth.kind,
    requireAuth,
    drain() {
      draining = true;
      webhookDispatcher.stop();
      scheduler.stop();
      queueMonitor.stop();
    },
  };
}

const STATUS_TTL_MS = Number(process.env.LAB_STATUS_TTL_MS ?? 1500);
const STATUS_CACHE_MAX = 20_000;
const statusCache = new Map<string, { body: string; etag: string; owner: string | null; at: number }>();

const CAPABILITIES_TTL_MS = Number(process.env.LAB_CAPABILITIES_TTL_MS ?? process.env.CAPABILITIES_TTL_MS ?? 5000);
const CAPABILITIES_CACHE_MAX = 100;
const capabilitiesCache = new Map<string, { payload: unknown; at: number }>();

function setStatusCache(id: string, body: string, etag: string, owner: string | null) {
  if (statusCache.size >= STATUS_CACHE_MAX) {
    const first = statusCache.keys().next().value;
    if (first) statusCache.delete(first);
  }
  statusCache.set(id, { body, etag, owner, at: Date.now() });
}

function publicJob(job: Job) {
  const { secret: _secret, input, ...rest } = job;
  // Never echo a password back; the URL and settings are fine to show to their owner.
  return { ...rest, input: { ...input } };
}

/**
 * A queued job also carries its place in line, so the app can say "1 job ahead of you" instead of
 * showing an indefinite spinner. The position is a nicety: a job's status must never fail because
 * the queue counters could not be read.
 */
async function withQueue(store: Store, job: Job) {
  const base = publicJob(job);
  if (job.status !== "queued") return base;
  try {
    const { ahead, oldestQueuedMs }: QueuePosition = await store.queuePosition(job.createdAt);
    return { ...base, queue: { ahead, oldestQueuedMs, waitingMs: Math.max(0, Date.now() - Date.parse(job.createdAt)) } };
  } catch {
    return base;
  }
}

export function validateRun(b: Record<string, unknown>, allowLiveRuns: boolean, root = process.cwd()): Record<string, unknown> {
  const op = b.op === undefined ? "run" : String(b.op);
  if (!["run", "replay", "experiment"].includes(op)) throw new AuthError(400, `Unknown lab operation "${op}".`);
  const known = (id: string) => allAgents().some((a) => a.id === id);
  const trials = Math.max(1, Math.min(5, Math.trunc(Number(b.trials ?? (op === "replay" ? 3 : 1)) || 1)));
  if (op === "replay") {
    // A fixture the index listed: a relative path under fixtures/, runs/_fixtures/ or results/<exp>/fixtures/.
    const fixture = String(b.fixture ?? "").replace(/\\/g, "/");
    if (!/^(fixtures|runs\/_fixtures|results\/[\w.-]+\/fixtures)\/[\w.+-]+$/.test(fixture) || !existsSync(join(root, fixture, "manifest.json"))) {
      throw new AuthError(400, "That fixture doesn't exist here.");
    }
    const agent = String(b.agent ?? "v1");
    if (!known(agent)) throw new AuthError(400, `Unknown agent "${agent}".`);
    // How the agent's model answers: the recorded calls, the deterministic stand-in, or a live
    // model. Without this the choice was made for the person — a browser agent whose fixture
    // holds no recorded calls was pushed into a live run, which needs a key and costs money,
    // and the replay could not be tried at all without one.
    const modelMode = b.modelMode === undefined ? undefined : String(b.modelMode);
    if (modelMode !== undefined && !["live", "replay", "scripted"].includes(modelMode)) throw new AuthError(400, `Unknown model mode "${modelMode}".`);
    if (modelMode === "live" && !allowLiveRuns) throw new AuthError(403, "Live model runs are disabled on this server (they cost money). Set LAB_ALLOW_LIVE_RUNS=1 to allow them.");
    return { op, fixture, agent, trials, fault: "none", seed: 1, task: "create-lead", ...(modelMode ? { modelMode } : {}) };
  }
  if (op === "experiment") {
    // Scripted agents only: an experiment is dozens of runs, and from the app it must never spend
    // model credits by accident.
    const scripted = (id: string) => allAgents().some((a) => a.id === id && a.kind === "scripted");
    const baseline = String(b.baseline ?? "v0");
    const candidates = (Array.isArray(b.candidates) ? b.candidates : ["v1", "v2"]).map(String).filter((c) => c !== baseline).slice(0, 4);
    for (const id of [baseline, ...candidates]) if (!scripted(id)) throw new AuthError(400, `Experiments from the app use the scripted agents only; "${id}" isn't one.`);
    if (candidates.length === 0) throw new AuthError(400, "Pick at least one candidate agent to compare with the baseline.");
    const seeds = Math.max(1, Math.min(3, Math.trunc(Number(b.seeds ?? 1)) || 1));
    const task: TaskId = isTaskId(String(b.task ?? "")) ? (b.task as TaskId) : "create-lead";
    return { op, baseline, candidates, trials: Math.min(trials, 3), seed: seeds, agent: baseline, fault: "none", task };
  }
  const agent = String(b.agent ?? "v0");
  if (!allAgents().some((a) => a.id === agent)) throw new AuthError(400, `Unknown agent "${agent}".`);
  const modelMode = b.modelMode === undefined ? undefined : String(b.modelMode);
  if (modelMode !== undefined && !["live", "replay", "scripted"].includes(modelMode)) throw new AuthError(400, `Unknown model mode "${modelMode}".`);
  if (modelMode === "live" && !allowLiveRuns) throw new AuthError(403, "Live model runs are disabled on this server (they cost money). Set LAB_ALLOW_LIVE_RUNS=1 to allow them.");
  let fault: string;
  try {
    fault = normalizeScenario(String(b.fault ?? "none"));
  } catch (e) {
    throw new AuthError(400, e instanceof Error ? e.message : String(e));
  }
  const task: TaskId = isTaskId(String(b.task ?? "")) ? (b.task as TaskId) : "create-lead";
  const seed = Number.isFinite(Number(b.seed)) ? Math.trunc(Number(b.seed)) : 1;
  return { agent, fault, task, seed, ...(modelMode ? { modelMode } : {}) };
}

/** Sample-site recordings: always on the desktop, opt-in (LAB_DEMO_SITE=1) on a shared server. */
export function demoSiteEnabled(exposed: boolean): boolean {
  return !exposed || process.env.LAB_DEMO_SITE === "1";
}

function validateRecord(b: Record<string, unknown>, exposed: boolean): Record<string, unknown> {
  const pagesIn = Number(b.maxPages);
  if (b.demo === true) {
    // The worker starts its own sample CRM and records that: no user-supplied URL, nothing the
    // SSRF guard needs to judge, and it works when the worker is a separate machine.
    if (!demoSiteEnabled(exposed)) throw new AuthError(403, "The sample site is turned off on this server.");
    return {
      demo: true,
      url: "sample:minicrm",
      maxPages: Number.isFinite(pagesIn) ? Math.max(1, Math.min(10, Math.trunc(pagesIn))) : 5,
      ...(isVoice(b.voice) ? { voice: b.voice } : {}),
      // The sample site narrates with the voice the person picked, like any other recording.
      ...voiceBlock(b),
      ...lengthBlock(b),
      blockPrivate: false,
    };
  }
  if (b.authorized !== true) throw new AuthError(400, "Confirm that you own this site or are authorized to test it.");
  if (typeof b.url !== "string" || !b.url.trim()) throw new AuthError(400, "Paste the site's URL.");
  let url: URL;
  try {
    url = new URL(b.url.trim());
  } catch {
    throw new AuthError(400, "That doesn't look like a web address. Paste the full link, starting with https://");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new AuthError(400, "Only http(s) addresses can be recorded.");
  return {
    url: url.toString(),
    ...(typeof b.username === "string" && b.username ? { username: b.username.slice(0, 200) } : {}),
    maxPages: Number.isFinite(Number(b.maxPages)) ? Math.max(1, Math.min(30, Math.trunc(Number(b.maxPages)))) : 8,
    ...lengthBlock(b),
    ...(isVoice(b.voice) ? { voice: b.voice } : {}),
    ...voiceBlock(b),
    blockPrivate: exposed && process.env.LAB_ALLOW_PRIVATE !== "1",
  };
}

/** The length cap in seconds, or nothing for "as many pages as it reaches". */
function lengthBlock(b: Record<string, unknown>): { maxSeconds?: number } {
  const asked = Number(b.maxSeconds);
  return Number.isFinite(asked) && asked > 0 ? { maxSeconds: Math.max(15, Math.min(3600, Math.trunc(asked))) } : {};
}

/** The provider, its voice and its language, validated against what that provider actually has. */
function voiceBlock(b: Record<string, unknown>): { ttsProvider?: string; ttsVoice?: string; ttsLanguage?: string } {
  // "polly" and "maya" are older aliases of two providers still in the list.
  const allowed = [...TTS_PROVIDERS, "polly", "maya"];
  const ttsProvider = typeof b.ttsProvider === "string" && allowed.includes(b.ttsProvider.toLowerCase() as typeof allowed[number]) ? b.ttsProvider.toLowerCase() : undefined;
  if (!ttsProvider) return {};
  // A chosen voice must be one this provider actually has, unless the provider has no public list
  // (Murf, a custom endpoint), where the id is passed through as typed.
  const chosen = typeof b.ttsVoice === "string" ? b.ttsVoice.trim().slice(0, 120) : "";
  const list = voicesFor(ttsProvider);
  const ttsVoice = chosen && (list.length === 0 || list.some((v) => v.id === chosen)) ? chosen : undefined;
  // A language is only meaningful where the provider needs one and the voice doesn't carry it.
  const asked = typeof b.ttsLanguage === "string" ? b.ttsLanguage.trim().slice(0, 20) : "";
  const ttsLanguage = /^[a-z]{2,3}([-_][A-Za-z]{2,4})?$/i.test(asked) ? asked.replace("_", "-") : undefined;
  return { ttsProvider, ...(ttsVoice ? { ttsVoice } : {}), ...(ttsLanguage ? { ttsLanguage } : {}) };
}

async function readBodyToTemp(req: IncomingMessage, limit: number, _prefix: string): Promise<string> {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const tmpDir = path.join(os.tmpdir(), "walkcast-voiceover");
  fs.mkdirSync(tmpDir, { recursive: true });
  const file = path.join(tmpDir, `${randomUUID()}.bin`);
  const { createWriteStream } = await import("node:fs");
  // Pipe chunks to disk instead of buffering, so a 40 MB voice doesn't pin the event loop.
  const out = createWriteStream(file);
  let size = 0;
  try {
    for await (const chunk of req as AsyncIterable<Buffer>) {
      size += chunk.length;
      if (size > limit) throw new AuthError(413, "That recording is too large.");
      if (!out.write(chunk)) await new Promise<void>((r) => out.once("drain", () => r()));
    }
    out.end();
    await new Promise<void>((resolve, reject) => {
      out.on("finish", () => resolve());
      out.on("error", reject);
    });
  } catch (e) {
    fs.rmSync(file, { force: true });
    if (out && !out.destroyed) out.destroy();
    throw e;
  }
  if (!size) {
    fs.rmSync(file, { force: true });
    throw new AuthError(400, "No audio received.");
  }
  return file;
}
function validateCaptions(raw: unknown): { start: number; end: number; text: string }[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 500) throw new AuthError(400, "The script needs between 1 and 500 lines.");
  return raw.map((c, i) => {
    const x = c as { start?: unknown; end?: unknown; text?: unknown };
    const start = Number(x.start);
    const end = Number(x.end);
    const text = typeof x.text === "string" ? x.text.replace(/\s+/g, " ").trim().slice(0, 400) : "";
    if (!Number.isFinite(start) || start < 0 || !Number.isFinite(end) || !text) throw new AuthError(400, `Line ${i + 1} of the script is empty or has no time.`);
    return { start, end: Math.max(end, start), text };
  });
}

async function readJson(req: IncomingMessage, limit = 100_000): Promise<Record<string, unknown>> {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > limit) throw new AuthError(413, "Request body too large.");
  }
  try {
    const value = JSON.parse(body || "{}") as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value as Record<string, unknown>;
  } catch {
    throw new AuthError(400, "Request body must be a JSON object.");
  }
}

function clampInt(raw: string | number | null | undefined, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && raw !== null && raw !== undefined && raw !== "" ? Math.max(min, Math.min(max, Math.trunc(n))) : fallback;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms))]);
}

/** The client's address; behind a reverse proxy set LAB_TRUST_PROXY=1 to use X-Forwarded-For. */
function clientIp(req: IncomingMessage): string {
  const forwarded = process.env.LAB_TRUST_PROXY === "1" ? String(req.headers["x-forwarded-for"] ?? "").split(",")[0]?.trim() : "";
  return forwarded || req.socket.remoteAddress || "?";
}

/** Serve a file with byte-range support, so video players can seek. */
function streamFile(req: IncomingMessage, res: ServerResponse, abs: string, type: string, cache: string): void {
  let size: number;
  try {
    const st = statSync(abs);
    if (!st.isFile()) { res.writeHead(404); res.end(); return; }
    size = st.size;
  } catch {
    res.writeHead(404); res.end(); return;
  }
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      res.end();
      return;
    }
    res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Cache-Control": cache });
    const s = createReadStream(abs, { start, end }).on("error", () => { if (!res.headersSent) { res.writeHead(500); } res.end(); });
    s.pipe(res);
    return;
  }
  res.writeHead(200, { "Content-Type": type, "Cache-Control": cache, "Accept-Ranges": "bytes", "Content-Length": size });
  const s = createReadStream(abs).on("error", () => { if (!res.headersSent) { res.writeHead(500); } res.end(); });
  s.pipe(res);
}

export interface ExportOptions {
  out: string;
  /** Include at most this many runs (newest first). */
  maxRuns: number;
  /** Embed step screenshots as data URIs (bigger file, fully self-contained). */
  screenshots: boolean;
  /** Embed screenshots for at most this many runs (newest first), to bound file size. */
  screenshotRuns?: number;
  /** Write page content without the html/head/body wrapper (for hosts that add their own). */
  fragment?: boolean;
  /** Embed the narrated MP4 and captions of at most this many recordings (newest first). */
  recordings?: number;
  root?: string;
}

/**
 * A single self-contained HTML file with the data baked in: for CI artifacts, sharing, or
 * opening without the server.
 */
export function exportDashboard(options: ExportOptions): { path: string; runs: number; bytes: number } {
  const data = new LabData(options.root);
  const index = data.index();
  const runs = index.runs.slice(0, options.maxRuns);
  const details: Record<string, RunDetail> = {};
  const files: Record<string, string> = {};
  let withShots = 0;
  for (const run of runs) {
    const detail = data.run(run.dir);
    if (!detail) continue;
    details[run.dir] = detail;
    if (!options.screenshots || run.screenshots === 0 || withShots >= (options.screenshotRuns ?? Infinity)) continue;
    withShots++;
    for (const e of detail.events) {
      if (e.type !== "step" || !e.screenshot) continue;
      const rel = join(run.dir, basename(e.screenshot));
      const abs = data.safe(rel);
      if (abs && existsSync(abs)) files[rel] = `data:image/jpeg;base64,${readFileSync(abs).toString("base64")}`;
    }
  }
  const recordings = index.recordings.slice(0, options.recordings ?? 1);
  for (const rec of recordings) {
    for (const [name, mime] of [[rec.media.mp4, "video/mp4"], [rec.media.webm ?? null, "video/webm"], [rec.media.captions, "text/vtt"]] as const) {
      const abs = name ? data.safe(join(rec.dir, name)) : null;
      if (abs && existsSync(abs)) files[join(rec.dir, name!)] = `data:${mime};base64,${readFileSync(abs).toString("base64")}`;
    }
  }
  const payload: { index: LabIndex; details: Record<string, RunDetail>; files: Record<string, string> } = {
    index: { ...index, runs, recordings },
    details,
    files,
  };
  const script = `<script>window.__LAB_DATA__=${JSON.stringify(payload).replace(/</g, "\\u003c")}</script>`;
  let html = dashboardHtml().replace("</head>", `${script}</head>`);
  if (options.fragment) {
    const head = html.match(/<head>([\s\S]*)<\/head>/)?.[1] ?? "";
    const body = html.match(/<body>([\s\S]*)<\/body>/)?.[1] ?? "";
    html = head.replace(/<meta charset[^>]*>\s*/i, "").replace(/<meta name="viewport"[^>]*>\s*/i, "") + body;
  }
  writeFileSync(options.out, html);
  return { path: options.out, runs: Object.keys(details).length, bytes: Buffer.byteLength(html) };
}
