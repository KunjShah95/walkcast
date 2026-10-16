import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Stages what the desktop installer ships next to the Tauri binary:
 *
 *   src-tauri/sidecar/     the server's TypeScript sources in their repo layout, the built dashboard,
 *                          and production node_modules (run through tsx, so nothing is bundled and
 *                          every path the code resolves from its own location still holds)
 *   src-tauri/binaries/    this Node binary, named with the Rust target triple as Tauri expects
 *
 * Run by `tauri build` (beforeBuildCommand) after the dashboard is built.
 */

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const TAURI = join(REPO, "apps", "desktop", "src-tauri");
const OUT = join(TAURI, "sidecar");
const BIN = join(TAURI, "binaries");

/** Sources the server reaches, kept at their repo paths. */
const SOURCES = ["packages/core/src", "packages/brand/src", "apps/desktop/server", "apps/desktop/sidecar.ts", "supabase/migrations"];
const DASHBOARD = "apps/desktop/dashboard/dist/index.html";
/** Packages read by path rather than imported (the self-hosted fonts), plus the TypeScript loader. */
const ALWAYS = ["@fontsource-variable/schibsted-grotesk", "@fontsource-variable/jetbrains-mono", "tsx"];

if (!existsSync(join(REPO, DASHBOARD))) throw new Error(`${DASHBOARD} is missing: run npm run ui:build first`);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const rel of [...SOURCES, DASHBOARD]) {
  const from = join(REPO, rel);
  const to = join(OUT, rel);
  mkdirSync(dirname(to), { recursive: true });
  if (statSync(from).isDirectory()) cpSync(from, to, { recursive: true });
  else copyFileSync(from, to);
}

// Runtime packages: every bare import in the staged sources, mapped to its package name.
const builtins = new Set(builtinModules);
const used = new Set<string>(ALWAYS);
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []));
for (const file of walk(OUT)) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"'.][^"']*)["']/g)) {
    const spec = m[1]!;
    if (spec.startsWith("node:") || builtins.has(spec)) continue;
    used.add(spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]!);
  }
}

const root = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
const dependencies: Record<string, string> = {};
for (const name of [...used].sort()) {
  const version = root.dependencies[name] ?? root.devDependencies[name];
  if (!version) throw new Error(`${name} is imported by the server but is not in package.json`);
  dependencies[name] = version;
}
writeFileSync(join(OUT, "package.json"), JSON.stringify({ name: "walkcast-sidecar", private: true, type: "module", dependencies }, null, 2));
// The root lockfile pins every transitive version; npm drops what this smaller manifest doesn't need.
copyFileSync(join(REPO, "package-lock.json"), join(OUT, "package-lock.json"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
execFileSync(npm, ["install", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: OUT, stdio: "inherit", shell: process.platform === "win32" });

// The Node binary, named the way Tauri's externalBin expects: walkcast-node-<target triple>.
const triple = /host: (\S+)/.exec(execFileSync("rustc", ["-vV"], { encoding: "utf8" }))?.[1];
if (!triple) throw new Error("could not read the Rust host triple from `rustc -vV`");
mkdirSync(BIN, { recursive: true });
const node = join(BIN, `walkcast-node-${triple}${process.platform === "win32" ? ".exe" : ""}`);
copyFileSync(process.execPath, node);

console.log(`Staged ${Object.keys(dependencies).length} packages into ${relative(REPO, OUT)}: ${Object.keys(dependencies).join(", ")}`);
console.log(`Node ${process.version} -> ${relative(REPO, node)}`);
