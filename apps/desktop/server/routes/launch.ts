import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { LaunchVideo, RecordingSummary } from "../../../../packages/core/src/data.ts";
import { findChrome } from "../../../../packages/core/src/lab/chrome.ts";
import { checkFreeSpace } from "../../../../packages/core/src/ops/disk.ts";
import { log } from "../../../../packages/core/src/ops/log.ts";
import { kokoroReady, refreshKokoro } from "../../../../packages/core/src/record/voice.ts";
import type { DesktopTask } from "../desktop-tasks.ts";
import { readJson, rereadSummary } from "../http.ts";
import type { Route } from "./router.ts";

// ---------------------------------------------------------- local product-launch video studio
const taskView = (task: DesktopTask) => ({
  id: task.id, kind: task.kind, recordingId: task.recordingId, status: task.status,
  progress: task.progress, message: task.message, startedAt: task.startedAt,
  updatedAt: task.updatedAt, error: task.error, video: task.video,
});

/** Kokoro can be warmed in Walkcast's private cache or already exist in Hugging Face's user cache. */
function hasKokoroModel(cacheRoot: string): boolean {
  const snapshots = join(cacheRoot, "hub", "models--hexgrad--Kokoro-82M", "snapshots");
  try {
    return readdirSync(snapshots, { withFileTypes: true }).some((entry) => {
      if (!entry.isDirectory()) return false;
      const snapshot = join(snapshots, entry.name);
      return existsSync(join(snapshot, "config.json")) && existsSync(join(snapshot, "kokoro-v1_0.pth"));
    });
  } catch {
    return false;
  }
}

