import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { FFMPEG_TIMEOUT_MS } from "./media.ts";

/**
 * The walkthrough, re-framed for a feed.
 *
 * A 16:9 video in a phone feed is a strip with two empty bands. A screen-recording editor
 * exports 9:16 and 1:1; this does the same from the finished MP4, so the zoom and the voice
 * come along. The video sits on a blurred, darkened copy of itself (the frame is never empty
 * and never a flat colour that clashes with the site), and the captions are burned in under
 * it, because a feed plays muted until someone taps.
 */
export type Shape = "vertical" | "square";

export const SHAPES: Record<Shape, { width: number; height: number; file: string; label: string }> = {
  vertical: { width: 1080, height: 1920, file: "recording-vertical.mp4", label: "9:16" },
  square: { width: 1080, height: 1080, file: "recording-square.mp4", label: "1:1" },
};

/**
 * How the burned-in captions look. "clean" is the original look (white on a soft panel), "bold"
 * is larger with a heavy outline for busy backgrounds, "minimal" is small white text with a thin
 * shadow and no panel.
 */
export type CaptionStyle = "clean" | "bold" | "minimal";

export function isCaptionStyle(v: unknown): v is CaptionStyle {
  return v === "clean" || v === "bold" || v === "minimal";
}

/** ASS style fields that differ per preset; the rest is shared. Sizes are in 288-line canvas units ×4. */
const CAPTION_LOOK: Record<CaptionStyle, { size: number; fields: string[] }> = {
  clean: { size: 42, fields: ["PrimaryColour=&H00FFFFFF", "BackColour=&H99000000", "BorderStyle=4", "Outline=0", "Shadow=0"] },
  bold: { size: 56, fields: ["Bold=1", "PrimaryColour=&H00FFFFFF", "OutlineColour=&H00000000", "BorderStyle=1", "Outline=3", "Shadow=1"] },
  minimal: { size: 34, fields: ["PrimaryColour=&H00FFFFFF", "OutlineColour=&H80000000", "BorderStyle=1", "Outline=1", "Shadow=1"] },
};

export function isShape(v: unknown): v is Shape {
  return v === "vertical" || v === "square";
}

/**
 * The filter graph for one shape. Exported for tests; `captions` is the caption file's name
 * relative to the working directory (ffmpeg's subtitles filter reads a path, and a Windows
 * drive letter's colon would need escaping inside the graph).
 */
export function socialFilter(shape: Shape, captions: string | null, captionStyle: CaptionStyle = "clean"): string {
  const { width: W, height: H } = SHAPES[shape];
  // Edge to edge in a tall frame; a little inset in a square one, so the blur frames it.
  const fg = shape === "vertical" ? W : 1000;
  const fgH = Math.round((fg * 9) / 16 / 2) * 2;
  // The video sits a little above the middle; the captions take the space under it.
  const lift = shape === "vertical" ? 160 : 110;
  const y = Math.round((H - fgH) / 2 - lift);
  const graph = [
    `[0:v]split=2[a][b]`,
    `[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=36,eq=brightness=-0.22:saturation=0.85[bg]`,
    `[b]scale=${fg}:${fgH}[fg]`,
    `[bg][fg]overlay=(W-w)/2:${y}${captions ? "[v0]" : ",format=yuv420p[v]"}`,
  ];
  if (captions) {
    // ASS sizes are in units of a 288-line canvas, scaled to the frame's height.
    const unit = H / 288;
    const below = H - (y + fgH);
    const look = CAPTION_LOOK[captionStyle];
    const style = [
      "FontName=Arial",
      `FontSize=${Math.round(look.size / unit)}`,
      ...look.fields,
      "Alignment=2",
      `MarginV=${Math.round((below * 0.55) / unit)}`,
      `MarginL=${Math.round(70 / unit)}`,
      `MarginR=${Math.round(70 / unit)}`,
    ].join(",");
    graph.push(`[v0]subtitles=${captions}:force_style='${style}',format=yuv420p[v]`);
  }
  return graph.join(";");
}

const run = promisify(execFile);
const FFMPEG = process.env.LAB_FFMPEG ?? "ffmpeg";

/**
 * Write the re-framed copy beside the recording and return its file name. A build of ffmpeg
 * without libass still gets the re-framed video, without burned captions, rather than nothing.
 */
export async function socialExport(dir: string, shape: Shape, signal?: AbortSignal, captionStyle: CaptionStyle = "clean"): Promise<{ file: string; captions: boolean }> {
  const source = join(dir, "recording.mp4");
  if (!existsSync(source)) throw new Error("This walkthrough has no MP4 to re-frame yet.");
  const out = SHAPES[shape].file;
  const hasCaptions = existsSync(join(dir, "captions.vtt"));
  const encode = (captions: string | null) =>
    run(
      FFMPEG,
      [
        "-hide_banner", "-loglevel", "error", "-y",
        "-i", "recording.mp4",
        "-filter_complex", socialFilter(shape, captions, captionStyle),
        "-map", "[v]", "-map", "0:a?",
        "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-profile:v", "high",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        out,
      ],
      { cwd: dir, timeout: FFMPEG_TIMEOUT_MS, killSignal: "SIGKILL", windowsHide: true, maxBuffer: 4 * 1024 * 1024, signal },
    );
  let burned = hasCaptions;
  try {
    await encode(hasCaptions ? "captions.vtt" : null);
  } catch (e) {
    if (!hasCaptions || signal?.aborted) throw e;
    burned = false;
    await encode(null);
  }
  const path = join(dir, out);
  if (!existsSync(path) || statSync(path).size === 0) throw new Error("ffmpeg wrote no video.");
  return { file: out, captions: burned };
}
