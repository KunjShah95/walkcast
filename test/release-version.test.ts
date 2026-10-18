import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

// The release version is written by hand into five files, and .github/workflows/release.yml only
// cross-checks one of them (tauri.conf.json) against the git tag. A drift between the others
// ships a binary whose sidecar reports a different version — the in-app updater then compares the
// wrong "current" number, and the website's download links break. Nothing caught that here, so
// assert the whole set agrees.

const REPO = resolve(import.meta.dirname, "..");

const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");

/** The version each file declares, by the key it uses. */
const sources = {
  "package.json": () => JSON.parse(read("package.json")).version as string,
  "package-lock.json": () => JSON.parse(read("package-lock.json")).version as string,
  'package-lock.json packages[""]': () =>
    (JSON.parse(read("package-lock.json")).packages?.[""]?.version ?? "") as string,
  "apps/desktop/src-tauri/Cargo.toml": () =>
    /^version\s*=\s*"([^"]+)"/m.exec(read("apps/desktop/src-tauri/Cargo.toml"))?.[1] ?? "",
  "apps/desktop/src-tauri/Cargo.lock": () =>
    /name = "walkcast"\nversion = "([^"]+)"/.exec(read("apps/desktop/src-tauri/Cargo.lock"))?.[1] ?? "",
  "apps/desktop/src-tauri/tauri.conf.json": () =>
    JSON.parse(read("apps/desktop/src-tauri/tauri.conf.json")).version as string,
} satisfies Record<string, () => string>;

test("every file that records the release version records the same one", () => {
  const found = Object.entries(sources).map(([file, readVersion]) => [file, readVersion()] as const);

  for (const [file, version] of found) {
    assert.match(version, /^\d+\.\d+\.\d+/, `${file} declares no version`);
  }

  const versions = new Set(found.map(([, v]) => v));
  assert.equal(
    versions.size,
    1,
    `version drift: ${found.map(([f, v]) => `${f}=${v}`).join(", ")} — bump them together, then tag the lot`,
  );
});

test("the version is a plain release version, not a prerelease", () => {
  const version = sources["package.json"]();
  assert.doesNotMatch(
    version,
    /[-+]/,
    `${version} carries a prerelease/build suffix; the release workflow publishes draft: false, prerelease: false`,
  );
});