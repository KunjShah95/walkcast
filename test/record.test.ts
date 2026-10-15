import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { startApp } from "../src/app/server.ts";
import { SEED_LEADS } from "../src/lab/task.ts";
import { hasFlite } from "../src/record/media.ts";
import { toWebVtt } from "../src/record/narration.ts";
import { recordSite } from "../src/record/site.ts";

let app: Awaited<ReturnType<typeof startApp>>;
const out = mkdtempSync(join(tmpdir(), "lab-rec-"));

before(async () => {
  app = await startApp({ fault: "none", seed: 1, task: "lookup-owner", seedLeads: SEED_LEADS });
});
after(async () => {
  await app.close();
  rmSync(out, { recursive: true, force: true });
});

function filesContain(dir: string, needle: string): string[] {
  return readdirSync(dir).filter((f) => readFileSync(join(dir, f)).includes(needle));
}

test("refuses to record without an authorization attestation", async () => {
  await assert.rejects(recordSite({ url: app.url, maxPages: 1, authorized: false, outDir: out }), /authorized/);
});

test("signs in, browses same-origin pages, narrates, and never writes the password", { timeout: 180_000 }, async () => {
  const r = await recordSite({ url: app.url, username: "demo", password: "demo-pass", maxPages: 3, authorized: true, outDir: out, paceMs: 50 });
  assert.equal(r.signIn.outcome, "signed-in");
  assert.equal(r.pages.length, 3);
  assert.ok(r.pages.every((p) => p.url.startsWith(app.url)));
  assert.ok(r.captions.some((c) => /password\. It is hidden/.test(c.text)));
  assert.ok(r.captions.every((c) => !c.text.includes("demo-pass")));
  assert.ok(existsSync(join(r.dir, "captions.vtt")));
  assert.ok(existsSync(join(r.dir, "video.webm")));
  if (hasFlite()) {
    assert.equal(r.media.mp4, "recording.mp4");
    assert.equal(r.media.voice, "flite");
    // Spoken lines never overlap.
    for (let i = 1; i < r.captions.length; i++) assert.ok(r.captions[i]!.start >= r.captions[i - 1]!.end - 0.01);
  }
  assert.deepEqual(filesContain(r.dir, "demo-pass"), []);
  assert.deepEqual(filesContain(r.dir, "postData"), [], "request bodies stay out of site recordings");
});

test("a wrong password is reported as rejected, with the site's own message", { timeout: 120_000 }, async () => {
  const r = await recordSite({ url: app.url, username: "demo", password: "not-the-password", maxPages: 1, authorized: true, outDir: out, paceMs: 50 });
  assert.equal(r.signIn.outcome, "rejected");
  assert.match(r.signIn.detail, /Invalid username or password/);
  assert.deepEqual(filesContain(r.dir, "not-the-password"), []);
});

test("an exposed server's recorder refuses local targets before opening a browser", async () => {
  await assert.rejects(recordSite({ url: app.url, maxPages: 1, authorized: true, outDir: out, blockPrivate: true }), /private or local/);
  await assert.rejects(recordSite({ url: "not a url", maxPages: 1, authorized: true, outDir: out }), /web address/);
});

test("WebVTT cue text from page titles can't break the file", () => {
  assert.equal(toWebVtt([{ start: 0, end: 1, text: "A --> B\n\n<b>&" }]), "WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.000\nA → B &lt;b&gt;&amp;\n");
});

test("WebVTT output", () => {
  assert.equal(toWebVtt([{ start: 1.5, end: 62.25, text: "Hello." }]), "WEBVTT\n\n1\n00:00:01.500 --> 00:01:02.250\nHello.\n");
});
