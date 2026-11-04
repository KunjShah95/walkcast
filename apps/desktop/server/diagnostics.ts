import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { arch, cpus, freemem, platform, release, totalmem } from "node:os";
import { join } from "node:path";
import { scrubText } from "../../../packages/core/src/capture/secrets.ts";
import { findChrome } from "../../../packages/core/src/lab/chrome.ts";
import { configuredProviders } from "../../../packages/core/src/llm/providers.ts";
import { freeBytes, minFreeDiskBytes } from "../../../packages/core/src/ops/disk.ts";
import { recentLogLines } from "../../../packages/core/src/ops/log.ts";
import { browserSetup } from "../../../packages/core/src/record/browser-install.ts";
import { canEncode, canNarrate, hasFlite } from "../../../packages/core/src/record/media.ts";
import { configuredSttProviders } from "../../../packages/core/src/record/stt.ts";
import { configuredCloudProviders, kokoroAvailable } from "../../../packages/core/src/record/voice.ts";
import type { Job, JobKind, Store } from "../../../packages/core/src/store/index.ts";
import { launchRenderTimeoutMs } from "./desktop-tasks.ts";

/**
 * A support bundle: what someone attaches to a bug report so the problem can be seen without
 * screen-sharing. Versions, the OS, what this machine can do (encode, narrate, which providers
 * are configured — yes/no only), recent job states and their errors, the limits in force, and the
 * recent log. Recorded site addresses can appear (they are what the jobs were about).
 *
 * Never in it: an API key, a password, a cookie or a session token. Every string that goes in is
 * passed through `redact`, which removes the values of every credential this process holds and
 * anything shaped like a secret, whatever field it turned up in.
 */

export interface DiagnosticsContext {
  root: string;
  appRoot: string;
  store: Store;
  storeKind: string;
  mediaKind: string;
  worker: "busy" | "idle" | "off";
  /** The account asking: its own jobs only on a server with accounts (null = all, local use). */
  scope: string | null;
  limits: Record<string, number>;
  credentialEnvs: string[];
  exposed: boolean;
  requireAuth: boolean;
  desktop: boolean;
}

const SECRETISH_ENV = /KEY|TOKEN|SECRET|PASSWORD|PASS\b|COOKIE|SESSION|CREDENTIAL|DB_URL|DATABASE_URL/i;

/** Every secret value this process knows of, longest first (so one inside another can't half-survive). */
function knownSecrets(credentialEnvs: string[]): string[] {
  const values = new Set<string>();
  for (const [name, value] of Object.entries(process.env)) {
    if (!value || value.length < 6) continue;
    if (credentialEnvs.includes(name) || SECRETISH_ENV.test(name)) values.add(value);
  }
  return [...values].sort((a, b) => b.length - a.length);
}

const PATTERNS: [RegExp, string][] = [
  // First, so "Authorization: Bearer x" loses the token, not just the word "Bearer".
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g, "$1 [redacted]"],
  // key=value / "key": "value" for anything named like a secret
  [/((?:pass(?:word)?|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|auth(?:orization)?|cookie|session(?:[_-]?id)?|set-cookie|lab_session|sb-[\w-]*-auth-token)["']?\s*[:=]\s*["']?)([^"'\s,;&}]+)/gi, "$1[redacted]"],
  // Provider key shapes
  [/\b(sk|rk|pk)-(?:ant-|proj-|or-v1-)?[A-Za-z0-9_-]{12,}/g, "[redacted-key]"],
  [/\b(AKIA|ASIA)[A-Z0-9]{12,}\b/g, "[redacted-key]"],
  [/\bAIza[0-9A-Za-z_-]{20,}/g, "[redacted-key]"],
  [/\b(gh[pousr]_[A-Za-z0-9]{20,}|hf_[A-Za-z0-9]{20,}|xai-[A-Za-z0-9]{20,}|gsk_[A-Za-z0-9]{20,})/g, "[redacted-key]"],
  // JWTs (Supabase sessions, OAuth tokens)
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[redacted-token]"],
  // user:password@ in a URL
  [/(\/\/[^/\s:@]+:)[^@\s/]+@/g, "$1[redacted]@"],
  // sealed secrets (secret-box v1)
  [/\bv1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+/g, "[redacted-sealed]"],
];

/** Remove secrets from one string: known values first, then anything shaped like one. */
export function redactText(text: string, secrets: string[]): string {
  let out = scrubText(text);
  for (const s of secrets) out = out.split(s).join("[redacted]");
  for (const [re, to] of PATTERNS) out = out.replace(re, to);
  return out;
}

