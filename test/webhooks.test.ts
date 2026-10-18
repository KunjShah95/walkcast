import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { FileStore } from "../packages/core/src/store/index.ts";
import { MAX_ATTEMPTS, backoffMs, processOutbox, webhookUrlProblem } from "../packages/core/src/webhooks.ts";

const dir = mkdtempSync(join(tmpdir(), "lab-webhooks-"));
after(() => rmSync(dir, { recursive: true, force: true }));

async function completedJob(s: FileStore) {
  await s.addWebhook(null, "https://hooks.example/x");
  await s.enqueue({ kind: "record", owner: null, input: { url: "https://site.example" } });
  const j = await s.claim("w", 60_000);
  await s.finish(j!.id, "w", { status: "succeeded", result: { dir: "recordings/r" } });
  return j!;
}

test("dispatcher signs the body, sends delivery headers, and marks the row done", async () => {
  const s = new FileStore(join(dir, "a.json"));
  try {
    const job = await completedJob(s);
    const seen: { url: string; init: RequestInit }[] = [];
    process.env.LAB_WEBHOOK_SECRET = "shh";
    const fetch = (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return new Response("ok", { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    assert.equal(await processOutbox(s, "d", { fetch }), 1);
    delete process.env.LAB_WEBHOOK_SECRET;
    const { url, init } = seen[0]!;
    const h = init.headers as Record<string, string>;
    const body = String(init.body);
    assert.equal(url, "https://hooks.example/x");
    assert.equal(init.redirect, "manual");
    assert.equal(h["X-Walkcast-Event"], "job.completed");
    assert.equal(h["X-Walkcast-Signature"], `sha256=${createHmac("sha256", "shh").update(`${h["X-Walkcast-Timestamp"]}.${body}`).digest("hex")}`);
    assert.equal(JSON.parse(body).job.id, job.id);
    assert.equal(JSON.parse(body).delivery, h["X-Walkcast-Delivery"]);
    assert.equal((await s.deliveries(null, 5))[0]?.status, "done");
    assert.equal(await processOutbox(s, "d", { fetch }), 0, "nothing left");
  } finally {
    await s.close();
  }
});

test("dispatcher retries with backoff, then gives up after MAX_ATTEMPTS", async () => {
  const s = new FileStore(join(dir, "b.json"));
  try {
    await completedJob(s);
    const fetch = (async () => new Response("no", { status: 503 })) as unknown as typeof globalThis.fetch;
    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      // Make the row due immediately instead of waiting out the backoff.
      (s as unknown as { data: { deliveries: { nextAt: string }[] } }).data.deliveries[0]!.nextAt = new Date(0).toISOString();
      assert.equal(await processOutbox(s, "d", { fetch }), 1);
    }
    const [d] = await s.deliveries(null, 1);
    assert.equal(d?.status, "failed");
    assert.equal(d?.attempts, MAX_ATTEMPTS);
    assert.equal(d?.lastError, "HTTP 503");
    assert.equal(backoffMs(1), 1000);
    assert.equal(backoffMs(20), 60_000);
  } finally {
    await s.close();
  }
});

test("webhook urls: http(s) only, no credentials, private targets refused when exposed", async () => {
  assert.equal(await webhookUrlProblem("ftp://x.example", false), "webhook url must be http(s)");
  assert.equal(await webhookUrlProblem("https://u:p@x.example", false), "webhook url must not contain credentials");
  assert.equal(await webhookUrlProblem("http://127.0.0.1:9/hook", false), null, "desktop may post to localhost");
  assert.match(String(await webhookUrlProblem("http://127.0.0.1:9/hook", true)), /private or local/);
  assert.match(String(await webhookUrlProblem("http://[::1]/hook", true)), /private or local/);
});
