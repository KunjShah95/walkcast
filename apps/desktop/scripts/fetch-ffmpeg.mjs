// Fetch a static ffmpeg for the installer to ship. The installer ships ffmpeg because it encodes the
// MP4 and mixes the narration, and people rarely have ffmpeg on PATH. Without it the app records
// video and captions only.
//
// One pinned release covers Windows, macOS and Linux, which beats three vendor download URLs that can
// rot independently. The binaries are self-contained, so they run on a user's machine whatever is
// installed there. Each platform's LICENSE travels with its binary, as stage-sidecar.ts expects.
//
// Writes WALKCAST_FFMPEG to the environment (and to GITHUB_ENV, when running in CI).

import { appendFileSync, chmodSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Pinned so the shipped binary cannot change under a moving tag.
const RELEASE = "b6.0";
const BASE = `https://github.com/eugeneware/ffmpeg-static/releases/download/${RELEASE}`;

const PLATFORMS = {
  "win32-x64": "win32-x64",
  "darwin-x64": "darwin-x64",
  "darwin-arm64": "darwin-arm64",
  "linux-x64": "linux-x64",
};

const key = `${process.platform}-${process.arch}`;
const asset = PLATFORMS[key];
if (!asset) {
  throw new Error(`no bundled ffmpeg for ${key}; add it upstream at ${BASE.replace("/ffmpeg-", "/ffmpeg-")}`);
}

const root = join(tmpdir(), "walkcast-ffmpeg");
const binDir = join(root, "bin");
const exe = join(binDir, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");

async function download(url, dest) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

// stage-sidecar.ts looks for the license next to the binary's parent directory.
const license = join(root, "LICENSE");

rmSync(root, { recursive: true, force: true });
mkdirSync(binDir, { recursive: true });

await download(`${BASE}/ffmpeg-${asset}`, exe);
await download(`${BASE}/${asset}.LICENSE`, license);
if (process.platform !== "win32") chmodSync(exe, 0o755);

const mb = (statSync(exe).size / 1048576).toFixed(1);

// The installer muxes narration into H.264; a build without libx264 would ship a silent app.
const probe = spawnSync(exe, ["-hide_banner", "-encoders"], { encoding: "utf8" });
if (probe.status !== 0 || !probe.stdout.includes("libx264")) {
  throw new Error(`fetched ffmpeg for ${key} does not report libx264`);
}

console.log(`ffmpeg ${asset} (${mb} MB) -> ${exe}`);
console.log(`license -> ${license}`);

if (process.env.GITHUB_ENV) {
  appendFileSync(process.env.GITHUB_ENV, `WALKCAST_FFMPEG=${exe}\n`);
} else {
  console.log(`WALKCAST_FFMPEG=${exe}`);
}