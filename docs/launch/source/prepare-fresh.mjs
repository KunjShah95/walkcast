import { mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workDir = process.env.WALKCAST_LAUNCH_WORK_DIR || here;
const input = process.argv[2] || process.env.WALKCAST_DEMO_VIDEO;
if (!input || !existsSync(resolve(input))) {
  throw new Error("Pass a fresh recorder MP4: node prepare-fresh.mjs <recording.mp4>");
}
const ffmpeg = process.env.LAB_FFMPEG || "ffmpeg";
const source = resolve(input);

function run(args) {
  return new Promise((done, fail) => {
    const child = spawn(ffmpeg, args, { windowsHide: true, stdio: "inherit" });
    child.once("error", fail);
    child.once("exit", (code) => code === 0 ? done() : fail(new Error(`ffmpeg exited ${code}`)));
  });
}

// Use three real moments from the new live-site recording: Home, Download, and Lab.
for (const [name, seconds] of [["a", 6], ["b", 38], ["c", 56]]) {
  const dir = resolve(workDir, "fresh-frames", name);
  mkdirSync(dir, { recursive: true });
  const filter = name === "a"
    // The homepage embeds a legacy third-party demo below the hero. Keep this launch cut
    // on Walkcast's own current UI and mask that unrelated embedded footage from the shot.
    ? "crop=1920:900:0:0,pad=1920:1080:0:0:white,fps=30"
    : "fps=30";
  await run(["-v", "error", "-y", "-ss", String(seconds), "-t", "4.2", "-i", source,
    "-vf", filter, "-q:v", "3", resolve(dir, "%03d.jpg")]);
}
console.log(`Prepared current Home, Download, and Lab frames from ${source}`);
