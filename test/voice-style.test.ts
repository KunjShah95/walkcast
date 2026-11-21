import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { forSpeech, parsePronunciations } from "../packages/core/src/record/speech-text.ts";
import { elevenLabsEngine, kokoroEngine, openaiTtsEngine } from "../packages/core/src/record/voice.ts";
import { STYLES, resolveStyle } from "../packages/core/src/record/voice-style.ts";

const saved = { ...process.env };
const realFetch = globalThis.fetch;
afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
  globalThis.fetch = realFetch;
});

test("a style is warm unless a real one is named", () => {
  assert.equal(resolveStyle(undefined, {}), "warm");
  assert.equal(resolveStyle("CALM", {}), "calm");
  assert.equal(resolveStyle("sarcastic", {}), "warm");
  assert.equal(resolveStyle(undefined, { WALKCAST_VOICE_STYLE: "upbeat" }), "upbeat");
  assert.equal(resolveStyle("calm", { WALKCAST_VOICE_STYLE: "upbeat" }), "calm");
});

test("every style says how to deliver the lines on each engine that can be steered", () => {
  for (const s of Object.values(STYLES)) {
    assert.ok(s.pace >= 0.8 && s.pace <= 1.2, "pace stays inside what Kokoro accepts");
    assert.ok(s.instructions.length > 40);
    assert.ok(s.elevenlabs.stability > 0 && s.elevenlabs.stability < 1);
  }
});

test("a personal pronunciation changes what is spoken, whole-word, never what is shown", () => {
  const rules = parsePronunciations("Kunj = koonj; Estate360 = estate three sixty\nWalkcast=walk cast");
  assert.equal(forSpeech("Kunj opened Estate360 in Walkcast.", rules), "koonj opened estate three sixty in walk cast.");
  assert.equal(forSpeech("Kunjan is someone else.", rules), "Kunjan is someone else.");
  assert.deepEqual(parsePronunciations("nonsense; = nothing; word="), []);
});

test("a pronunciation is applied before a name is mistaken for a hostname", () => {
  const rules = parsePronunciations("acme.app = acme");
  assert.equal(forSpeech("Opening acme.app.", rules), "Opening acme.");
});

test("Kokoro takes its voice and pace from the style unless the person chose them", () => {
  const calm = kokoroEngine(undefined, "calm");
  if (!calm) return; // not installed on this machine
  assert.match(calm.id, /af_heart,af_nicole/);
  assert.ok((calm.wordsPerSecond ?? 0) < 2.9);
  assert.match(kokoroEngine("bf_emma", "calm")!.id, /bf_emma/);
});

test("ElevenLabs is steered by the style and told the lines around each one", async () => {
  process.env.ELEVENLABS_API_KEY = "k";
  const bodies: Record<string, unknown>[] = [];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response("nope", { status: 500 });
  }) as typeof fetch;
  const engine = elevenLabsEngine(undefined, "upbeat")!;
  const dir = mkdtempSync(join(tmpdir(), "style-"));
  try {
    await assert.rejects(
      engine.speakMany!([{ text: "First.", file: join(dir, "a.wav") }, { text: "Second.", file: join(dir, "b.wav") }], dir),
    );
    assert.deepEqual(bodies[0]!.voice_settings, STYLES.upbeat.elevenlabs);
    assert.equal(bodies[0]!.next_text, "Second.");
    assert.equal(bodies[0]!.previous_text, undefined);
    assert.match(engine.fingerprint ?? "", /upbeat/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("OpenAI's gpt-4o voice gets delivery instructions; tts-1 is not sent a field it rejects", async () => {
  process.env.OPENAI_API_KEY = "k";
  const sent: Record<string, unknown>[] = [];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return new Response("nope", { status: 500 });
  }) as typeof fetch;
  const dir = mkdtempSync(join(tmpdir(), "style-"));
  try {
    process.env.OPENAI_TTS_MODEL = "gpt-4o-mini-tts";
    await assert.rejects(openaiTtsEngine(undefined, "calm")!.speak("Hi.", join(dir, "a.wav"), dir));
    assert.equal(sent[0]!.instructions, STYLES.calm.instructions);
    process.env.OPENAI_TTS_MODEL = "tts-1";
    await assert.rejects(openaiTtsEngine(undefined, "calm")!.speak("Hi.", join(dir, "b.wav"), dir));
    assert.equal("instructions" in sent[1]!, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a voice sample is cloned once and the clone is reused until the sample changes", async () => {
  const { cloneSample } = await import("../packages/core/src/record/voice.ts");
  const { writeFileSync } = await import("node:fs");
  const dir = mkdtempSync(join(tmpdir(), "clone-"));
  const sample = join(dir, "me.wav");
  writeFileSync(sample, "RIFFfake");
  let calls = 0;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    calls++;
    assert.ok(init?.body instanceof FormData);
    assert.equal((init!.headers as Record<string, string>)["xi-api-key"], "k");
    return new Response(JSON.stringify({ voice_id: `voice-${calls}` }), { status: 200 });
  }) as typeof fetch;
  try {
    assert.equal(await cloneSample(sample, "me.wav:8:1", "k"), "voice-1");
    assert.equal(await cloneSample(sample, "me.wav:8:1", "k"), "voice-1");
    assert.equal(calls, 1, "the same sample is not cloned twice");
    assert.equal(await cloneSample(sample, "me.wav:9:2", "k"), "voice-2");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a failed clone says why, so the recording can fall back to another voice", async () => {
  const { cloneSample } = await import("../packages/core/src/record/voice.ts");
  const { writeFileSync } = await import("node:fs");
  const dir = mkdtempSync(join(tmpdir(), "clone-"));
  const sample = join(dir, "me.wav");
  writeFileSync(sample, "RIFFfake");
  globalThis.fetch = (async () => new Response(JSON.stringify({ detail: { message: "Voice cloning needs a paid plan" } }), { status: 401 })) as typeof fetch;
  try {
    await assert.rejects(cloneSample(sample, "x", "k"), /paid plan/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Kokoro speaks product names it has no dictionary entry for, instead of losing the line", { timeout: 240_000 }, async () => {
  const { kokoroEngine, kokoroReady } = await import("../packages/core/src/record/voice.ts");
  const { wavSeconds } = await import("../packages/core/src/record/media.ts");
  if (!(await kokoroReady())) return; // Kokoro is optional; the guard is for machines that have it
  const dir = mkdtempSync(join(tmpdir(), "kokoro-oov-"));
  try {
    const lines = ["Opening agentic crm henna dot vercel dot app.", 'Scrolling through "Leads · Estate360 ×".', "Then xqzvt and qwrtz."];
    await kokoroEngine()!.speakMany!(lines.map((text, i) => ({ text, file: join(dir, `${i}.wav`) })), dir);
    for (const i of lines.keys()) assert.ok(wavSeconds(join(dir, `${i}.wav`)) > 0.5, `line ${i} has audio`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
