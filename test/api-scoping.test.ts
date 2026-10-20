import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
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

test("the sample site records with the voice that was picked, and the length that was asked for", async () => {
  // The demo path used to drop the provider, so a test recording always came back in the
  // built-in voice no matter what the picker said.
  const c = await account("demo-voice@example.com");
  const r = await call(c, "/api/record", {
    method: "POST",
    body: JSON.stringify({ demo: true, maxPages: 2, ttsProvider: "openai", ttsVoice: "onyx", maxSeconds: 45 }),
  });
  assert.equal(r.status, 202, await r.clone().text());
  const { job } = (await r.json()) as { job: { id: string } };
  const input = (await store.job(job.id))?.input as { ttsProvider?: string; ttsVoice?: string; maxSeconds?: number };
  assert.equal(input.ttsProvider, "openai");
  assert.equal(input.ttsVoice, "onyx");
  assert.equal(input.maxSeconds, 45);
  // Only the input matters here: don't leave a real recording queued ahead of the next test's job.
  assert.equal((await call(c, `/api/jobs/${job.id}/cancel`, { method: "POST" })).status, 200);
});

test("a cloud provider this server has no key for is refused, not silently swapped for the built-in voice", async () => {
  // Its own server, because the refusal only applies where this process holds the worker (the
  // desktop app): a separate worker machine may hold a key this web server can't see.
  const solo = mkdtempSync(join(tmpdir(), "lab-tts-"));
  const own = await serveDashboard(5400 + Math.floor(Math.random() * 200), { root: solo, unref: true, store: new FileStore(join(solo, ".lab", "store.json")), worker: true });
  try {
    const signup = await fetch(`${own.url}/auth/signup`, { method: "POST", body: JSON.stringify({ email: "no-key@example.com", password: "a-good-password" }) });
    const cookie = signup.headers.get("set-cookie")!.split(";")[0]!;
    const r = await fetch(`${own.url}/api/record`, {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ demo: true, maxPages: 1, ttsProvider: "elevenlabs" }),
    });
    const body = (await r.json()) as { error?: string };
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.match(body.error ?? "", /ELEVENLABS_API_KEY/, "says which key is missing");
  } finally {
    await own.close?.();
    rmSync(solo, { recursive: true, force: true });
  }
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

test("tenants are isolated: a signed-in account cannot read another account's job or recording", async () => {
  const a = await account("tenant-a@example.com");
  const b = await account("tenant-b@example.com");
  const ownerA = (await store.userByEmail("tenant-a@example.com"))!.id;
  const ownerB = (await store.userByEmail("tenant-b@example.com"))!.id;
  assert.ok(ownerA && ownerB && ownerA !== ownerB);

  // Jobs, the way a user makes them: POST /api/run, then poll /api/jobs/:id.
  const submitted = async (cookie: string) => {
    const r = await call(cookie, "/api/run", { method: "POST", body: JSON.stringify({ agent: "sh-p0", fault: "none", modelMode: "replay" }) });
    assert.equal(r.status, 202, await r.clone().text());
    return ((await r.json()) as { job: { id: string } }).job.id;
  };
  const jobA = await submitted(a);
  assert.equal((await call(a, `/api/jobs/${jobA}`)).status, 200, "a reads her own job");
  assert.equal((await call(b, `/api/jobs/${jobA}`)).status, 404, "b does not get a's job, not even a stub");
  const jobB = await submitted(b);
  assert.equal((await call(b, `/api/jobs/${jobB}`)).status, 200, "and b reads her own");

  // Recordings live on disk as recordings/<id>/recording.json, owned by whoever made them.
  const recording = (id: string, owner: string, createdAt: string) => {
    const dir = join(root, "recordings", id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "recording.json"), JSON.stringify({ id, owner, url: `${srv.url}/files/recordings/${id}/recording.json`, createdAt, captions: [{ start: 0, end: 1000, text: "private" }] }));
    return dir;
  };
  const recA = recording("rec-tenant-a", ownerA, "2026-01-02T00:00:00.000Z");
  const recB = recording("rec-tenant-b", ownerB, "2026-01-01T00:00:00.000Z");
  assert.ok(recA && recB);

  const fileA = "/files/recordings/rec-tenant-a/recording.json";
  assert.equal((await call(a, fileA)).status, 200, "a opens her own recording");
  assert.equal((await call(b, fileA)).status, 404, "b gets nothing from a's recording file");
  assert.equal((await call(b, "/files/recordings/rec-tenant-b/recording.json")).status, 200, "b opens her own");

  const transcript = "/api/recordings/rec-tenant-a/transcript";
  assert.equal((await call(a, transcript)).status, 200);
  assert.equal((await call(b, transcript)).status, 404, "b cannot read a's transcript");
  assert.equal((await call(b, "/api/recordings/rec-tenant-b/transcript")).status, 200);

  // The library only ever lists the caller's own.
  const listed = async (cookie: string) => (((await (await call(cookie, "/api/index")).json()) as { recordings: { id: string }[] }).recordings).map((r) => r.id);
  assert.deepEqual((await listed(a)).sort(), ["rec-tenant-a"]);
  assert.deepEqual((await listed(b)).sort(), ["rec-tenant-b"]);
});

