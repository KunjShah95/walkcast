import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RecordingSummary } from "../../../../packages/core/src/data.ts";
import type { TraceEvent } from "../../../../packages/core/src/capture/recorder.ts";
import { log } from "../../../../packages/core/src/ops/log.ts";
import { analyzeRecording } from "../../../../packages/core/src/record/insights.ts";
import { buildSilentCopy, generateCaptionsFromAudio, isVoice, renarrate, voiceover } from "../../../../packages/core/src/record/media.ts";
import { isShape, socialExport } from "../../../../packages/core/src/record/social.ts";
import { configuredSttProviders } from "../../../../packages/core/src/record/stt.ts";
import { toSrt, toVtt, transcriptMarkdown } from "../../../../packages/core/src/record/transcript.ts";
import { engineFor } from "../../../../packages/core/src/record/voice.ts";
import { isCloudProvider } from "../../../../packages/core/src/record/voices.ts";
import { capabilitiesCache } from "../caches.ts";
import { clampInt, readBodyToTemp, readJson, rereadSummary, validateCaptions } from "../http.ts";
import { LIMITS } from "../job-input.ts";
import { revealInFileManager } from "../reveal.ts";
import { newShareToken } from "../share.ts";
import type { Route } from "./router.ts";
import { sendGuide } from "./share.ts";

