import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { VOICES, canNarrate, cloudVoicePreview, isVoice, voicePreview } from "../../../../packages/core/src/record/media.ts";
import { configuredCloudProviders, kokoroAvailable, kokoroReady } from "../../../../packages/core/src/record/voice.ts";
import { defaultLanguageFor, defaultVoiceFor, isCloudProvider, needsLanguageInput, voicesFor } from "../../../../packages/core/src/record/voices.ts";
import { capabilitiesCache } from "../caches.ts";
import { TYPES, clientIp, moveFile, readBodyToTemp, streamFile } from "../http.ts";
import { TTS_PROVIDERS, TTS_PROVIDER_LABEL } from "../job-input.ts";
import type { Ctx, Route } from "./router.ts";

// ---------------------------------------------------------------- custom voice upload/list
/** Where uploaded voice samples live, and who may use each one (also checked by POST /api/record). */
export function voiceAccess({ canSee, deps: { root, exposed } }: Ctx) {
  const voicesDir = join(root, "data", "voices");
  // A voice sample is a recording of somebody's voice: it belongs to whoever uploaded it. The
  // uploader is kept beside the file (<id>.owner); samples from before that existed have none
  // and stay visible on a local server, never on a shared one.
  const voiceOwner = (id: string): string | null => {
    try {
      return readFileSync(join(voicesDir, `${id}.owner`), "utf8").trim() || null;
    } catch {
      return null;
    }
  };
  const mayUseVoice = (id: string) => {
    const o = voiceOwner(id);
    return o === null ? !exposed : canSee(o);
  };
  const voiceFiles = (id?: string) =>
    existsSync(voicesDir) ? readdirSync(voicesDir).filter((f) => /\.(wav|mp3|ogg|m4a)$/i.test(f) && (id === undefined || basename(f, extname(f)) === id)) : [];
  return { voicesDir, voiceOwner, mayUseVoice, voiceFiles };
}

