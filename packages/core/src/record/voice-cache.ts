/**
 * A content-addressed cache for narration clips.
 *
 * The narration pipeline speaks one clip per caption line, and a voice engine pays a real price
 * per call: Kokoro spawns Python and reloads its model (~10-15 s), Windows speech starts
 * PowerShell, every cloud provider is a round trip. The same line is said again the next time the
 * same site is recorded, in a re-run, in a retry after a crash, and in every test that records the
 * sample CRM — and it is the same bytes every time, because a clip depends only on the text and
 * on the voice that says it.
 *
 * So the clip is kept under a hash of exactly those two things. A hit is a file copy; a miss is
 * synthesized once and copyable forever after.
 *
 * A cache must never cost a recording. Every function here degrades to "no cache" on a read-only
 * disk, a full disk, or a corrupt entry, and `LAB_TTS_CACHE=off` turns it off entirely.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The longest a clip's text may be before hashing it stops being worth it. */
const MAX_TEXT = 4000;

/** Writes between size checks: stat-ing a big folder on every line would cost more than it saves. */
const PRUNE_EVERY = 64;

/** A voice, as far as a clip's identity is concerned. */
export interface ClipVoice {
  /** What the engine calls itself, e.g. `kokoro:af_heart`. */
  readonly id: string;
  /**
   * Anything else that changes the bytes: the model behind an id, or the uploaded sample a
   * custom voice plays. Defaults to `id`. An engine whose id does not pin its output must say so,
   * or the cache would hand back another voice's clip for the same words.
   */
  readonly fingerprint?: string;
}

/** Whether the cache is on. Read per call so a test (or a CLI flag) can turn it off mid-process. */
export function cacheEnabled(): boolean {
  return (process.env.LAB_TTS_CACHE ?? "").trim().toLowerCase() !== "off";
}

/** Where clips live: `LAB_TTS_CACHE`, or a directory in the temp dir shared by every recording. */
export function cacheRoot(): string {
  const configured = process.env.LAB_TTS_CACHE?.trim();
  return configured && configured.toLowerCase() !== "off" ? configured : join(tmpdir(), "walkcast-tts-cache");
}

/** How large the cache may grow before the oldest clips are dropped, in bytes. */
export function cacheLimitBytes(): number {
  const mb = Number(process.env.LAB_TTS_CACHE_MB ?? "");
  return (Number.isFinite(mb) && mb > 0 ? mb : 512) * 1024 * 1024;
}

/**
 * The identity of a clip: the voice that says it and the words it says.
 *
 * NUL separates the two so that a voice id ending in "a" and a line starting with "b" cannot
 * collide with a voice id ending in "ab" and a line starting with "".
 */
export function clipKey(voice: ClipVoice, text: string): string {
  const said = text.slice(0, MAX_TEXT);
  return createHash("sha256").update(`${voice.fingerprint ?? voice.id}\u0000${said}`).digest("hex");
}

/** The clip for `key`, or null when it is not cached (or the cache cannot be read). */
export function cachedClip(key: string): string | null {
  if (!cacheEnabled()) return null;
  const file = join(cacheRoot(), `${key}.wav`);
  try {
    // A zero-byte file is a write that was interrupted, not a clip: treat it as a miss so the
    // line is said again rather than mixed as silence.
    return statSync(file).size > 0 ? file : null;
  } catch {
    return null;
  }
}

/** Keep a freshly synthesized clip. Best-effort: a full or read-only disk just means no hit later. */
export function storeClip(key: string, from: string): void {
  if (!cacheEnabled()) return;
  let temp: string | undefined;
  try {
    const dir = cacheRoot();
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${key}.wav`);
    // Copied beside the target and renamed onto it: a process killed mid-write must not leave a
    // short clip where a complete one is expected, or the next run silently truncates a line.
    temp = `${file}.${process.pid}.tmp`;
    copyFileSync(from, temp);
    renameSync(temp, file);
    writes++;
    if (writes % PRUNE_EVERY === 0) pruneCache();
  } catch {
    if (temp) rmSync(temp, { force: true });
  }
}

let writes = 0;

/** Total bytes held, or 0 when the folder is not there. */
export function cacheBytes(): number {
  try {
    return readdirSync(cacheRoot()).reduce((sum, f) => sum + (statSync(join(cacheRoot(), f)).size || 0), 0);
  } catch {
    return 0;
  }
}

/**
 * Drop the oldest clips until the cache fits its limit. Returns how many files went.
 *
 * Oldest-by-write rather than smallest: the value of a clip is that it is said again, and a line
 * that was written long ago and never reused is the cheapest thing to lose.
 */
export function pruneCache(limit = cacheLimitBytes()): number {
  const dir = cacheRoot();
  let files: { file: string; size: number; at: number }[];
  try {
    files = readdirSync(dir)
      .filter((f) => f.endsWith(".wav"))
      .map((f) => {
        const path = join(dir, f);
        const st = statSync(path);
        return { file: path, size: st.size, at: st.mtimeMs };
      });
  } catch {
    return 0;
  }
  let total = files.reduce((sum, f) => sum + f.size, 0);
  if (total <= limit) return 0;
  let dropped = 0;
  for (const f of files.sort((a, b) => a.at - b.at)) {
    if (total <= limit) break;
    try {
      rmSync(f.file, { force: true });
      total -= f.size;
      dropped++;
    } catch {
      /* someone else's file, or already gone */
    }
  }
  return dropped;
}

/** Empty the cache outright — a voice changed, or the operator wants the disk back. */
export function clearCache(): void {
  const dir = cacheRoot();
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) if (f.endsWith(".wav") || f.endsWith(".tmp")) rmSync(join(dir, f), { force: true });
}
