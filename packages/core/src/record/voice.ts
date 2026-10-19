/**
 * Voice synthesis backends for Walkcast's narration pipeline. The engine produces a WAV (or any
 * ffmpeg-readable file) for one line of text; the pipeline in `media.ts` mixes and muxes the rest.
 *
 * Backend selection honours `LAB_TTS_PROVIDER` (`sarvam`, `bhashini`, `elevenlabs`, ...). The
 * offline flite/Windows voice only speaks when `LAB_TTS_PROVIDER=flite` asks for it by name: by
 * default a recording ships silent with captions. Any failure to reach the provider throws so the recording still ships with video
 * + captions (the existing `buildMedia` catch keeps what we have). Keys never leave the server.
 */
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveLanguage, resolveVoice } from "./voices.ts";

const FFMPEG = process.env.LAB_FFMPEG ?? "ffmpeg";
const execFileAsync = promisify(execFile);
async function run(args: string[], opts: { cwd?: string } = {}): Promise<void> {
  await execFileAsync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], { cwd: opts.cwd, maxBuffer: 4 * 1024 * 1024, timeout: 5 * 60_000, killSignal: "SIGKILL" });
}

export interface VoiceEngine {
  /** Short label shown in `MediaResult.note` and in the voice picker. */
  readonly id: string;
  /** Where text-to-speech runs for this engine. */
  readonly kind: "local" | "cloud" | "custom-voice";
  /** Synthesize `text` into `outFile`. */
  speak(text: string, outFile: string, cwd: string): Promise<void>;
  /** Zero-network engines are always available; cloud ones need a key + network. */
  available(): boolean;
}

