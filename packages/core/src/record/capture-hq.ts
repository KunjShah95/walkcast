/**
 * High-quality capture of a browser page.
 *
 * Playwright's own `recordVideo` encodes VP8 at a fixed low bitrate (about 1 Mbit/s), so text on a
 * 1080p page comes out soft and every scroll smears. This records the page through Chromium's
 * screencast instead: each frame arrives as a JPEG at quality 92, and is piped straight into an
 * ffmpeg that encodes a constant-30 fps VP8 WebM at a much higher bitrate. The result replaces
 * Playwright's file as `video.webm`, so zoom, dead-air trimming, the MP4 and the WebM all read it
 * as they always did.
 *
 * It runs beside Playwright's recording, never instead of it: if anything here fails (no ffmpeg,
 * a page that will not screencast, an encoder that dies mid-visit) the recording simply keeps
 * Playwright's video. Capture quality can improve a recording; it cannot lose one.
 *
 * Time is wall-clock. A screencast only sends a frame when the page changes, so ffmpeg stamps
 * each frame with the time it arrived and repeats it at 30 fps until the next one.
 */
import { spawn, type ChildProcessByStdio } from "node:child_process";
import { existsSync, rmSync, statSync } from "node:fs";
import type { Readable, Writable } from "node:stream";
import type { BrowserContext, CDPSession, Page } from "playwright";

const FFMPEG = process.env.LAB_FFMPEG ?? "ffmpeg";

export interface HqCapture {
  /** Wall-clock `Date.now()` when the first frame went in: the video's time zero. */
  readonly startedAt: number;
  /** Stops capturing and finishes the file. Resolves true when `file` holds a usable video. */
  stop(): Promise<boolean>;
}

export interface HqOptions {
  width: number;
  height: number;
  fps?: number;
  /** Video bitrate ceiling, in Mbit/s. */
  mbps?: number;
  /** JPEG quality of each screencast frame, 1 to 100. */
  quality?: number;
}

/** Whether high-quality capture is wanted: on unless WALKCAST_HQ_CAPTURE=0. */
export function hqCaptureWanted(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.WALKCAST_HQ_CAPTURE ?? "").trim() !== "0";
}

/** The ffmpeg arguments: JPEG frames on stdin in, a constant-rate VP8 WebM out. Exported for tests. */
export function encoderArgs(file: string, { fps = 30, mbps = 8 }: Pick<HqOptions, "fps" | "mbps"> = {}): string[] {
  return [
    "-hide_banner", "-loglevel", "error", "-y",
    "-use_wallclock_as_timestamps", "1", "-f", "image2pipe", "-c:v", "mjpeg", "-i", "pipe:0",
    // Constant frame rate: a still page repeats its last frame, a busy one is never dropped below it.
    "-vf", `fps=${fps}:round=near,format=yuv420p`,
    "-c:v", "libvpx", "-deadline", "realtime", "-cpu-used", "6", "-threads", "4",
    "-crf", "8", "-b:v", `${mbps}M`, "-qmin", "0", "-qmax", "30", "-g", String(fps * 2), "-auto-alt-ref", "0",
    "-an", file,
  ];
}

/**
 * Starts capturing `page` into `file`. Resolves undefined when capture cannot start (not Chromium,
 * no ffmpeg), so the caller carries on with Playwright's video alone.
 */
export async function startHqCapture(context: BrowserContext, page: Page, file: string, opts: HqOptions): Promise<HqCapture | undefined> {
  let cdp: CDPSession;
  try {
    cdp = await context.newCDPSession(page);
  } catch {
    return undefined;
  }
  let ff: ChildProcessByStdio<Writable, null, Readable>;
  try {
    ff = spawn(FFMPEG, encoderArgs(file, opts), { stdio: ["pipe", "ignore", "pipe"], windowsHide: true });
  } catch {
    return undefined;
  }
  let dead = false;
  let stderr = "";
  ff.stderr.on("data", (d: Buffer) => (stderr = (stderr + d.toString()).slice(-600)));
  ff.on("error", () => (dead = true));
  ff.stdin.on("error", () => (dead = true));
  const exited = new Promise<number>((resolve) => ff.on("close", (code) => resolve(code ?? 1)));
  ff.on("close", () => (dead = true));

  let last: Buffer | null = null;
  let draining: Promise<void> = Promise.resolve();
  /** Writes one JPEG, waiting for the pipe to empty so a slow encoder slows capture rather than filling memory. */
  const write = (jpeg: Buffer): void => {
    if (dead) return;
    last = jpeg;
    draining = draining.then(
      () =>
        new Promise<void>((resolve) => {
          if (dead || !ff.stdin.writable) return resolve();
          if (ff.stdin.write(jpeg)) resolve();
          else ff.stdin.once("drain", () => resolve());
        }),
    );
  };

  cdp.on("Page.screencastFrame", (frame: { data: string; sessionId: number }) => {
    write(Buffer.from(frame.data, "base64"));
    // Acknowledge at once: the browser sends the next frame only after this.
    void cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => undefined);
  });

  try {
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: opts.quality ?? 92, maxWidth: opts.width, maxHeight: opts.height, everyNthFrame: 1 });
    // The first frame now, so the video has a time zero before the page has changed at all.
    const first = await page.screenshot({ type: "jpeg", quality: opts.quality ?? 92 });
    write(first);
  } catch {
    dead = true;
    ff.kill();
    await exited;
    rmSync(file, { force: true });
    return undefined;
  }
  const startedAt = Date.now();

  return {
    startedAt,
    async stop() {
      try {
        await cdp.send("Page.stopScreencast");
      } catch {
        /* the page may already be closing */
      }
      // Repeat the last frame at the stop time, so the video runs to the end of the visit and not
      // to the last change on the page.
      if (last) write(last);
      await draining.catch(() => undefined);
      ff.stdin.end();
      const code = await Promise.race([exited, new Promise<number>((r) => setTimeout(() => r(-1), 60_000))]);
      if (code !== 0) ff.kill();
      const ok = code === 0 && existsSync(file) && statSync(file).size > 4096;
      if (!ok) {
        rmSync(file, { force: true });
        if (stderr) console.warn(`High-quality capture failed (${stderr.replace(/\s+/g, " ").trim().slice(0, 160)}); keeping the standard video.`);
      }
      return ok;
    },
  };
}
