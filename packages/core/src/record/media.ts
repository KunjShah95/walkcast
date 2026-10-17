import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toWebVtt, type Caption } from "./narration.ts";
import { chooseVoiceEngine, type VoiceEngine, engineFor, fliteEngine, sapiAvailable, sapiEngine, sarvamTranscribe } from "./voice.ts";

export interface MediaResult {
  /** Raw browser video (WebM), relative to the recording directory. */
  video: string | null;
  /** Video with the spoken narration and an embedded caption track (MP4). */
  mp4: string | null;
  /** Same narration over the original VP8 video (WebM + Opus): plays in browsers without H.264. */
  webm: string | null;
  /** Narration audio on its own (WAV). */
  audio: string | null;
  captions: string;
  /** Who speaks: a synthetic voice ("flite" for any engine, kept for older recordings), the user's own recording, or nobody. */
  voice: "flite" | "own" | "none";
  note: string;
}

const FFMPEG = process.env.LAB_FFMPEG ?? "ffmpeg";
const FFPROBE = process.env.LAB_FFPROBE ?? "ffprobe";
/** The flite voices ffmpeg ships with. */
export const VOICES = ["slt", "awb", "kal", "rms"] as const;
export type Voice = (typeof VOICES)[number];
export function isVoice(v: unknown): v is Voice {
  return typeof v === "string" && (VOICES as readonly string[]).includes(v);
}
const VOICE: Voice = isVoice(process.env.LAB_VOICE) ? process.env.LAB_VOICE : "slt";

/**
 * Turn the browser video and captions into a narrated MP4. Each caption is spoken by the local
 * voice (ffmpeg's flite where the build has it, Windows speech otherwise, or a configured cloud
 * engine), the clips are laid out without overlapping (captions shift to match the speech), mixed
 * into one track, and muxed with the video plus a caption track. Without ffmpeg or any voice the
 * recording still has the WebM video and WebVTT captions for the dashboard player.
 */
export async function buildMedia(dir: string, captions: Caption[], voice: Voice = VOICE, engine: VoiceEngine | null = pickEngine(voice)): Promise<MediaResult> {
  const video = existsSync(join(dir, "video.webm")) ? "video.webm" : null;
  const result: MediaResult = { video, mp4: null, webm: null, audio: null, captions: "captions.vtt", voice: "none", note: "" };
  const finish = (note: string) => {
    writeFileSync(join(dir, "captions.vtt"), toWebVtt(captions));
    result.note = note;
    return result;
  };
  if (!video) return finish("The browser produced no video.");
  if (!canEncode()) return finish("ffmpeg (with libx264) is not installed; the recording has video and captions only.");
  if (!engine) return finish("No voice is available (ffmpeg has no flite and this is not Windows); the recording has video and captions only.");

  try {
    return await narrate(dir, video, captions, result, engine);
  } catch (e) {
    // Keep what we have (video + captions) and say what went wrong.
    return finish(`Narration failed (${e instanceof Error ? e.message.split("\n")[0] : String(e)}); the recording has video and captions only.`);
  } finally {
    for (const [i] of captions.entries()) {
      rmSync(join(dir, `.tts-${i}.wav`), { force: true });
      rmSync(join(dir, `.tts-${i}.txt`), { force: true });
    }
  }
}

