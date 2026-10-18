import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { chooseSttProvider, groupWords, transcribe } from "../packages/core/src/record/stt.ts";

const dir = mkdtempSync(join(tmpdir(), "stt-"));
const wav = join(dir, "a.wav");
writeFileSync(wav, Buffer.alloc(64));
const saved = { ...process.env };
after(() => { process.env = saved; rmSync(dir, { recursive: true, force: true }); });

const clear = () => { for (const k of ["SARVAM_API_KEY", "OPENAI_API_KEY", "GROQ_API_KEY", "ELEVENLABS_API_KEY", "LAB_STT_BASE_URL", "LAB_STT_PROVIDER", "LAB_STT_MODEL"]) delete process.env[k]; };

test("provider choice: explicit, env, first configured, clear errors", () => {
  clear();
  assert.throws(() => chooseSttProvider(), /No speech-to-text provider/);
  process.env.GROQ_API_KEY = "g";
  assert.equal(chooseSttProvider(), "groq");
  process.env.SARVAM_API_KEY = "s";
  assert.equal(chooseSttProvider(), "sarvam", "first configured in order");
  assert.equal(chooseSttProvider("groq"), "groq");
  assert.throws(() => chooseSttProvider("openai"), /not configured/);
  assert.throws(() => chooseSttProvider("nope"), /Unknown STT provider/);
});

test("OpenAI-compatible: verbose_json segments become timed cues", async () => {
  clear();
  process.env.OPENAI_API_KEY = "k";
  let seen: { url: string; form: FormData; auth: string } | null = null;
  const fetch = (async (url: string, init: RequestInit) => {
    seen = { url, form: init.body as FormData, auth: (init.headers as Record<string, string>).Authorization! };
    return Response.json({ text: "Hello there. Welcome.", segments: [{ start: 0, end: 1.2, text: " Hello there." }, { start: 1.2, end: 2.5, text: " Welcome." }] });
  }) as unknown as typeof globalThis.fetch;
  const t = await transcribe(wav, { language: "en-IN", fetch });
  assert.equal(seen!.url, "https://api.openai.com/v1/audio/transcriptions");
  assert.equal(seen!.auth, "Bearer k");
  assert.equal(seen!.form.get("response_format"), "verbose_json");
  assert.equal(seen!.form.get("language"), "en");
  assert.deepEqual(t.segments, [{ start: 0, end: 1.2, text: "Hello there." }, { start: 1.2, end: 2.5, text: "Welcome." }]);
});

test("ElevenLabs word timestamps are grouped into sentences", () => {
  const words = "Open the leads page. Then click save".split(" ").map((text, i) => ({ text, start: i, end: i + 0.9 }));
  assert.deepEqual(groupWords(words), [
    { start: 0, end: 3.9, text: "Open the leads page." },
    { start: 4, end: 6.9, text: "Then click save" },
  ]);
});
