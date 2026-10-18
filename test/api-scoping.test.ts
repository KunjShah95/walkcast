import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { serveDashboard } from "../apps/desktop/server/server.ts";
import { FileStore } from "../packages/core/src/store/index.ts";

process.env.LAB_LOG = "off";

/**
 * Webhooks and schedules are per account (they used to be one global list that every user could
 * read and that heard every user's jobs), and model-backed agents carry their own daily ceiling.
 */
const root = mkdtempSync(join(tmpdir(), "lab-scope-"));
// A pre-store schedules.json is imported once into the store (owner: local) and renamed.
writeFileSync(join(root, "schedules.json"), JSON.stringify([{ url: "https://legacy.example", interval: "2h", authorized: false }]));
let srv: Awaited<ReturnType<typeof serveDashboard>>;
let store: FileStore;
before(async () => {
  process.env.LAB_LLM_RUNS_PER_DAY = "0";
  store = new FileStore(join(root, ".lab", "store.json"));
  srv = await serveDashboard(5100 + Math.floor(Math.random() * 200), { root, unref: true, store, worker: false });
});
after(async () => {
  delete process.env.LAB_LLM_RUNS_PER_DAY;
  await srv.close?.();
  rmSync(root, { recursive: true, force: true });
});

async function account(email: string) {
  const r = await fetch(`${srv.url}/auth/signup`, { method: "POST", body: JSON.stringify({ email, password: "a-good-password" }) });
  return r.headers.get("set-cookie")!.split(";")[0]!;
}
const call = (cookie: string, path: string, init: RequestInit = {}) =>
  fetch(`${srv.url}${path}`, { ...init, headers: { cookie, ...(init.headers as Record<string, string> | undefined) } });

test("webhooks and schedules are owner-scoped", async () => {
  const a = await account("a@example.com");
  const b = await account("b@example.com");
  assert.equal((await call(a, "/api/webhooks", { method: "POST", body: JSON.stringify({ url: "https://hooks.example/a" }) })).status, 201);
  assert.equal((await call(a, "/api/webhooks", { method: "POST", body: JSON.stringify({ url: "ftp://nope" }) })).status, 400);
  assert.deepEqual(((await (await call(b, "/api/webhooks")).json()) as { webhooks: string[] }).webhooks, [], "b sees none of a's webhooks");
  assert.equal((await call(b, `/api/webhooks/${encodeURIComponent("https://hooks.example/a")}`, { method: "DELETE" })).status, 404, "b can't delete a's webhook");
  assert.deepEqual(((await (await call(a, "/api/webhooks")).json()) as { webhooks: string[] }).webhooks, ["https://hooks.example/a"]);

  const created = (await (await call(a, "/api/schedules", { method: "POST", body: JSON.stringify({ url: "https://site.example", interval: "1h", authorized: true }) })).json()) as { schedule: { id: string } };
  assert.ok(created.schedule.id);
  assert.deepEqual(((await (await call(b, "/api/schedules")).json()) as { schedules: unknown[] }).schedules, []);
  assert.equal((await call(b, `/api/schedules/${created.schedule.id}`, { method: "DELETE" })).status, 404);
  assert.equal((await call(a, `/api/schedules/${created.schedule.id}`, { method: "DELETE" })).status, 200);

  const legacy = await store.schedules(null);
  assert.deepEqual(legacy.map((x) => x.url), ["https://legacy.example/"], "legacy file imported for the local owner");
});

test("model-backed agents have their own daily ceiling; replays are free", async () => {
  const c = await account("c@example.com");
  const live = await call(c, "/api/run", { method: "POST", body: JSON.stringify({ agent: "sh-p0", fault: "none", modelMode: "live" }) });
  assert.equal(live.status, 429);
  assert.match(((await live.json()) as { error: string }).error, /agent sh-p0/);
  const replay = await call(c, "/api/run", { method: "POST", body: JSON.stringify({ agent: "sh-p0", fault: "none", modelMode: "replay" }) });
  assert.equal(replay.status, 202, "replay has no model cost");

  const usage = (await (await call(c, "/api/agents/usage")).json()) as { agents: { agent: string; total: number; active: number; exposure: string; dailyLimit: number | null }[] };
  const sh = usage.agents.find((u) => u.agent === "sh-p0");
  assert.equal(sh?.total, 1);
  assert.equal(sh?.active, 1);
  assert.equal(sh?.exposure, "lab");
  assert.equal(sh?.dailyLimit, 0);
  assert.equal((await call(c, "/api/agents/usage?windowMs=-1")).status, 400);
});

test("first-run sample site: a demo job records a sample CRM the worker starts itself", { timeout: 180_000 }, async () => {
  const { Worker } = await import("../packages/core/src/jobs/worker.ts");
  const { LocalMedia } = await import("../packages/core/src/media/store.ts");
  const c = await account("d@example.com");
  const r = await call(c, "/api/record", { method: "POST", body: JSON.stringify({ demo: true, maxPages: 2 }) });
  assert.equal(r.status, 202, await r.clone().text());
  const { job } = (await r.json()) as { job: { id: string } };
  assert.equal((await store.job(job.id))?.input.url, "sample:minicrm");
  const worker = new Worker({ store, media: new LocalMedia(join(root, "recordings")), root, pollMs: 100 }).start();
  try {
    let j = await store.job(job.id);
    for (let i = 0; i < 300 && (j?.status === "queued" || j?.status === "running"); i++) {
      await new Promise((res) => setTimeout(res, 300));
      j = await store.job(job.id);
    }
    assert.equal(j?.status, "succeeded", j?.error ?? "");
    const rec = await store.recording(String(j!.result!.id));
    assert.match(rec!.url, /^http:\/\/127\.0\.0\.1:\d+\//);
    assert.equal((rec!.summary.signIn as { outcome?: string } | undefined)?.outcome, "signed-in", JSON.stringify(rec!.summary.signIn));
  } finally {
    await worker.stop(1000);
  }
});

test("sign-in wall: nothing of the app is served before sign-in, and there is no way around it", async () => {
  const app = await fetch(`${srv.url}/app`, { redirect: "manual" });
  assert.equal(app.status, 302);
  assert.equal(app.headers.get("location"), `/login?next=${encodeURIComponent("/app")}`);
  assert.equal((await fetch(`${srv.url}/api/index`)).status, 401);
  const login = await (await fetch(`${srv.url}/login`)).text();
  assert.ok(!login.includes("without an account"), "no skip link when sign-in is required");
  const cookie = await account("wall@example.com");
  const signedIn = await call(cookie, "/app", { redirect: "manual" });
  assert.equal(signedIn.status, 200);
  assert.match(await signedIn.text(), /<html/i);
});
