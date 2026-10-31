import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { speakLines, speechMsMany, wavSeconds } from "../packages/core/src/record/media.ts";
import { pcmToWav, type VoiceEngine } from "../packages/core/src/record/voice.ts";

/**
 * Narration is spoken once.
 *
 * A recording is a dozen lines, and every local voice pays a large fixed cost per call: Kokoro
 * builds a neural model, Windows speech starts PowerShell. On top of that, the same lines come
 * back the next time the same site is recorded. So the pipeline says each distinct line once, in
 * as few processes as the engine allows, and copies anything it has said before.
 */

const dirs: string[] = [];
const original = process.env.LAB_TTS_CACHE;
afterEach(() => {
  if (original === undefined) delete process.env.LAB_TTS_CACHE;
  else process.env.LAB_TTS_CACHE = original;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function fresh(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

/** A cache of this test's own, so one test cannot read another's clips. */
function ownCache(): void {
  process.env.LAB_TTS_CACHE = fresh("walkcast-cache-");
}

/** A WAV of `seconds` that is unique to `text`, so a copied clip is recognisably the right one. */
function wavFor(text: string, seconds = 0.25): Buffer {
  const samples = Math.round(22050 * seconds);
  const body = Buffer.alloc(samples * 2);
  // The words, written into the first samples: two clips of the same length stay distinguishable.
  body.write(text.slice(0, Math.max(1, samples - 1)), 0, "utf8");
  return pcmToWav(body, 22050);
}

interface Recorder {
  engine: VoiceEngine;
  batches: string[][];
  spoken: string[];
}

/** A local engine that records how it was asked to speak. */
function fakeEngine(id = "fake:voice", opts: { batch?: boolean; failBatch?: boolean; seconds?: number; fingerprint?: string } = {}): Recorder {
  const batches: string[][] = [];
  const spoken: string[] = [];
  const seconds = opts.seconds ?? 0.25;
  const write = (text: string, file: string) => {
    spoken.push(text);
    writeFileSync(file, wavFor(text, seconds));
  };
  const engine: VoiceEngine = {
    id,
    kind: "local",
    wordsPerSecond: 2.5,
    available: () => true,
    ...(opts.fingerprint ? { fingerprint: opts.fingerprint } : {}),
    async speak(text, file) {
      write(text, file);
    },
  };
  if (opts.batch !== false) {
    engine.speakMany = async (lines, _cwd, onLine) => {
      batches.push(lines.map((l) => l.text));
      if (opts.failBatch) {
        // Half the batch, the way a provider that drops a connection does.
        write(lines[0]!.text, lines[0]!.file);
        throw new Error("the voice connection dropped");
      }
      for (const [i, line] of lines.entries()) {
        write(line.text, line.file);
        onLine?.(i + 1, lines.length);
      }
    };
  }
  return { engine, batches, spoken };
}

test("a page's lines are spoken in one pass, not one process per line", async () => {
  ownCache();
  const dir = fresh("walkcast-say-");
  const { engine, batches, spoken } = fakeEngine();
  const texts = ["Opening the dashboard.", "Signing in.", "Adding a lead."];
  const clips = await speakLines(dir, texts, engine);
  assert.equal(batches.length, 1, "the engine was asked once, with the whole page");
  assert.deepEqual(batches[0], texts, "and in order");
  assert.deepEqual(spoken, texts, "every line was spoken exactly once");
  assert.equal(clips.length, 3);
  for (const [i, clip] of clips.entries()) {
    assert.ok(existsSync(clip.file), `line ${i} has a clip`);
    assert.ok(clip.seconds > 0, `line ${i} has a length`);
  }
});

test("a line this machine has already spoken is copied, not spoken again", async () => {
  ownCache();
  const first = fresh("walkcast-say-");
  const texts = ["Page one of two.", "Signing in."];
  const a = fakeEngine();
  await speakLines(first, texts, a.engine);
  assert.equal(a.spoken.length, 2, "the first recording spoke both lines");

  // The same words, the same voice: a different recording of the same site.
  const second = fresh("walkcast-say-");
  const b = fakeEngine();
  const clips = await speakLines(second, texts, b.engine);
  assert.equal(b.spoken.length, 0, "the second recording spoke nothing");
  assert.equal(b.batches.length, 0, "and did not start a voice process at all");
  for (const [i, text] of texts.entries()) {
    assert.deepEqual(readFileSync(clips[i]!.file), wavFor(text), `line ${i} is the clip that was already spoken`);
  }
});

test("the same words in another voice are spoken again", async () => {
  ownCache();
  const texts = ["Opening the dashboard."];
  await speakLines(fresh("walkcast-say-"), texts, fakeEngine("kokoro:af_heart").engine);

  const other = fakeEngine("kokoro:am_michael");
  await speakLines(fresh("walkcast-say-"), texts, other.engine);
  assert.deepEqual(other.spoken, texts, "a different voice is different audio, not a cache hit");

  // And a change nothing in the id names: an engine that pins its output with a fingerprint.
  const modelA = fakeEngine("openai:alloy", { fingerprint: "openai:alloy:gpt-4o-mini-tts" });
  await speakLines(fresh("walkcast-say-"), texts, modelA.engine);
  assert.equal(modelA.spoken.length, 1);
  const modelB = fakeEngine("openai:alloy", { fingerprint: "openai:alloy:tts-1" });
  await speakLines(fresh("walkcast-say-"), texts, modelB.engine);
  assert.equal(modelB.spoken.length, 1, "another model behind the same voice is not the same clip");
});

test("a batch that fails halfway falls back to one line at a time, and the recording still speaks", async () => {
  ownCache();
  const dir = fresh("walkcast-say-");
  const { engine, spoken } = fakeEngine("fake:voice", { failBatch: true });
  const texts = ["Opening the dashboard.", "Signing in.", "Adding a lead."];
  const clips = await speakLines(dir, texts, engine);
  // The first line's text was written by the failed batch, and then each line was retried on its
  // own: what matters is that every line has audio and none was lost to the batch error.
  for (const text of texts) assert.ok(spoken.includes(text), `"${text}" was spoken`);
  for (const [i, clip] of clips.entries()) {
    assert.ok(clip.seconds > 0, `line ${i} still has audio after the failed batch`);
    assert.deepEqual(readFileSync(clip.file), wavFor(texts[i]!), `line ${i} is the clip for its own line`);
  }
});

test("an engine with no batch hook is still spoken one line at a time", async () => {
  ownCache();
  const { engine, spoken } = fakeEngine("fake:voice", { batch: false });
  const clips = await speakLines(fresh("walkcast-say-"), ["One.", "Two."], engine);
  assert.deepEqual(spoken, ["One.", "Two."]);
  assert.equal(clips.length, 2);
});

test("measuring a page's lines speaks them once, and the mux reuses those clips", async () => {
  ownCache();
  const dir = fresh("walkcast-say-");
  const { engine, batches } = fakeEngine("fake:measure", { seconds: 0.5 });
  const texts = ["Opening the dashboard.", "Signing in.", "Adding a lead."];

  const total = await speechMsMany(texts, engine);
  assert.equal(batches.length, 1, "the whole page was measured in one voice process");
  // Each line is half a second: the walk holds the screen for the sum, not for one line.
  assert.ok(Math.abs(total - 1500) < 120, `three half-second lines measure about 1.5 s, got ${total}`);
  assert.equal(await speechMsMany(texts, engine), total, "measuring the same lines again is free");

  // The clips measured for pacing are the ones the narration will use: the mux speaks nothing.
  const before = batches.length;
  const clips = await speakLines(dir, texts, engine);
  assert.equal(batches.length, before, "the narration did not start a second voice process");
  for (const [i, clip] of clips.entries()) {
    assert.ok(wavSeconds(clip.file) > 0, `line ${i} has audio`);
    assert.ok(clip.seconds > 0);
  }
});

test("with the cache off, every line is spoken every time", async () => {
  ownCache();
  const texts = ["Opening the dashboard."];
  await speakLines(fresh("walkcast-say-"), texts, fakeEngine().engine);
  process.env.LAB_TTS_CACHE = "off";
  const again = fakeEngine();
  await speakLines(fresh("walkcast-say-"), texts, again.engine);
  assert.deepEqual(again.spoken, texts, "an off cache is a miss every time");
});
