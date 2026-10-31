import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import {
  cacheBytes,
  cachedClip,
  cacheLimitBytes,
  cacheRoot,
  clearCache,
  clipKey,
  pruneCache,
  storeClip,
} from "../packages/core/src/record/voice-cache.ts";

/**
 * Narration clips are cached by the voice and the words.
 *
 * The pipeline speaks one clip per caption line, and the same line comes back in the next
 * recording of the same site, in a retry, and in every test that walks the sample CRM. A hit has
 * to be the *same* clip (same voice, same words) and a miss has to be cheap and safe; a cache
 * that hands back another voice's audio would narrate the wrong thing with total confidence.
 */

const dirs: string[] = [];
const original = process.env.LAB_TTS_CACHE;
afterEach(() => {
  if (original === undefined) delete process.env.LAB_TTS_CACHE;
  else process.env.LAB_TTS_CACHE = original;
  delete process.env.LAB_TTS_CACHE_MB;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A cache directory of its own, so one test cannot see another's clips. */
function freshCache(): string {
  const dir = mkdtempSync(join(tmpdir(), "walkcast-cache-"));
  dirs.push(dir);
  process.env.LAB_TTS_CACHE = dir;
  return dir;
}

/**
 * A directory to speak into, kept outside the cache.
 *
 * A synthesized clip is written beside the recording, so the stand-ins for those clips have to
 * live somewhere else — counted from inside the cache they would look like cache entries, and
 * the size and eviction assertions would be measuring the fixtures.
 */
function freshSources(): string {
  const dir = mkdtempSync(join(tmpdir(), "walkcast-spoken-"));
  dirs.push(dir);
  return dir;
}

/** A stand-in for a synthesized clip. */
function clip(dir: string, name = "clip.wav", bytes = "RIFF....WAVEdata") {
  const file = join(dir, name);
  writeFileSync(file, bytes);
  return file;
}

test("a clip is identified by its voice and its words, and the two cannot bleed into each other", () => {
  assert.equal(clipKey({ id: "kokoro:af_heart" }, "Opening the dashboard."), clipKey({ id: "kokoro:af_heart" }, "Opening the dashboard."), "the same voice saying the same line is the same clip");
  assert.notEqual(clipKey({ id: "kokoro:af_heart" }, "Opening the dashboard."), clipKey({ id: "kokoro:af_heart" }, "Signing in."), "different words are different clips");
  assert.notEqual(clipKey({ id: "kokoro:af_heart" }, "Opening."), clipKey({ id: "kokoro:am_michael" }, "Opening."), "a different voice is a different clip");
  // The separator: "…:a" + "b" must not equal "…:ab" + "".
  assert.notEqual(clipKey({ id: "voice:a" }, "bc"), clipKey({ id: "voice:ab" }, "c"));
  // A fingerprint overrides the id, so an engine whose id does not pin its output can say so.
  assert.notEqual(
    clipKey({ id: "openai:alloy", fingerprint: "openai:alloy:gpt-4o-mini-tts" }, "Hello"),
    clipKey({ id: "openai:alloy", fingerprint: "openai:alloy:tts-1" }, "Hello"),
    "the model behind a voice is part of the clip",
  );
});

test("a clip is a miss before it is stored, a hit after, and a hit is the same bytes", () => {
  const cache = freshCache();
  const key = clipKey({ id: "flite:slt" }, "Page one of two.");
  assert.equal(cachedClip(key), null, "nothing is cached yet");
  const source = clip(freshSources(), "spoken.wav", "RIFF....WAVE-real-samples");
  storeClip(key, source);
  const hit = cachedClip(key);
  assert.ok(hit, "the clip is a hit once it has been stored");
  assert.equal(statSync(hit).size, statSync(source).size);
  assert.ok(hit.startsWith(cache), "the clip lives in the cache, not wherever it was spoken");
});

test("a half-written clip reads as a miss, so the line is said again instead of mixed as silence", () => {
  const cache = freshCache();
  const key = clipKey({ id: "flite:slt" }, "Truncated.");
  writeFileSync(join(cache, `${key}.wav`), "");
  assert.equal(cachedClip(key), null, "a zero-byte entry is not a clip");
});

test("a store that cannot write reports nothing and leaves no debris", () => {
  const cache = freshCache();
  const spoken = freshSources();
  // A source that is not there: the copy fails, and the cache must swallow it rather than take
  // the recording down for a cache it never needed.
  assert.doesNotThrow(() => storeClip(clipKey({ id: "flite:slt" }, "Missing source."), join(spoken, "not-there.wav")));
  assert.equal(readdirSync(cache).filter((f) => f.endsWith(".tmp")).length, 0, "no temp file is left behind");
  // A cache root that is a file, not a folder: same answer.
  const file = clip(spoken, "not-a-dir.bin");
  process.env.LAB_TTS_CACHE = file;
  assert.doesNotThrow(() => storeClip("abc", file));
});

test("LAB_TTS_CACHE=off turns the cache off in both directions", () => {
  const cache = freshCache();
  const spoken = freshSources();
  const key = clipKey({ id: "flite:slt" }, "Cached but switched off.");
  const source = clip(spoken, "spoken.wav");
  storeClip(key, source);
  assert.ok(existsSync(join(cache, `${key}.wav`)), "it was stored while the cache was on");
  process.env.LAB_TTS_CACHE = "off";
  assert.equal(cachedClip(key), null, "a clip already on disk is not handed back when the cache is off");
  storeClip(clipKey({ id: "flite:slt" }, "Not stored."), source);
  assert.deepEqual(readdirSync(cache).filter((f) => f.endsWith(".wav")), [`${key}.wav`], "and nothing new is written");
});

test("the oldest clips go first when the cache outgrows its limit", () => {
  const cache = freshCache();
  const spoken = freshSources();
  const keys: string[] = [];
  for (let i = 0; i < 5; i++) {
    const key = clipKey({ id: "flite:slt" }, `line ${i}`);
    storeClip(key, clip(spoken, `spoken-${i}.wav`, "x".repeat(1000)));
    const file = join(cache, `${key}.wav`);
    // Age them explicitly: filesystem timestamps are too coarse to order five writes in a row.
    const at = 1_700_000_000 + i * 60;
    utimesSync(file, at, at);
    keys.push(file);
  }
  const dropped = pruneCache(2500);
  assert.equal(dropped, 3, "three clips go to get 5000 bytes under 2500");
  assert.ok(!existsSync(keys[0]!) && !existsSync(keys[1]!) && !existsSync(keys[2]!), "the oldest three were dropped");
  assert.ok(existsSync(keys[3]!) && existsSync(keys[4]!), "the newest two stay");
  assert.ok(cacheBytes() <= 2500);
  assert.equal(pruneCache(2500), 0, "a cache under its limit is left alone");
});

test("clearing the cache leaves the folder empty but present", () => {
  const cache = freshCache();
  const spoken = freshSources();
  storeClip(clipKey({ id: "flite:slt" }, "One"), clip(spoken, "a.wav"));
  storeClip(clipKey({ id: "flite:slt" }, "Two"), clip(spoken, "b.wav"));
  clearCache();
  assert.deepEqual(readdirSync(cache).filter((f) => f.endsWith(".wav")), []);
  assert.equal(cacheBytes(), 0);
  mkdirSync(cache, { recursive: true });
  assert.doesNotThrow(() => clearCache(), "clearing a cache that is not there is not an error");
});

test("the limit is the documented default unless the operator says otherwise", () => {
  freshCache();
  assert.equal(cacheLimitBytes(), 512 * 1024 * 1024, "512 MB by default");
  process.env.LAB_TTS_CACHE_MB = "64";
  assert.equal(cacheLimitBytes(), 64 * 1024 * 1024);
  process.env.LAB_TTS_CACHE_MB = "not-a-number";
  assert.equal(cacheLimitBytes(), 512 * 1024 * 1024, "an unreadable value falls back to the default");
  delete process.env.LAB_TTS_CACHE;
  assert.match(cacheRoot(), /walkcast-tts-cache$/, "with nothing configured the cache lives in the temp dir");
});
