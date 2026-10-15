import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toWebVtt, type Caption } from "./narration.ts";

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
  voice: "flite" | "none";
  note: string;
}

const FFMPEG = process.env.LAB_FFMPEG ?? "ffmpeg";
const FFPROBE = process.env.LAB_FFPROBE ?? "ffprobe";
const VOICE = process.env.LAB_VOICE ?? "slt";

/**
 * Turn the browser video and captions into a narrated MP4. Each caption is spoken with ffmpeg's
 * built-in flite voice, the clips are laid out without overlapping (captions shift to match the
 * speech), mixed into one track, and muxed with the video plus a caption track. Without ffmpeg
 * (or flite) the recording still has the WebM video and WebVTT captions for the dashboard player.
 */
export async function buildMedia(dir: string, captions: Caption[]): Promise<MediaResult> {
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
    return await narrate(dir, video, captions, result);
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

async function narrate(dir: string, video: string, captions: Caption[], result: MediaResult): Promise<MediaResult> {
  // 1. Speak each caption to its own clip.
  const clips: { file: string; seconds: number }[] = [];
  for (const [i, caption] of captions.entries()) {
    const text = join(dir, `.tts-${i}.txt`);
    const file = join(dir, `.tts-${i}.wav`);
    writeFileSync(text, caption.text.replace(/[{}]/g, ""));
    await run(["-f", "lavfi", "-i", `flite=textfile=${escapeFilterPath(text)}:voice=${VOICE}`, "-ar", "22050", "-ac", "1", file]);
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
  const videoSeconds = await probeSeconds(join(dir, video));
  const extra = Math.max(0, cursor - videoSeconds + 0.5);
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
  result.webm = existsSync(webm) && statSync(webm).size > 0 ? "narrated.webm" : null;
  result.audio = "narration.wav";
  result.mp4 = existsSync(mp4) && statSync(mp4).size > 0 ? "recording.mp4" : null;
  result.voice = "flite";
  result.note = `Narrated with the flite "${VOICE}" voice (${captions.length} lines).`;
  return result;
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
  await run(["-f", "lavfi", "-i", `flite=textfile=${escapeFilterPath(txt)}:voice=${VOICE}`, "-ar", "22050", "-ac", "1", wav]);
  const ms = Math.round(wavSeconds(wav) * 1000);
  rmSync(txt, { force: true });
  rmSync(wav, { force: true });
  spoken.set(text, ms);
  return ms;
}

const execFileAsync = promisify(execFile);

/** ffmpeg runs asynchronously so a server stays responsive while a recording is encoded. */
async function run(args: string[]): Promise<void> {
  // A hung encode must not hold a worker forever.
  await execFileAsync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], { maxBuffer: 4 * 1024 * 1024, timeout: 5 * 60_000, killSignal: "SIGKILL" });
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

/** ffmpeg filter arguments treat ':' '\'' and '\\' specially. */
function escapeFilterPath(path: string): string {
  return path.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