/** Narration voices: uploaded samples, the provider catalog the picker renders, and spoken previews. */
export const voiceRoutes: Route[] = [
  {
    method: "GET",
    path: "/api/voices/custom",
    auth: "owner-checked",
    handler: (ctx) => {
      const { user, json, deps: { requireAuth } } = ctx;
      const { mayUseVoice, voiceFiles } = voiceAccess(ctx);
      if (requireAuth && !user) return json(401, { error: "Sign in first." });
      const voices = voiceFiles()
        .filter((f) => mayUseVoice(basename(f, extname(f))))
        .map((f) => ({ id: basename(f, extname(f)), name: f, url: `/api/voices/custom/${basename(f, extname(f))}` }));
      return json(200, { voices });
    },
  },
  {
    method: "POST",
    path: "/api/voices/custom",
    auth: "user",
    handler: async (ctx) => {
      const { req, user, owner, json, deps: { requireAuth } } = ctx;
      const { voicesDir } = voiceAccess(ctx);
      if (requireAuth && !user) return json(401, { error: "Sign in first." });
      const tmp = await readBodyToTemp(req, 40_000_000, "voice");
      const nameHeader = String(req.headers["x-file-name"] ?? "");
      const ext = /^\.(wav|mp3|ogg|m4a)$/i.test(extname(nameHeader)) ? extname(nameHeader).toLowerCase() : ".wav";
      const id = randomUUID();
      mkdirSync(voicesDir, { recursive: true });
      const dest = join(voicesDir, `${id}${ext}`);
      moveFile(tmp, dest);
      if (owner) writeFileSync(join(voicesDir, `${id}.owner`), owner);
      capabilitiesCache.clear();
      return json(201, { id, name: basename(dest), url: `/api/voices/custom/${id}` });
    },
  },
  {
    method: ["GET", "HEAD"],
    path: /^\/api\/voices\/custom\/([\w-]+)$/,
    auth: "owner-checked",
    handler: (ctx) => {
      const { req, res, user, json, params, deps: { requireAuth } } = ctx;
      const { voicesDir, mayUseVoice, voiceFiles } = voiceAccess(ctx);
      if (requireAuth && !user) return json(401, { error: "Sign in first." });
      const id = params[1]!;
      const files = voiceFiles(id);
      if (files.length === 0 || !mayUseVoice(id)) return json(404, { error: "Not found." });
      const abs = join(voicesDir, files[0]!);
      const ct = TYPES[extname(abs).toLowerCase()] ?? "application/octet-stream";
      return void streamFile(req, res, abs, ct, "private, max-age=3600");
    },
  },
  {
    method: "DELETE",
    path: /^\/api\/voices\/custom\/([\w-]+)$/,
    auth: "owner-checked",
    handler: (ctx) => {
      const { user, json, params, deps: { requireAuth } } = ctx;
      const { voicesDir, mayUseVoice, voiceFiles } = voiceAccess(ctx);
      if (requireAuth && !user) return json(401, { error: "Sign in first." });
      const id = params[1]!;
      const files = voiceFiles(id);
      if (files.length === 0 || !mayUseVoice(id)) return json(404, { error: "Not found." });
      for (const f of files) rmSync(join(voicesDir, f), { force: true });
      rmSync(join(voicesDir, `${id}.owner`), { force: true });
      capabilitiesCache.clear();
      return json(200, { ok: true });
    },
  },

  // ---------------------------------------------------------------- voice preview (cloud providers)
  // The voice catalog the TTS picker renders: each provider's voices, its default, and whether
  // the server holds credentials for it. Providers with no public list (Murf, custom) are typed in.
  {
    method: "GET",
    path: "/api/voices",
    auth: "user",
    handler: async ({ json }) => {
      // Kokoro's first import is expensive, so report its package presence with the non-blocking
      // readiness probe instead of making an installed voice disappear during app startup.
      await kokoroReady();
      return json(200, {
        providers: TTS_PROVIDERS.map((p) => {
          const cloud = isCloudProvider(p);
          const voices = voicesFor(p);
          return {
            id: p,
            label: TTS_PROVIDER_LABEL[p] ?? p,
            cloud,
            /** A provider with credentials (or, for Kokoro, a working local install), so a choice
             *  here can actually speak. */
            configured: p === "kokoro" ? kokoroAvailable() : !cloud || configuredCloudProviders().includes(p),
            /** False when the provider's voice ids aren't a public list: the picker takes a text box. */
            hasList: voices.length > 0,
            defaultVoice: cloud || p === "kokoro" ? defaultVoiceFor(p) : (p === "flite" ? VOICES[0] : ""),
            /** The language the default voice speaks, and whether the picker asks for one. */
            defaultLanguage: cloud ? defaultLanguageFor(p) : "",
            needsLanguage: cloud && needsLanguageInput(p),
            voices,
          };
        }),
      });
    },
  },
  {
    method: ["GET", "HEAD"],
    path: "/api/voices/preview",
    auth: "user",
    handler: async ({ req, res, url, owner, json, deps: { store } }) => {
      const provider = (url.searchParams.get("provider") ?? "").trim();
      const voice = (url.searchParams.get("voice") ?? "").trim();
      const language = (url.searchParams.get("language") ?? "").trim().slice(0, 20);
      if (!provider) return json(400, { error: "provider is required." });
      if (!/^[\w:.-]{1,80}$/.test(voice || "x") || !/^[\w-]{0,20}$/.test(language)) return json(400, { error: "That voice or language is not one a provider names." });
      // Every new preview is a paid synthesis on the operator's key: 30 an hour per account.
      if ((await store.hit(`preview:${owner ?? clientIp(req)}`, 3_600_000)) > 30) return json(429, { error: "Too many voice previews this hour. Try again later." });
      try {
        const buf = await cloudVoicePreview(provider, voice, language || undefined);
        const ct = buf.length >= 4 && buf.toString("ascii", 0, 4) === "RIFF" ? "audio/wav"
          : buf.length >= 3 && buf.toString("ascii", 0, 3) === "ID3" ? "audio/mpeg"
          : buf.length >= 4 && buf.toString("ascii", 0, 4) === "OggS" ? "audio/ogg"
          : "audio/wav";
        res.writeHead(200, { "Content-Type": ct, "Content-Length": buf.length, "Cache-Control": "private, max-age=300" });
        return void res.end(buf);
      } catch (e) {
        return json(503, { error: e instanceof Error ? e.message : String(e) });
      }
    },
  },
  // ---------------------------------------------------------------- narration
  {
    method: "*",
    path: /^\/api\/voices\/(\w+)\.wav$/,
    auth: "user",
    handler: async ({ res, json, params }) => {
      if (!isVoice(params[1])) return json(404, { error: "Unknown voice." });
      if (!canNarrate()) return json(503, { error: "Voice previews need ffmpeg, plus its flite voice or Windows speech." });
      const wav = await voicePreview(params[1]);
      res.writeHead(200, { "Content-Type": "audio/wav", "Content-Length": wav.length, "Cache-Control": "private, max-age=86400" });
      return void res.end(wav);
    },
  },
];
