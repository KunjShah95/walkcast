/**
 * Voice synthesis backends for Walkcast's narration pipeline. The engine produces a WAV (or any
 * ffmpeg-readable file) for one line of text; the pipeline in `media.ts` mixes and muxes the rest.
 *
 * Backend selection honours `LAB_TTS_PROVIDER` (`flite` (default), `sarvam`, `bhashini`,
 * `elevenlabs`). Any failure to reach the provider throws so the recording still ships with video
 * + captions (the existing `buildMedia` catch keeps what we have). Keys never leave the server.
 */
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FFMPEG = process.env.LAB_FFMPEG ?? "ffmpeg";
const execFileAsync = promisify(execFile);
async function run(args: string[], opts: { cwd?: string } = {}): Promise<void> {
  await execFileAsync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], { cwd: opts.cwd, maxBuffer: 4 * 1024 * 1024, timeout: 5 * 60_000, killSignal: "SIGKILL" });
}

export interface VoiceEngine {
  /** Short label shown in `MediaResult.note` and in the voice picker. */
  readonly id: string;
  /** Where text-to-speech runs for this engine. */
  readonly kind: "local" | "cloud";
  /** Synthesize `text` into `outFile`. */
  speak(text: string, outFile: string, cwd: string): Promise<void>;
  /** Zero-network engines are always available; cloud ones need a key + network. */
  available(): boolean;
}

const VOICES = ["slt", "awb", "kal", "rms"] as const;
export type FliteVoice = (typeof VOICES)[number];

export function fliteEngine(voice: FliteVoice): VoiceEngine {
  return {
    id: `flite:${voice}`,
    kind: "local",
    available: (): boolean => true,
    async speak(text, outFile, cwd) {
      const txt = join(cwd, ".tts-tmp.txt");
      writeFileSync(txt, text.replace(/[{}]/g, ""));
      await run(["-f", "lavfi", "-i", `flite=textfile=.tts-tmp.txt:voice=${voice}`, "-ar", "22050", "-ac", "1", outFile], { cwd });
    },
  };
}

/** Best-effort Sarvam (Bulbul) backend. Endpoint shape per Sarvam's public API as of 2026. */
export function sarvamEngine(): VoiceEngine | null {
  const key = process.env.SARVAM_API_KEY?.trim();
  if (!key) return null;
  const language = process.env.LAB_TTS_LANGUAGE ?? "en-IN";
  return {
    id: "sarvam:bulbul",
    kind: "cloud",
    available: (): boolean => Boolean(key),
    async speak(text, outFile) {
      const res = await fetch("https://api.sarvam.ai/text-to-speech", {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-subscription-key": key },
        body: JSON.stringify({ inputs: [text], target_language_code: language, speaker: process.env.SARVAM_SPEAKER ?? "anushka", model: "bulbul:v2" }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`sarvam TTS failed (${res.status})`);
      const json = (await res.json()) as { audios?: string[] };
      const encoded = json.audios?.[0];
      if (!encoded) throw new Error("sarvam returned no audio");
      const buf = Buffer.from(encoded, "base64");
      const { writeFile } = await import("node:fs/promises");
      await writeFile(outFile, buf);
    },
  };
}

/**
 * The speech engine built into Windows (SAPI, System.Speech), driven through PowerShell. Every
 * Windows 10/11 install has it, while the ffmpeg builds people get on Windows (gyan.dev, BtbN)
 * leave out flite, so this is what narrates on Windows. The flite voice names map to a gender:
 * slt is female, the others male; Windows picks its installed voice for that gender.
 */
export function sapiEngine(voice: FliteVoice): VoiceEngine {
  const gender = voice === "slt" ? "Female" : "Male";
  return {
    id: `windows:${gender.toLowerCase()}`,
    kind: "local",
    available: sapiAvailable,
    async speak(text, outFile, cwd) {
      const txt = join(cwd, ".tts-tmp.txt");
      writeFileSync(txt, text, "utf8");
      // Paths and text reach PowerShell through the environment, so nothing needs quoting.
      await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", SAPI_SCRIPT], {
        env: { ...process.env, WALKCAST_TTS_IN: txt, WALKCAST_TTS_OUT: outFile, WALKCAST_TTS_GENDER: gender },
        timeout: 60_000,
        windowsHide: true,
      });
      if (!existsSync(outFile)) throw new Error("Windows speech produced no audio");
    },
  };
}

