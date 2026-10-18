#!/usr/bin/env node
// Writes the Tauri updater feed (latest.json) from the signed release artifacts.
//
//   node apps/desktop/scripts/updater-manifest.mjs <artifactsDir> <tag> [--repo owner/name]
//
// The app polls releases/latest/download/latest.json (tauri.conf.json → plugins.updater). Each
// platform entry points at the installer the updater can apply in place, plus the minisign
// signature Tauri produced for it at build time (TAURI_SIGNING_PRIVATE_KEY):
//   windows-x86_64  NSIS *-setup.exe   darwin-aarch64  *.app.tar.gz   linux-x86_64  *.AppImage
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const PLATFORMS = {
  "windows-x86_64": (name) => /_x64-setup\.exe$/.test(name),
  "darwin-aarch64": (name) => /\.app\.tar\.gz$/.test(name),
  "linux-x86_64": (name) => /\.AppImage$/.test(name),
};

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

export function buildManifest(dir, tag, repo, notes) {
  const files = walk(dir);
  const platforms = {};
  const missing = [];
  for (const [platform, matches] of Object.entries(PLATFORMS)) {
    const file = files.find((f) => matches(basename(f)));
    const sig = file && files.find((f) => f === `${file}.sig`);
    if (!file || !sig) {
      missing.push(`${platform} (${file ? "no .sig next to " + basename(file) : "no installer"})`);
      continue;
    }
    platforms[platform] = {
      signature: readFileSync(sig, "utf8").trim(),
      url: `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(basename(file))}`,
    };
  }
  if (missing.length) throw new Error(`updater manifest incomplete: ${missing.join("; ")}`);
  return {
    version: tag.replace(/^v/, ""),
    notes,
    pub_date: new Date().toISOString(),
    platforms,
  };
}

if (process.argv[1] && basename(process.argv[1]) === "updater-manifest.mjs") {
  const [dir, tag] = process.argv.slice(2);
  const repoFlag = process.argv.indexOf("--repo");
  const repo = repoFlag > 0 ? process.argv[repoFlag + 1] : process.env.GITHUB_REPOSITORY;
  if (!dir || !tag || !repo) {
    console.error("usage: updater-manifest.mjs <artifactsDir> <tag> [--repo owner/name]");
    process.exit(2);
  }
  const manifest = buildManifest(dir, tag, repo, `Walkcast ${tag}. Full notes: https://github.com/${repo}/releases/tag/${tag}`);
  writeFileSync(join(dir, "latest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`latest.json: ${Object.keys(manifest.platforms).join(", ")} → ${manifest.version}`);
}
