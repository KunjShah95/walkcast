import { mkdirSync, existsSync, copyFileSync, cpSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workDir = resolve(process.env.WALKCAST_LAUNCH_WORK_DIR || here);
const outputDir = resolve(process.env.WALKCAST_LAUNCH_OUTPUT_DIR || resolve(here, "output-site"));
const configPath = resolve(process.env.WALKCAST_LAUNCH_SITE_CONFIG || "");
const capture = resolve(process.argv[2] || "");
const ffmpeg = process.env.LAB_FFMPEG || "ffmpeg";
const python = process.env.WALKCAST_KOKORO_PYTHON || "python";
const voice = process.env.KOKORO_VOICE || "af_heart";
if (!existsSync(capture) || !existsSync(configPath)) throw new Error("A website recording and its launch-film details are required.");
const site = JSON.parse(await (await import("node:fs/promises")).readFile(configPath, "utf8"));
const host = String(site.host || new URL(site.url).hostname);
const title = String(site.title || host).replace(/[\r\n]+/g, " ").slice(0, 100);
const pages = (site.pages || []).map((page) => ({
  title: String(page.title || "Product details").replace(/[\r\n]+/g, " ").trim().slice(0, 56),
  url: String(page.url || site.url),
})).filter((page) => page.title);
const pageCount = pages.length;
const shortLabel = (value) => {
  const first = value.split(/\s[|—–:]\s/)[0]?.trim() || value;
  return first.length <= 38 ? first : `${first.slice(0, 35).replace(/\s+\S*$/, "")}…`;
};
const tone = ["polished", "cinematic", "playful"].includes(site.tone) ? site.tone : "polished";
const format = ["landscape", "vertical", "square"].includes(site.format) ? site.format : "landscape";
const dimensions = { landscape: [1920, 1080], vertical: [1080, 1920], square: [1080, 1080] }[format];
const data = { host, title: shortLabel(title), pageCount, tone, format };
data.captureDuration = Math.max(15, Number(site.durationMs || 20_000) / 1000);
data.duration = Math.min(data.captureDuration, 58);
data.pages = pages.slice(0, 6).map((page) => ({ ...page, title: shortLabel(page.title), path: (() => { try { return new URL(page.url).pathname || "/"; } catch { return "/"; } })() }));
data.chapters = data.pages.map((page, index) => ({ label: ["First look", "Explore", "A closer look", "In the details", "Another angle", "The experience"][index] || "The experience", title: page.title, path: page.path, at: page.atMs === undefined ? null : page.atMs / 1000 }));
data.titleHtml = data.title.replace(/[&<>"']/g, "").slice(0, 50);
const duration = data.duration;

mkdirSync(outputDir, { recursive: true });
mkdirSync(workDir, { recursive: true });
if (workDir !== here) {
  copyFileSync(resolve(here, "site-film.html"), resolve(workDir, "site-film.html"));
  cpSync(resolve(here, "fonts"), resolve(workDir, "fonts"), { recursive: true, force: true });
}
copyFileSync(capture, resolve(workDir, "fresh-capture.mp4"));

function run(command, args, cwd = here, env = process.env) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { cwd, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let tail = "";
    child.stdout?.on("data", (chunk) => { const line = String(chunk).trim(); if (line) console.log(line); });
    child.stderr?.on("data", (chunk) => { tail = `${tail}${String(chunk)}`.slice(-4000); });
    child.once("error", fail);
    child.once("close", (code) => code === 0 ? done() : fail(new Error(`${command} exited ${code}${tail ? `: ${tail}` : ""}`)));
  });
}

const html = (await (await import("node:fs/promises")).readFile(resolve(here, "site-film.html"), "utf8"))
  .replaceAll("__SITE_DATA__", JSON.stringify(data).replaceAll("<", "\\u003c"));
writeFileSync(resolve(workDir, "site-film.html"), html);
await run(python, [resolve(here, "music-brag.py"), resolve(outputDir, "score.wav"), tone, String(duration)], here, {
  ...process.env, PYTHONUTF8: "1", WALKCAST_LAUNCH_CHAPTER_TIMES: JSON.stringify(data.chapters.map((chapter) => chapter.at)),
});
await run(python, [resolve(here, "voiceover-site.py"), voice, resolve(outputDir, "voice.wav"), configPath, String(duration)], here, {
  ...process.env, PYTHONUTF8: "1", HF_HOME: process.env.WALKCAST_KOKORO_CACHE || resolve(here, "../../../.walkcast/kokoro-cache"),
});
await run(process.execPath, [resolve(here, "render.mjs"), resolve(workDir, "site-film.html"), resolve(outputDir, "silent.mp4"), "30", "0", String(duration), String(dimensions[0]), String(dimensions[1])], here, {
  ...process.env, PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "",
});
const musicMix = tone === "cinematic" ? 0.48 : tone === "playful" ? 0.4 : 0.34;
const fadeStart = Math.max(0, duration - 4);
const mix = `[1:a]aresample=48000,highpass=f=80,equalizer=f=3000:t=q:w=1.2:g=2.5,acompressor=threshold=0.1:ratio=3:attack=5:release=120:makeup=1.6,pan=stereo|c0=c0|c1=c0,asplit=2[vo][key];[0:a]aresample=48000,volume=${musicMix}[music];[music][key]sidechaincompress=threshold=0.02:ratio=10:attack=25:release=400[duck];[duck][vo]amix=inputs=2:weights='1 1.25':normalize=0,loudnorm=I=-14:TP=-1.2:LRA=11,aresample=48000,afade=t=out:st=${fadeStart}:d=4[a]`;
const finalVideo = resolve(outputDir, "Site-Launch-Film.mp4");
await run(ffmpeg, ["-y", "-i", resolve(outputDir, "score.wav"), "-i", resolve(outputDir, "voice.wav"), "-i", resolve(outputDir, "silent.mp4"), "-filter_complex", mix,
  "-map", "2:v:0", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-metadata", `title=${host} — Walkthrough Film`, "-movflags", "+faststart", "-t", String(duration), finalVideo]);
await run(ffmpeg, ["-y", "-ss", String(Math.min(duration - 1, Math.max(2, duration * 0.24))), "-i", finalVideo, "-frames:v", "1", "-update", "1", "-q:v", "2", resolve(outputDir, "Site-Launch-Film-poster.jpg")]);
console.log(JSON.stringify({ video: finalVideo, sourceCapture: capture, website: host, voice, tone, format, dimensions, duration, pageCount }));