const SAPI_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "Add-Type -AssemblyName System.Speech",
  "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
  "try { $s.SelectVoiceByHints([System.Speech.Synthesis.VoiceGender]::$env:WALKCAST_TTS_GENDER) } catch {}",
  "$f = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)",
  "$s.SetOutputToWaveFile($env:WALKCAST_TTS_OUT, $f)",
  "$s.Speak([IO.File]::ReadAllText($env:WALKCAST_TTS_IN))",
  "$s.Dispose()",
].join("; ");

let sapi: boolean | undefined;
/** Whether Windows speech is usable here: Windows, PowerShell, and at least one installed voice. */
export function sapiAvailable(): boolean {
  if (sapi === undefined) {
    if (process.platform !== "win32" || process.env.LAB_TTS_PROVIDER === "flite") return (sapi = false);
    const out = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices().Count"],
      { encoding: "utf8", timeout: 30_000, windowsHide: true },
    );
    sapi = out.status === 0 && Number.parseInt(out.stdout.trim(), 10) > 0;
  }
  return sapi;
}

export function bhashiniEngine(): VoiceEngine | null {
  const key = process.env.BHASHINI_API_KEY?.trim() || process.env.ULCA_API_KEY?.trim();
  const userId = process.env.BHASHINI_USER_ID?.trim() || process.env.ULCA_USER_ID?.trim();
  if (!key || !userId) return null;
  const language = process.env.LAB_TTS_LANGUAGE ?? "hi";
  const serviceId = process.env.BHASHINI_TTS_SERVICE_ID?.trim() || "ai4bharat/indic-tts-coqui-indic--gpu--t4";
  return {
    id: "bhashini:tts",
    kind: "cloud",
    available: (): boolean => Boolean(key && userId),
    async speak(text, outFile) {
      const res = await fetch("https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json", "ulcaApiKey": key, "userID": userId },
        body: JSON.stringify({ modelId: serviceId, task: "tts", input: [{ source: text }], config: { language: { sourceLanguage: language } } }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`bhashini TTS failed (${res.status})`);
      const json = (await res.json()) as { audio?: Array<{ audioContent?: string }> };
      const encoded = json.audio?.[0]?.audioContent;
      if (!encoded) throw new Error("bhashini returned no audio");
      const { writeFile } = await import("node:fs/promises");
      await writeFile(outFile, Buffer.from(encoded, "base64"));
    },
  };
}

export function elevenLabsEngine(): VoiceEngine | null {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) return null;
  const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim() || "21m00Tcm4TlvDq8ikWAM";
  const model = process.env.ELEVENLABS_MODEL?.trim() || "eleven_multilingual_v2";
  return {
    id: "elevenlabs:tts",
    kind: "cloud",
    available: (): boolean => Boolean(key),
    async speak(text, outFile) {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "xi-api-key": key, "Accept": "audio/mpeg" },
        body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`elevenlabs TTS failed (${res.status})`);
      const buf = Buffer.from(await res.arrayBuffer());
      const tmp = outFile + ".mp3";
      const { writeFile } = await import("node:fs/promises");
      await writeFile(tmp, buf);
      await run(["-i", tmp, "-ar", "22050", "-ac", "1", outFile]);
      const { rmSync } = await import("node:fs");
      rmSync(tmp, { force: true });
    },
  };
}

