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
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { signHeaders } from "../media/s3.ts";
import { resolveLanguage, resolveVoice } from "./voices.ts";

const FFMPEG = process.env.LAB_FFMPEG ?? "ffmpeg";
const execFileAsync = promisify(execFile);
async function run(args: string[], opts: { cwd?: string } = {}): Promise<void> {
  await execFileAsync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], { cwd: opts.cwd, maxBuffer: 4 * 1024 * 1024, timeout: 5 * 60_000, killSignal: "SIGKILL" });
}

/**
 * Whether `file` starts with a RIFF/WAVE header.
 *
 * The name on disk is not a promise about the bytes inside it: a provider answers in its own
 * format, and the extension says nothing. This is the only honest check.
 */
export function isRiffWav(file: string): boolean {
  let fd: number | undefined;
  try {
    fd = openSync(file, "r");
    const head = Buffer.alloc(12);
    const read = readSync(fd, head, 0, 12, 0);
    return read === 12 && head.toString("ascii", 0, 4) === "RIFF" && head.toString("ascii", 8, 12) === "WAVE";
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * Wrap raw 16-bit little-endian mono PCM in a RIFF/WAVE header.
 *
 * Google Cloud TTS answers LINEAR16: bare samples with no header at all. Everything downstream
 * (the duration read, the mix, the browser preview) expects a WAV, and ffmpeg cannot guess the
 * format of a headerless file, so the header is written here rather than guessed at later.
 */
export function pcmToWav(pcm: Buffer, sampleRate = 22050, channels = 1, bitsPerSample = 16): Buffer {
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const head = Buffer.alloc(44);
  head.write("RIFF", 0, "ascii");
  head.writeUInt32LE(36 + pcm.length, 4);
  head.write("WAVE", 8, "ascii");
  head.write("fmt ", 12, "ascii");
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(channels, 22);
  head.writeUInt32LE(sampleRate, 24);
  head.writeUInt32LE(byteRate, 28);
  head.writeUInt16LE(blockAlign, 32);
  head.writeUInt16LE(bitsPerSample, 34);
  head.write("data", 36, "ascii");
  head.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([head, pcm]);
}

/**
 * Whether `file` holds text rather than audio.
 *
 * A provider that has gone wrong answers with an error page or a JSON body, and ffmpeg cannot
 * read either. The raw-PCM reading below would happily take those bytes as samples, so a
 * provider's failure would become a millisecond of noise and a recording that claims to have
 * spoken. Text is the giveaway.
 */
function looksLikeText(file: string): boolean {
  let head: Buffer;
  try {
    head = readFileSync(file).subarray(0, 512);
  } catch {
    return false;
  }
  if (!head.length) return false;
  let printable = 0;
  for (const byte of head) {
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte < 127)) printable++;
  }
  return printable / head.length > 0.9;
}

/**
 * Make `file` a 22050 Hz mono WAV, whatever the provider sent.
 *
 * This is the boundary where a provider's own format becomes the format the pipeline speaks.
 * ElevenLabs and Polly answer MP3, Google answers headerless PCM, a custom endpoint answers
 * whatever it likes, and an uploaded voice sample may be an MP3 named .wav. Left alone, a clip
 * that isn't a WAV is either measured as zero-length (every caption collapses onto t=0) or
 * rejected by the mix — and a rejected mix means the recording ships silent, which is exactly
 * the "the cloud voice doesn't work with video recordings" report.
 */
async function ensureWav(file: string, cwd: string): Promise<void> {
  if (!existsSync(file)) throw new Error("the voice provider returned no audio");
  if (isRiffWav(file)) return;
  const out = `${file}.wav`;
  try {
    try {
      await run(["-i", file, "-ar", "22050", "-ac", "1", out], { cwd });
    } catch (e) {
      // Headerless PCM: ffmpeg has nothing to detect the format from, so say what it is. Only
      // when the bytes look like samples and not like an error page: reading a page of text as
      // noise turns the provider's failure into a recording that claims to have spoken.
      const size = statSync(file).size;
      if (size % 2 !== 0 || size === 0 || looksLikeText(file)) throw e;
      await run(["-f", "s16le", "-ar", "22050", "-ac", "1", "-i", file, "-ar", "22050", "-ac", "1", out], { cwd });
    }
    renameSync(out, file);
  } catch (e) {
    // A half-written conversion must not be left behind in the recording's folder.
    rmSync(out, { force: true });
    throw e;
  }
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
  /**
   * How fast this voice speaks, in words a second. The recording holds each action on screen for
   * as long as its narration takes, so a cloud voice has to be paced by its own speed: paced by
   * the offline voice's, the line it speaks arrives after the action it describes has moved on.
   */
  wordsPerSecond?: number;
}

