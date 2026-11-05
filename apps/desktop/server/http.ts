import { randomUUID, timingSafeEqual } from "node:crypto";
import { copyFileSync, createReadStream, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RecordingSummary } from "../../../packages/core/src/data.ts";
import { AuthError } from "./auth.ts";

/**
 * Request and response plumbing the routes share: body readers, the range-aware file streamer, and
 * the small parsing helpers. Moved out of server.ts unchanged when the routes became a table.
 */

export const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".wav": "audio/wav",
  ".vtt": "text/vtt; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json",
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
};

/** Compare a share token in constant time, so response timing says nothing about how close a guess was. */
export function sameToken(stored: string, given: string): boolean {
  const a = Buffer.from(stored);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** A recording's summary as it is on disk now, or `fallback` when it can no longer be read. */
export function rereadSummary<T extends RecordingSummary>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function readBodyToTemp(req: IncomingMessage, limit: number, _prefix: string): Promise<string> {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const tmpDir = path.join(os.tmpdir(), "walkcast-voiceover");
  fs.mkdirSync(tmpDir, { recursive: true });
  const file = path.join(tmpDir, `${randomUUID()}.bin`);
  const { createWriteStream } = await import("node:fs");
  // Pipe chunks to disk instead of buffering, so a 40 MB voice doesn't pin the event loop.
  const out = createWriteStream(file);
  let size = 0;
  try {
    for await (const chunk of req as AsyncIterable<Buffer>) {
      size += chunk.length;
      if (size > limit) throw new AuthError(413, "That recording is too large.");
      if (!out.write(chunk)) await new Promise<void>((r) => out.once("drain", () => r()));
    }
    out.end();
    await new Promise<void>((resolve, reject) => {
      out.on("finish", () => resolve());
      out.on("error", reject);
    });
  } catch (e) {
    fs.rmSync(file, { force: true });
    if (out && !out.destroyed) out.destroy();
    throw e;
  }
  if (!size) {
    fs.rmSync(file, { force: true });
    throw new AuthError(400, "No audio received.");
  }
  return file;
}

export function validateCaptions(raw: unknown): { start: number; end: number; text: string }[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 500) throw new AuthError(400, "The script needs between 1 and 500 lines.");
  return raw.map((c, i) => {
    const x = c as { start?: unknown; end?: unknown; text?: unknown };
    const start = Number(x.start);
    const end = Number(x.end);
    const text = typeof x.text === "string" ? x.text.replace(/\s+/g, " ").trim().slice(0, 400) : "";
    if (!Number.isFinite(start) || start < 0 || !Number.isFinite(end) || !text) throw new AuthError(400, `Line ${i + 1} of the script is empty or has no time.`);
    return { start, end: Math.max(end, start), text };
  });
}

export async function readJson(req: IncomingMessage, limit = 100_000): Promise<Record<string, unknown>> {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > limit) throw new AuthError(413, "Request body too large.");
  }
  try {
    const value = JSON.parse(body || "{}") as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value as Record<string, unknown>;
  } catch {
    throw new AuthError(400, "Request body must be a JSON object.");
  }
}

/** A moment in words: "20 Oct 2026, 10:00". A raw timestamp tells a reader nothing. */
export function readableWhen(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;
  return `${when.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}, ${when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

export function clampInt(raw: string | number | null | undefined, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && raw !== null && raw !== undefined && raw !== "" ? Math.max(min, Math.min(max, Math.trunc(n))) : fallback;
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms))]);
}

/** The client's address; behind a reverse proxy set LAB_TRUST_PROXY=1 to use X-Forwarded-For. */
export function clientIp(req: IncomingMessage): string {
  const forwarded = process.env.LAB_TRUST_PROXY === "1" ? String(req.headers["x-forwarded-for"] ?? "").split(",")[0]?.trim() : "";
  return forwarded || req.socket.remoteAddress || "?";
}

/** Serve a file with byte-range support, so video players can seek. */
export function streamFile(req: IncomingMessage, res: ServerResponse, abs: string, type: string, cache: string): void {
  let size: number;
  try {
    const st = statSync(abs);
    if (!st.isFile()) { res.writeHead(404); res.end(); return; }
    size = st.size;
  } catch {
    res.writeHead(404); res.end(); return;
  }
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      res.end();
      return;
    }
    res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Cache-Control": cache });
    const s = createReadStream(abs, { start, end }).on("error", () => { if (!res.headersSent) { res.writeHead(500); } res.end(); });
    s.pipe(res);
    return;
  }
  res.writeHead(200, { "Content-Type": type, "Cache-Control": cache, "Accept-Ranges": "bytes", "Content-Length": size });
  const s = createReadStream(abs).on("error", () => { if (!res.headersSent) { res.writeHead(500); } res.end(); });
  s.pipe(res);
}

/** Move a file, across filesystems too: a rename between two mounts or drives fails with EXDEV. */
export function moveFile(from: string, to: string): void {
  try {
    renameSync(from, to);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EXDEV") throw e;
    copyFileSync(from, to);
    rmSync(from, { force: true });
  }
}