/** Google Cloud Text-to-Speech (Indian voices: en-IN, hi-IN, ta-IN, te-IN, ...). */
export function googleCloudTtsEngine(): VoiceEngine | null {
  const key = process.env.GOOGLE_TTS_API_KEY?.trim() || process.env.GOOGLE_CLOUD_API_KEY?.trim();
  if (!key) return null;
  const language = process.env.LAB_TTS_LANGUAGE ?? "en-IN";
  const voice = process.env.GOOGLE_TTS_VOICE?.trim() || (language.startsWith("hi") ? "hi-IN-Wavenet-A" : "en-IN-Wavenet-A");
  return {
    id: "google:tts",
    kind: "cloud",
    available: (): boolean => Boolean(key),
    async speak(text, outFile) {
      const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: { text }, voice: { languageCode: language, name: voice }, audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: 22050 } }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`google TTS failed (${res.status})`);
      const json = (await res.json()) as { audioContent?: string };
      if (!json.audioContent) throw new Error("google TTS returned no audio");
      const { writeFile } = await import("node:fs/promises");
      await writeFile(outFile, Buffer.from(json.audioContent, "base64"));
    },
  };
}

/** Azure Cognitive Services TTS (Indian voices). */
export function azureTtsEngine(): VoiceEngine | null {
  const key = process.env.AZURE_TTS_KEY?.trim() || process.env.AZURE_SPEECH_KEY?.trim();
  const region = process.env.AZURE_TTS_REGION?.trim() || process.env.AZURE_SPEECH_REGION?.trim();
  if (!key || !region) return null;
  const language = process.env.LAB_TTS_LANGUAGE ?? "en-IN";
  const voice = process.env.AZURE_TTS_VOICE?.trim() || (language.startsWith("hi") ? "hi-IN-SwaraNeural" : "en-IN-NeerjaNeural");
  return {
    id: "azure:tts",
    kind: "cloud",
    available: (): boolean => Boolean(key && region),
    async speak(text, outFile) {
      const safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      const ssml = "<speak version='1.0' xml:lang='" + language + "'><voice name='" + voice + "'>" + safe + "</voice></speak>";
      const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: "POST",
        headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "riff-22khz-16bit-mono-pcm" },
        body: ssml,
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`azure TTS failed (${res.status})`);
      const { writeFile } = await import("node:fs/promises");
      await writeFile(outFile, Buffer.from(await res.arrayBuffer()));
    },
  };
}

/** AWS Polly (Indian English + Hindi). Uses env credentials; signs with SigV4 is overkill, so this
 *  uses the simpler presigned Polly endpoint via the AWS SDK-less REST with basic auth-less flow.
 *  For production, set AWS credentials and use the AWS CLI/SDK; here we hit Polly's synthesize
 *  endpoint with the standard AWS4 signing via fetch is not trivial, so this engine is a thin
 *  wrapper that shells out to the AWS CLI when available. */
export function awsPollyEngine(): VoiceEngine | null {
  const voice = process.env.AWS_POLLY_VOICE?.trim() || "Aditi";
  const region = process.env.AWS_REGION?.trim() || "ap-south-1";
  const lang = process.env.LAB_TTS_LANGUAGE ?? "en-IN";
  return {
    id: "awspolly:tts",
    kind: "cloud",
    available: (): boolean => Boolean(process.env.AWS_ACCESS_KEY_ID || process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI),
    async speak(text, outFile) {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const run = promisify(execFile);
      const tmp = outFile + ".mp3";
      await run("aws", ["polly", "synthesize-speech", "--region", region, "--output-format", "mp3", "--voice-id", voice, "--language-code", lang, "--text", text, tmp]);
      await run(process.env.LAB_FFMPEG ?? "ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", tmp, "-ar", "22050", "-ac", "1", outFile]);
      const { rmSync } = await import("node:fs");
      rmSync(tmp, { force: true });
    },
  };
}

