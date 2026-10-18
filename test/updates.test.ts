import assert from "node:assert/strict";
import { test } from "node:test";
import { checkForUpdate, currentVersion, newerThan } from "../packages/core/src/ops/updates.ts";

test("version comparison is numeric, and a pre-release sorts before its release", () => {
  assert.equal(newerThan("0.3.1", "0.3.0"), true);
  assert.equal(newerThan("0.10.0", "0.9.9"), true, "numeric, not lexical");
  assert.equal(newerThan("v1.0.0", "0.99.0"), true);
  assert.equal(newerThan("0.3.0", "0.3.0"), false);
  assert.equal(newerThan("0.3.0", "0.3.1"), false);
  assert.equal(newerThan("0.3.0", "0.3.0-rc.1"), true);
  assert.equal(newerThan("0.3.0-rc.1", "0.3.0"), false);
});

test("release check reports an update, caches it, and turns failures into an error field", async () => {
  let calls = 0;
  const ok = (async () => {
    calls++;
    return Response.json({ tag_name: "v9.9.9", html_url: "https://github.com/x/releases/tag/v9.9.9", body: "notes", published_at: "2026-10-18T00:00:00Z" });
  }) as unknown as typeof fetch;
  const a = await checkForUpdate({ fetch: ok, current: "1.0.0", ttlMs: 60_000 });
  assert.deepEqual({ latest: a.latest, available: a.available, url: a.url, error: a.error }, { latest: "9.9.9", available: true, url: "https://github.com/x/releases/tag/v9.9.9", error: null });
  await checkForUpdate({ fetch: ok, current: "1.0.0", ttlMs: 60_000 });
  assert.equal(calls, 1, "second call served from the cache");

  const down = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
  const b = await checkForUpdate({ fetch: down, current: "2.0.0", ttlMs: 0 });
  assert.equal(b.available, false);
  assert.equal(b.error, "GitHub answered 503");
  assert.match(currentVersion(), /^\d+\.\d+\.\d+/);
});
