import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { LabData } from "../src/ui/data.ts";

const roots: string[] = [];
const mkroot = () => {
  const r = mkdtempSync(join(tmpdir(), "walkcast-sep-"));
  roots.push(r);
  return r;
};
after(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

/**
 * Regression: on Windows, `dir` fields were built with the OS separator. The dashboard builds
 * `/files/${dir}/${file}` and encodes each `/`-segment, so `recordings\<id>` became a single
 * segment containing %5C, the server's `/`-only regex never matched, and a completed recording
 * showed three 404s for files that existed. Every dir that reaches the browser must use forward
 * slashes on every platform.
 */
function recording(root: string, name: string) {
  const dir = join(root, "recordings", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "recording.json"), JSON.stringify({ id: name, dir: `recordings/${name}`, url: "https://x", createdAt: Date.now() }));
  writeFileSync(join(dir, "recording.mp4"), "not-really-a-video");
  return name;
}

test("recording dirs use forward slashes whatever the OS separator is", () => {
  const root = mkroot();
  const name = recording(root, "example-com-abc123");
  const listed = new LabData(root).recordings();
  assert.equal(listed.length, 1);
  assert.equal(listed[0]!.dir, `recordings/${name}`);
  assert.doesNotMatch(listed[0]!.dir, /\\/, "a backslash here becomes %5C in the URL and 404s");
});

test("the URL the dashboard builds from a dir round-trips through the server's parser", () => {
  const root = mkroot();
  const name = recording(root, "example-com-def456");
  const dir = new LabData(root).recordings()[0]!.dir;

  // dashboard/src/lib/api.ts encodes per "/"-segment.
  const path = `/files/${`${dir}/recording.mp4`.split("/").map(encodeURIComponent).join("/")}`;
  assert.equal(path, `/files/recordings/${name}/recording.mp4`);
  assert.doesNotMatch(path, /%5C/i);

  // server.ts parses it back to the id and file.
  const parsed = /^recordings[\\/]([^\\/]+)[\\/]([^\\/]+)$/.exec(path.slice("/files/".length));
  assert.ok(parsed, "the server must match a normal forward-slash path");
  assert.equal(parsed[1], name);
  assert.equal(parsed[2], "recording.mp4");
});

test("the server still accepts a backslash-separated path from an older recording", () => {
  const parsed = /^recordings[\\/]([^\\/]+)[\\/]([^\\/]+)$/.exec(`recordings\\old-id\\recording.mp4`);
  assert.ok(parsed, "paths recorded before the normalisation must keep working");
  assert.equal(parsed[1], "old-id");
  assert.equal(parsed[2], "recording.mp4");
});

test("run and fixture dirs are forward-slashed too", () => {
  const root = mkroot();
  const runDir = join(root, "runs", "run-1");
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "result.json"), JSON.stringify({ runId: "run-1", agent: "sh-p0", diagnosis: { verdict: "pass", findings: [] }, steps: 1, createdAt: Date.now() }));
  const fixtureDir = join(root, "fixtures", "f1");
  mkdirSync(fixtureDir, { recursive: true });
  writeFileSync(join(fixtureDir, "manifest.json"), JSON.stringify({ fault: "none", source: "fixtures" }));

  const index = new LabData(root).index(50);
  assert.equal(index.runs[0]!.dir, "runs/run-1");
  assert.equal(index.fixtures[0]!.dir, "fixtures/f1");
  for (const d of [index.runs[0]!.dir, index.fixtures[0]!.dir]) assert.doesNotMatch(d, /\\/);
});