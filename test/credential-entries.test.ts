import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { CREDENTIAL_ALIASES, CREDENTIAL_KEYS, credentialSet, serveDashboard, validateRun } from "../apps/desktop/server/server.ts";
import { PROVIDERS } from "../packages/core/src/llm/providers.ts";

/**
 * The keys a person enters, and the names the providers read them under.
 *
 * A provider reads one name for its key; people paste it under another. The Settings panel and
 * the provider then disagreed: the row said "not set" for a key that worked, or the provider was
 * listed as unconfigured while the recording spoke with it. The panel also could not enter a key
 * for the Vercel AI Gateway at all, even though the provider list and the doctor both knew it.
 */

const roots: string[] = [];
const mkroot = (): string => {
  const r = mkdtempSync(join(tmpdir(), "walkcast-creds-"));
  roots.push(r);
  return r;
};
after(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

/** Run `fn` with the given environment variables set, restoring them afterwards. */
function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const saved = new Map(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("a key the provider reads under another name still shows as set", () => {
  withEnv({ GOOGLE_CLOUD_API_KEY: "a-key", GOOGLE_TTS_API_KEY: undefined }, () => {
    assert.equal(credentialSet("GOOGLE_TTS_API_KEY"), true, "Google's key is set under the name Google also reads");
  });
  withEnv({ GOOGLE_CLOUD_API_KEY: undefined, GOOGLE_TTS_API_KEY: undefined }, () => {
    assert.equal(credentialSet("GOOGLE_TTS_API_KEY"), false);
  });
  withEnv({ ULCA_API_KEY: "a-key", BHASHINI_API_KEY: undefined }, () => {
    assert.equal(credentialSet("BHASHINI_API_KEY"), true);
  });
  withEnv({ AZURE_SPEECH_KEY: "a-key", AZURE_SPEECH_REGION: "eastus" }, () => {
    assert.equal(credentialSet("AZURE_TTS_KEY"), true);
    assert.equal(credentialSet("AZURE_TTS_REGION"), true);
  });
  withEnv({ HUGGINGFACE_HUB_TOKEN: "a-key" }, () => {
    assert.equal(credentialSet("HF_TOKEN"), true);
  });
});

test("every model provider has a key the person can enter", () => {
  // The Settings list and the provider list are two places that have to agree. When they drifted,
  // the Vercel AI Gateway appeared in the provider list and in the doctor's checks, and had no
  // field to type a key into.
  const enterable = new Set(CREDENTIAL_KEYS.map((k) => k.env));
  // A name a provider reads is enterable if it is a field of its own, or an alias of one.
  const reachable = (env: string): boolean => {
    if (enterable.has(env)) return true;
    return Object.entries(CREDENTIAL_ALIASES).some(([canonical, names]) => enterable.has(canonical) && names.includes(env));
  };
  for (const provider of Object.values(PROVIDERS)) {
    for (const env of provider.apiKeyEnv) {
      if (provider.keyOptional) continue;
      // The ChatGPT token is issued by "Sign in with ChatGPT", not typed by a person.
      if (env === "CHATGPT_ACCESS_TOKEN") continue;
      assert.ok(reachable(env), `${provider.label} reads ${env}, which nobody can enter in Settings`);
    }
  }
});

test("a replay can be asked for the recorded calls instead of a live model", () => {
  const root = mkroot();
  mkdirSync(join(root, "fixtures", "f1"), { recursive: true });
  writeFileSync(join(root, "fixtures", "f1", "manifest.json"), "{}");
  const base = { op: "replay", fixture: "fixtures/f1", agent: "v1", trials: 3 };
  // Without this, the choice was made for the person: a browser agent whose fixture held no
  // recorded calls was pushed into a live run, which needs a key and costs money.
  assert.equal(validateRun({ ...base, modelMode: "scripted" }, false, root).modelMode, "scripted");
  assert.equal(validateRun({ ...base, modelMode: "replay" }, false, root).modelMode, "replay");
  assert.equal(validateRun({ ...base, modelMode: "live" }, true, root).modelMode, "live");
  // A live model still needs the server to allow it.
  assert.throws(() => validateRun({ ...base, modelMode: "live" }, false, root), /Live model runs are disabled/);
  assert.throws(() => validateRun({ ...base, modelMode: "nonsense" }, true, root), /Unknown model mode/);
  // And a fixture that isn't there is still refused.
  assert.throws(() => validateRun({ ...base, fixture: "fixtures/nope" }, false, root), /doesn't exist/);
});

test("saving a key writes it under every name the provider reads", async () => {
  const root = mkroot();
  const srv = await serveDashboard(6400 + Math.floor(Math.random() * 300), { root, unref: true, requireAuth: false });
  const names = ["GOOGLE_TTS_API_KEY", "GOOGLE_CLOUD_API_KEY", "AZURE_TTS_KEY", "AZURE_SPEECH_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "BHASHINI_API_KEY", "ULCA_API_KEY"];
  const saved = new Map(names.map((n) => [n, process.env[n]]));
  try {
    const post = await fetch(`${srv.url}/api/credentials`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ env: "GOOGLE_TTS_API_KEY", value: "a-key" }) });
    assert.equal(post.status, 200, await post.clone().text());
    assert.equal(process.env.GOOGLE_TTS_API_KEY, "a-key");
    assert.equal(process.env.GOOGLE_CLOUD_API_KEY, "a-key", "the name the provider also reads got the key too");
    // The panel reports it as set.
    const listed = (await (await fetch(`${srv.url}/api/credentials`)).json()) as { keys: { env: string; set: boolean }[] };
    assert.equal(listed.keys.find((k) => k.env === "GOOGLE_TTS_API_KEY")?.set, true);

    // The two Anthropic names are two ways to authenticate, and a request carrying both is
    // rejected: setting one clears the other.
    process.env.ANTHROPIC_AUTH_TOKEN = "a-bearer-token";
    await fetch(`${srv.url}/api/credentials`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ env: "ANTHROPIC_API_KEY", value: "sk-ant" }) });
    assert.equal(process.env.ANTHROPIC_API_KEY, "sk-ant");
    assert.equal(process.env.ANTHROPIC_AUTH_TOKEN, undefined, "only one Anthropic way to authenticate at a time");

    // Clearing takes every name with it.
    await fetch(`${srv.url}/api/credentials?env=GOOGLE_TTS_API_KEY`, { method: "DELETE" });
    assert.equal(process.env.GOOGLE_TTS_API_KEY, undefined);
    assert.equal(process.env.GOOGLE_CLOUD_API_KEY, undefined, "the alias was cleared too");
  } finally {
    for (const [n, v] of saved) {
      if (v === undefined) delete process.env[n];
      else process.env[n] = v;
    }
    await srv.close?.();
  }
});