/** OpenAI TTS (gpt-4o-mini-tts / tts-1). */
export function openaiTtsEngine(): VoiceEngine | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  const model = process.env.OPENAI_TTS_MODEL?.trim() || "gpt-4o-mini-tts";
  const voice = process.env.OPENAI_TTS_VOICE?.trim() || "alloy";
  return {
    id: "openai:tts",
    kind: "cloud",
    available: (): boolean => Boolean(key),
    async speak(text, outFile) {
      const res = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({ model, input: text, voice, response_format: "wav" }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`openai TTS failed (${res.status})`);
      const { writeFile } = await import("node:fs/promises");
      await writeFile(outFile, Buffer.from(await res.arrayBuffer()));
    },
  };
}

/** Murf AI TTS (Indian voices). */
export function murfEngine(): VoiceEngine | null {
  const key = process.env.MURF_API_KEY?.trim();
  if (!key) return null;
  const voice = process.env.MURF_VOICE?.trim() || "en-IN-isha";
  return {
    id: "murf:tts",
    kind: "cloud",
    available: (): boolean => Boolean(key),
    async speak(text, outFile) {
      const res = await fetch("https://api.murf.ai/v1/speech/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": key },
        body: JSON.stringify({ text, voiceId: voice, format: "WAV" }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`murf TTS failed (${res.status})`);
      const json = (await res.json()) as { audioFile?: string };
      if (!json.audioFile) throw new Error("murf returned no audio");
      const audioRes = await fetch(json.audioFile);
      const { writeFile } = await import("node:fs/promises");
      await writeFile(outFile, Buffer.from(await audioRes.arrayBuffer()));
    },
  };
}

/** Reverie (Indian language TTS). */
export function reverieEngine(): VoiceEngine | null {
  const key = process.env.REVERIE_API_KEY?.trim();
  const appId = process.env.REVERIE_APP_ID?.trim();
  if (!key || !appId) return null;
  const language = process.env.LAB_TTS_LANGUAGE ?? "hi";
  return {
    id: "reverie:tts",
    kind: "cloud",
    available: (): boolean => Boolean(key && appId),
    async speak(text, outFile) {
      const res = await fetch("https://revapi.reverieinc.com/", {
        method: "POST",
        headers: { "Content-Type": "application/json", "REV-API-KEY": key, "REV-APP-ID": appId, "src_lang": language, "tgt_lang": language, "REV-APPNAME": "tts" },
        body: JSON.stringify({ text, speaker: process.env.REVERIE_SPEAKER ?? "female" }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`reverie TTS failed (${res.status})`);
      const { writeFile } = await import("node:fs/promises");
      await writeFile(outFile, Buffer.from(await res.arrayBuffer()));
    },
  };
}

/** Generic "Maya"-style / custom HTTP TTS endpoint. POST {text} -> audio bytes or {audio}. */
export function customTtsEngine(): VoiceEngine | null {
  const endpoint = process.env.LAB_TTS_ENDPOINT?.trim();
  if (!endpoint) return null;
  const key = process.env.LAB_TTS_API_KEY?.trim();
  const language = process.env.LAB_TTS_LANGUAGE ?? "en";
  return {
    id: "custom:tts",
    kind: "cloud",
    available: (): boolean => Boolean(endpoint),
    async speak(text, outFile) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(key ? { "Authorization": `Bearer ${key}` } : {}) },
        body: JSON.stringify({ text, language, voice: process.env.LAB_TTS_VOICE }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`custom TTS failed (${res.status})`);
      const ct = res.headers.get("content-type") ?? "";
      const { writeFile } = await import("node:fs/promises");
      if (ct.includes("application/json")) {
        const json = (await res.json()) as { audio?: string; audioContent?: string; url?: string };
        const encoded = json.audio || json.audioContent;
        if (encoded) { await writeFile(outFile, Buffer.from(encoded, "base64")); return; }
        if (json.url) {
          const a = await fetch(json.url);
          await writeFile(outFile, Buffer.from(await a.arrayBuffer()));
          return;
        }
        throw new Error("custom TTS returned no audio");
      }
      await writeFile(outFile, Buffer.from(await res.arrayBuffer()));
    },
  };
}

