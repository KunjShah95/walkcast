import assert from "node:assert/strict";
import { test } from "node:test";
import { lookup, withCredentials } from "../src/llm/credentials.ts";
import { apiKey, provider } from "../src/llm/providers.ts";

test("credentials: overrides shadow process.env inside the scope only", async () => {
  const info = provider("openrouter");
  const prev = process.env.OPENROUTER_API_KEY;
  try {
    process.env.OPENROUTER_API_KEY = "server-key";
    assert.equal(apiKey(info), "server-key");
    await withCredentials({ OPENROUTER_API_KEY: "user-key" }, async () => {
      assert.equal(apiKey(info), "user-key");
      assert.equal(lookup("NOT_A_SET_VARIABLE"), undefined);
    });
    // The server key is untouched after the scope ends.
    assert.equal(apiKey(info), "server-key");
  } finally {
    if (prev === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = prev;
  }
});

test("credentials: a value the owner did not connect falls through to the environment", async () => {
  const prev = process.env.OPENROUTER_API_KEY;
  try {
    process.env.OPENROUTER_API_KEY = "server-key";
    await withCredentials({ CHATGPT_ACCESS_TOKEN: "user-cgpt" }, async () => {
      assert.equal(lookup("CHATGPT_ACCESS_TOKEN"), "user-cgpt");
      assert.equal(lookup("OPENROUTER_API_KEY"), "server-key");
    });
  } finally {
    if (prev === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = prev;
  }
});
