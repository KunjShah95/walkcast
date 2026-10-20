import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanCredential } from "../apps/desktop/server/server.ts";
import { defaultSelection } from "../packages/core/src/llm/model-spec.ts";
import { PROVIDERS } from "../packages/core/src/llm/providers.ts";
import { awsPollyEngine, configuredCloudProviders } from "../packages/core/src/record/voice.ts";

/** Run `fn` with exactly these provider keys in the environment, restoring it afterwards. */
function withEnv(vars: Record<string, string>, fn: () => void): void {
  const names = new Set([...Object.values(PROVIDERS).flatMap((p) => p.apiKeyEnv), "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", "LAB_AGENT_MODEL", "LAB_STAGEHAND_MODEL", ...Object.keys(vars)]);
  const saved = new Map([...names].map((n) => [n, process.env[n]]));
  for (const n of names) delete process.env[n];
  Object.assign(process.env, vars);
  try {
    fn();
  } finally {
    for (const [n, v] of saved) if (v === undefined) delete process.env[n];
    else process.env[n] = v;
  }
}

test("a pasted key loses the quotes, Bearer prefix and newline it was copied with", () => {
  assert.equal(cleanCredential("  sk-abc\n"), "sk-abc");
  assert.equal(cleanCredential('"sk-abc"'), "sk-abc");
  assert.equal(cleanCredential("'sk-abc'"), "sk-abc");
  assert.equal(cleanCredential("Bearer sk-abc"), "sk-abc");
  assert.equal(cleanCredential('"Bearer sk-abc"\r\n'), "sk-abc");
  // Only a matching pair is stripped; a quote inside a key is part of it.
  assert.equal(cleanCredential('ab"cd'), 'ab"cd');
  assert.equal(cleanCredential(""), "");
});

test("AWS Polly counts as configured only with both halves of the key pair", () => {
  withEnv({}, () => {
    assert.equal(awsPollyEngine(), null);
    assert.ok(!configuredCloudProviders().includes("awspolly"));
  });
  withEnv({ AWS_ACCESS_KEY_ID: "AKIAEXAMPLE" }, () => {
    assert.equal(awsPollyEngine(), null, "an access key id alone can't sign a request");
    assert.ok(!configuredCloudProviders().includes("awspolly"));
  });
  withEnv({ AWS_ACCESS_KEY_ID: "AKIAEXAMPLE", AWS_SECRET_ACCESS_KEY: "secret" }, () => {
    assert.ok(awsPollyEngine());
    assert.ok(configuredCloudProviders().includes("awspolly"));
  });
});

test("live runs default to a provider someone holds a key for", () => {
  withEnv({}, () => assert.match(defaultSelection().agent, /^anthropic:/, "no key at all: Claude, so the error names its key"));
  withEnv({ OPENROUTER_API_KEY: "k" }, () => assert.equal(defaultSelection().agent, `openrouter:${PROVIDERS.openrouter!.exampleModel}`));
  withEnv({ OPENROUTER_API_KEY: "k", GROQ_API_KEY: "k" }, () => {
    const chain = defaultSelection().agent.split(",");
    assert.deepEqual(chain.map((s) => s.split(":")[0]).sort(), ["groq", "openrouter"]);
  });
  withEnv({ ANTHROPIC_API_KEY: "k", OPENAI_API_KEY: "k" }, () => assert.match(defaultSelection().agent, /^anthropic:/));
  withEnv({ OPENAI_API_KEY: "k", LAB_AGENT_MODEL: "openai:gpt-5-mini" }, () => {
    assert.equal(defaultSelection().agent, "openai:gpt-5-mini", "an explicit choice wins");
    assert.equal(defaultSelection().stagehand, "openai:gpt-5-mini");
  });
});