async function narrate(dir: string, video: string, captions: Caption[], result: MediaResult, engine: VoiceEngine): Promise<MediaResult> {
  // 1. Speak each caption to its own clip.
  const clips: { file: string; seconds: number }[] = [];
  for (const [i, caption] of captions.entries()) {
    const file = join(dir, `.tts-${i}.wav`);
    await engine.speak(caption.text.replace(/[{}]/g, ""), file, dir);
    clips.push({ file, seconds: wavSeconds(file) });
  }

  // 2. Lay them out: each line starts at its event time, or after the previous line finishes.
  let cursor = 0;
  for (const [i, caption] of captions.entries()) {
    const start = Math.max(caption.start, cursor);
    caption.start = round(start);
    caption.end = round(start + clips[i]!.seconds + 0.15);
    cursor = start + clips[i]!.seconds + 0.25;
  }

  // 3. Mix into one narration track.
  const audio = join(dir, "narration.wav");
  const inputs = clips.flatMap((c) => ["-i", c.file]);
  const delays = captions.map((c, i) => `[${i}:a]adelay=${Math.round(c.start * 1000)}:all=1[a${i}]`);
  const mix = `${captions.map((_, i) => `[a${i}]`).join("")}amix=inputs=${captions.length}:normalize=0:dropout_transition=0[out]`;
  await run([...inputs, "-filter_complex", [...delays, mix].join(";"), "-map", "[out]", "-ar", "22050", "-ac", "1", audio]);
  writeFileSync(join(dir, "captions.vtt"), toWebVtt(captions));

  // 4. Mux: hold the last frame if the narration runs past the end of the video.
  Object.assign(result, await mux(dir, video, audio, cursor));
  result.voice = "flite";
  result.note = `Narrated with the "${engine.id}" voice (${captions.length} lines).`;
  return result;
}

/** Video + narration track (+ captions) into the MP4 and the narrated WebM. */
async function mux(dir: string, video: string, audio: string, audioSeconds: number): Promise<Pick<MediaResult, "mp4" | "webm" | "audio">> {
  const videoSeconds = await probeSeconds(join(dir, video));
  const extra = Math.max(0, audioSeconds - videoSeconds + 0.5);
  const mp4 = join(dir, "recording.mp4");
  await run([
    "-i", join(dir, video),
    "-i", audio,
    "-i", join(dir, "captions.vtt"),
    "-filter_complex", `[0:v]tpad=stop_mode=clone:stop_duration=${extra.toFixed(2)},format=yuv420p[v]`,
    "-map", "[v]", "-map", "1:a", "-map", "2:s",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-profile:v", "high", "-level", "4.2",
    "-c:a", "aac", "-b:a", "96k",
    "-c:s", "mov_text", "-metadata:s:s:0", "language=eng",
    "-movflags", "+faststart",
    mp4,
  ]);
  const webm = join(dir, "narrated.webm");
  await run(["-i", join(dir, video), "-i", audio, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "libopus", "-b:a", "64k", webm]);
  return {
    webm: existsSync(webm) && statSync(webm).size > 0 ? "narrated.webm" : null,
    audio: "narration.wav",
    mp4: existsSync(mp4) && statSync(mp4).size > 0 ? "recording.mp4" : null,
  };
}

/**
 * Re-speak an edited script over an existing recording. Needs the raw browser video, which only
 * a recording kept on local disk still has.
 */
export async function renarrate(dir: string, captions: Caption[], voice: Voice): Promise<MediaResult> {
  if (!existsSync(join(dir, "video.webm"))) throw new Error("The original browser video isn't kept for this recording, so it can't be re-narrated.");
  const engine = localVoice(voice);
  if (!canEncode() || !engine) throw new Error("This machine has no narration voice (ffmpeg with flite, or Windows speech).");
  const result: MediaResult = { video: "video.webm", mp4: null, webm: null, audio: null, captions: "captions.vtt", voice: "none", note: "" };
  try {
    return await narrate(dir, "video.webm", captions, result, engine);
  } finally {
    for (const [i] of captions.entries()) {
      rmSync(join(dir, `.tts-${i}.wav`), { force: true });
      rmSync(join(dir, `.tts-${i}.txt`), { force: true });
    }
  }
}

/** Replace the narration with the user's own recorded voice (any audio ffmpeg reads). */
export async function voiceover(dir: string, audioPath: string, captions: Caption[]): Promise<MediaResult> {
  if (!existsSync(join(dir, "video.webm"))) throw new Error("The original browser video isn't kept for this recording, so the voice can't be replaced.");
  const audio = join(dir, "narration.wav");
  // The upload arrived as a temp file on disk so a 40MB voice doesn't take per-instance RAM
  // before ffmpeg even sees it. `audioPath` is owned by the caller (it provides cleanup).
  await run(["-i", audioPath, "-ar", "22050", "-ac", "1", audio]);
  writeFileSync(join(dir, "captions.vtt"), toWebVtt(captions));
  const media = await mux(dir, "video.webm", audio, wavSeconds(audio));
  return { video: "video.webm", ...media, captions: "captions.vtt", voice: "own", note: "Narrated in your own voice." };
}

