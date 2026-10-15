import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { startApp } from "../src/app/server.ts";
import { SEED_LEADS } from "../src/lab/task.ts";
import { open, seal } from "../src/jobs/secret-box.ts";
import { LocalMedia, S3Media } from "../src/media/store.ts";
import { presignGet, signHeaders } from "../src/media/s3.ts";
import { FileStore, PgStore, migrate, type Store } from "../src/store/index.ts";
import { freshSchema } from "./pg-helper.ts";
import { serveDashboard } from "../src/ui/server.ts";

process.env.LAB_LOG = "off";

let app: Awaited<ReturnType<typeof startApp>>;
before(async () => {
  app = await startApp({ fault: "none", seed: 1, task: "lookup-owner", seedLeads: SEED_LEADS });
});
after(() => app.close());

test("sealed secrets round-trip and can't be read without the key", () => {
  const sealed = seal("hunter2-password");
  assert.ok(!sealed.includes("hunter2"));
  assert.equal(open(sealed), "hunter2-password");
  const [v, iv, tag, body] = sealed.split(".");
  assert.throws(() => open([v, iv, tag, body!.slice(0, -2) + "AA"].join(".")), "tampering is detected");
});

test("S3 signing matches AWS's published test vectors", () => {
  const cfg = { bucket: "examplebucket", region: "us-east-1", accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" };
  const at = new Date("2013-05-24T00:00:00Z");
  // "Authenticating Requests: Using Query Parameters" (presigned GET)
  assert.equal(new URL(presignGet(cfg, "test.txt", 86400, at)).searchParams.get("X-Amz-Signature"), "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404");
  // "Authenticating Requests: Using the Authorization Header" (GET Object with Range)
  const h = signHeaders(cfg, "GET", new URL("https://examplebucket.s3.amazonaws.com/test.txt"), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", { Range: "bytes=0-9" }, at);
  assert.match(h.authorization!, /Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41$/);
});

test("S3 media: uploads with signed PUTs (path-style for Supabase) and serves presigned links", async () => {
  const puts: { url: string; auth: string; sha: string; type: string; bytes: number }[] = [];
  const s3 = createServer((req, res) => {
    let n = 0;
    req.on("data", (c: Buffer) => (n += c.length));
    req.on("end", () => {
      puts.push({ url: req.url!, auth: String(req.headers.authorization), sha: String(req.headers["x-amz-content-sha256"]), type: String(req.headers["content-type"]), bytes: n });
      res.end();
    });
  });
  await new Promise<void>((r) => s3.listen(0, "127.0.0.1", r));
  const port = (s3.address() as { port: number }).port;
  const dir = mkdtempSync(join(tmpdir(), "s3-"));
  try {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(dir, "captions.vtt"), "WEBVTT\n");
    const media = new S3Media({ bucket: "recordings", region: "eu-west-2", endpoint: `http://127.0.0.1:${port}/storage/v1/s3` }, async () => ({ accessKeyId: "AK", secretAccessKey: "SK" }), "");
    await media.publish("rec-1", dir, ["captions.vtt", "missing.mp4"]);
    assert.equal(puts.length, 1, "missing files are skipped");
    assert.equal(puts[0]!.url, "/storage/v1/s3/recordings/rec-1/captions.vtt");
    assert.match(puts[0]!.auth, /^AWS4-HMAC-SHA256 Credential=AK\/\d{8}\/eu-west-2\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
    assert.equal(puts[0]!.type, "text/vtt; charset=utf-8");
    assert.equal(puts[0]!.bytes, 7);
    const where = await media.locate("rec-1", "captions.vtt");
    assert.ok(where && "redirect" in where);
    const link = new URL(where.redirect);
    assert.equal(link.pathname, "/storage/v1/s3/recordings/rec-1/captions.vtt");
    assert.equal(link.searchParams.get("X-Amz-Expires"), "900");
    assert.equal(await media.locate("../etc", "passwd"), null);
  } finally {
    s3.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

const stores: [string, () => Promise<Store>][] = [["file", async () => new FileStore(join(mkdtempSync(join(tmpdir(), "jobs-")), "store.json"))]];
if (process.env.TEST_DATABASE_URL) {
  stores.push([
    "postgres",
    async () => {
      return freshSchema(process.env.TEST_DATABASE_URL!);
    },
  ]);
}

for (const [name, open] of stores) {
  describe(`queued recording end to end (${name} store)`, () => {
    test("sign up, submit twice with one idempotency key, poll the job, watch the result", { timeout: 240_000 }, async () => {
      const root = mkdtempSync(join(tmpdir(), "e2e-"));
      const store = await open();
      const srv = await serveDashboard(4700 + Math.floor(Math.random() * 200), { root, unref: true, store, media: new LocalMedia(join(root, "recordings")) });
      const base = srv.url;
      try {
        const signup = await fetch(`${base}/auth/signup`, { method: "POST", body: JSON.stringify({ email: "q@example.com", password: "a-good-password" }) });
        const cookie = signup.headers.get("set-cookie")!.split(";")[0]!;
        const submit = () =>
          fetch(`${base}/api/record`, {
            method: "POST",
            headers: { cookie, "Idempotency-Key": "same-click" },
            body: JSON.stringify({ url: app.url, username: "demo", password: "demo-pass", maxPages: 2, authorized: true }),
          }).then(async (r) => ({ status: r.status, body: (await r.json()) as { job: { id: string; status: string; input: Record<string, unknown> } } }));
        const first = await submit();
        const second = await submit();
        assert.equal(first.status, 202);
        assert.equal(second.body.job.id, first.body.job.id, "a retried submit is the same job");
        assert.ok(!JSON.stringify(first.body).includes("demo-pass"), "the password is never echoed");

        // A second, different job while one is active is refused (per-user limit).
        const other = await fetch(`${base}/api/record`, { method: "POST", headers: { cookie }, body: JSON.stringify({ url: app.url, maxPages: 1, authorized: true }) });
        assert.equal(other.status, 429);

        let job = first.body.job as { id: string; status: string; result?: { dir: string; id: string }; error?: string };
        for (let i = 0; i < 200 && (job.status === "queued" || job.status === "running"); i++) {
          await new Promise((r) => setTimeout(r, 500));
          job = ((await (await fetch(`${base}/api/jobs/${job.id}`, { headers: { cookie } })).json()) as { job: typeof job }).job;
        }
        assert.equal(job.status, "succeeded", job.error);
        const index = (await (await fetch(`${base}/api/index`, { headers: { cookie } })).json()) as { recordings: { id: string; signIn: { outcome: string } }[] };
        const rec = index.recordings.find((r) => r.id === job.result!.id);
        assert.equal(rec?.signIn.outcome, "signed-in");
        assert.equal((await fetch(`${base}/files/recordings/${job.result!.id}/captions.vtt`, { headers: { cookie } })).status, 200);
        if (name === "postgres") {
          const [row] = await (store as PgStore).sql`select secret, status from jobs where id = ${job.id}`;
          assert.equal(row!.secret, null, "sealed credentials are cleared when the job ends");
        }

        // Someone else can't see the job or the files.
        const other2 = await fetch(`${base}/auth/signup`, { method: "POST", body: JSON.stringify({ email: "r@example.com", password: "a-good-password" }) });
        const cookie2 = other2.headers.get("set-cookie")!.split(";")[0]!;
        assert.equal((await fetch(`${base}/api/jobs/${job.id}`, { headers: { cookie: cookie2 } })).status, 404);
        assert.equal((await fetch(`${base}/files/recordings/${job.result!.id}/captions.vtt`, { headers: { cookie: cookie2 } })).status, 404);

        assert.equal((await fetch(`${base}/healthz`)).status, 200);
        assert.equal((await fetch(`${base}/readyz`)).status, 200);
      } finally {
        await srv.close(1000);
        await store.close();
        rmSync(root, { recursive: true, force: true });
      }
    });
  });
}

if (process.env.TEST_DATABASE_URL) {
  test("production shape: web-only server + a separate worker process sharing Postgres", { timeout: 240_000 }, async () => {
    const { Worker } = await import("../src/jobs/worker.ts");
    const { randomBytes } = await import("node:crypto");
    const root = mkdtempSync(join(tmpdir(), "split-"));
    const web = await freshSchema(process.env.TEST_DATABASE_URL!);
    const media = new LocalMedia(join(root, "recordings"));
    const srv = await serveDashboard(4950 + Math.floor(Math.random() * 40), { root, unref: true, store: web, media, worker: false });
    const workerStore = new PgStore(process.env.TEST_DATABASE_URL!, { schema: web.schema });
    const saved = process.env.LAB_SECRET_KEY;
    try {
      const signup = await fetch(`${srv.url}/auth/signup`, { method: "POST", body: JSON.stringify({ email: "w@example.com", password: "a-good-password" }) });
      const cookie = signup.headers.get("set-cookie")!.split(";")[0]!;
      const body = JSON.stringify({ url: app.url, username: "demo", password: "demo-pass", maxPages: 1, authorized: true });
      // Without a shared key a separate worker couldn't open the sealed password: refuse up front.
      delete process.env.LAB_SECRET_KEY;
      assert.equal((await fetch(`${srv.url}/api/record`, { method: "POST", headers: { cookie }, body })).status, 503);
      process.env.LAB_SECRET_KEY = randomBytes(32).toString("base64");
      const r = await fetch(`${srv.url}/api/record`, { method: "POST", headers: { cookie }, body });
      assert.equal(r.status, 202);
      const { job } = (await r.json()) as { job: { id: string } };
      assert.equal((await web.job(job.id))?.status, "queued", "the web tier doesn't run it");

      const worker = new Worker({ store: workerStore, media, root, pollMs: 200 }).start();
      let status = "queued";
      for (let i = 0; i < 300 && (status === "queued" || status === "running"); i++) {
        await new Promise((res) => setTimeout(res, 500));
        status = (await web.job(job.id))!.status;
      }
      await worker.stop(1000);
      assert.equal(status, "succeeded", (await web.job(job.id))?.error ?? "");
      assert.equal((await web.recordings(null, 10)).length, 1);
    } finally {
      if (saved === undefined) delete process.env.LAB_SECRET_KEY;
      else process.env.LAB_SECRET_KEY = saved;
      await srv.close(500);
      await workerStore.close();
      await web.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
}