/** A recording and what is made from it: narration, exports, share links, notes, transcripts and guides. */
export const recordingRoutes: Route[] = [
  {
    method: "POST",
    path: /^\/api\/recordings\/([\w.-]+)\/(narration|voiceover)$/,
    auth: "owner-checked",
    handler: async ({ req, json, params, canSee, deps: { root, media, findRecording, saveRecordingSummary } }) => {
      const [, id, what] = params as unknown as [string, string, "narration" | "voiceover"];
      const row = await findRecording(id);
      if (!row || !canSee(row.owner)) return json(404, { error: "Recording not found." });
      if (media.kind !== "local") return json(501, { error: "Editing narration needs recordings kept on this server's disk." });
      const dir = join(root, "recordings", id);
      const file = join(dir, "recording.json");
      if (!existsSync(file)) return json(404, { error: "Recording not found." });
      const summary = JSON.parse(readFileSync(file, "utf8")) as RecordingSummary & Record<string, unknown>;
      let result;
      let captions: RecordingSummary["captions"] | undefined;
      if (what === "narration") {
        const b = await readJson(req, 500_000);
        captions = validateCaptions(b.captions);
        const voice = isVoice(b.voice) ? b.voice : "slt";
        // Re-speak with the voice the recording was made in ("elevenlabs:<voice id>"), so fixing
        // one line doesn't swap a natural voice for the offline one.
        const spoke = typeof (summary as { narration?: { spoke?: unknown } }).narration?.spoke === "string" ? String((summary as { narration: { spoke: string } }).narration.spoke) : "";
        const [spokeProvider = "", ...spokeVoice] = spoke.split(":");
        const cloud = spokeProvider && isCloudProvider(spokeProvider) ? engineFor(spokeProvider, voice, spokeVoice.join(":") || undefined) : null;
        result = await renarrate(dir, captions, voice, cloud);
      } else {
        const audioPath = await readBodyToTemp(req, 40_000_000, "voiceover");
        try {
          result = await voiceover(dir, audioPath, summary.captions);
        } finally {
          rmSync(audioPath, { force: true });
        }
      }
      // Re-voicing takes a while. Read the summary again and change only what it made, so a share
      // link or note created in the meantime is not written over by the copy read at the start.
      const fresh = rereadSummary(file, summary);
      if (captions) fresh.captions = captions;
      fresh.media = { ...fresh.media, ...result, video: fresh.media.video };
      writeFileSync(file, JSON.stringify(fresh, null, 2));
      await saveRecordingSummary(id, row.owner, fresh);
      return json(200, { recording: { ...fresh, id, dir: `recordings/${id}` } });
    },
  },
  // The walkthrough re-framed for a feed: 9:16 or 1:1, captions burned in. Made on request,
  // because most walkthroughs never need one and each takes an encode.
  // Show a recording (or one of its files, e.g. an export) in the OS file manager. Only on a
  // loopback server: on a shared one the file manager would open on the server's screen.
  {
    method: "POST",
    path: /^\/api\/recordings\/([\w.-]+)\/reveal$/,
    auth: "owner-checked",
    handler: async ({ req, res, json, params, canSee, securityHeaders, deps: { o, root, media, exposed, findRecording } }) => {
      if (exposed) return json(404, { error: "not found" });
      const id = params[1]!;
      if (id.startsWith(".")) return json(404, { error: "Recording not found." });
      const row = await findRecording(id);
      if (!row || !canSee(row.owner)) return json(404, { error: "Recording not found." });
      if (media.kind !== "local") return json(404, { error: "This recording isn't stored on this computer." });
      const b = await readJson(req, 10_000).catch(() => ({}) as Record<string, unknown>);
      const file = b.file === undefined || b.file === null || b.file === "" ? null : String(b.file);
      // The same strict name rule media serving uses: one path segment, no "..".
      if (file !== null && (!/^[\w.-]+$/.test(file) || file === "." || file.includes(".."))) return json(400, { error: "That isn't a file name." });
      const target = file ? join(root, "recordings", id, file) : join(root, "recordings", id);
      if (!existsSync(target)) return json(404, { error: "File not found." });
      (o.reveal ?? revealInFileManager)(target);
      res.writeHead(204, securityHeaders);
      return void res.end();
    },
  },
  {
    method: "POST",
    path: /^\/api\/recordings\/([\w.-]+)\/export$/,
    auth: "owner-checked",
    handler: async ({ url, json, params, canSee, deps: { root, media, findRecording, saveRecordingSummary } }) => {
      const id = params[1]!;
      const shape = url.searchParams.get("shape");
      if (!isShape(shape)) return json(400, { error: "shape must be vertical or square" });
      const row = await findRecording(id);
      if (!row || !canSee(row.owner)) return json(404, { error: "Recording not found." });
      if (media.kind !== "local") return json(501, { error: "Exports need recordings kept on this server's disk." });
      const dir = join(root, "recordings", id);
      const file = join(dir, "recording.json");
      if (!existsSync(file)) return json(404, { error: "Recording not found." });
      const summary = JSON.parse(readFileSync(file, "utf8")) as RecordingSummary & Record<string, unknown>;
      let made: { file: string; captions: boolean };
      try {
        made = await socialExport(dir, shape);
      } catch (e) {
        return json(500, { error: e instanceof Error ? e.message.split("\n").at(-1) : String(e) });
      }
      // The encode takes a while: change only what it made, on a fresh read of the summary.
      const fresh = rereadSummary(file, summary);
      fresh.media = { ...fresh.media, exports: { ...fresh.media.exports, [shape]: made.file } };
      writeFileSync(file, JSON.stringify(fresh, null, 2));
      await saveRecordingSummary(id, row.owner, fresh);
      return json(200, { recording: { ...fresh, id, dir: `recordings/${id}` }, captions: made.captions });
    },
  },
  // Re-export several existing recordings in one background job: the per-item work is exactly
  // what POST /api/recordings/:id/export does, run sequentially so one bad recording doesn't
  // sink the rest. The whole batch counts as one active job, same ceiling as a single run.
  {
    method: "POST",
    path: "/api/recordings/batch-render",
    auth: "owner-checked",
    handler: async ({ req, json, owner, canSee, deps: { store, worker, findRecording } }) => {
      const b = (await readJson(req).catch(() => ({}))) as { recordingIds?: unknown; shape?: unknown };
      const recordingIds = Array.isArray(b.recordingIds) ? b.recordingIds.filter((x): x is string => typeof x === "string" && x.length > 0) : null;
      if (!recordingIds || recordingIds.length === 0) return json(400, { error: "recordingIds must be a non-empty array of recording ids." });
      if (recordingIds.length > LIMITS.maxBatchRenderItems) return json(400, { error: `A batch render can include at most ${LIMITS.maxBatchRenderItems} recordings.` });
      if (!isShape(b.shape)) return json(400, { error: "shape must be vertical or square" });
      // Fail the whole request up front if any id is missing or not this account's: the user must
      // know which one was bad before anything runs, not after the job half-finishes.
      for (const id of recordingIds) {
        const row = await findRecording(id);
        if (!row || !canSee(row.owner)) return json(404, { error: `Recording ${id} not found.` });
      }
      if ((await store.activeJobs(owner)) >= LIMITS.activeJobsPerUser) return json(429, { error: "You already have a job running. Wait for it to finish." });
      const job = await store.enqueueLimited({ kind: "batch-render", owner, input: { recordingIds, shape: b.shape } }, LIMITS.activeJobsPerUser);
      if (!job) return json(429, { error: "You already have a job running. Wait for it to finish." });
      worker?.poke();
      log.info("job.enqueued", { job: job.id, kind: "batch-render", owner, items: recordingIds.length });
      return json(202, { jobId: job.id });
    },
  },
  // A download of the same walkthrough with no narration track, for a recording that was
  // made with a voice but is wanted without one (sharing with sound off, dubbing it elsewhere).
  // Built once per recording and reused after that, the same way an export is.
  {
    method: "POST",
    path: /^\/api\/recordings\/([\w.-]+)\/no-voice$/,
    auth: "owner-checked",
    handler: async ({ json, params, canSee, deps: { root, media, findRecording, saveRecordingSummary } }) => {
      const id = params[1]!;
      const row = await findRecording(id);
      if (!row || !canSee(row.owner)) return json(404, { error: "Recording not found." });
      if (media.kind !== "local") return json(501, { error: "A no-voice download needs the recording kept on this server's disk." });
      const dir = join(root, "recordings", id);
      const file = join(dir, "recording.json");
      if (!existsSync(file)) return json(404, { error: "Recording not found." });
      const summary = JSON.parse(readFileSync(file, "utf8")) as RecordingSummary & Record<string, unknown>;
      let silent: string;
      try {
        silent = await buildSilentCopy(dir);
      } catch (e) {
        return json(500, { error: e instanceof Error ? e.message.split("\n").at(-1) : String(e) });
      }
      const fresh = rereadSummary(file, summary);
      fresh.media = { ...fresh.media, silent };
      writeFileSync(file, JSON.stringify(fresh, null, 2));
      await saveRecordingSummary(id, row.owner, fresh);
      return json(200, { recording: { ...fresh, id, dir: `recordings/${id}` } });
    },
  },
  // Share a walkthrough: a link that plays it for whoever has it, until it expires.
  //
  // The token is the permission and it lives in the walkthrough's own summary, so revoking
  // a link is removing it from there. There is no account on the other side of the link:
  // that is the whole point of sending someone one.
  {
    method: ["POST", "DELETE"],
    path: /^\/api\/recordings\/([\w.-]+)\/share$/,
    auth: "owner-checked",
    handler: async ({ req, url, user, owner, json, params, canSee, deps: { root, media, siteUrl, findRecording, listRecordings, saveRecordingSummary } }) => {
      const id = params[1]!;
      const row = await findRecording(id);
      if (!row || !canSee(row.owner)) return json(404, { error: "Recording not found." });
      const summary = row.summary ?? (await listRecordings(user)).find((r) => r.id === id);
      if (!summary) return json(404, { error: "Recording not found." });
      const shares = (summary.shares ?? []).filter((s) => Date.parse(s.expiresAt) > Date.now());
      if (req.method === "DELETE") {
        const token = url.searchParams.get("token");
        const kept = token ? shares.filter((s) => s.token !== token) : [];
        summary.shares = kept;
        await saveRecordingSummary(id, row.owner, summary);
        return json(200, { ok: true, shares: kept });
      }
      const body = (await readJson(req).catch(() => ({}))) as { days?: number; includeNotes?: boolean; silent?: boolean };
      const days = clampInt(body.days, 1, 90, 7);
      // Notes are the owner's private reading of the walkthrough. They go on a link only when
      // the owner asks for it, and each link carries its own answer.
      const includeNotes = body.includeNotes === true;
      // A link made with no narration: build the no-voice copy now if nobody has asked for one
      // yet, same as the Library's own "Download (no voice)" button does.
      const wantsSilent = body.silent === true;
      if (wantsSilent && !summary.media.silent) {
        if (media.kind !== "local") return json(501, { error: "A no-voice link needs the recording kept on this server's disk." });
        const dir = join(root, "recordings", id);
        try {
          summary.media = { ...summary.media, silent: await buildSilentCopy(dir) };
        } catch (e) {
          return json(500, { error: e instanceof Error ? e.message.split("\n").at(-1) : String(e) });
        }
      }
      const share = { token: newShareToken(), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + days * 86_400_000).toISOString(), includeNotes, ...(wantsSilent ? { silent: true } : {}) };
      summary.shares = [...shares, share];
      await saveRecordingSummary(id, row.owner, summary);
      log.info("recording.shared", { id, owner, until: share.expiresAt });
      return json(200, { share, url: `${siteUrl}/share/${encodeURIComponent(id)}/${share.token}`, shares: summary.shares });
    },
  },
  // What the recorder found on the site while it walked it.
  //
  // A walkthrough made now carries its insights in its summary. One made before this existed
  // still has its trace on disk, and the trace is where the truth is: the same analysis runs
  // over it here, so an old walkthrough is not a blank page.
  {
    method: "GET",
    path: /^\/api\/recordings\/([\w.-]+)\/insights$/,
    auth: "owner-checked",
    handler: async ({ user, json, params, canSee, deps: { root, media, findRecording, listRecordings } }) => {
      const id = params[1]!;
      const row = await findRecording(id);
      if (!row || !canSee(row.owner)) return json(404, { error: "Recording not found." });
      const summary = (await listRecordings(user)).find((r) => r.id === id);
      if (summary?.insights) return json(200, { insights: summary.insights });
      if (media.kind !== "local") return json(501, { error: "This walkthrough's trace is not on this server, so it cannot be read here." });
      const trace = join(root, "recordings", id, "trace.jsonl");
      if (!existsSync(trace)) return json(404, { error: "This walkthrough has no trace to read." });
      const facts = {
        id,
        url: summary?.url ?? "",
        createdAt: summary?.createdAt,
        durationMs: summary?.durationMs ?? 0,
        pages: summary?.pages ?? [],
        skipped: summary?.skipped ?? [],
        stopped: summary?.stopped,
      };
      const events = readFileSync(trace, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line) as TraceEvent;
          } catch {
            return null; // a half-written line is not a reason to fail the whole read
          }
        })
        .filter((e): e is TraceEvent => e !== null);
      return json(200, { insights: analyzeRecording(facts, events) });
    },
  },
  // Notes pinned to a moment in a walkthrough.
  //
  // The walkthrough is the evidence; the note is its owner's reading of it. Notes belong to
  // the recording's owner and are nobody else's business: they are listed, added and removed
  // through this one route, and a note only reaches a share link when its owner says so.
  {
    method: ["GET", "POST"],
    path: /^\/api\/recordings\/([\w.-]+)\/annotations$/,
    auth: "owner-checked",
    handler: async ({ req, json, params, canSee, deps: { store, findRecording } }) => {
      const id = params[1]!;
      const row = await findRecording(id);
      if (!row || !canSee(row.owner)) return json(404, { error: "Recording not found." });
      if (req.method === "GET") return json(200, { annotations: await store.annotations(id, row.owner ?? null) });
      const body = (await readJson(req).catch(() => ({}))) as { at?: unknown; text?: unknown };
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text) return json(400, { error: "A note needs some text." });
      if (text.length > 2000) return json(400, { error: "That note is too long (2000 characters at the most)." });
      const at = Number(body.at);
      if (!Number.isFinite(at) || at < 0) return json(400, { error: "A note needs a position in the video." });
      const annotation = {
        id: randomUUID(),
        recordingId: id,
        owner: row.owner ?? null,
        at: Math.round(at * 1000) / 1000,
        text,
        createdAt: new Date().toISOString(),
      };
      await store.addAnnotation(annotation);
      return json(201, { annotation });
    },
  },
  {
    method: "DELETE",
    path: /^\/api\/recordings\/([\w.-]+)\/annotations\/([\w-]+)$/,
    auth: "owner-checked",
    handler: async ({ json, params, canSee, deps: { store, findRecording } }) => {
      const [, id, noteId] = params as unknown as [string, string, string];
      const row = await findRecording(id);
      if (!row || !canSee(row.owner)) return json(404, { error: "Recording not found." });
      const removed = await store.removeAnnotation(noteId, row.owner ?? null);
      return removed ? json(200, { ok: true }) : json(404, { error: "Note not found." });
    },
  },
  // Delete a recording: its files (local folder, or its objects in the bucket) and its index row.
  {
    method: "DELETE",
    path: /^\/api\/recordings\/([\w.-]+)$/,
    auth: "owner-checked",
    handler: async ({ user, owner, json, params, canSee, deps: { store, media, findRecording, listRecordings } }) => {
      const id = params[1]!;
      if (id.startsWith(".")) return json(404, { error: "Recording not found." }); // never "..": this ends in a delete
      const row = await findRecording(id);
      if (!row || !canSee(row.owner)) return json(404, { error: "Recording not found." });
      // The files it published (worker.ts): the media names in its summary, plus recording.json.
      const summary = (await listRecordings(user)).find((r) => r.id === id);
      const m = (summary?.media ?? {}) as Partial<Record<"mp4" | "webm" | "video" | "audio" | "captions", string | null>>;
      const launchFiles = (summary?.media.launchVideos ?? []).flatMap((film) => [film.video, film.poster, film.noVoiceVideo, film.ownVoiceVideo]);
      const files = [m.mp4, m.webm, m.video, m.audio, m.captions, ...launchFiles, "recording.json"].filter((f): f is string => Boolean(f));
      try {
        await media.remove(id, files);
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        // Windows: the video is still open (playing in a tab). The index row stays, so nothing is half-deleted.
        if (code === "EBUSY" || code === "EPERM") return json(409, { error: "The recording is in use and couldn't be deleted. Stop playing it and try again." });
        return json(502, { error: `Couldn't delete the recording's files: ${e instanceof Error ? e.message : String(e)}` });
      }
      await store.deleteRecording(id);
      capabilitiesCache.clear();
      log.info("recording.deleted", { id, owner });
      return json(200, { ok: true });
    },
  },
  {
    method: "POST",
    path: /^\/api\/recordings\/([\w.-]+)\/captions\/stt$/,
    auth: "owner-checked",
    handler: async ({ req, json, params, canSee, deps: { root, media, findRecording, saveRecordingSummary } }) => {
      const id = params[1]!;
      const row = await findRecording(id);
      if (!row || !canSee(row.owner)) return json(404, { error: "Recording not found." });
      if (media.kind !== "local") return json(501, { error: "STT needs recordings kept on this server's disk." });
      const dir = join(root, "recordings", id);
      const file = join(dir, "recording.json");
      if (!existsSync(file)) return json(404, { error: "Recording not found." });
      const summary = JSON.parse(readFileSync(file, "utf8")) as RecordingSummary & Record<string, unknown>;
      const b = await readJson(req).catch(() => ({}));
      const language = typeof (b as any)?.language === "string" ? (b as any).language : "unknown";
      let audioFile = (summary.media as any)?.audio ?? "narration.wav";
      if (!existsSync(join(dir, audioFile))) {
        if (existsSync(join(dir, "video.webm"))) audioFile = "video.webm";
        else return json(400, { error: "No audio available for this recording." });
      }
      // No speech-to-text key is the person's to fix in Settings, not a server failure.
      if (configuredSttProviders().length === 0) return json(400, { error: "Auto-captions need a speech-to-text key. Add an OpenAI, Groq, ElevenLabs or Sarvam key in Settings." });
      try {
        const captions = await generateCaptionsFromAudio(join(dir, audioFile), language, typeof (b as any)?.provider === "string" ? (b as any).provider : null);
        const { toWebVtt } = await import("../../../../packages/core/src/record/narration.ts");
        writeFileSync(join(dir, "captions.vtt"), toWebVtt(captions as any));
        // Speech-to-text takes a while: change only the captions on a fresh read (see narration).
        const fresh = rereadSummary(file, summary);
        fresh.captions = captions;
        fresh.media = { ...fresh.media, captions: "captions.vtt" };
        writeFileSync(file, JSON.stringify(fresh, null, 2));
        await saveRecordingSummary(id, row.owner, fresh);
        return json(200, { recording: { ...fresh, id, dir: `recordings/${id}` }, captions });
      } catch (e) {
        return json(500, { error: e instanceof Error ? e.message : String(e) });
      }
    },
  },
];

