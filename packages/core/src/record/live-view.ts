import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { log } from "../ops/log.ts";

/**
 * A cheap "watch it happen" view of a recording job while it still runs.
 *
 * The recorder already takes one JPEG per page as the walk visits it (`record/site.ts`,
 * `recordPage`). Rather than build a second, continuous screen-capture pipeline, this turns that
 * same picture into its own HLS segment: a live slideshow, not a smooth video. It is honest about
 * what it is — the product principle is real evidence over a nicer-looking approximation.
 *
 * Each frame is one short-lived `ffmpeg` process (loop a still image into a few seconds of video,
 * write one .ts file, exit), not one long-lived process fed over stdin. That was tried first and
 * dropped: piping JPEGs into a persistent ffmpeg's stdin buffered everything until the pipe
 * closed — nothing reached disk until the recording (and the preview with it) was already over,
 * on the very platform (Windows) this app ships on. A fresh process per page, a few seconds apart,
 * has no such buffering to fight, and the manifest it plays from is plain text this module writes
 * itself.
 *
 * ffmpeg is best-effort throughout: a missing binary, a failed encode, or a write after the
 * session stopped are all swallowed. A walkthrough must never fail because its live preview
 * could not start or keep up.
 */

/** How long each page's picture holds on screen, in the output timeline. */
const FRAME_SECONDS = 3;
/** Segments kept in the manifest (and on disk) at once; older ones are deleted as they scroll off. */
const WINDOW_SIZE = 6;
/** Encoders run one per recording; a second is headroom for a job that is still closing. */
export const LIVE_MAX_SESSIONS = (() => {
  const n = Number(process.env.LAB_LIVE_SESSIONS);
  return Number.isInteger(n) && n > 0 ? n : 2;
})();

interface Session {
  dir: string;
  live: string;
  /** The next segment number to assign. */
  seq: number;
  /** Segment numbers currently in the manifest, oldest first. */
  window: number[];
  /** An encode is in flight: the next pushed frame is dropped rather than queued behind it. */
  encoding: boolean;
  stopped: boolean;
  frames: number;
  dropped: number;
}

/** What `pushLiveFrame` needs to run ffmpeg; a test supplies its own. */
export type LiveSpawner = (bin: string, args: string[]) => ChildProcess;

const byDir = new Map<string, Session>();
const dirByJob = new Map<string, string>();

/** The ffmpeg binary, read per call so a machine's own ffmpeg (or a test's) can be chosen. */
function ffmpegBinary(): string {
  return process.env.LAB_FFMPEG ?? "ffmpeg";
}

function segPath(live: string, seq: number): string {
  return join(live, `seg${String(seq).padStart(3, "0")}.ts`);
}

/**
 * The ffmpeg command for one segment: loop a single still image for `FRAME_SECONDS` of video,
 * encoded as its own self-contained MPEG-TS file. No pipes, no persistent process — the whole
 * command starts, writes one file, and exits.
 */
export function segmentArgs(jpegPath: string, outTs: string): string[] {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-loop",
    "1",
    "-i",
    jpegPath,
    "-t",
    String(FRAME_SECONDS),
    "-r",
    "1",
    "-vf",
    "scale=960:-2,format=yuv420p",
    "-c:v",
    "libx264",
    // A preview is a second encoder on a machine whose real job is the recording: spend CPU on
    // the recording, not on the slideshow nobody keeps.
    "-preset",
    "ultrafast",
    "-crf",
    "26",
    "-tune",
    "stillimage",
    "-f",
    "mpegts",
    outTs,
  ];
}

/** The directory a running job's live manifest would be under, or null if it has none (yet). */
export function liveDirForJob(jobId: string): string | null {
  return dirByJob.get(jobId) ?? null;
}

/** How many previews are running: the bound the server's own limit count is built on. */
export function liveSessionCount(): number {
  return byDir.size;
}

/**
 * Starts (or no-ops if already started) a live session for this job's recording directory.
 *
 * Refuses past `LIVE_MAX_SESSIONS`: the app records one job at a time, and an encoder per
 * abandoned job would steal the CPU the recording itself needs. A refused preview is simply
 * absent, which the dashboard already handles.
 */
