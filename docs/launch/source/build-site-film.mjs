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
const duration = 20;
if (!existsSync(capture) || !existsSync(configPath)) throw new Error("A website recording and its launch-film details are required.");
const site = JSON.parse(await (await import("node:fs/promises")).readFile(configPath, "utf8"));
const host = String(site.host || new URL(site.url).hostname);
const title = String(site.title || host).replace(/[\r\n]+/g, " ").slice(0, 100);
const pages = (site.pages || []).map((page) => ({
  title: String(page.title || "Product details").replace(/[\r\n]+/g, " ").trim().slice(0, 56),
  url: String(page.url || site.url),
})).filter((page) => page.title);
const pageCount = pages.length;
while (pages.length < 3) pages.push(pages.at(-1) || { title: host, url: site.url });
const shortLabel = (value) => {
  const first = value.split(/\s[|—–:]\s/)[0]?.trim() || value;
  return first.length <= 38 ? first : `${first.slice(0, 35).replace(/\s+\S*$/, "")}…`;
};
const tone = ["polished", "cinematic", "playful"].includes(site.tone) ? site.tone : "polished";
const format = ["landscape", "vertical", "square"].includes(site.format) ? site.format : "landscape";
const dimensions = { landscape: [1920, 1080], vertical: [1080, 1920], square: [1080, 1080] }[format];
const data = { host, title: shortLabel(title), pages: pages.slice(0, 3).map((page) => ({ ...page, title: shortLabel(page.title) })), pageCount, tone, format, duration };
data.captureDuration = Math.max(15, Number(site.durationMs || 20_000) / 1000);
data.clipStarts = [0.1, 0.26, 0.45].map((ratio) => Math.min(data.captureDuration - 5.25, data.captureDuration * ratio));

mkdirSync(outputDir, { recursive: true });
mkdirSync(workDir, { recursive: true });
for (const name of ["a", "b", "c"]) mkdirSync(resolve(workDir, "fresh-frames", name), { recursive: true });
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

// These proof frames provide a poster fallback; the final composition also plays the source clip.
for (const [name, ratio] of [["a", 0.1], ["b", 0.26], ["c", 0.45]]) {
  const seconds = Math.max(0.1, Math.min(Number(site.durationMs || 20_000) / 1000 - 0.5, Number(site.durationMs || 20_000) / 1000 * ratio));
  await run(ffmpeg, ["-v", "error", "-y", "-ss", seconds.toFixed(2), "-i", capture, "-frames:v", "1", "-q:v", "2", resolve(workDir, "fresh-frames", name, "001.jpg")]);
}

const html = (await (await import("node:fs/promises")).readFile(resolve(here, "site-film.html"), "utf8"))
  .replaceAll("__SITE_DATA__", JSON.stringify(data).replaceAll("<", "\\u003c"));
writeFileSync(resolve(workDir, "site-film.html"), html);
await run(python, [resolve(here, "music-brag.py"), resolve(outputDir, "score.wav"), tone], here, {
  ...process.env, PYTHONUTF8: "1",
});
await run(python, [resolve(here, "voiceover-site.py"), voice, resolve(outputDir, "voice.wav"), captions, configPath], here, {
  ...process.env, PYTHONUTF8: "1", HF_HOME: process.env.WALKCAST_KOKORO_CACHE || resolve(here, "../../../.walkcast/kokoro-cache"),
});
await run(process.execPath, [resolve(here, "render.mjs"), resolve(workDir, "site-film.html"), resolve(outputDir, "silent.mp4"), "30", "0", String(duration), String(dimensions[0]), String(dimensions[1])], here, {
  ...process.env, PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "",
});
const musicMix = tone === "cinematic" ? 0.48 : tone === "playful" ? 0.4 : 0.34;
const mix = `[1:a]aresample=48000,highpass=f=80,equalizer=f=3000:t=q:w=1.2:g=2.5,acompressor=threshold=0.1:ratio=3:attack=5:release=120:makeup=1.6,pan=stereo|c0=c0|c1=c0,asplit=2[vo][key];[0:a]aresample=48000,volume=${musicMix}[music];[music][key]sidechaincompress=threshold=0.02:ratio=10:attack=25:release=400[duck];[duck][vo]amix=inputs=2:weights='1 1.25':normalize=0,loudnorm=I=-14:TP=-1.2:LRA=11,aresample=48000,afade=t=out:st=17:d=3[a]`;
const finalVideo = resolve(outputDir, "Site-Launch-Film.mp4");
await run(ffmpeg, ["-y", "-i", resolve(outputDir, "score.wav"), "-i", resolve(outputDir, "voice.wav"), "-i", resolve(outputDir, "silent.mp4"), "-i", captions, "-filter_complex", mix,
  "-map", "2:v:0", "-map", "[a]", "-map", "3:s:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-c:s", "mov_text", "-metadata:s:s:0", "language=eng", "-metadata", `title=${host} — Brag Product Film`, "-movflags", "+faststart", "-t", String(duration), finalVideo]);
await run(ffmpeg, ["-y", "-ss", "10", "-i", finalVideo, "-frames:v", "1", "-update", "1", "-q:v", "2", resolve(outputDir, "Site-Launch-Film-poster.jpg")]);

const safe = (text) => text.replace(/[\r\n]+/g, " ").replace(/[<>]/g, "").replaceAll("|", "\\|");
const pageList = [...new Set((site.pages || []).map((page) => safe(String(page.title || "").trim())).filter(Boolean))];
const sourceList = pageList.length ? pageList.map((page) => `- ${page}`).join("\n") : "- Page titles were unavailable; the film relies on real captured visuals.";
const storyboard = `# Brag storyboard — ${safe(title)}\n\n- **Creative direction:** ${tone}\n- **Format:** ${format} (${dimensions[0]} × ${dimensions[1]}, 30 fps)\n- **Duration:** ${duration} seconds\n- **Source:** fresh Walkcast capture of ${host} (${pageCount} recorded page${pageCount === 1 ? "" : "s"})\n- **Audio:** local Kokoro narration, original generated score, ducked/mastered mix, English captions\n\n## Story beats\n\n| Time | Beat | Source |\n| --- | --- | --- |\n| 0–3s | Hook: introduce ${safe(title)} with a confident motion reveal. | Site identity from this recording |\n| 3–8s | First look: let the actual site establish its own visual character. | Capture excerpt at 10% |\n| 8–13s | Explore: move into a second real moment from the visit. | Capture excerpt at 26% |\n| 13–17s | Detail: reveal another real moment and hold for reading. | Capture excerpt at 45% |\n| 17–20s | Outro: close on the product name and ${host}. | Site identity from this recording |\n\n## Recorded page titles\n\n${sourceList}\n\n## Craft rules\n\n- Keep the opening readable, then let the actual website footage carry the story.\n- Use layered depth, smooth camera easing, and brief motion accents; avoid flashing text.\n- Do not invent product claims. All website footage comes from this recording.\n- Narration stays short and does not repeat on-screen page copy.\n`;
writeFileSync(resolve(outputDir, "brag-plan.md"), storyboard, "utf8");
const shareCopy = `A short ${tone} look at ${title}, captured from a real visit to ${host}.`;
writeFileSync(resolve(outputDir, "share-copy.txt"), `${shareCopy}\n`, "utf8");
console.log(JSON.stringify({ video: finalVideo, captions, storyboard: resolve(outputDir, "brag-plan.md"), shareCopy: resolve(outputDir, "share-copy.txt"), sourceCapture: capture, website: host, voice, tone, format, dimensions, duration }));
