import assert from "node:assert/strict";
// Keep the browser cold per test so the node process (and Chromium) can exit cleanly.
process.env.LAB_WARM_BROWSER = "0";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { startApp } from "../packages/core/src/app/server.ts";
import { SEED_LEADS } from "../packages/core/src/lab/task.ts";
import { canNarrate } from "../packages/core/src/record/media.ts";
import { toWebVtt } from "../packages/core/src/record/narration.ts";
import { recordSite } from "../packages/core/src/record/site.ts";

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

// Alone this takes about 90 s; the full suite runs browser and ffmpeg files side by side, and the
// old 180 s ceiling was what failed there, not the recorder.
test("signs in, browses same-origin pages, narrates, and never writes the password", { timeout: 420_000 }, async (t) => {
  // The offline voice is opt-in (recordings are silent without a voice key); this test wants it.
  process.env.LAB_ROBOT_VOICE = "1";
  t.after(() => delete process.env.LAB_ROBOT_VOICE);
  const r = await recordSite({ url: app.url, username: "demo", password: "demo-pass", maxPages: 3, authorized: true, outDir: out, paceMs: 50 });
  // This test has failed once in a full parallel suite run and never alone. Under load the walk,
  // the voice or the encode can fall short, so a failure says which one instead of only "3 !== 2".
  const what = JSON.stringify({ signIn: r.signIn, pages: r.pages.map((p) => p.url), skipped: r.skipped, stopped: r.stopped, media: r.media });
  assert.equal(r.signIn.outcome, "signed-in", what);
  assert.equal(r.pages.length, 3, what);
  assert.ok(r.pages.every((p) => p.url.startsWith(app.url)));
  assert.ok(r.captions.some((c) => /password\. It is hidden/.test(c.text)));
  assert.ok(r.captions.every((c) => !c.text.includes("demo-pass")));
  assert.ok(existsSync(join(r.dir, "captions.vtt")));
  assert.ok(existsSync(join(r.dir, "video.webm")));
  if (canNarrate()) {
    assert.equal(r.media.mp4, "recording.mp4", what);
    assert.equal(r.media.voice, "flite", what);
  }
  // One caption on screen at a time, spoken or silent.
  for (let i = 1; i < r.captions.length; i++) assert.ok(r.captions[i]!.start >= r.captions[i - 1]!.end - 0.01, `caption ${i} overlaps the one before`);
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

test("the dashboard's local voice choice resolves to this machine's voice, never a missing one", async () => {
  const { engineFor } = await import("../packages/core/src/record/voice.ts");
  const { localVoice } = await import("../packages/core/src/record/media.ts");
  // "flite" is the dashboard default; it must fall through to localVoice (Windows speech on Windows).
  assert.equal(engineFor("flite", "slt"), null);
  assert.equal(engineFor("", "slt"), null);
  const local = localVoice("slt");
  if (local) assert.match(local.id, /^(flite|windows):/);
});

test("choosing a cloud voice picks that provider's voice, not the flite names", async () => {
  const { engineFor } = await import("../packages/core/src/record/voice.ts");
  process.env.ELEVENLABS_API_KEY = "test-key";
  process.env.OPENAI_API_KEY = "test-key";
  try {
    const eleven = engineFor("elevenlabs", "slt", "JBFqnCBsd6RMkjVDRZzb");
    assert.equal(eleven?.kind, "cloud");
    assert.equal(eleven?.id, "elevenlabs:JBFqnCBsd6RMkjVDRZzb");
    const openai = engineFor("openai", "slt", "onyx");
    assert.equal(openai?.id, "openai:onyx");
    // No key, no engine: the recorder falls back rather than speaking with the wrong voice.
    delete process.env.ELEVENLABS_API_KEY;
    assert.equal(engineFor("elevenlabs", "slt", "onyx"), null);
  } finally {
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.OPENAI_API_KEY;
  }
});

test("a voice id the provider doesn't have falls back to that provider's default", async () => {
  const { resolveVoice, voicesFor, defaultVoiceFor, hasVoiceList, isCloudProvider } = await import("../packages/core/src/record/voices.ts");
  // A curated provider only ever sends an id it publishes.
  assert.equal(resolveVoice("openai", "onyx"), "onyx");
  assert.equal(resolveVoice("openai", "not-a-voice"), defaultVoiceFor("openai"));
  assert.equal(resolveVoice("openai", ""), defaultVoiceFor("openai"));
  // Providers whose ids aren't a public list (Murf, a custom endpoint) take what you type.
  assert.equal(hasVoiceList("murf"), false);
  assert.equal(resolveVoice("murf", "en-IN-isha"), "en-IN-isha");
  assert.ok(voicesFor("elevenlabs").length > 0);
  // "polly" and "maya" are aliases of providers in the list.
  assert.deepEqual(voicesFor("polly").map((v) => v.id), voicesFor("awspolly").map((v) => v.id));
  assert.equal(isCloudProvider("flite"), false);
  assert.equal(isCloudProvider("custom-voice"), false);
  assert.equal(isCloudProvider("azure"), true);
});

test("the voice a person picks decides the language, not the deployment default", async () => {
  const { languageFor, defaultVoiceFor, needsLanguageInput } = await import("../packages/core/src/record/voices.ts");
  const env = { LAB_TTS_LANGUAGE: "en-IN" } as NodeJS.ProcessEnv;
  // A neural voice id carries its locale, and Google/Azure reject a mismatched languageCode.
  assert.equal(languageFor("azure", "en-US-JennyNeural", env), "en-US");
  assert.equal(languageFor("google", "hi-IN-Neural2-A", env), "hi-IN");
  // Polly ids carry none, so the catalog maps the voice to the only language it may be used with.
  assert.equal(languageFor("awspolly", "Joanna", env), "en-US");
  assert.equal(languageFor("awspolly", "Kajal", env), "en-IN");
  // A provider that infers language from the text is never sent one.
  assert.equal(languageFor("elevenlabs", "EXAVITQu4vr4xnSDxMaL", env), "");
  assert.equal(languageFor("openai", "onyx", env), "");
  // Free-text ids fall back to the deployment's language, then the provider's own default.
  assert.equal(languageFor("sarvam", "anushka", env), "en-IN");
  assert.equal(languageFor("bhashini", "some-model", env), "en-IN");
  assert.equal(languageFor("bhashini", "some-model", {} as NodeJS.ProcessEnv), "hi");
  assert.equal(needsLanguageInput("sarvam"), true);
  assert.equal(needsLanguageInput("azure"), false);
  // With a language set, the default voice speaks it rather than being the list's first entry.
  assert.equal(defaultVoiceFor("azure", env), "en-IN-NeerjaNeural");
  assert.equal(defaultVoiceFor("azure", {} as NodeJS.ProcessEnv), "en-US-JennyNeural");
  // Both Aditi and Kajal are en-IN; the first matching voice wins.
  assert.equal(defaultVoiceFor("awspolly", { LAB_TTS_LANGUAGE: "hi-IN" } as NodeJS.ProcessEnv), "Aditi");
});

test("an explicit language from the picker is honoured, a junk one ignored", async () => {
  const { resolveLanguage } = await import("../packages/core/src/record/voices.ts");
  // Sarvam's free-text voice ids need one; a valid tag wins over the env default.
  assert.equal(resolveLanguage("sarvam", "hi", "anushka"), "hi");
  assert.equal(resolveLanguage("sarvam", "hi-IN", "anushka"), "hi-IN");
  // Anything that isn't a language tag falls back rather than reaching the provider.
  assert.equal(resolveLanguage("sarvam", "not a tag", "anushka"), "en-IN");
  assert.equal(resolveLanguage("sarvam", "", "anushka"), "en-IN");
});

test("a length cap stops the walk at the next page boundary, and the narration says why", { timeout: 180_000 }, async () => {
  // Paced slowly so ten pages cannot fit in the budget: the cap has to be what stops the walk.
  const r = await recordSite({ url: app.url, username: "demo", password: "demo-pass", maxPages: 10, maxSeconds: 15, authorized: true, outDir: out, paceMs: 1500 });
  assert.equal(r.stopped?.reason, "time");
  assert.equal(r.stopped?.limitSeconds, 15);
  assert.ok((r.pages.length as number) < 10, `stopped after ${r.pages.length} pages, wanted fewer than 10`);
  assert.ok(r.captions.some((c) => /limit/i.test(c.text)), "the narration explains the length");
});

test("without a cap the walk ends on the page count", { timeout: 180_000 }, async () => {
  const r = await recordSite({ url: app.url, maxPages: 2, authorized: true, outDir: out, paceMs: 50 });
  assert.equal(r.stopped?.limitSeconds, undefined);
  assert.ok((r.pages.length as number) <= 2, `visited ${r.pages.length} pages, wanted at most 2`);
});

test("a length cap is clamped to something a recording can actually say", async () => {
  const { formatLength } = await import("../packages/core/src/record/site.ts");
  // Spoken as words, because it goes into the narration: "2 minutes", not "120s".
  assert.equal(formatLength(120), "2 minutes");
  assert.equal(formatLength(60), "1 minute");
  assert.equal(formatLength(45), "45 seconds");
  assert.equal(formatLength(300), "5 minutes");
});

test("a voice name and its credential travel with the provider", async () => {
  const { credentialFor, providerLabel, defaultVoiceFor } = await import("../packages/core/src/record/voices.ts");
  // Used in the refusal message when a chosen provider can't be reached: "no ELEVENLABS_API_KEY".
  assert.equal(credentialFor("elevenlabs"), "ELEVENLABS_API_KEY");
  assert.equal(credentialFor("polly"), "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY");
  assert.equal(providerLabel("openai"), "OpenAI");
  assert.equal(providerLabel("nonsense"), "nonsense");
  assert.equal(defaultVoiceFor("openai", {} as NodeJS.ProcessEnv), "alloy");
});