/** A recording read as a document: its transcript and its step-by-step guide. */
export const documentRoutes: Route[] = [
  {
    method: "GET",
    path: /^\/api\/recordings\/([\w.-]+)\/transcript$/,
    auth: "owner-checked",
    handler: async ({ res, url, json, params, canSee, securityHeaders, deps: { store, findRecording } }) => {
      const id = params[1]!;
      const row = await findRecording(id);
      if (!row || !canSee(row.owner) || !row.summary) return json(404, { error: "not found" });
      // The summary is the recording's own document wherever the media lives. Reading it from
      // the store keeps transcripts working when recording.json is in object storage, where a
      // locate() is a redirect to a file the browser would download instead of the server read.
      const summary: RecordingSummary = row.summary;
      const caps = summary.captions ?? [];
      const format = (url.searchParams.get("format") ?? "json").toLowerCase();
      if (format === "json") return json(200, { captions: caps });
      if (format === "srt") {
        const body = toSrt(caps);
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...securityHeaders });
        return void res.end(body);
      }
      if (format === "vtt") {
        const body = toVtt(caps);
        res.writeHead(200, { "Content-Type": "text/vtt; charset=utf-8", "Cache-Control": "no-store", ...securityHeaders });
        return void res.end(body);
      }
      if (format === "md" || format === "markdown") {
        // The whole visit as one document: the pages it opened, the narration it spoke, the
        // owner's notes and what the recorder found. Meant to be pasted somewhere else.
        const notes = await store.annotations(id, row.owner ?? null);
        const body = transcriptMarkdown({
          url: summary.url ?? "",
          createdAt: summary.createdAt,
          durationMs: summary.durationMs ?? 0,
          pages: summary.pages ?? [],
          captions: caps,
          notes: notes.map((n) => ({ at: n.at, text: n.text })),
          findings: summary.insights?.findings ?? [],
        });
        res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store", ...securityHeaders });
        return void res.end(body);
      }
      return json(400, { error: "unknown format" });
    },
  },
  // The same visit as a step-by-step guide: every page it opened and every click and fill,
  // each with a picture of the screen at that moment. HTML to read or print, Markdown to paste.
  {
    method: "GET",
    path: /^\/api\/recordings\/([\w.-]+)\/guide$/,
    auth: "owner-checked",
    handler: async (ctx) => {
      const { url, json, params, canSee, deps: { findRecording } } = ctx;
      const id = params[1]!;
      const row = await findRecording(id);
      if (!row || !canSee(row.owner)) return json(404, { error: "not found" });
      if (!row.summary) return json(404, { error: "not found" });
      return sendGuide(ctx, id, row.summary, (url.searchParams.get("format") ?? "html").toLowerCase(), `/files/recordings/${encodeURIComponent(id)}/`);
    },
  },
];
