import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toWebVtt, type Caption } from "./narration.ts";
import { chooseVoiceEngine, type VoiceEngine, type FliteVoice, fliteEngine } from "./voice.ts";

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
  /** Who speaks: the flite voice, the user's own recording, or nobody (captions only). */
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
 * Turn the browser video and captions into a narrated MP4. Each caption is spoken with ffmpeg's
 * built-in flite voice, the clips are laid out without overlapping (captions shift to match the
 * speech), mixed into one track, and muxed with the video plus a caption track. Without ffmpeg
 * (or flite) the recording still has the WebM video and WebVTT captions for the dashboard player.
 */
export async function buildMedia(dir: string, captions: Caption[], voice: Voice = VOICE, engine: VoiceEngine = chooseVoiceEngine()): Promise<MediaResult> {
  const video = existsSync(join(dir, "video.webm")) ? "video.webm" : null;
  const result: MediaResult = { video, mp4: null, webm: null, audio: null, captions: "captions.vtt", voice: "none", note: "" };
  const finish = (note: string) => {
    writeFileSync(join(dir, "captions.vtt"), toWebVtt(captions));
    result.note = note;
    return result;
  };
  if (!video) return finish("The browser produced no video.");
  if (!hasFlite()) return finish("ffmpeg with the flite voice is not installed; the recording has video and captions only.");

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
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
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
  if (!hasFlite()) throw new Error("ffmpeg with the flite voice isn't installed on this server.");
  const result: MediaResult = { video: "video.webm", mp4: null, webm: null, audio: null, captions: "captions.vtt", voice: "none", note: "" };
  try {
    return await narrate(dir, "video.webm", captions, result, fliteEngine(voice));
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
  if (!hasFlite()) throw new Error("ffmpeg with the flite voice isn't installed on this server.");
  const dir = mkdtempSync(join(tmpdir(), "lab-voice-"));
  try {
    writeFileSync(join(dir, "t.txt"), "Opening the dashboard. Scrolling through the pricing page, then signing in.");
    await run(["-f", "lavfi", "-i", `flite=textfile=t.txt:voice=${voice}`, "-ar", "22050", "-ac", "1", "p.wav"], { cwd: dir });
    const buf = readFileSync(join(dir, "p.wav"));
    previews.set(voice, buf);
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
  if (!hasFlite()) return text.split(/\s+/).filter(Boolean).length * 380 + 400;
  const cached = spoken.get(text);
  if (cached !== undefined) return cached;
  cacheDir ??= mkdtempSync(join(tmpdir(), "lab-tts-"));
  const i = spoken.size;
  const txt = join(cacheDir, `${i}.txt`);
  const wav = join(cacheDir, `${i}.wav`);
  writeFileSync(txt, text.replace(/[{}]/g, ""));
  await run(["-f", "lavfi", "-i", `flite=textfile=${i}.txt:voice=${VOICE}`, "-ar", "22050", "-ac", "1", wav], { cwd: cacheDir });
  const ms = Math.round(wavSeconds(wav) * 1000);
  rmSync(txt, { force: true });
  rmSync(wav, { force: true });
  spoken.set(text, ms);
  return ms;
}

const execFileAsync = promisify(execFile);

/** ffmpeg runs asynchronously so a server stays responsive while a recording is encoded. */
async function run(args: string[], opts: { cwd?: string } = {}): Promise<void> {
  await execFileAsync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], { cwd: opts.cwd, maxBuffer: 4 * 1024 * 1024, timeout: 5 * 60_000, killSignal: "SIGKILL" });
}

let fliteAvailable: boolean | undefined;
export function hasFlite(): boolean {
  if (fliteAvailable === undefined) {
    const out = spawnSync(FFMPEG, ["-hide_banner", "-filters"], { encoding: "utf8" });
    fliteAvailable = out.status === 0 && /\bflite\b/.test(out.stdout) && /libx264/.test(spawnSync(FFMPEG, ["-hide_banner", "-encoders"], { encoding: "utf8" }).stdout ?? "");
  }
  return fliteAvailable;
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
  return times.length ? Math.max(...times) : 0;
}


function round(n: number): number {
  return Math.round(n * 100) / 100;
}