const previews = new Map<Voice, Buffer>();
/** A short sample of a voice, for choosing one before recording. */
export async function voicePreview(voice: Voice): Promise<Buffer> {
  const hit = previews.get(voice);
  if (hit) return hit;
  const engine = localVoice(voice);
  if (!engine) throw new Error("This machine has no narration voice (ffmpeg with flite, or Windows speech).");
  const dir = mkdtempSync(join(tmpdir(), "lab-voice-"));
  try {
    await engine.speak("Opening the dashboard. Scrolling through the pricing page, then signing in.", join(dir, "p.wav"), dir);
    const buf = readFileSync(join(dir, "p.wav"));
    previews.set(voice, buf);
    return buf;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const cloudPreviews = new Map<string, Buffer>();
/** A short sample synthesized through a cloud TTS provider, for choosing one before recording. */
export async function cloudVoicePreview(provider: string, voice: string = "slt"): Promise<Buffer> {
  const cacheKey = `${provider}:${voice}`;
  const hit = cloudPreviews.get(cacheKey);
  if (hit) return hit;
  let engine: VoiceEngine | null = null;
  const p = provider.trim().toLowerCase();
  if (p === "flite" || p === "local" || p === "") {
    const v = isVoice(voice) ? voice : "slt";
    engine = localVoice(v);
  } else {
    engine = engineFor(p, isVoice(voice) ? voice : "slt");
  }
  if (!engine) throw new Error(`No TTS engine available for provider "${provider}".`);
  const dir = mkdtempSync(join(tmpdir(), "lab-voice-"));
  try {
    const file = join(dir, "preview.wav");
    await engine.speak("Opening the dashboard. Scrolling through the pricing page, then signing in.", file, dir);
    const buf = readFileSync(file);
    cloudPreviews.set(cacheKey, buf);
    return buf;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

let cacheDir: string | undefined;
const spoken = new Map<string, number>();

/**
 * How long the narration voice takes to say `text`, in ms. With flite available the line is
 * synthesized once (and cached) so the measurement is exact; otherwise it is estimated.
 */
export async function speechMs(text: string): Promise<number> {
  const engine = localVoice(VOICE);
  if (!engine) return text.split(/\s+/).filter(Boolean).length * 380 + 400;
  const cached = spoken.get(text);
  if (cached !== undefined) return cached;
  cacheDir ??= mkdtempSync(join(tmpdir(), "lab-tts-"));
  const i = spoken.size;
  const txt = join(cacheDir, `${i}.txt`);
  const wav = join(cacheDir, `${i}.wav`);
  writeFileSync(txt, text.replace(/[{}]/g, ""));
  await engine.speak(text.replace(/[{}]/g, ""), wav, cacheDir);
  const ms = Math.round(wavSeconds(wav) * 1000);
  rmSync(txt, { force: true });
  rmSync(wav, { force: true });
  spoken.set(text, ms);
  return ms;
}

const execFileAsync = promisify(execFile);

/** ffmpeg runs asynchronously so a server stays responsive while a recording is encoded. */
async function run(args: string[], opts: { cwd?: string } = {}): Promise<void> {
  await execFileAsync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], { cwd: opts.cwd, maxBuffer: 4 * 1024 * 1024, timeout: 5 * 60_000, killSignal: "SIGKILL", windowsHide: true });
}

let encoder: boolean | undefined;
/** ffmpeg runs and can write H.264: enough to build the MP4 whoever speaks. */
export function canEncode(): boolean {
  if (encoder === undefined) {
    const out = spawnSync(FFMPEG, ["-hide_banner", "-encoders"], { encoding: "utf8", windowsHide: true });
    encoder = out.status === 0 && /libx264/.test(out.stdout ?? "");
  }
  return encoder;
}

let fliteAvailable: boolean | undefined;
/** ffmpeg has its built-in flite voice (and H.264). Most Linux and Homebrew builds; not Windows ones. */
export function hasFlite(): boolean {
  if (fliteAvailable === undefined) {
    const out = spawnSync(FFMPEG, ["-hide_banner", "-filters"], { encoding: "utf8", windowsHide: true });
    fliteAvailable = out.status === 0 && /\bflite\b/.test(out.stdout) && canEncode();
  }
  return fliteAvailable;
}

/** The voice that speaks locally for `voice`: flite where ffmpeg has it, else Windows speech. */
export function localVoice(voice: Voice): VoiceEngine | null {
  if (hasFlite()) return fliteEngine(voice);
  if (canEncode() && sapiAvailable()) return sapiEngine(voice);
  return null;
}

/** Whether recordings here get a spoken narration track. */
export function canNarrate(): boolean {
  return canEncode() && localVoice(VOICE) !== null;
}

/** A configured cloud voice (LAB_TTS_PROVIDER) wins; otherwise the local one. */
function pickEngine(voice: Voice): VoiceEngine | null {
  const provider = process.env.LAB_TTS_PROVIDER?.trim().toLowerCase();
  if (provider && provider !== "flite") {
    const engine = chooseVoiceEngine();
    if (engine.kind === "cloud") return engine;
  }
  return localVoice(voice);
}

/** Duration of a PCM WAV from its header (avoids a probe per clip). */
function wavSeconds(file: string): number {
  const buf = readFileSync(file);
  const byteRate = buf.readUInt32LE(28);
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "data") return Math.min(size, buf.length - offset - 8) / byteRate;
    offset += 8 + size;
  }
  return 0;
}