export function startLiveView(jobId: string, dir: string): void {
  if (byDir.has(dir)) return;
  if (byDir.size >= LIVE_MAX_SESSIONS) {
    log.warn("live.refused", { job: jobId, running: byDir.size, limit: LIVE_MAX_SESSIONS });
    return;
  }
  const live = join(dir, "live");
  try {
    mkdirSync(live, { recursive: true });
  } catch (e) {
    log.warn("live.mkdir-failed", { job: jobId, error: String(e) });
    return;
  }
  dirByJob.set(jobId, dir);
  byDir.set(dir, { dir, live, seq: 0, window: [], encoding: false, stopped: false, frames: 0, dropped: 0 });
}

/** A standard HLS VOD-shaped playlist over a sliding window of segments, written atomically. */
function writeManifest(session: Session): void {
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    `#EXT-X-TARGETDURATION:${FRAME_SECONDS}`,
    `#EXT-X-MEDIA-SEQUENCE:${session.window[0] ?? session.seq}`,
    ...session.window.flatMap((n) => [`#EXTINF:${FRAME_SECONDS}.0,`, `seg${String(n).padStart(3, "0")}.ts`]),
  ];
  const final = join(session.live, "live.m3u8");
  const tmp = `${final}.tmp`;
  writeFileSync(tmp, `${lines.join("\n")}\n`);
  // A player must never read a manifest mid-write; rename is the atomic swap.
  renameSync(tmp, final);
}

/**
 * Turns the page screenshot just taken into the live stream's next segment, if one is running
 * for this dir.
 *
 * A frame is dropped when the previous one is still encoding: the preview shows the newest page
 * it can keep up with, and the recording itself is never slowed down to feed it.
 */
export function pushLiveFrame(dir: string, jpegPath: string, spawner: LiveSpawner = (bin, args) => spawn(bin, args, { stdio: "ignore" })): void {
  const session = byDir.get(dir);
  if (!session || session.stopped) return;
  if (session.encoding) {
    session.dropped += 1;
    return;
  }
  const seq = session.seq++;
  const outTs = segPath(session.live, seq);
  session.encoding = true;
  let proc: ChildProcess;
  try {
    proc = spawner(ffmpegBinary(), segmentArgs(jpegPath, outTs));
  } catch (e) {
    session.encoding = false;
    log.warn("live.spawn-failed", { dir, error: String(e) });
    return;
  }
  proc.on("error", (e) => {
    session.encoding = false;
    log.warn("live.ffmpeg-error", { dir, error: String(e) });
  });
  proc.once("exit", (code) => {
    session.encoding = false;
    // The session stopped while this encode was still running: its segment belongs to a preview
    // nobody will fetch again.
    if (session.stopped) {
      try {
        unlinkSync(outTs);
      } catch {
        /* already cleaned up with the rest of the live dir */
      }
      return;
    }
    if (code !== 0) {
      log.warn("live.encode-failed", { dir, code });
      try {
        unlinkSync(outTs);
      } catch {
        /* nothing was written */
      }
      return;
    }
    session.frames += 1;
    session.window.push(seq);
    while (session.window.length > WINDOW_SIZE) {
      const old = session.window.shift()!;
      try {
        unlinkSync(segPath(session.live, old));
      } catch {
        /* already gone */
      }
    }
    try {
      writeManifest(session);
    } catch (e) {
      log.warn("live.manifest-failed", { dir, error: String(e) });
    }
  });
}

/** Stops the job's live session (if any) and removes its live directory. */
export function stopLiveView(jobId: string): void {
  const dir = dirByJob.get(jobId);
  dirByJob.delete(jobId);
  if (!dir) return;
  const session = byDir.get(dir);
  byDir.delete(dir);
  if (!session) return;
  session.stopped = true;
  log.info("live.stopped", { job: jobId, frames: session.frames, dropped: session.dropped });
  // An encode already in flight cleans its own segment up (its exit handler checks `stopped`);
  // give it a moment before removing the directory out from under it.
  setTimeout(
    () => {
      try {
        rmSync(session.live, { recursive: true, force: true });
      } catch (e) {
        // On Windows a file ffmpeg still holds open cannot be deleted; it is inside the recording
        // folder, which is removed with the recording either way.
        log.debug("live.remove-failed", { job: jobId, error: String(e) });
      }
    },
    session.encoding ? 1500 : 0,
  ).unref();
}