/** Redact every string inside a JSON-shaped value. */
export function redactDeep<T>(value: T, secrets: string[]): T {
  if (typeof value === "string") return redactText(value, secrets) as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, secrets)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = /^(secret|password|cookie|token|apiKey|openrouterKey|refreshToken|accessToken)$/i.test(k) ? "[redacted]" : redactDeep(v, secrets);
    return out as T;
  }
  return value;
}

function firstLine(cmd: string, args: string[]): string | null {
  try {
    const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 5000, windowsHide: true });
    return r.status === 0 ? (r.stdout.split(/\r?\n/)[0]?.trim() ?? null) : null;
  } catch {
    return null;
  }
}

function appVersion(appRoot: string): string | null {
  if (process.env.WALKCAST_VERSION) return process.env.WALKCAST_VERSION;
  try {
    const p = join(appRoot, "package.json");
    return existsSync(p) ? ((JSON.parse(readFileSync(p, "utf8")) as { version?: string }).version ?? null) : null;
  } catch {
    return null;
  }
}

/** What a job looked like, without its secret and with only the input fields that explain it. */
function jobView(job: Job) {
  const i = job.input as Record<string, unknown>;
  const input: Record<string, unknown> = {};
  for (const k of ["url", "demo", "maxPages", "maxSeconds", "shape", "agent", "fault", "task", "modelMode", "op", "ttsProvider", "narration", "authorizedAt"]) if (i[k] !== undefined) input[k] = i[k];
  if (Array.isArray(i.recordingIds)) input.recordingIds = i.recordingIds.length;
  return { id: job.id, kind: job.kind, status: job.status, attempts: job.attempts, createdAt: job.createdAt, startedAt: job.startedAt, finishedAt: job.finishedAt, progress: job.progress, error: job.error, input };
}

export async function buildDiagnostics(c: DiagnosticsContext): Promise<Record<string, unknown>> {
  const secrets = knownSecrets(c.credentialEnvs);
  const kinds: JobKind[] = ["record", "run", "batch-render"];
  const failed = (await Promise.all(kinds.map((k) => c.store.failedJobs(c.scope, k, 20).catch(() => [] as Job[]))))
    .flat()
    .sort((a, b) => (b.finishedAt ?? b.createdAt).localeCompare(a.finishedAt ?? a.createdAt))
    .slice(0, 20);
  const active = c.scope === null ? [] : (await Promise.all(kinds.map((k) => c.store.activeJob(c.scope, k).catch(() => null)))).filter((j): j is Job => j !== null);
  const ffmpeg = process.env.LAB_FFMPEG ?? "ffmpeg";
  const chrome = findChrome();
  const bundle = {
    generatedAt: new Date().toISOString(),
    versions: {
      app: appVersion(c.appRoot),
      node: process.versions.node,
      v8: process.versions.v8,
      ffmpeg: firstLine(ffmpeg, ["-version"]),
      chromium: chrome ? { path: chrome } : null,
      recordingBrowser: browserSetup(),
    },
    os: { platform: platform(), release: release(), arch: arch(), cpus: cpus().length, totalMemMb: Math.round(totalmem() / 1048576), freeMemMb: Math.round(freemem() / 1048576) },
    server: { store: c.storeKind, media: c.mediaKind, worker: c.worker, exposed: c.exposed, requireAuth: c.requireAuth, desktop: c.desktop, uptimeS: Math.round(process.uptime()) },
    capabilities: {
      canEncode: canEncode(),
      hasFlite: hasFlite(),
      canNarrate: canNarrate(),
      kokoro: kokoroAvailable(),
      providers: Object.fromEntries(configuredProviders().map((p) => [p.id, true])),
      ttsProviders: configuredCloudProviders(),
      sttProviders: configuredSttProviders(),
      // Which credentials are set: yes or no, never the value.
      credentials: Object.fromEntries(c.credentialEnvs.map((env) => [env, Boolean(process.env[env])])),
    },
    disk: { freeMb: await freeBytes(c.root).then((b) => (b === null ? null : Math.round(b / 1048576))), minFreeMb: Math.round(minFreeDiskBytes() / 1048576) },
    limits: { ...c.limits, launchRenderTimeoutMs: launchRenderTimeoutMs() },
    activeJobs: active.map(jobView),
    failedJobs: failed.map(jobView),
    log: recentLogLines(500),
  };
  return redactDeep(bundle, secrets);
}