test("the Anthropic key in scope is the one the request uses", async () => {
  const { ClaudeBackend } = await import("../packages/core/src/llm/claude.ts");
  const { withCredentials } = await import("../packages/core/src/llm/credentials.ts");
  const backend = new ClaudeBackend();
  const client = () => (backend as unknown as { anthropic: { apiKey: string | null; authToken: string | null } }).anthropic;
  // The SDK reads ANTHROPIC_API_KEY from the environment once, when it is constructed. A key
  // saved afterwards, or a key connected to one person's account, was invisible to it.
  withEnv({ ANTHROPIC_API_KEY: undefined, ANTHROPIC_AUTH_TOKEN: undefined }, () => {
    assert.equal(client().apiKey, null, "no key yet");
    process.env.ANTHROPIC_API_KEY = "sk-saved-later";
    assert.equal(client().apiKey, "sk-saved-later", "a key saved after the backend was built is used");
  });
  // A key connected to one person's account answers inside that job only.
  await withCredentials({ ANTHROPIC_API_KEY: "sk-scoped" }, async () => {
    assert.equal(client().apiKey, "sk-scoped");
    assert.equal(client().authToken, null, "only one way to authenticate");
  });
  // A bearer token is used when there is no API key.
  withEnv({ ANTHROPIC_API_KEY: undefined, ANTHROPIC_AUTH_TOKEN: "a-bearer-token" }, () => {
    assert.equal(client().apiKey, null);
    assert.equal(client().authToken, "a-bearer-token");
  });
});