describe("anonymous access, with accounts required", () => {
  const wallRoot = mkdtempSync(join(tmpdir(), "lab-wall-"));
  let wall: Awaited<ReturnType<typeof serveDashboard>>;
  before(async () => {
    wall = await serveDashboard(5900 + Math.floor(Math.random() * 300), { root: wallRoot, unref: true, store: new FileStore(join(wallRoot, ".lab", "store.json")), worker: false, requireAuth: true });
  });
  after(async () => {
    await wall.close?.(100);
    rmSync(wallRoot, { recursive: true, force: true });
  });

  test("every data and action route answers 401 without a session, and only /api/me is open", async () => {
    const anonymous = [
      ["GET", "/api/credentials"],
      ["POST", "/api/credentials"],
      ["DELETE", "/api/credentials?env=OPENAI_API_KEY"],
      ["GET", "/api/jobs/anything"],
      ["POST", "/api/run"],
      ["POST", "/api/record"],
      ["GET", "/files/anything"],
      ["GET", "/api/index"],
      ["GET", "/api/recordings"],
      ["GET", "/api/webhooks"],
      ["GET", "/api/schedules"],
    ] as const;
    for (const [method, path] of anonymous) {
      const res = await fetch(`${wall.url}${path}`, { method, body: method === "POST" ? JSON.stringify({ url: "https://site.example", agent: "sh-p0", env: "OPENAI_API_KEY", value: "sk-leaked" }) : undefined });
      assert.equal(res.status, 401, `${method} ${path} is behind the sign-in wall`);
      assert.equal(((await res.json()) as { signIn?: string }).signIn, `/login?next=${encodeURIComponent("/app")}`);
    }
    // Nothing was written on the way in, and the dashboard shell itself is not served.
    const app = await fetch(`${wall.url}/app`, { redirect: "manual" });
    assert.equal(app.status, 302);
    assert.equal(app.headers.get("location"), `/login?next=${encodeURIComponent("/app")}`);
    const me = (await (await fetch(`${wall.url}/api/me`)).json()) as { user: unknown; authRequired: boolean };
    assert.equal(me.user, null, "/api/me is the one open route, and it says who you are: nobody");
    assert.equal(me.authRequired, true);
  });

  test("the same routes answer for a signed-in account, so the 401s are the wall and not a dead server", async () => {
    const cookie = (await (await fetch(`${wall.url}/auth/signup`, { method: "POST", body: JSON.stringify({ email: "wall2@example.com", password: "a-good-password" }) })).headers.get("set-cookie"))!.split(";")[0]!;
    const authed = (path: string, init: RequestInit = {}) => fetch(`${wall.url}${path}`, { ...init, headers: { cookie, ...(init.headers as Record<string, string> | undefined) } });
    assert.equal((await authed("/api/credentials")).status, 200);
    assert.equal((await authed("/api/index")).status, 200);
    assert.equal((await authed("/api/jobs/anything")).status, 404, "signed in, so the job lookup runs and misses");
    assert.equal((await authed("/api/record", { method: "POST", body: JSON.stringify({ url: "not-a-url" }) })).status, 400, "past the wall, into input validation");
    const app = await authed("/app", { redirect: "manual" });
    assert.equal(app.status, 200);
  });
});
