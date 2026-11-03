import { mkdirSync, existsSync, copyFileSync, cpSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workDir = resolve(process.env.WALKCAST_LAUNCH_WORK_DIR || here);
const outputDir = resolve(process.env.WALKCAST_LAUNCH_OUTPUT_DIR || resolve(here, "output-site"));
const captions = resolve(process.env.WALKCAST_LAUNCH_CAPTIONS_PATH || resolve(outputDir, "Site-Launch-Film.vtt"));
const configPath = resolve(process.env.WALKCAST_LAUNCH_SITE_CONFIG || "");
const capture = resolve(process.argv[2] || "");
const ffmpeg = process.env.LAB_FFMPEG || "ffmpeg";
const python = process.env.WALKCAST_KOKORO_PYTHON || "python";
const voice = process.env.KOKORO_VOICE || "af_heart";
if (!existsSync(capture) || !existsSync(configPath)) throw new Error("A website recording and its launch-film details are required.");
const site = JSON.parse(await (await import("node:fs/promises")).readFile(configPath, "utf8"));
const duration = Math.max(15, Number(site.durationMs || 0) / 1000);
const pageTitles = (site.pages || []).map((page) => String(page.title || "Product details").trim()).filter(Boolean);
while (pageTitles.length < 3) pageTitles.push(pageTitles.at(-1) || site.host);
const data = { host: String(site.host || new URL(site.url).hostname), title: String(site.title || site.host), pages: pageTitles.slice(0, 3) };

mkdirSync(outputDir, { recursive: true });
mkdirSync(workDir, { recursive: true });
mkdirSync(resolve(workDir, "fresh-frames", "a"), { recursive: true });
mkdirSync(resolve(workDir, "fresh-frames", "b"), { recursive: true });
mkdirSync(resolve(workDir, "fresh-frames", "c"), { recursive: true });
if (workDir !== here) {
  copyFileSync(resolve(here, "site-film.html"), resolve(workDir, "site-film.html"));
  cpSync(resolve(here, "fonts"), resolve(workDir, "fonts"), { recursive: true, force: true });
}

function run(command, args, cwd = here, env = process.env) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { cwd, env, windowsHide: true, stdio: "inherit" });
    child.once("error", fail);
    child.once("exit", (code) => code === 0 ? done() : fail(new Error(`${command} exited ${code}`)));
  });
}
// Three evenly spaced frames keep the film tied to the actual recorded website, even if the
// walkthrough is shorter, longer, or has a completely different page structure.
for (const [name, ratio] of [["a", 0.16], ["b", 0.48], ["c", 0.78]]) {
  const seconds = Math.max(0.1, Math.min(duration - 0.5, duration * ratio));
  await run(ffmpeg, ["-v", "error", "-y", "-ss", seconds.toFixed(2), "-i", capture, "-frames:v", "1", "-q:v", "2", resolve(workDir, "fresh-frames", name, "001.jpg")]);
}

const html = (await (await import("node:fs/promises")).readFile(resolve(here, "site-film.html"), "utf8"))
  .replaceAll("__SITE_DATA__", JSON.stringify(data).replaceAll("<", "\\u003c"));
writeFileSync(resolve(workDir, "site-film.html"), html);
await run(process.execPath, [resolve(here, "music.py"), resolve(outputDir, "score.wav")]);
await run(python, [resolve(here, "voiceover-site.py"), voice, resolve(outputDir, "voice.wav"), captions, configPath], here, {
  ...process.env, PYTHONUTF8: "1", HF_HOME: process.env.WALKCAST_KOKORO_CACHE || resolve(here, "../../../.walkcast/kokoro-cache"),
});
await run(process.execPath, [resolve(here, "render.mjs"), resolve(workDir, "site-film.html"), resolve(outputDir, "silent.mp4"), "30", "0", "42"], here, {
  ...process.env, PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "",
});
const mix = "[1:a]aresample=48000,highpass=f=80,equalizer=f=3000:t=q:w=1.2:g=2.5,acompressor=threshold=0.1:ratio=3:attack=5:release=120:makeup=1.6,pan=stereo|c0=c0|c1=c0[vo];[0:a]aresample=48000,volume=0.55[music];[music][vo]sidechaincompress=threshold=0.02:ratio=10:attack=25:release=400[duck];[duck][vo]amix=inputs=2:weights='1 1.25':normalize=0,loudnorm=I=-14:TP=-1.2:LRA=11,aresample=48000,afade=t=out:st=39:d=2[a]";
const finalVideo = resolve(outputDir, "Site-Launch-Film.mp4");
await run(ffmpeg, ["-y", "-i", resolve(outputDir, "score.wav"), "-i", resolve(outputDir, "voice.wav"), "-i", resolve(outputDir, "silent.mp4"), "-i", captions, "-filter_complex", mix,
  "-map", "2:v:0", "-map", "[a]", "-map", "3:s:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-c:s", "mov_text", "-metadata:s:s:0", "language=eng", "-metadata", `title=${data.host} — Website Launch Film`, "-movflags", "+faststart", "-t", "42", finalVideo]);
await run(ffmpeg, ["-y", "-ss", "21", "-i", finalVideo, "-frames:v", "1", "-q:v", "2", resolve(outputDir, "Site-Launch-Film-poster.jpg")]);
console.log(JSON.stringify({ video: finalVideo, captions, sourceCapture: capture, website: data.host, voice, duration: 42 }));