/** Resolve a VoiceEngine for a given provider name (or null to fall back to local flite). */
export function engineFor(provider: string | undefined, voice: FliteVoice = "slt"): VoiceEngine | null {
  const p = (provider ?? process.env.LAB_TTS_PROVIDER ?? "flite").trim().toLowerCase();
  if (p === "sarvam") return sarvamEngine();
  if (p === "bhashini") return bhashiniEngine();
  if (p === "elevenlabs") return elevenLabsEngine();
  if (p === "google") return googleCloudTtsEngine();
  if (p === "azure") return azureTtsEngine();
  if (p === "awspolly" || p === "polly") return awsPollyEngine();
  if (p === "openai") return openaiTtsEngine();
  if (p === "murf") return murfEngine();
  if (p === "reverie") return reverieEngine();
  if (p === "custom" || p === "maya") return customTtsEngine();
  // "flite" is what the dashboard sends for its local default: return null so the caller uses the
  // machine's built-in voice (media.localVoice: flite where ffmpeg has it, Windows speech otherwise).
  // Forcing flite here would fail on every Windows PC, whose ffmpeg builds have no flite.
  void voice;
  return null;
}

export function chooseVoiceEngine(): VoiceEngine {
  const choice = (process.env.LAB_TTS_PROVIDER ?? "flite").trim().toLowerCase();
  const tryEngine = (name: string, fn: () => VoiceEngine | null): VoiceEngine | null => {
    const e = fn();
    if (e) return e;
    console.warn(`LAB_TTS_PROVIDER=${name} but it is not configured; falling back to flite.`);
    return null;
  };
  if (choice === "sarvam") { const e = tryEngine("sarvam", sarvamEngine); if (e) return e; }
  else if (choice === "bhashini") { const e = tryEngine("bhashini", bhashiniEngine); if (e) return e; }
  else if (choice === "elevenlabs") { const e = tryEngine("elevenlabs", elevenLabsEngine); if (e) return e; }
  else if (choice === "google") { const e = tryEngine("google", googleCloudTtsEngine); if (e) return e; }
  else if (choice === "azure") { const e = tryEngine("azure", azureTtsEngine); if (e) return e; }
  else if (choice === "awspolly" || choice === "polly") { const e = tryEngine("awspolly", awsPollyEngine); if (e) return e; }
  else if (choice === "openai") { const e = tryEngine("openai", openaiTtsEngine); if (e) return e; }
  else if (choice === "murf") { const e = tryEngine("murf", murfEngine); if (e) return e; }
  else if (choice === "reverie") { const e = tryEngine("reverie", reverieEngine); if (e) return e; }
  else if (choice === "custom" || choice === "maya") { const e = tryEngine("custom", customTtsEngine); if (e) return e; }
  return fliteEngine(process.env.LAB_TTS_VOICE ? (process.env.LAB_TTS_VOICE as any) : "slt");
}

export async function sarvamTranscribe(audioPath: string, language = "unknown"): Promise<string> {
  const key = process.env.SARVAM_API_KEY?.trim();
  if (!key) throw new Error("SARVAM_API_KEY is required for STT");
  const { readFile } = await import("node:fs/promises");
  const buf = await readFile(audioPath);
  const form = new FormData();
  form.append("file", new Blob([buf]), "audio.wav");
  form.append("language_code", language);
  form.append("model", "saaras:v1");
  const res = await fetch("https://api.sarvam.ai/speech-to-text", {
    method: "POST",
    headers: { "api-subscription-key": key },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`sarvam STT failed (${res.status})`);
  const json = (await res.json()) as { transcript?: string };
  return json.transcript ?? "";
}
