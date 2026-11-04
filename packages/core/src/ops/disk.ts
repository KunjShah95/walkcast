import { existsSync } from "node:fs";
import { statfs } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/**
 * Free-space checks before work that writes hundreds of megabytes (a recording, a batch of
 * exports, a launch film). Without one, a full disk surfaced minutes later as an ffmpeg error
 * nobody could read ("Conversion failed!") and a half-written video.
 */

const MB = 1024 * 1024;

/** The minimum free space work needs before it starts: LAB_MIN_FREE_DISK_MB (default 1024 MB). */
export function minFreeDiskBytes(): number {
  const mb = Number(process.env.LAB_MIN_FREE_DISK_MB ?? 1024);
  return Number.isFinite(mb) && mb >= 0 ? Math.round(mb * MB) : 1024 * MB;
}

/** Bytes available to this process on the volume holding `dir` (or its nearest existing parent), or null when unknown. */
export async function freeBytes(dir: string): Promise<number | null> {
  let at = resolve(dir);
  while (!existsSync(at)) {
    const up = dirname(at);
    if (up === at) return null;
    at = up;
  }
  try {
    const s = await statfs(at);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null; // a filesystem that can't say: don't block work on a guess
  }
}

export interface FreeSpace {
  ok: boolean;
  freeBytes: number | null;
  needBytes: number;
  /** Set when !ok: the reason a person can act on. */
  message?: string;
}

export function notEnoughDiskMessage(free: number, need: number): string {
  return `Not enough free disk space (${Math.floor(free / MB)} MB free, need ${Math.ceil(need / MB)} MB).`;
}

/** Whether the volume holding `dir` has at least `minBytes` free. Unknown free space passes. */
export async function checkFreeSpace(dir: string, minBytes = minFreeDiskBytes()): Promise<FreeSpace> {
  const free = await freeBytes(dir);
  if (free === null || free >= minBytes) return { ok: true, freeBytes: free, needBytes: minBytes };
  return { ok: false, freeBytes: free, needBytes: minBytes, message: notEnoughDiskMessage(free, minBytes) };
}

/** The message a full disk gets wherever it surfaces, instead of the tool's own wording. */
export const DISK_FULL_MESSAGE = "The disk is full (no space left on device). Free some disk space and try again.";

/** Whether an error (or an ffmpeg/child-process message) means the disk ran out of space. */
export function isDiskFull(error: unknown): boolean {
  if (error && typeof error === "object" && (error as { code?: unknown }).code === "ENOSPC") return true;
  const text = error instanceof Error ? error.message : String(error ?? "");
  return /\bENOSPC\b|No space left on device|There is not enough space on the disk/i.test(text);
}
