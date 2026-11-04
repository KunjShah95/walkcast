import { chmodSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { masterKey, openAtRest, sealAtRest } from "../../../packages/core/src/jobs/secret-box.ts";
import { PROVIDERS, apiKey, baseURL } from "../../../packages/core/src/llm/providers.ts";
import { log } from "../../../packages/core/src/ops/log.ts";
import { clearVoicePreviews, cloudVoicePreview } from "../../../packages/core/src/record/media.ts";
import { configuredCloudProviders } from "../../../packages/core/src/record/voice.ts";
import { credentialFor, providerLabel } from "../../../packages/core/src/record/voices.ts";
import { capabilitiesCache } from "./caches.ts";

/**
 * The server-wide credentials the Settings panel edits: which keys exist, where they are kept
 * (owner-readable, or sealed under WALKCAST_MASTER_KEY), and how a saved key is tested. Moved out
 * of server.ts unchanged; server.ts re-exports the public part.
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
export function credentialNames(env: string): string[] {
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
export function connectedProviders(user: { openrouterKey?: string; chatgpt?: { refreshToken?: string } } | null): string[] {
  const out: string[] = [];
  if (user?.openrouterKey) out.push("openrouter");
  if (user?.chatgpt?.refreshToken) out.push("chatgpt");
  return out;
}

function credentialsPath(root: string): string {
  return join(root, ".walkcast-credentials.json");
}

/** The same credentials, encrypted under WALKCAST_MASTER_KEY: written instead of the plaintext file when that key is set. */
function encryptedCredentialsPath(root: string): string {
  return join(root, ".walkcast-credentials.enc");
}

function parseCredentials(text: string): Record<string, string> {
  try {
    const v = JSON.parse(text) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === "string"));
  } catch {
    return {};
  }
}

/** Write a file readable by its owner only, atomically: a crash mid-write must not lose every saved key. */
function writePrivateFile(p: string, body: string): void {
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, body, { mode: 0o600 });
  try {
    chmodSync(tmp, 0o600);
  } catch {
    /* a filesystem without POSIX permissions (Windows) has nothing to tighten */
  }
  renameSync(tmp, p);
}

/**
 * The saved credentials.
 *
 * With WALKCAST_MASTER_KEY set they live encrypted in .walkcast-credentials.enc. A plaintext
 * .walkcast-credentials.json from before is folded in, re-saved encrypted, and then deleted, so
 * the keys stop sitting on disk in the clear. An encrypted file that this key can't open throws
 * rather than reading as empty: saving over it would silently drop every other saved key.
 * Without the master key nothing changes: the plaintext file, owner-readable only.
 */
export function readCredentials(root: string): Record<string, string> {
  const plain = credentialsPath(root);
  const enc = encryptedCredentialsPath(root);
  if (!masterKey()) {
    if (!existsSync(plain)) {
      if (existsSync(enc)) log.warn("credentials.locked", { reason: "WALKCAST_MASTER_KEY is not set, so the encrypted credentials file can't be read" });
      return {};
    }
    return parseCredentials(readFileSync(plain, "utf8"));
  }
  let data: Record<string, string> = {};
  if (existsSync(enc)) {
    try {
      data = parseCredentials(openAtRest(readFileSync(enc, "utf8")));
    } catch (e) {
      throw new Error(`The saved credentials can't be opened with this WALKCAST_MASTER_KEY (${e instanceof Error ? e.message : String(e)}).`);
    }
  }
  if (existsSync(plain)) {
    // Migration: the encrypted copy wins where both name a key (it was written later).
    data = { ...parseCredentials(readFileSync(plain, "utf8")), ...data };
    writePrivateFile(enc, sealAtRest(JSON.stringify(data)));
    // Only once the encrypted copy is on disk and opens again.
    if (JSON.stringify(parseCredentials(openAtRest(readFileSync(enc, "utf8")))) === JSON.stringify(data)) {
      rmSync(plain, { force: true });
      log.info("credentials.encrypted", { keys: Object.keys(data).length });
    }
  }
  return data;
}

function writeCredentials(root: string, data: Record<string, string>): void {
  if (masterKey()) {
    writePrivateFile(encryptedCredentialsPath(root), sealAtRest(JSON.stringify(data)));
    rmSync(credentialsPath(root), { force: true });
    return;
  }
  // The file holds the keys in plain text, so it is readable by its owner only.
  writePrivateFile(credentialsPath(root), JSON.stringify(data, null, 2));
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
  try {
    for (const [k, v] of Object.entries(readCredentials(root))) {
      if (CREDENTIAL_KEYS.some((c) => c.env === k)) setCredential(k, v);
    }
  } catch (e) {
    log.warn("credentials.unreadable", { error: e instanceof Error ? e.message : String(e) });
  }
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

export function saveCredential(root: string, env: string, value: string): void {
  const data = readCredentials(root);
  if (value) data[env] = value; else delete data[env];
  writeCredentials(root, data);
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
export async function testCredential(env: string): Promise<{ ok: boolean; message: string }> {
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
