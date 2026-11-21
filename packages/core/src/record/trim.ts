import { execFile } from "node:child_process";
import { existsSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { FFMPEG_TIMEOUT_MS, probeSeconds } from "./media.ts";
import { toWebVtt, type Caption } from "./narration.ts";

/**
 * Cut a finished recording to a span, without opening a browser.
 *
 * A pacing problem (a slow first page, a long wait at the end) used to mean recording again.
 * The MP4 already holds everything, so this is one ffmpeg pass over it, plus the caption lines
 * that fall inside the span, moved so they still line up with the cut.
 */
export const TRIM_FILE = "recording-trim.mp4";
export const TRIM_CAPTIONS = "captions-trim.vtt";

/** The shortest cut worth making. Anything under this is an empty video. */
export const MIN_TRIM_SECONDS = 1;

export interface TrimSpan {
  from: number;
  to: number;
}

/**
 * Read `from` and `to` (seconds) off a request. Returns the reason when they cannot be used, so
 * the caller can say it plainly instead of handing ffmpeg a nonsense range.
 */
export function readSpan(fromRaw: unknown, toRaw: unknown, duration?: number): TrimSpan | string {
  const from = Number(fromRaw);
  const to = Number(toRaw);
  if (fromRaw === null || fromRaw === undefined || fromRaw === "" || toRaw === null || toRaw === undefined || toRaw === "" || !Number.isFinite(from) || !Number.isFinite(to)) {
    return "from and to must be numbers of seconds, e.g. from=4&to=38.";
  }
  if (from < 0) return "from can't be before the start of the video.";
  if (to - from < MIN_TRIM_SECONDS) return `The cut must be at least ${MIN_TRIM_SECONDS} second long.`;
  if (duration !== undefined && from >= duration) return `from is past the end of the video (${duration.toFixed(1)}s).`;
  return { from, to: duration !== undefined ? Math.min(to, duration) : to };
}

/** The caption lines inside the span, with times counted from the cut's own start. */
export function trimCaptions(captions: Caption[], span: TrimSpan): Caption[] {
  const out: Caption[] = [];
  for (const c of captions) {
    if (c.end <= span.from || c.start >= span.to) continue;
    const start = Math.max(c.start, span.from) - span.from;
    const end = Math.min(c.end, span.to) - span.from;
    out.push({ start: Math.round(start * 100) / 100, end: Math.round(end * 100) / 100, text: c.text });
  }
  return out;
}

const run = promisify(execFile);
const FFMPEG = process.env.LAB_FFMPEG ?? "ffmpeg";

/** Write `recording-trim.mp4` and its captions beside the recording. */
export async function trimRecording(dir: string, captions: Caption[], span: TrimSpan, signal?: AbortSignal): Promise<{ file: string; captions: string; seconds: number }> {
  const source = join(dir, "recording.mp4");
  if (!existsSync(source)) throw new Error("This walkthrough has no MP4 to cut yet.");
  // Re-encoded, not stream-copied: a copy can only start on a keyframe, so the cut would begin
  // seconds before the point that was asked for.
  await run(
    FFMPEG,
    [
      "-hide_banner", "-loglevel", "error", "-y",
      "-ss", span.from.toFixed(2), "-to", span.to.toFixed(2),
      "-i", "recording.mp4",
      "-map", "0:v", "-map", "0:a?", "-sn",
      "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      TRIM_FILE,
    ],
    { cwd: dir, timeout: FFMPEG_TIMEOUT_MS, killSignal: "SIGKILL", windowsHide: true, maxBuffer: 4 * 1024 * 1024, ...(signal ? { signal } : {}) },
  );
  const path = join(dir, TRIM_FILE);
  if (!existsSync(path) || statSync(path).size === 0) throw new Error("ffmpeg wrote no video.");
  writeFileSync(join(dir, TRIM_CAPTIONS), toWebVtt(trimCaptions(captions, span)));
  return { file: TRIM_FILE, captions: TRIM_CAPTIONS, seconds: Math.round((await probeSeconds(path)) * 10) / 10 };
}
