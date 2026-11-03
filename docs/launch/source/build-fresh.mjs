import { mkdirSync, existsSync, cpSync, copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const launchDir = resolve(here, "..");
const workDir = resolve(process.env.WALKCAST_LAUNCH_WORK_DIR || here);
const outputDir = resolve(process.env.WALKCAST_LAUNCH_OUTPUT_DIR || resolve(here, "output-fresh"));
const captions = resolve(process.env.WALKCAST_LAUNCH_CAPTIONS_PATH || resolve(launchDir, "walkcast-launch-fresh.vtt"));
const capture = process.argv[2] || process.env.WALKCAST_DEMO_VIDEO;
const python = process.env.WALKCAST_KOKORO_PYTHON || "python";
const ffmpeg = process.env.LAB_FFMPEG || "ffmpeg";
const voice = process.env.KOKORO_VOICE || "af_heart";
if (!capture || !existsSync(resolve(capture))) {
  throw new Error("Pass a new Walkcast recorder file: node build-fresh.mjs <recording.mp4>");
}
mkdirSync(outputDir, { recursive: true });
const kokoroCache = process.env.WALKCAST_KOKORO_CACHE || resolve(here, "../../../.walkcast/kokoro-cache");
mkdirSync(kokoroCache, { recursive: true });
mkdirSync(workDir, { recursive: true });
if (workDir !== here) {
  copyFileSync(resolve(here, "video.html"), resolve(workDir, "video.html"));
  cpSync(resolve(here, "fonts"), resolve(workDir, "fonts"), { recursive: true, force: true });
  cpSync(resolve(here, "../../brand/svg"), resolve(workDir, "../../brand/svg"), { recursive: true, force: true });
}

function run(command, args, cwd = here, env = process.env) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { cwd, env, windowsHide: true, stdio: "inherit" });
    child.once("error", fail);
    child.once("exit", (code) => code === 0 ? done() : fail(new Error(`${command} exited ${code}`)));
  });
}

await run(process.execPath, [resolve(here, "prepare-fresh.mjs"), resolve(capture)], here, { ...process.env, WALKCAST_LAUNCH_WORK_DIR: workDir });
await run(python, [resolve(here, "music.py"), resolve(outputDir, "score.wav")]);
await run(python, [resolve(here, "voiceover-fresh.py"), voice, resolve(outputDir, "voice.wav"), captions], here, { ...process.env, PYTHONUTF8: "1", HF_HOME: kokoroCache });

const silent = resolve(outputDir, "silent.mp4");
const finalVideo = resolve(outputDir, "Walkcast-Launch-Fresh.mp4");
const poster = resolve(outputDir, "Walkcast-Launch-Fresh-poster.jpg");
await run(process.execPath, [resolve(here, "render.mjs"), resolve(workDir, "video.html"), silent, "30", "0", "88"]);

const mix = "[1:a]aresample=48000,highpass=f=80,equalizer=f=3000:t=q:w=1.2:g=2.5,acompressor=threshold=0.1:ratio=3:attack=5:release=120:makeup=1.6,pan=stereo|c0=c0|c1=c0,asplit=2[vo][key];[0:a]aresample=48000,volume=0.55[music];[music][key]sidechaincompress=threshold=0.02:ratio=10:attack=25:release=400[duck];[duck][vo]amix=inputs=2:weights='1 1.25':normalize=0,loudnorm=I=-14:TP=-1.2:LRA=11,aresample=48000,afade=t=out:st=86:d=2[a]";
await run(ffmpeg, ["-y", "-i", resolve(outputDir, "score.wav"), "-i", resolve(outputDir, "voice.wav"), "-i", silent,
  "-i", captions, "-filter_complex", mix,
  "-map", "2:v:0", "-map", "[a]", "-map", "3:s:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
  "-c:s", "mov_text", "-metadata:s:s:0", "language=eng", "-metadata", "title=Walkcast — Fresh Product Launch",
  "-movflags", "+faststart", "-t", "88", finalVideo]);
await run(ffmpeg, ["-y", "-ss", "26", "-i", finalVideo, "-frames:v", "1", "-q:v", "2", poster]);
console.log(JSON.stringify({ video: finalVideo, poster, captions, sourceCapture: resolve(capture), voice, duration: 88 }));
