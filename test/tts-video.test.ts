import assert from "node:assert/strict";
// Keep the browser cold per test so the node process (and Chromium) can exit cleanly.
process.env.LAB_WARM_BROWSER = "0";
import { execFileSync, spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { startApp } from "../packages/core/src/app/server.ts";
import { SEED_LEADS } from "../packages/core/src/lab/task.ts";
import { wavSeconds } from "../packages/core/src/record/media.ts";
import { recordSite } from "../packages/core/src/record/site.ts";
import { engineFor, isRiffWav, pcmToWav } from "../packages/core/src/record/voice.ts";

/**
 * Cloud narration and video recordings.
 *
 * Every provider answers in its own format: ElevenLabs and Polly in MP3, Google in headerless
 * PCM, a custom endpoint in whatever it likes, an uploaded voice sample in whatever the person
 * uploaded. The pipeline measures each clip and mixes it with ffmpeg, so a clip that is not a
 * WAV either measured as zero-length (every caption on top of t=0) or was rejected by the mix —
 * and a rejected mix means the recording ships silent, which is what "the cloud voice doesn't
 * work with video recordings" meant.
 */

const roots: string[] = [];
const mkroot = (): string => {
  const r = mkdtempSync(join(tmpdir(), "walkcast-tts-"));
  roots.push(r);
  return r;
};
after(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

/** ffmpeg is needed to make and to read audio; the tests that need it are skipped without it. */
function hasFfmpeg(): boolean {
  return spawnSync("ffmpeg", ["-version"], { encoding: "utf8", windowsHide: true }).status === 0;
}

/** A second of a tone, encoded as MP3 — the format a provider answers in. */
function makeMp3(dir: string, seconds = 1): Buffer {
  const file = join(dir, `tone-${Math.random().toString(36).slice(2)}.mp3`);
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`, file], { windowsHide: true });
  return readFileSync(file);
}

let provider: Server;
let providerUrl = "";
/** A cloud TTS provider that answers in MP3, the way several of them do. */
before(async () => {
  const dir = mkroot();
  const mp3 = makeMp3(dir);
  provider = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "audio/mpeg" });
    res.end(mp3);
  });
  await new Promise<void>((r) => provider.listen(0, "127.0.0.1", r));
  const address = provider.address();
  providerUrl = typeof address === "object" && address ? `http://127.0.0.1:${address.port}/tts` : "";
});
after(() => {
  provider?.close();
});

test("a provider that answers in MP3 still produces a clip the pipeline can measure", { skip: !hasFfmpeg() }, async () => {
  const dir = mkroot();
  process.env.LAB_TTS_ENDPOINT = providerUrl;
  try {
    const engine = engineFor("custom", "slt");
    assert.ok(engine, "the custom provider is configured");
    const file = join(dir, "clip.wav");
    await engine.speak("Opening the dashboard.", file, dir);
    assert.ok(isRiffWav(file), "the clip is a WAV whatever the provider answered with");
    const seconds = wavSeconds(file);
    assert.ok(seconds > 0.5 && seconds < 1.5, `the clip measures about a second, got ${seconds}`);
  } finally {
    delete process.env.LAB_TTS_ENDPOINT;
  }
});

test("headerless PCM (what Google answers) becomes a WAV with the right length", () => {
  // 22050 Hz, mono, 16-bit: one second of samples.
  const pcm = Buffer.alloc(22050 * 2);
  const wav = pcmToWav(pcm, 22050);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.toString("ascii", 8, 12), "WAVE");
  assert.equal(wav.readUInt32LE(24), 22050, "the sample rate is in the header");
  assert.equal(wav.readUInt16LE(22), 1, "one channel");
  assert.equal(wav.readUInt16LE(34), 16, "16-bit samples");
  const dir = mkroot();
  const file = join(dir, "pcm.wav");
  writeFileSync(file, wav);
  assert.equal(Math.round(wavSeconds(file)), 1, "a second of audio measures a second");
});