export type FliteVoice = "slt" | "awb" | "kal" | "rms";

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
export function sarvamEngine(cloudVoice?: string, cloudLanguage?: string): VoiceEngine | null {
  const key = process.env.SARVAM_API_KEY?.trim();
  if (!key) return null;
  const language = resolveLanguage("sarvam", cloudLanguage, cloudVoice);
  const speaker = cloudVoice?.trim() || process.env.SARVAM_SPEAKER?.trim() || "anushka";
  return {
    id: `sarvam:${speaker}`,
    kind: "cloud",
    available: (): boolean => Boolean(key),
    async speak(text, outFile) {
      const res = await fetch("https://api.sarvam.ai/text-to-speech", {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-subscription-key": key },
        body: JSON.stringify({ inputs: [text], target_language_code: language, speaker, model: "bulbul:v2" }),
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

export function bhashiniEngine(cloudVoice?: string, cloudLanguage?: string): VoiceEngine | null {
  const key = process.env.BHASHINI_API_KEY?.trim() || process.env.ULCA_API_KEY?.trim();
  const userId = process.env.BHASHINI_USER_ID?.trim() || process.env.ULCA_USER_ID?.trim();
  if (!key || !userId) return null;
  const language = resolveLanguage("bhashini", cloudLanguage, cloudVoice);
  const serviceId = cloudVoice?.trim() || process.env.BHASHINI_TTS_SERVICE_ID?.trim() || "ai4bharat/indic-tts-coqui-indic--gpu--t4";
  return {
    id: `bhashini:${serviceId.split("/").pop()}`,
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

/** A premade ElevenLabs voice (Sarah): usable on every plan, including free API keys. */
const ELEVENLABS_PREMADE = "EXAVITQu4vr4xnSDxMaL";

/** ElevenLabs' own explanation of a failure ("quota exceeded", "invalid key"), kept short. */
function elevenLabsMessage(body: string): string {
  try {
    const d = (JSON.parse(body) as { detail?: { message?: string } | string }).detail;
    const msg = typeof d === "string" ? d : d?.message;
    if (msg) return msg.slice(0, 160);
  } catch { /* not JSON */ }
  return body.slice(0, 160) || "no details";
}

export function elevenLabsEngine(cloudVoice?: string): VoiceEngine | null {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) return null;
  let voiceId = resolveVoice("elevenlabs", cloudVoice);
  const model = process.env.ELEVENLABS_MODEL?.trim() || "eleven_multilingual_v2";
  const say = (text: string) =>
    fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": key, "Accept": "audio/mpeg" },
      body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
      signal: AbortSignal.timeout(60_000),
    });
  return {
    get id() {
      return `elevenlabs:${voiceId}`;
    },
    kind: "cloud",
    available: (): boolean => Boolean(key),
    async speak(text, outFile) {
      let res = await say(text);
      // Free accounts may only use premade voices through the API; a library voice (one picked
      // in an older build, or set in ELEVENLABS_VOICE_ID) answers 402. Switch to a premade voice
      // for the rest of the recording rather than losing the narration.
      if (res.status === 402 && voiceId !== ELEVENLABS_PREMADE) {
        const body = await res.text();
        if (/paid_plan_required|library voice/i.test(body)) {
          voiceId = ELEVENLABS_PREMADE;
          res = await say(text);
        } else {
          throw new Error(`elevenlabs TTS failed (402): ${elevenLabsMessage(body)}`);
        }
      }
      if (!res.ok) throw new Error(`elevenlabs TTS failed (${res.status}): ${elevenLabsMessage(await res.text())}`);
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
export function googleCloudTtsEngine(cloudVoice?: string, cloudLanguage?: string): VoiceEngine | null {
  const key = process.env.GOOGLE_TTS_API_KEY?.trim() || process.env.GOOGLE_CLOUD_API_KEY?.trim();
  if (!key) return null;
  const voice = resolveVoice("google", cloudVoice);
  // The voice id carries the locale ("en-IN-Neural2-A"), and Google rejects a mismatched
  // languageCode, so the voice decides unless the picker sent an explicit language.
  const language = resolveLanguage("google", cloudLanguage, voice);
  return {
    id: `google:${voice}`,
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
export function azureTtsEngine(cloudVoice?: string, cloudLanguage?: string): VoiceEngine | null {
  const key = process.env.AZURE_TTS_KEY?.trim() || process.env.AZURE_SPEECH_KEY?.trim();
  const region = process.env.AZURE_TTS_REGION?.trim() || process.env.AZURE_SPEECH_REGION?.trim();
  if (!key || !region) return null;
  const voice = resolveVoice("azure", cloudVoice);
  // A neural voice id starts with its locale ("hi-IN-SwaraNeural"); the SSML lang has to agree.
  const language = resolveLanguage("azure", cloudLanguage, voice);
  return {
    id: `azure:${voice}`,
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
export function awsPollyEngine(cloudVoice?: string, cloudLanguage?: string): VoiceEngine | null {
  const voice = resolveVoice("awspolly", cloudVoice) || "Aditi";
  const region = process.env.AWS_REGION?.trim() || "ap-south-1";
  // Polly ids carry no locale, so the catalog maps each voice to the language it may be used with.
  const lang = resolveLanguage("awspolly", cloudLanguage, voice);
  return {
    id: `awspolly:${voice}`,
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
export function openaiTtsEngine(cloudVoice?: string): VoiceEngine | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  const model = process.env.OPENAI_TTS_MODEL?.trim() || "gpt-4o-mini-tts";
  const voice = resolveVoice("openai", cloudVoice) || "alloy";
  return {
    id: `openai:${voice}`,
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
export function murfEngine(cloudVoice?: string): VoiceEngine | null {
  const key = process.env.MURF_API_KEY?.trim();
  if (!key) return null;
  const voice = cloudVoice?.trim() || process.env.MURF_VOICE?.trim() || "en-IN-isha";
  return {
    id: `murf:${voice}`,
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
export function reverieEngine(cloudVoice?: string, cloudLanguage?: string): VoiceEngine | null {
  const key = process.env.REVERIE_API_KEY?.trim();
  const appId = process.env.REVERIE_APP_ID?.trim();
  if (!key || !appId) return null;
  const language = resolveLanguage("reverie", cloudLanguage, cloudVoice);
  const speaker = cloudVoice?.trim() || process.env.REVERIE_SPEAKER?.trim() || "female";
  return {
    id: `reverie:${speaker}`,
    kind: "cloud",
    available: (): boolean => Boolean(key && appId),
    async speak(text, outFile) {
      const res = await fetch("https://revapi.reverieinc.com/", {
        method: "POST",
        headers: { "Content-Type": "application/json", "REV-API-KEY": key, "REV-APP-ID": appId, "src_lang": language, "tgt_lang": language, "REV-APPNAME": "tts" },
        body: JSON.stringify({ text, speaker }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`reverie TTS failed (${res.status})`);
      const { writeFile } = await import("node:fs/promises");
      await writeFile(outFile, Buffer.from(await res.arrayBuffer()));
    },
  };
}

/** Generic "Maya"-style / custom HTTP TTS endpoint. POST {text} -> audio bytes or {audio}. */
export function customTtsEngine(cloudVoice?: string, cloudLanguage?: string): VoiceEngine | null {
  const endpoint = process.env.LAB_TTS_ENDPOINT?.trim();
  if (!endpoint) return null;
  const key = process.env.LAB_TTS_API_KEY?.trim();
  const language = resolveLanguage("custom", cloudLanguage, cloudVoice);
  const voice = cloudVoice?.trim() || process.env.LAB_TTS_VOICE?.trim() || undefined;
  return {
    id: `custom:${voice ?? "default"}`,
    kind: "cloud",
    available: (): boolean => Boolean(endpoint),
    async speak(text, outFile) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(key ? { "Authorization": `Bearer ${key}` } : {}) },
        body: JSON.stringify({ text, language, voice }),
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

/** Play an uploaded custom voice sample as narration (fallback: copy the first sample). */
function customVoiceEngine(): VoiceEngine | null {
  const dir = join(process.cwd(), "data", "voices");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f: string) => /\.(wav|mp3|ogg|m4a)$/i.test(f));
  if (files.length === 0) return null;
  const sample = join(dir, files[0]!);
  return {
    id: "custom-voice",
    kind: "custom-voice",
    available: () => true,
    async speak(_text: string, outFile: string, _cwd: string) {
      const { copyFileSync } = await import("node:fs");
      copyFileSync(sample, outFile);
    },
  };
}

/** Resolve a VoiceEngine for a given provider name (or null to fall back to local flite).
 *
 * `voice` is the local flite name; `cloudVoice` and `cloudLanguage` are the provider's voice id and
 * language as the dashboard picker chose them (see `voices.ts`). Each provider falls back to its own
 * default when they're absent. */
export function engineFor(provider: string | undefined, voice: FliteVoice = "slt", cloudVoice?: string, cloudLanguage?: string): VoiceEngine | null {
  const p = (provider ?? process.env.LAB_TTS_PROVIDER ?? "flite").trim().toLowerCase();
  if (p === "sarvam") return sarvamEngine(cloudVoice, cloudLanguage);
  if (p === "bhashini") return bhashiniEngine(cloudVoice, cloudLanguage);
  if (p === "elevenlabs") return elevenLabsEngine(cloudVoice);
  if (p === "google") return googleCloudTtsEngine(cloudVoice, cloudLanguage);
  if (p === "azure") return azureTtsEngine(cloudVoice, cloudLanguage);
  if (p === "awspolly" || p === "polly") return awsPollyEngine(cloudVoice, cloudLanguage);
  if (p === "openai") return openaiTtsEngine(cloudVoice);
  if (p === "murf") return murfEngine(cloudVoice);
  if (p === "reverie") return reverieEngine(cloudVoice, cloudLanguage);
  if (p === "custom" || p === "maya") return customTtsEngine(cloudVoice, cloudLanguage);
  if (p === "custom-voice" || p === "custom_voice") return customVoiceEngine();
  // "flite" is what the dashboard sends for its local default: return null so the caller uses the
  // machine's built-in voice (media.localVoice: flite where ffmpeg has it, Windows speech otherwise).
  // Forcing flite here would fail on every Windows PC, whose ffmpeg builds have no flite.
  void voice;
  return null;
}

/** The cloud providers that have credentials in this server's environment, for the TTS picker. */
export function configuredCloudProviders(): string[] {
  const candidates = ["sarvam", "bhashini", "elevenlabs", "google", "azure", "awspolly", "openai", "murf", "reverie", "custom"];
  return candidates.filter((p) => engineFor(p) !== null);
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
  else if (choice === "custom-voice" || choice === "custom_voice") { const e = tryEngine("custom-voice", customVoiceEngine); if (e) return e; }
  return fliteEngine(process.env.LAB_TTS_VOICE ? (process.env.LAB_TTS_VOICE as any) : "slt");
}

/** Sarvam transcript text (kept for callers that predate record/stt.ts). */
export async function sarvamTranscribe(audioPath: string, language = "unknown"): Promise<string> {
  const { transcribe } = await import("./stt.ts");
  return (await transcribe(audioPath, { language, provider: "sarvam" })).text;
}