/** Launch Studio: Kokoro setup, a launch film rendered from a recording, and the task status both report. */
export const launchRoutes: Route[] = [
  {
    method: "POST",
    path: "/api/launch-videos/setup",
    auth: "user",
    handler: ({ json, owner, deps: { o, root, desktopTasks, appSourceRoot } }) => {
      if (!o.desktop) return json(403, { error: "Kokoro setup is available from the local desktop app." });
      if (process.platform !== "win32") return json(501, { error: "Run the documented Kokoro setup command on this platform, then return to Launch Studio." });
      const active = [...desktopTasks.values()].find((task) => task.kind === "kokoro-setup" && task.status === "running");
      if (active) return json(202, { task: taskView(active) });
      const id = randomUUID();
      const task: DesktopTask = {
        id, kind: "kokoro-setup", owner: owner ?? null, status: "running", progress: 2,
        message: "Preparing Kokoro and its local voice model…", startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      const cache = process.env.WALKCAST_KOKORO_CACHE || join(root, "data", "kokoro-cache");
      mkdirSync(cache, { recursive: true });
      const script = join(appSourceRoot, "scripts", "setup-kokoro.ps1");
      desktopTasks.start(task, "powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-WarmModel", "-CachePath", cache], appSourceRoot, {
        ...process.env, PYTHONUTF8: "1", WALKCAST_KOKORO_CACHE: cache,
      }, async () => {
        if (!(await refreshKokoro())) throw new Error("Kokoro setup finished, but Walkcast still cannot find its Python packages.");
      });
      log.info("launch_video.kokoro_setup_started", { task: id, owner });
      return json(202, { task: taskView(task) });
    },
  },
  {
    method: "GET",
    path: /^\/api\/launch-videos\/jobs\/([\w-]+)$/,
    auth: "owner-checked",
    handler: ({ json, params, canSee, deps: { desktopTasks } }) => {
      const task = desktopTasks.get(params[1]!);
      if (!task || !canSee(task.owner)) return json(404, { error: "Launch video job not found." });
      return json(200, { task: taskView(task) });
    },
  },
  {
    method: "POST",
    path: /^\/api\/recordings\/([\w.-]+)\/launch-videos$/,
    auth: "owner-checked",
    handler: async ({ req, json, params, owner, canSee, deps: { o, root, media, desktopTasks, appSourceRoot, findRecording, saveRecordingSummary } }) => {
      if (!o.desktop) return json(403, { error: "Launch Studio is available in the local desktop app." });
      const id = params[1]!;
      const row = await findRecording(id);
      if (!row || !canSee(row.owner) || !row.summary) return json(404, { error: "Recording not found." });
      const recordingDurationMs = row.summary.durationMs;
      if (media.kind !== "local") return json(501, { error: "Launch films need the recording saved on this computer." });
      let sourceUrl: URL;
      try { sourceUrl = new URL(row.summary.url); } catch { return json(400, { error: "This recording has an invalid website address." }); }
      if (!(sourceUrl.protocol === "https:" || sourceUrl.protocol === "http:") || row.summary.durationMs < 15_000 || !row.summary.pages.length) {
        return json(400, { error: "Choose a website recording with at least 15 seconds of footage and one visited page." });
      }
      const input = await readJson(req, 20_000);
      const voiceProvider = input.voiceProvider === "custom" ? "custom" : input.voiceProvider === "none" ? "none" : "kokoro";
      const voice = voiceProvider === "none" ? "none" : String(input.voice ?? "af_heart").trim();
      if (voiceProvider === "kokoro" && !/^[a-z]{2}_[a-z0-9_]{2,40}$/.test(voice)) return json(400, { error: "Choose a valid Kokoro voice id." });
      if (voiceProvider === "custom" && (!/^[\w:.-]{1,100}$/.test(voice) || !process.env.LAB_TTS_ENDPOINT?.trim())) return json(503, { error: "Configure LAB_TTS_ENDPOINT and enter a valid voice-profile ID before using the connected voice pipeline." });
      const tone = input.tone ?? "polished";
      const format = input.format ?? "landscape";
      if (!(tone === "polished" || tone === "cinematic" || tone === "playful")) return json(400, { error: "Choose a supported film direction." });
      if (!(format === "landscape" || format === "vertical" || format === "square")) return json(400, { error: "Choose a supported video format." });
      let kokoroCache: string | undefined;
      if (voiceProvider === "kokoro") {
        if (!(await kokoroReady())) return json(503, { error: "Kokoro is not installed for this Python. Open Launch Studio and choose Set up Kokoro." });
        const appCache = process.env.WALKCAST_KOKORO_CACHE?.trim() || join(root, "data", "kokoro-cache");
        const userCache = process.env.HF_HOME?.trim() || join(homedir(), ".cache", "huggingface");
        kokoroCache = [appCache, userCache].find(hasKokoroModel);
        if (!kokoroCache) return json(503, { error: "The Kokoro model is not downloaded yet. Choose Prepare model in Launch Studio, then generate the film again." });
      }
      // A film render writes frames, audio and an encode: refuse up front on a nearly full disk.
      const space = await checkFreeSpace(root);
      if (!space.ok) return json(507, { error: space.message });
      if ([...desktopTasks.values()].some((task) => task.kind === "launch-video" && task.status === "running" && task.recordingId === id && task.owner === (owner ?? null))) {
        return json(409, { error: "A launch video is already rendering from this recording." });
      }
      const recordingDir = join(root, "recordings", id);
      const summaryFile = join(recordingDir, "recording.json");
      if (!existsSync(summaryFile)) return json(404, { error: "Recording files are missing." });
      const diskSummary = JSON.parse(readFileSync(summaryFile, "utf8")) as RecordingSummary & Record<string, unknown>;
      const captureCandidates = [join(recordingDir, "recording.mp4"), diskSummary.media?.mp4 && join(recordingDir, basename(diskSummary.media.mp4)), diskSummary.media?.video && join(recordingDir, basename(diskSummary.media.video))]
        .filter((file): file is string => typeof file === "string");
      const capture = captureCandidates.find((file) => existsSync(file));
      if (!capture) return json(404, { error: "The fresh recording video is missing. Record the site again in Walkcast." });

      const taskId = randomUUID();
      const taskRoot = join(root, "launch-video-work", taskId);
      const workDir = join(taskRoot, "docs", "launch", "source");
      const outputDir = join(taskRoot, "rendered");
      const siteConfigPath = join(taskRoot, "site-film.json");
      mkdirSync(taskRoot, { recursive: true });
      const requestMoments = new Map<string, number>();
      const tracePath = join(recordingDir, "trace.jsonl");
      if (existsSync(tracePath)) {
        for (const line of readFileSync(tracePath, "utf8").split(/\r?\n/)) {
          try {
            const event = JSON.parse(line) as { type?: string; method?: string; url?: string; at?: number };
            if (event.type !== "request" || event.method !== "GET" || !event.url || !Number.isFinite(event.at)) continue;
            const key = new URL(event.url).origin + new URL(event.url).pathname;
            if (!requestMoments.has(key)) requestMoments.set(key, event.at!);
          } catch { /* ignore malformed and non-URL trace rows */ }
        }
      }
      const rawPages = row.summary.pages.map((page) => {
        let pathname = "";
        let atMs: number | undefined;
        try {
          const url = new URL(page.url);
          pathname = url.pathname;
          atMs = requestMoments.get(url.origin + url.pathname);
        } catch { /* invalid event URL; title remains useful */ }
        return { title: String(page.title || pathname || sourceUrl.hostname).trim().slice(0, 60), url: page.url, atMs };
      }).filter((page, index, all) => all.findIndex((other) => other.url === page.url) === index).slice(0, 8);
      const firstMoment = rawPages.find((page) => page.atMs !== undefined)?.atMs ?? 0;
      const pages = rawPages.map((page, index) => ({ ...page, atMs: page.atMs === undefined ? undefined : Math.max(0, page.atMs - firstMoment) || (index === 0 ? 0 : undefined) }));
      writeFileSync(siteConfigPath, JSON.stringify({ url: sourceUrl.toString(), host: sourceUrl.hostname, title: pages[0]?.title || sourceUrl.hostname, pages, durationMs: row.summary.durationMs, tone, format }));
      const task: DesktopTask = {
        id: taskId, kind: "launch-video", owner: owner ?? null, recordingId: id, status: "running", progress: 1,
        message: "Building the launch film…", startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), temporaryDir: taskRoot,
      };
      const builder = join(appSourceRoot, "docs", "launch", "source", "build-site-film.mjs");
      desktopTasks.start(task, process.execPath, [builder, capture], appSourceRoot, {
        ...process.env,
        KOKORO_VOICE: voice,
        WALKCAST_LAUNCH_VOICE_ID: voice,
        WALKCAST_LAUNCH_VOICE_PROVIDER: voiceProvider,
        WALKCAST_LAUNCH_HAS_VOICE: voiceProvider === "none" ? "0" : "1",
        WALKCAST_LAUNCH_TONE: tone,
        WALKCAST_LAUNCH_FORMAT: format,
        ...(kokoroCache ? { WALKCAST_KOKORO_CACHE: kokoroCache } : {}),
        HF_HUB_OFFLINE: "1",
        WALKCAST_LAUNCH_WORK_DIR: workDir,
        WALKCAST_LAUNCH_OUTPUT_DIR: outputDir,
        WALKCAST_LAUNCH_SITE_CONFIG: siteConfigPath,
        ...(findChrome() ? { PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: findChrome()! } : {}),
      }, async () => {
        const video = `launch-video-${taskId}.mp4`;
        const poster = `launch-video-${taskId}-poster.jpg`;
        copyFileSync(join(outputDir, "Site-Launch-Film.mp4"), join(recordingDir, video));
        copyFileSync(join(outputDir, "Site-Launch-Film-poster.jpg"), join(recordingDir, poster));
        const noVoiceOutput = join(outputDir, "Site-Launch-Film-No-Voice.mp4");
        const noVoiceVideo = existsSync(noVoiceOutput) ? `launch-video-${taskId}-no-voice.mp4` : undefined;
        if (noVoiceVideo) copyFileSync(noVoiceOutput, join(recordingDir, noVoiceVideo));
        const made: LaunchVideo = { id: taskId, video, poster, ...(noVoiceVideo ? { noVoiceVideo } : {}), voice, voiceProvider, tone, format, durationSeconds: Math.min(58, Math.round(recordingDurationMs / 1000)), createdAt: new Date().toISOString() };
        const fresh = rereadSummary(summaryFile, diskSummary);
        fresh.media.launchVideos = [made, ...(fresh.media.launchVideos ?? []).filter((item) => item.id !== made.id)].slice(0, 12);
        writeFileSync(summaryFile, JSON.stringify(fresh, null, 2));
        await saveRecordingSummary(id, row.owner, fresh);
        task.video = made;
      });
      log.info("launch_video.started", { task: taskId, recording: id, voice, owner });
      return json(202, { task: taskView(task) });
    },
  },
];