/** The pace of a typical cloud narration voice, in words a second. */
const DEFAULT_WORDS_PER_SECOND = 2.8;

export type FliteVoice = "slt" | "awb" | "kal" | "rms";

export function fliteEngine(voice: FliteVoice): VoiceEngine {
  return {
    id: `flite:${voice}`,
    kind: "local",
    available: (): boolean => true,
    // The offline voice is deliberately slow and flat: it is a fallback, not a voice anyone
    // chooses for the pace of it.
    wordsPerSecond: 2.2,
    async speak(text, outFile, cwd) {
      const txt = join(cwd, ".tts-tmp.txt");
      writeFileSync(txt, text.replace(/[{}]/g, ""));
      // The line's text is scratch: it used to stay behind in every recording's folder.
      try {
        await run(["-f", "lavfi", "-i", `flite=textfile=.tts-tmp.txt:voice=${voice}`, "-ar", "22050", "-ac", "1", outFile], { cwd });
      } finally {
        rmSync(txt, { force: true });
      }
      await ensureWav(outFile, cwd);
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
    wordsPerSecond: 2.8,
    async speak(text, outFile, cwd) {
      const res = await fetch("https://api.sarvam.ai/text-to-speech", {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-subscription-key": key },
        body: JSON.stringify({ inputs: [text], target_language_code: language, speaker, model: "bulbul:v2" }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw await ttsError("sarvam", res);
      const json = (await res.json()) as { audios?: string[] };
      const encoded = json.audios?.[0];
      if (!encoded) throw new Error("sarvam returned no audio");
      const buf = Buffer.from(encoded, "base64");
      const { writeFile } = await import("node:fs/promises");
      await writeFile(outFile, buf);
      await ensureWav(outFile, cwd);
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
    wordsPerSecond: 2.6,
    async speak(text, outFile, cwd) {
      const txt = join(cwd, ".tts-tmp.txt");
      writeFileSync(txt, text, "utf8");
      // Paths and text reach PowerShell through the environment, so nothing needs quoting.
      try {
        await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", SAPI_SCRIPT], {
          env: { ...process.env, WALKCAST_TTS_IN: txt, WALKCAST_TTS_OUT: outFile, WALKCAST_TTS_GENDER: gender },
          timeout: 60_000,
          windowsHide: true,
        });
      } finally {
        rmSync(txt, { force: true });
      }
      if (!existsSync(outFile)) throw new Error("Windows speech produced no audio");
      await ensureWav(outFile, cwd);
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
    wordsPerSecond: 2.7,
    async speak(text, outFile, cwd) {
      const res = await fetch("https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json", "ulcaApiKey": key, "userID": userId },
        body: JSON.stringify({ modelId: serviceId, task: "tts", input: [{ source: text }], config: { language: { sourceLanguage: language } } }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw await ttsError("bhashini", res);
      const json = (await res.json()) as { audio?: Array<{ audioContent?: string }> };
      const encoded = json.audio?.[0]?.audioContent;
      if (!encoded) throw new Error("bhashini returned no audio");
      const { writeFile } = await import("node:fs/promises");
      await writeFile(outFile, Buffer.from(encoded, "base64"));
      await ensureWav(outFile, cwd);
    },
  };
}

/** A premade ElevenLabs voice (Sarah): usable on every plan, including free API keys. */
const ELEVENLABS_PREMADE = "EXAVITQu4vr4xnSDxMaL";

/** A provider's own explanation of a failure ("quota exceeded", "invalid key"), kept short. */
function elevenLabsMessage(body: string): string {
  try {
    const j = JSON.parse(body) as { detail?: { message?: string } | string; error?: { message?: string } | string; message?: string };
    const pick = (v: unknown) => (typeof v === "string" ? v : v && typeof v === "object" && "message" in v && typeof v.message === "string" ? v.message : undefined);
    const msg = pick(j.detail) ?? pick(j.error) ?? pick(j.message);
    if (msg) return msg.slice(0, 160);
  } catch { /* not JSON */ }
  return body.replace(/\s+/g, " ").trim().slice(0, 160) || "no details";
}

/** The error a failed provider call throws: its name, the status, and what the provider said. */
async function ttsError(provider: string, res: Response): Promise<Error> {
  return new Error(`${provider} TTS failed (${res.status}): ${elevenLabsMessage(await res.text().catch(() => ""))}`);
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
    wordsPerSecond: 2.9,
    async speak(text, outFile, cwd) {
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
      await ensureWav(outFile, cwd);
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
    wordsPerSecond: 3,
    async speak(text, outFile, cwd) {
      const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: { text }, voice: { languageCode: language, name: voice }, audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: 22050 } }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw await ttsError("google", res);
      const json = (await res.json()) as { audioContent?: string };
      if (!json.audioContent) throw new Error("google TTS returned no audio");
      // LINEAR16 is bare 16-bit PCM with no header: written straight to disk it is a file
      // ffmpeg cannot read and the duration reader cannot measure, so the WAV header goes on
      // here, once, rather than leaving both to guess later.
      const pcm = Buffer.from(json.audioContent, "base64");
      const { writeFile } = await import("node:fs/promises");
      await writeFile(outFile, pcmToWav(pcm, 22050));
      await ensureWav(outFile, cwd);
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
    wordsPerSecond: 2.8,
    async speak(text, outFile, cwd) {
      const safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      const ssml = "<speak version='1.0' xml:lang='" + language + "'><voice name='" + voice + "'>" + safe + "</voice></speak>";
      const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: "POST",
        headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "riff-22khz-16bit-mono-pcm" },
        body: ssml,
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw await ttsError("azure", res);
      const { writeFile } = await import("node:fs/promises");
      await writeFile(outFile, Buffer.from(await res.arrayBuffer()));
      await ensureWav(outFile, cwd);
    },
  };
}

/** AWS Polly, called directly with a SigV4-signed request: no AWS CLI or SDK on the machine. Needs
 *  AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (plus AWS_SESSION_TOKEN for temporary keys). */
export function awsPollyEngine(cloudVoice?: string, cloudLanguage?: string): VoiceEngine | null {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!accessKeyId || !secretAccessKey) return null;
  const sessionToken = process.env.AWS_SESSION_TOKEN?.trim() || undefined;
  const voice = resolveVoice("awspolly", cloudVoice) || "Aditi";
  const region = process.env.AWS_REGION?.trim() || "ap-south-1";
  // Polly ids carry no locale, so the catalog maps each voice to the language it may be used with.
  // Only the bilingual voices take a LanguageCode; any other voice rejects one it wasn't built for.
  const lang = POLLY_BILINGUAL.has(voice) ? resolveLanguage("awspolly", cloudLanguage, voice) : undefined;
  const say = async (text: string, engine: "neural" | "standard") => {
    const url = new URL(`https://polly.${region}.amazonaws.com/v1/speech`);
    const body = JSON.stringify({ Engine: engine, OutputFormat: "mp3", Text: text, VoiceId: voice, ...(lang ? { LanguageCode: lang } : {}) });
    const headers = signHeaders({ bucket: "", region, accessKeyId, secretAccessKey, sessionToken, service: "polly" }, "POST", url, createHash("sha256").update(body).digest("hex"), { "content-type": "application/json" });
    return fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(60_000) });
  };
  return {
    id: `awspolly:${voice}`,
    kind: "cloud",
    available: (): boolean => true,
    wordsPerSecond: 2.9,
    async speak(text, outFile, cwd) {
      const first = POLLY_STANDARD_ONLY.has(voice) ? "standard" : "neural";
      let res = await say(text, first);
      // A voice that exists on only one engine answers 400 on the other: try that one once.
      if (res.status === 400) {
        const why = await res.text();
        if (!/engine/i.test(why)) throw new Error(`awspolly TTS failed (400): ${pollyMessage(why)}`);
        res = await say(text, first === "neural" ? "standard" : "neural");
      }
      if (!res.ok) throw new Error(`awspolly TTS failed (${res.status}): ${pollyMessage(await res.text())}`);
      const tmp = outFile + ".mp3";
      const { writeFile } = await import("node:fs/promises");
      await writeFile(tmp, Buffer.from(await res.arrayBuffer()));
      await run(["-i", tmp, "-ar", "22050", "-ac", "1", outFile]);
      const { rmSync } = await import("node:fs");
      rmSync(tmp, { force: true });
      await ensureWav(outFile, cwd);
    },
  };
}

