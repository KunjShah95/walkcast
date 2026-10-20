import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { serveDashboard } from "../apps/desktop/server/server.ts";
import { explainFailure } from "../packages/core/src/record/failure.ts";
import { LocalMedia } from "../packages/core/src/media/store.ts";
import { FileStore } from "../packages/core/src/store/index.ts";
import type { FailureReport } from "../packages/core/src/record/failure.ts";

process.env.LAB_LOG = "off";

test("failure reasons read as plain words", () => {
  assert.equal(explainFailure("page.goto: net::ERR_NAME_NOT_RESOLVED at https://x.invalid/").category, "address");
  assert.equal(explainFailure("page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:9/").category, "unreachable");
  assert.equal(explainFailure("Stopped: no progress for 210 s").category, "stuck");
  assert.equal(explainFailure("Stopped: took longer than 660 s").category, "too-long");
  assert.equal(explainFailure("The worker stopped responding too many times.").category, "interrupted");
  assert.equal(explainFailure("browserType.launch: Executable doesn't exist at C:\\x\\headless_shell.exe").category, "browser");
  assert.equal(explainFailure("something nobody planned for").category, "unknown");
});

/** A port nothing listens on: bind one, then close it. */
async function deadPort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as { port: number }).port;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}

test("a recording that fails lands in the Lab with its reason, and leaves no half-made recording", { timeout: 240_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "failures-"));
  const store = new FileStore(join(root, "store.json"));
  const srv = await serveDashboard(5100 + Math.floor(Math.random() * 200), { root, unref: true, store, media: new LocalMedia(join(root, "recordings")) });
  const base = srv.url;
  try {
    const signup = await fetch(`${base}/auth/signup`, { method: "POST", body: JSON.stringify({ email: "f@example.com", password: "a-good-password" }) });
    const cookie = signup.headers.get("set-cookie")!.split(";")[0]!;
    const url = `http://127.0.0.1:${await deadPort()}/`;
    const r = await fetch(`${base}/api/record`, { method: "POST", headers: { cookie }, body: JSON.stringify({ url, maxPages: 1, authorized: true, ttsProvider: "none" }) });
    assert.equal(r.status, 202);
    const { job } = (await r.json()) as { job: { id: string } };

    let status = "queued";
    for (let i = 0; i < 400 && (status === "queued" || status === "running"); i++) {
      await new Promise((res) => setTimeout(res, 500));
      status = ((await (await fetch(`${base}/api/jobs/${job.id}`, { headers: { cookie } })).json()) as { job: { status: string } }).job.status;
    }
    assert.equal(status, "failed");

    const { failures } = (await (await fetch(`${base}/api/failures`, { headers: { cookie } })).json()) as { failures: FailureReport[] };
    assert.equal(failures.length, 1);
    const f = failures[0]!;
    assert.equal(f.jobId, job.id);
    assert.equal(f.url, url);
    assert.equal(f.category, "unreachable", f.error);
    assert.ok(f.stage, "the stage it died at is kept");
    const index = (await (await fetch(`${base}/api/index`, { headers: { cookie } })).json()) as { failedRecordings: number; recordings: unknown[] };
    assert.equal(index.failedRecordings, 1);
    assert.equal(index.recordings.length, 0);
    if (f.files.screenshot) assert.equal((await fetch(`${base}/api/failures/${job.id}/${f.files.screenshot}`, { headers: { cookie } })).status, 200);

    // The half-made recording folder is gone; the evidence lives under failures/.
    const leftovers = existsSync(join(root, "recordings")) ? readdirSync(join(root, "recordings")) : [];
    assert.deepEqual(leftovers, []);
    assert.ok(existsSync(join(root, "failures", job.id, "failure.json")));

    // Someone else sees none of it.
    const other = await fetch(`${base}/auth/signup`, { method: "POST", body: JSON.stringify({ email: "g@example.com", password: "a-good-password" }) });
    const cookie2 = other.headers.get("set-cookie")!.split(";")[0]!;
    const theirs = (await (await fetch(`${base}/api/failures`, { headers: { cookie: cookie2 } })).json()) as { failures: unknown[] };
    assert.equal(theirs.failures.length, 0);
    assert.equal((await fetch(`${base}/api/failures/${job.id}/failure.png`, { headers: { cookie: cookie2 } })).status, 404);
  } finally {
    await srv.close(1000);
    await store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("old half-made recording folders are swept; finished and fresh ones are kept", async () => {
  const { mkdirSync, utimesSync, writeFileSync } = await import("node:fs");
  const { sweepPartialRecordings } = await import("../packages/core/src/jobs/worker.ts");
  const dir = mkdtempSync(join(tmpdir(), "sweep-"));
  try {
    const old = (Date.now() - 2 * 86_400_000) / 1000;
    for (const name of ["dead", "done", "fresh"]) mkdirSync(join(dir, name));
    writeFileSync(join(dir, "dead", "video.webm"), "x");
    writeFileSync(join(dir, "done", "recording.json"), "{}");
    utimesSync(join(dir, "dead"), old, old);
    utimesSync(join(dir, "done"), old, old);
    assert.equal(sweepPartialRecordings(dir), 1);
    assert.deepEqual(readdirSync(dir).sort(), ["done", "fresh"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a recording can be deleted, files and all; nothing outside recordings/ can be", async () => {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const root = mkdtempSync(join(tmpdir(), "del-"));
  const srv = await serveDashboard(5350 + Math.floor(Math.random() * 40), { root, unref: true, requireAuth: false, worker: false });
  try {
    const dir = join(root, "recordings", "site.example-abc");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "recording.json"), JSON.stringify({ kind: "recording", id: "site.example-abc", url: "https://site.example/", createdAt: new Date().toISOString(), durationMs: 1, signIn: { attempted: false, outcome: "not-attempted", detail: "" }, pages: [], skipped: [], captions: [], media: { video: null, mp4: null, audio: null, captions: "captions.vtt", voice: "none", note: "" } }));
    writeFileSync(join(dir, "video.webm"), "x");
    assert.equal((await fetch(`${srv.url}/api/recordings/..`, { method: "DELETE" })).status, 404);
    assert.equal((await fetch(`${srv.url}/api/recordings/site.example-abc`, { method: "DELETE" })).status, 200);
    assert.ok(!existsSync(dir));
    assert.ok(existsSync(root), "the workspace itself is untouched");
    assert.equal((await fetch(`${srv.url}/api/recordings/site.example-abc`, { method: "DELETE" })).status, 404);
  } finally {
    await srv.close(500);
    rmSync(root, { recursive: true, force: true });
  }
});

test("cancelling a running recording stops it, keeps it out of failures, and frees the slot", { timeout: 240_000 }, async () => {
  const { startApp } = await import("../packages/core/src/app/server.ts");
  const { SEED_LEADS } = await import("../packages/core/src/lab/task.ts");
  const app = await startApp({ fault: "none", seed: 1, task: "lookup-owner", seedLeads: SEED_LEADS });
  const root = mkdtempSync(join(tmpdir(), "cancel-"));
  const store = new FileStore(join(root, "store.json"));
  const srv = await serveDashboard(5400 + Math.floor(Math.random() * 100), { root, unref: true, store, media: new LocalMedia(join(root, "recordings")) });
  try {
    const signup = await fetch(`${srv.url}/auth/signup`, { method: "POST", body: JSON.stringify({ email: "c@example.com", password: "a-good-password" }) });
    const cookie = signup.headers.get("set-cookie")!.split(";")[0]!;
    const body = JSON.stringify({ url: app.url, maxPages: 10, authorized: true, ttsProvider: "none" });
    const { job } = (await (await fetch(`${srv.url}/api/record`, { method: "POST", headers: { cookie }, body })).json()) as { job: { id: string } };
    const status = async () => ((await (await fetch(`${srv.url}/api/jobs/${job.id}`, { headers: { cookie } })).json()) as { job: { status: string } }).job.status;
    for (let i = 0; i < 100 && (await status()) !== "running"; i++) await new Promise((r) => setTimeout(r, 200));
    await new Promise((r) => setTimeout(r, 1500)); // let it get into the walk

    const other = await fetch(`${srv.url}/auth/signup`, { method: "POST", body: JSON.stringify({ email: "d@example.com", password: "a-good-password" }) });
    const cookie2 = other.headers.get("set-cookie")!.split(";")[0]!;
    assert.equal((await fetch(`${srv.url}/api/jobs/${job.id}/cancel`, { method: "POST", headers: { cookie: cookie2 } })).status, 404, "only the owner can cancel");

    const r = await fetch(`${srv.url}/api/jobs/${job.id}/cancel`, { method: "POST", headers: { cookie } });
    assert.equal(r.status, 200);
    assert.equal(await status(), "cancelled");
    assert.equal((await fetch(`${srv.url}/api/jobs/${job.id}/cancel`, { method: "POST", headers: { cookie } })).status, 409);

    // The worker lets go: the slot is free for the next recording, and nothing lands anywhere.
    let next = 429;
    for (let i = 0; i < 50 && next === 429; i++) {
      await new Promise((res) => setTimeout(res, 300));
      next = (await fetch(`${srv.url}/api/record`, { method: "POST", headers: { cookie }, body: JSON.stringify({ url: "https://site.invalid/", maxPages: 1, authorized: true, ttsProvider: "none" }) })).status;
    }
    assert.equal(next, 202);
    const failures = ((await (await fetch(`${srv.url}/api/failures`, { headers: { cookie } })).json()) as { failures: { jobId: string }[] }).failures;
    assert.ok(!failures.some((f) => f.jobId === job.id), "a cancel is not a failure");
  } finally {
    await srv.close(1000);
    await store.close();
    await app.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("S3 media: removing a recording sends a signed DELETE per file, and refuses odd ids", async () => {
  const { createServer: createHttp } = await import("node:http");
  const { S3Media } = await import("../packages/core/src/media/store.ts");
  const seen: { method: string; url: string; auth: string }[] = [];
  const s3 = createHttp((req, res) => {
    seen.push({ method: req.method!, url: req.url!, auth: String(req.headers.authorization) });
    res.statusCode = 204;
    res.end();
  });
  await new Promise<void>((r) => s3.listen(0, "127.0.0.1", r));
  const port = (s3.address() as { port: number }).port;
  try {
    const media = new S3Media({ bucket: "recordings", region: "eu-west-2", endpoint: `http://127.0.0.1:${port}/storage/v1/s3` }, async () => ({ accessKeyId: "AK", secretAccessKey: "SK" }), "");
    await media.remove("site-abc", ["video.mp4", "captions.vtt", "recording.json", "video.mp4", "../escape"]);
    assert.deepEqual(seen.map((s) => `${s.method} ${s.url}`), [
      "DELETE /storage/v1/s3/recordings/site-abc/video.mp4",
      "DELETE /storage/v1/s3/recordings/site-abc/captions.vtt",
      "DELETE /storage/v1/s3/recordings/site-abc/recording.json",
    ]);
    assert.ok(seen.every((s) => s.auth.startsWith("AWS4-HMAC-SHA256 Credential=AK/")));
    await assert.rejects(media.remove("..", ["x"]));
  } finally {
    s3.close();
  }
});

test("refused recordings and failed agent runs are listed too; repeat refusals are one entry", { timeout: 240_000 }, async () => {
  const savedKey = process.env.ELEVENLABS_API_KEY;
  const savedChrome = process.env.LAB_CHROME_PATH;
  delete process.env.ELEVENLABS_API_KEY;
  process.env.LAB_CHROME_PATH = join(tmpdir(), "no-such-chrome.exe");
  const root = mkdtempSync(join(tmpdir(), "refused-"));
  const store = new FileStore(join(root, "store.json"));
  const srv = await serveDashboard(5500 + Math.floor(Math.random() * 100), { root, unref: true, store, media: new LocalMedia(join(root, "recordings")) });
  try {
    const signup = await fetch(`${srv.url}/auth/signup`, { method: "POST", body: JSON.stringify({ email: "e@example.com", password: "a-good-password" }) });
    const cookie = signup.headers.get("set-cookie")!.split(";")[0]!;
    const ask = (body: object) => fetch(`${srv.url}/api/record`, { method: "POST", headers: { cookie }, body: JSON.stringify(body) });
    const voiceless = { url: "https://site.example/", maxPages: 1, authorized: true, ttsProvider: "elevenlabs", password: "hunter2-secret" };
    assert.equal((await ask(voiceless)).status, 400);
    assert.equal((await ask(voiceless)).status, 400);
    assert.equal((await ask({ url: "ftp://site.example/", maxPages: 1, authorized: true })).status, 400);
    assert.equal((await ask({ url: "https://site.example/", maxPages: 1 })).status, 400, "an unticked box is refused but not kept");

    const run = await fetch(`${srv.url}/api/run`, { method: "POST", headers: { cookie }, body: JSON.stringify({ agent: "sh-p0", fault: "none", seed: 1, modelMode: "scripted" }) });
    assert.equal(run.status, 202);
    const { job } = (await run.json()) as { job: { id: string } };
    let status = "queued";
    for (let i = 0; i < 200 && (status === "queued" || status === "running"); i++) {
      await new Promise((r) => setTimeout(r, 300));
      status = ((await (await fetch(`${srv.url}/api/jobs/${job.id}`, { headers: { cookie } })).json()) as { job: { status: string } }).job.status;
    }
    assert.equal(status, "failed");

    const body = (await (await fetch(`${srv.url}/api/failures`, { headers: { cookie } })).json()) as { failures: FailureReport[]; runs: { agent: string; category: string }[] };
    assert.equal(body.failures.length, 2, "the repeated refusal is kept once");
    assert.ok(body.failures.every((f) => f.refused));
    assert.deepEqual(body.failures.map((f) => f.category).sort(), ["not-allowed", "refused"]);
    assert.ok(!JSON.stringify(body).includes("hunter2"), "the password is never kept");
    assert.equal(body.runs.length, 1);
    assert.equal(body.runs[0]!.agent, "sh-p0");
    assert.equal(body.runs[0]!.category, "browser");
    const index = (await (await fetch(`${srv.url}/api/index`, { headers: { cookie } })).json()) as { failedRecordings: number };
    assert.equal(index.failedRecordings, 3);
  } finally {
    if (savedKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = savedKey;
    if (savedChrome === undefined) delete process.env.LAB_CHROME_PATH;
    else process.env.LAB_CHROME_PATH = savedChrome;
    await srv.close(1000);
    await store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
