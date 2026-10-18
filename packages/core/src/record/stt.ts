import { readFile } from "node:fs/promises";
import { basename } from "node:path";

/**
 * Speech-to-text for auto-captions. Providers with real timestamps (OpenAI-compatible
 * `verbose_json`, ElevenLabs Scribe) return timed segments; Sarvam returns text only, which the
 * caller spreads over the audio's duration.
 *
 *   sarvam      SARVAM_API_KEY            saaras:v1 (Indian languages)
 *   openai      OPENAI_API_KEY            LAB_STT_MODEL (default whisper-1)
 *   groq        GROQ_API_KEY              whisper-large-v3-turbo, OpenAI-compatible
 *   elevenlabs  ELEVENLABS_API_KEY        scribe_v1
 *   custom      LAB_STT_BASE_URL (+ LAB_STT_API_KEY)  any OpenAI-compatible /audio/transcriptions
 *
 * LAB_STT_PROVIDER picks one; otherwise the first configured in the order above.
 */
export type SttProvider = "sarvam" | "openai" | "groq" | "elevenlabs" | "custom";
export const STT_PROVIDERS: SttProvider[] = ["sarvam", "openai", "groq", "elevenlabs", "custom"];

export interface Transcript {
  provider: SttProvider;
  text: string;
  /** Timed segments when the provider returns them (seconds). */
  segments?: { start: number; end: number; text: string }[];
}

const env = (k: string) => process.env[k]?.trim() || undefined;

export function sttConfigured(p: SttProvider): boolean {
  switch (p) {
    case "sarvam": return Boolean(env("SARVAM_API_KEY"));
    case "openai": return Boolean(env("OPENAI_API_KEY"));
    case "groq": return Boolean(env("GROQ_API_KEY"));
    case "elevenlabs": return Boolean(env("ELEVENLABS_API_KEY"));
    case "custom": return Boolean(env("LAB_STT_BASE_URL"));
  }
}

export function configuredSttProviders(): SttProvider[] {
  return STT_PROVIDERS.filter(sttConfigured);
}

/** The provider to use: explicit choice, LAB_STT_PROVIDER, or the first configured one. */
export function chooseSttProvider(choice?: string | null): SttProvider {
  const wanted = (choice || env("LAB_STT_PROVIDER") || "").toLowerCase();
  if (wanted) {
    if (!STT_PROVIDERS.includes(wanted as SttProvider)) throw new Error(`Unknown STT provider '${wanted}'. Known: ${STT_PROVIDERS.join(", ")}`);
    if (!sttConfigured(wanted as SttProvider)) throw new Error(`STT provider '${wanted}' is not configured (missing API key).`);
    return wanted as SttProvider;
  }
  const first = configuredSttProviders()[0];
  if (!first) throw new Error("No speech-to-text provider configured. Set one of SARVAM_API_KEY, OPENAI_API_KEY, GROQ_API_KEY, ELEVENLABS_API_KEY or LAB_STT_BASE_URL.");
  return first;
}

export async function transcribe(audioPath: string, opts: { language?: string; provider?: string | null; fetch?: typeof fetch } = {}): Promise<Transcript> {
  const provider = chooseSttProvider(opts.provider);
  const language = opts.language && opts.language !== "unknown" ? opts.language : undefined;
  const f = opts.fetch ?? fetch;
  const buf = await readFile(audioPath);
  const file = new Blob([buf], { type: mimeFor(audioPath) });
  const name = basename(audioPath);
  switch (provider) {
    case "sarvam": {
      const form = new FormData();
      form.append("file", file, name);
      form.append("language_code", language ?? "unknown");
      form.append("model", "saaras:v1");
      const res = await f("https://api.sarvam.ai/speech-to-text", { method: "POST", headers: { "api-subscription-key": env("SARVAM_API_KEY")! }, body: form, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`sarvam STT failed (${res.status})`);
      const json = (await res.json()) as { transcript?: string };
      return { provider, text: json.transcript ?? "" };
    }
    case "openai":
    case "groq":
    case "custom": {
      const base = provider === "openai" ? "https://api.openai.com/v1" : provider === "groq" ? "https://api.groq.com/openai/v1" : env("LAB_STT_BASE_URL")!.replace(/\/$/, "");
      const key = provider === "openai" ? env("OPENAI_API_KEY") : provider === "groq" ? env("GROQ_API_KEY") : env("LAB_STT_API_KEY");
      const model = env("LAB_STT_MODEL") ?? (provider === "groq" ? "whisper-large-v3-turbo" : "whisper-1");
      const form = new FormData();
      form.append("file", file, name);
      form.append("model", model);
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "segment");
      if (language) form.append("language", language.split("-")[0]!);
      const res = await f(`${base}/audio/transcriptions`, { method: "POST", headers: key ? { Authorization: `Bearer ${key}` } : {}, body: form, signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`${provider} STT failed (${res.status})`);
      const json = (await res.json()) as { text?: string; segments?: { start: number; end: number; text: string }[] };
      const segments = (json.segments ?? []).map((s) => ({ start: Number(s.start), end: Number(s.end), text: String(s.text ?? "").trim() })).filter((s) => s.text && Number.isFinite(s.start) && Number.isFinite(s.end));
      return { provider, text: json.text ?? segments.map((s) => s.text).join(" "), ...(segments.length ? { segments } : {}) };
    }
    case "elevenlabs": {
      const form = new FormData();
      form.append("file", file, name);
      form.append("model_id", env("LAB_STT_MODEL") ?? "scribe_v1");
      if (language) form.append("language_code", language.split("-")[0]!);
      const res = await f("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": env("ELEVENLABS_API_KEY")! }, body: form, signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`elevenlabs STT failed (${res.status})`);
      const json = (await res.json()) as { text?: string; words?: { text: string; start: number; end: number; type?: string }[] };
      return { provider, text: json.text ?? "", ...(json.words?.length ? { segments: groupWords(json.words.filter((w) => w.type !== "spacing" && w.type !== "audio_event")) } : {}) };
    }
  }
}

/** Word timestamps → caption-sized cues: break at sentence ends or every 12 words. */
export function groupWords(words: { text: string; start: number; end: number }[]): { start: number; end: number; text: string }[] {
  const out: { start: number; end: number; text: string }[] = [];
  let cur: { start: number; end: number; parts: string[] } | null = null;
  for (const w of words) {
    const t = w.text.trim();
    if (!t) continue;
    cur ??= { start: w.start, end: w.end, parts: [] };
    cur.parts.push(t);
    cur.end = w.end;
    if (/[.!?]$/.test(t) || cur.parts.length >= 12) {
      out.push({ start: cur.start, end: cur.end, text: cur.parts.join(" ") });
      cur = null;
    }
  }
  if (cur) out.push({ start: cur.start, end: cur.end, text: cur.parts.join(" ") });
  return out;
}

function mimeFor(path: string): string {
  const ext = path.toLowerCase().split(".").pop();
  return ext === "wav" ? "audio/wav" : ext === "mp3" ? "audio/mpeg" : ext === "webm" ? "audio/webm" : ext === "m4a" ? "audio/mp4" : ext === "ogg" ? "audio/ogg" : "application/octet-stream";
}