const POLLY_BILINGUAL = new Set(["Aditi", "Kajal"]);
const POLLY_STANDARD_ONLY = new Set(["Aditi"]);

/** Polly's error body is JSON with a `message` (or `Message`); show that, not the raw payload. */
function pollyMessage(body: string): string {
  try {
    const j = JSON.parse(body) as { message?: string; Message?: string };
    return (j.message ?? j.Message ?? body).slice(0, 300);
  } catch {
    return body.slice(0, 300);
  }
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
    wordsPerSecond: 3,
    async speak(text, outFile, cwd) {
      const res = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({ model, input: text, voice, response_format: "wav" }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw await ttsError("openai", res);
      const { writeFile } = await import("node:fs/promises");
      await writeFile(outFile, Buffer.from(await res.arrayBuffer()));
      await ensureWav(outFile, cwd);
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
    wordsPerSecond: 3,
    async speak(text, outFile, cwd) {
      const res = await fetch("https://api.murf.ai/v1/speech/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": key },
        body: JSON.stringify({ text, voiceId: voice, format: "WAV" }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw await ttsError("murf", res);
      const json = (await res.json()) as { audioFile?: string };
      if (!json.audioFile) throw new Error("murf returned no audio");
      // The same ceiling as the synthesis: a stalled CDN must not hold the recording forever.
      const audioRes = await fetch(json.audioFile, { signal: AbortSignal.timeout(60_000) });
      // The download is a second request to Murf's CDN: a 403 or an expired link answers with an
      // error page, and that page used to be written to the clip as if it were the audio.
      if (!audioRes.ok) throw new Error(`murf TTS failed (${audioRes.status}): the audio file could not be downloaded.`);
      const { writeFile } = await import("node:fs/promises");
      await writeFile(outFile, Buffer.from(await audioRes.arrayBuffer()));
      await ensureWav(outFile, cwd);
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
    wordsPerSecond: 2.8,
    async speak(text, outFile, cwd) {
      const res = await fetch("https://revapi.reverieinc.com/", {
        method: "POST",
        headers: { "Content-Type": "application/json", "REV-API-KEY": key, "REV-APP-ID": appId, "src_lang": language, "tgt_lang": language, "REV-APPNAME": "tts" },
        body: JSON.stringify({ text, speaker }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw await ttsError("reverie", res);
      const { writeFile } = await import("node:fs/promises");
      await writeFile(outFile, Buffer.from(await res.arrayBuffer()));
      await ensureWav(outFile, cwd);
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
    wordsPerSecond: DEFAULT_WORDS_PER_SECOND,
    async speak(text, outFile, cwd) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(key ? { "Authorization": `Bearer ${key}` } : {}) },
        body: JSON.stringify({ text, language, voice }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw await ttsError("custom", res);
      const ct = res.headers.get("content-type") ?? "";
      const { writeFile } = await import("node:fs/promises");
      if (ct.includes("application/json")) {
        const json = (await res.json()) as { audio?: string; audioContent?: string; url?: string };
        const encoded = json.audio || json.audioContent;
        if (encoded) { await writeFile(outFile, Buffer.from(encoded, "base64")); await ensureWav(outFile, cwd); return; }
        if (json.url) {
          const a = await fetch(json.url, { signal: AbortSignal.timeout(60_000) });
          if (!a.ok) throw new Error(`custom TTS failed (${a.status}): the audio file could not be downloaded.`);
          await writeFile(outFile, Buffer.from(await a.arrayBuffer()));
          await ensureWav(outFile, cwd);
          return;
        }
        throw new Error("custom TTS returned no audio");
      }
      await writeFile(outFile, Buffer.from(await res.arrayBuffer()));
      await ensureWav(outFile, cwd);
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
    wordsPerSecond: DEFAULT_WORDS_PER_SECOND,
    async speak(_text: string, outFile: string, cwd: string) {
      const { copyFileSync } = await import("node:fs");
      copyFileSync(sample, outFile);
      // The sample is whatever the person uploaded — an MP3 named .wav, an OGG, an M4A. It has
      // to become a WAV before the pipeline can measure it and mix it.
      await ensureWav(outFile, cwd);
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
