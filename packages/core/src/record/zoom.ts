import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Box } from "./cursor.ts";

/**
 * Zoom in where the work happens.
 *
 * A 1920×1080 page shrunk into a chat window or a help-centre embed turns a form field into a
 * smudge. A screen-recording editor fixes that by zooming on each click; this does the same
 * from what the recorder already knows: the moment of every click and fill, and where on the
 * screen the control was. Nothing is guessed from the pixels.
 *
 * The plan is plain data (`focus.json` beside the video), so a re-narration or a voice-over
 * rebuilds the MP4 with the same zooms, and turning zoom off is deleting one flag.
 */

/** One moment the recorder pointed at a control. Seconds are video time. */
export interface Focus {
  /** When the pointer started moving to the control. */
  start: number;
  /** When the action on it finished. */
  end: number;
  box: Box;
  kind: "click" | "fill" | "select";
}

/** What `focus.json` holds. */
export interface FocusFile {
  /** Whether the MP4 zooms. The moments are kept either way, so zoom can be turned back on. */
  zoom: boolean;
  width: number;
  height: number;
  moments: Focus[];
}

/** One stretch of the video spent zoomed in on one place. */
export interface ZoomSegment {
  /** Zoom starts easing in. */
  start: number;
  /** Zoom has eased back out. */
  end: number;
  /** Centre of the zoom, in video pixels. */
  cx: number;
  cy: number;
  /** How far in: 1 is the whole frame. */
  z: number;
}

const EASE_IN = 0.45;
const EASE_OUT = 0.6;
/** How long the zoom holds after the action, so the result is on screen before it pulls back. */
const HOLD = 1.1;
/** Two moments closer than this share one zoom instead of pulling out and back in. */
const JOIN_GAP = 1.2;
const Z_MIN = 1.25;
const Z_MAX = 1.7;

/**
 * Turn the moments into zoom segments.
 *
 * The zoom is sized so the control and its neighbourhood fill about a third of the frame, and
 * clamped: a small button does not fill the screen, and a wide form still gets a visible push.
 * Moments close together in time and space are merged, so filling a two-field form is one
 * zoom across both fields rather than a bounce per field.
 */
export function zoomPlan(moments: Focus[], width: number, height: number, videoSeconds = Infinity): ZoomSegment[] {
  const sorted = [...moments].filter((m) => m.box.w > 0 && m.box.h > 0).sort((a, b) => a.start - b.start);
  const groups: { start: number; end: number; box: Box }[] = [];
  for (const m of sorted) {
    const last = groups.at(-1);
    if (last && m.start - last.end < JOIN_GAP) {
      const merged = union(last.box, m.box);
      // A merge that would need the whole width is two places, not one: keep them apart.
      if (merged.w <= width * 0.55 && merged.h <= height * 0.55) {
        last.box = merged;
        last.end = Math.max(last.end, m.end);
        continue;
      }
    }
    groups.push({ start: m.start, end: m.end, box: { ...m.box } });
  }
  const segments: ZoomSegment[] = [];
  for (const g of groups) {
    // Fit the box at a third of the frame, measured on whichever side is tighter.
    const fit = Math.min((width * 0.36) / Math.max(g.box.w, 1), (height * 0.36) / Math.max(g.box.h, 1));
    const z = round(clamp(fit, Z_MIN, Z_MAX));
    const start = Math.max(0, g.start - 0.1);
    let end = g.end + HOLD + EASE_OUT;
    const prev = segments.at(-1);
    // Never overlap the previous zoom. When this one starts first, the previous one gives up
    // the rest of its hold and pulls out early: the new action matters more than the old one.
    if (prev && start < prev.end) prev.end = round(Math.max(prev.start + EASE_IN + EASE_OUT, start));
    const from = prev ? Math.max(start, prev.end) : start;
    end = Math.min(end, videoSeconds);
    if (end - from < EASE_IN + EASE_OUT) continue;
    segments.push({ start: round(from), end: round(end), cx: round(g.box.x + g.box.w / 2), cy: round(g.box.y + g.box.h / 2), z });
  }
  return segments;
}

/**
 * The ffmpeg filter that plays a plan: `fps` to a constant rate (zoompan counts frames), then
 * zoompan with time-based expressions. Each segment contributes a smoothstep weight that rises
 * over EASE_IN, holds, and falls over EASE_OUT; the zoom and the centre follow the weights, so
 * between segments the frame is the whole page at zoom 1. Returns null when there is nothing to
 * zoom, and the caller encodes the video untouched.
 */
export function zoomFilter(segments: ZoomSegment[], width: number, height: number, fps = 25): string | null {
  if (!segments.length) return null;
  const weight = (s: ZoomSegment) => {
    const up = `clip((it-${s.start})/${EASE_IN},0,1)`;
    const down = `clip((${s.end}-it)/${EASE_OUT},0,1)`;
    // smoothstep(u) = u²(3−2u), on the smaller of the two ramps.
    const u = `min(${up},${down})`;
    return `(${u}*${u}*(3-2*${u}))`;
  };
  const z = `1${segments.map((s) => `+${round(s.z - 1)}*${weight(s)}`).join("")}`;
  const cx = `${width / 2}${segments.map((s) => `+${round(s.cx - width / 2)}*${weight(s)}`).join("")}`;
  const cy = `${height / 2}${segments.map((s) => `+${round(s.cy - height / 2)}*${weight(s)}`).join("")}`;
  const x = `clip((${cx})-iw/zoom/2,0,iw-iw/zoom)`;
  const y = `clip((${cy})-ih/zoom/2,0,ih-ih/zoom)`;
  return `fps=${fps},zoompan=z='${z}':x='${x}':y='${y}':d=1:s=${width}x${height}:fps=${fps}`;
}

/** Write the moments beside the video. */
export function writeFocus(dir: string, file: FocusFile): void {
  writeFileSync(join(dir, "focus.json"), JSON.stringify(file, null, 2));
}

/** The moments of a recording, or null when it has none (older recordings, Lab runs). */
export function readFocus(dir: string): FocusFile | null {
  const path = join(dir, "focus.json");
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as FocusFile;
    // A plan with no usable frame size would build a filter ffmpeg rejects: treat it as no plan.
    const size = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 16 && n <= 8192;
    return Array.isArray(parsed.moments) && size(parsed.width) && size(parsed.height) ? parsed : null;
  } catch {
    return null;
  }
}

/** The filter for the recording in `dir`, or null when it should not zoom. */
export function zoomFilterFor(dir: string, videoSeconds: number): string | null {
  if (process.env.LAB_ZOOM === "0") return null;
  const focus = readFocus(dir);
  if (!focus || !focus.zoom) return null;
  return zoomFilter(zoomPlan(focus.moments, focus.width, focus.height, videoSeconds), focus.width, focus.height);
}

function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