test("a file that is not a WAV measures as nothing instead of throwing", () => {
  const dir = mkroot();
  // The shape that used to take the whole narration down: an MP3 named .wav, and a truncated file.
  const mp3 = join(dir, "clip.wav");
  writeFileSync(mp3, Buffer.from([0xff, 0xfb, 0x90, 0x64, 0x00, 0x00, 0x01, 0x02]));
  assert.equal(wavSeconds(mp3), 0, "a non-WAV has no duration to read, and must not throw");
  const tiny = join(dir, "tiny.wav");
  writeFileSync(tiny, Buffer.from([1, 2, 3]));
  assert.equal(wavSeconds(tiny), 0, "a truncated file has no duration either");
  assert.equal(wavSeconds(join(dir, "missing.wav")), 0, "a file that isn't there has no duration");
});

test("a provider that answers with rubbish is reported, and the visit still ships", { skip: !hasFfmpeg(), timeout: 240_000 }, async (t) => {
  const app = await startApp({ fault: "none", seed: 1, task: "lookup-owner", seedLeads: SEED_LEADS });
  t.after(async () => {
    await app.close();
  });
  const dir = mkroot();
  // A provider that answers with bytes that are not audio at all: the pipeline has to notice and
  // report it rather than write a broken clip into the recording.
  const broken = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "audio/mpeg" });
    res.end(Buffer.from("this is not audio, it is a provider that answered with an error page"));
  });
  await new Promise<void>((r) => broken.listen(0, "127.0.0.1", r));
  const address = broken.address();
  t.after(() => broken.close());
  process.env.LAB_TTS_ENDPOINT = typeof address === "object" && address ? `http://127.0.0.1:${address.port}/tts` : "";
  t.after(() => delete process.env.LAB_TTS_ENDPOINT);
  const r = await recordSite({
    url: app.url,
    maxPages: 1,
    authorized: true,
    outDir: dir,
    paceMs: 50,
    ttsProvider: "custom",
  });
  // The recording still exists and still plays: the voice failed, the visit did not.
  assert.equal(r.media.mp4, "recording.mp4");
  assert.ok(existsSync(join(r.dir, "recording.mp4")));
  // The provider answered with rubbish, so it did not get to speak: the recording says why, and
  // the offline voice took over rather than the video going out with nothing on it.
  assert.match(r.media.note, /failed|Invalid data|instead/i, "the recording says why");
  assert.notEqual(r.narration?.spoke, "custom:default", "a provider that answered with rubbish did not speak");
  assert.equal(r.narration?.reachable, false, "and the recording says the provider was not reached");
});

test("a cloud voice narrates a real recording end to end", { skip: !hasFfmpeg(), timeout: 300_000 }, async (t) => {
  const app = await startApp({ fault: "none", seed: 1, task: "lookup-owner", seedLeads: SEED_LEADS });
  t.after(async () => {
    await app.close();
  });
  const dir = mkroot();
  process.env.LAB_TTS_ENDPOINT = providerUrl;
  t.after(() => delete process.env.LAB_TTS_ENDPOINT);
  const r = await recordSite({
    url: app.url,
    maxPages: 2,
    authorized: true,
    outDir: dir,
    paceMs: 50,
    ttsProvider: "custom",
  });
  assert.equal(r.media.voice, "flite", "the chosen voice spoke");
  assert.equal(r.media.mp4, "recording.mp4");
  assert.ok(statSync(join(r.dir, "recording.mp4")).size > 0);
  // The narration track is on disk and is not empty: the mix ran.
  assert.ok(existsSync(join(r.dir, "narration.wav")), "the narration track was written");
  assert.ok(wavSeconds(join(r.dir, "narration.wav")) > 0, "and it has audio in it");
  // The captions follow the speech: each line starts after the previous one ends.
  for (let i = 1; i < r.captions.length; i++) {
    assert.ok(r.captions[i]!.start >= r.captions[i - 1]!.end - 0.01, "the spoken lines do not overlap");
  }
  assert.equal(r.narration?.reachable, true);
});