async function probeSeconds(file: string): Promise<number> {
  const probe = (args: string[]) => execFileAsync(FFPROBE, ["-v", "error", ...args, file], { timeout: 60_000, maxBuffer: 16 * 1024 * 1024 }).then((r) => r.stdout, () => "");
  const n = Number.parseFloat(await probe(["-show_entries", "format=duration", "-of", "csv=p=0"]));
  if (Number.isFinite(n)) return n;
  // Playwright WebM files sometimes lack a duration header; use the last frame's timestamp instead.
  const times = (await probe(["-select_streams", "v", "-show_entries", "packet=pts_time", "-of", "csv=p=0"])).split("\n").map(Number.parseFloat).filter(Number.isFinite);
  if (times.length) return Math.max(...times);
  // No ffprobe (the desktop installer ships ffmpeg alone): stream-copy to nowhere and read the
  // last progress time ffmpeg prints.
  const err = await execFileAsync(FFMPEG, ["-hide_banner", "-i", file, "-map", "0:v:0", "-c", "copy", "-f", "null", "-"], { timeout: 60_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true }).then(
    (r) => r.stderr,
    (e: { stderr?: string }) => e.stderr ?? "",
  );
  const stamps = [...err.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)].map(([, h, m, sec]) => Number(h) * 3600 + Number(m) * 60 + Number(sec));
  return stamps.length ? Math.max(...stamps) : 0;
}


function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Auto-captions from recorded audio via Sarvam STT. Returns timed cues. */
export async function generateCaptionsFromAudio(audioPath: string, language = "unknown"): Promise<{ start: number; end: number; text: string }[]> {
  const transcript = (await sarvamTranscribe(audioPath, language)).trim();
  if (!transcript) return [];
  let duration = 0;
  try { duration = await probeSeconds(audioPath); } catch { duration = 0; }
  if (!Number.isFinite(duration) || duration <= 0) {
    const words = transcript.split(/\s+/).filter(Boolean).length;
    duration = Math.max(2, words * 0.35);
  }
  const sentences = transcript.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [transcript];
  const chunks: string[] = [];
  for (const s of sentences) {
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length <= 16) { chunks.push(s); continue; }
    for (let i = 0; i < words.length; i += 16) chunks.push(words.slice(i, i + 16).join(" "));
  }
  const counts = chunks.map((c) => Math.max(1, c.split(/\s+/).filter(Boolean).length));
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  let cursor = 0;
  return chunks.map((c, i) => {
    const frac = counts[i]! / total;
    const dur = Math.max(0.8, duration * frac);
    const start = round(cursor);
    const end = round(Math.min(duration, cursor + dur));
    cursor = end > start ? end : start + 0.8;
    if (cursor > duration) cursor = duration;
    return { start, end: end > start ? end : round(start + 0.8), text: c };
  });
}
