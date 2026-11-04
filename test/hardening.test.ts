import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { request } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { allowedLoopbackHost, dashboardCsp, inlineScriptHashes, requestLogLevel, serveDashboard } from "../apps/desktop/server/server.ts";
import { redactText } from "../apps/desktop/server/diagnostics.ts";
import { LocalMedia } from "../packages/core/src/media/store.ts";
import { FileStore } from "../packages/core/src/store/index.ts";
import { log } from "../packages/core/src/ops/log.ts";

process.env.LAB_LOG = "off";

/**
 * The desktop server's hardening contract: health with worker state, an orderly shutdown route,
 * DNS-rebinding refusal, the dashboard's CSP, request log levels, reveal-in-folder, the
 * diagnostics bundle (with nothing secret in it), the recorded authorization, and reattaching to
 * a batch render through /api/jobs/mine.
 */

const dirs: string[] = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

async function harness(opts: { requireAuth?: boolean; reveal?: (p: string) => void; onShutdown?: () => void } = {}) {
  const root = mkdtempSync(join(tmpdir(), "harden-"));
  dirs.push(root);
  const store = new FileStore(join(root, ".lab", "store.json"));
  const srv = await serveDashboard(0, {
    root,
    unref: true,
    store,
    media: new LocalMedia(join(root, "recordings")),
    worker: false,
    requireAuth: opts.requireAuth ?? true,
    ...(opts.reveal ? { reveal: opts.reveal } : {}),
    ...(opts.onShutdown ? { onShutdown: opts.onShutdown } : {}),
  });
  const account = async (email: string) => {
    const r = await fetch(`${srv.url}/auth/signup`, { method: "POST", body: JSON.stringify({ email, password: "a-good-password" }) });
    return { cookie: r.headers.get("set-cookie")!.split(";")[0]!, owner: (await store.userByEmail(email))!.id };
  };
  return { root, store, srv, account };
}

function makeRecording(root: string, id: string, owner: string | null): void {
  const dir = join(root, "recordings", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "recording.json"),
    JSON.stringify({ id, owner, url: "https://site.example/", createdAt: new Date().toISOString(), durationMs: 1000, signIn: { attempted: false, outcome: "not-attempted", detail: "" }, pages: [], skipped: [], captions: [], media: { video: null, mp4: "recording.mp4", audio: null, captions: "", voice: "none", note: "" } }),
  );
  writeFileSync(join(dir, "recording-vertical.mp4"), "x");
}

/** A raw request with a chosen Host header (fetch won't let a caller set one). */
function rawGet(url: string, path: string, host: string): Promise<{ status: number; body: string }> {
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const req = request({ host: u.hostname, port: u.port, path, method: "GET", headers: { host } }, (res) => {
      let body = "";
      res.on("data", (c: Buffer) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("health and shutdown", () => {
  test("/healthz says whether the worker is busy", async () => {
    const { srv } = await harness();
    const body = (await (await fetch(`${srv.url}/healthz`)).json()) as { ok: boolean; worker: string };
    assert.deepEqual(body, { ok: true, worker: "idle" });
    await srv.close(100);
  });

  test("POST /api/shutdown needs the token, answers 202, then closes and calls onShutdown", async () => {
    process.env.WALKCAST_SHUTDOWN_TOKEN = "shutdown-token-for-tests-123";
    let exited = 0;
    const { srv } = await harness({ requireAuth: false, onShutdown: () => exited++ });
    try {
      assert.equal((await fetch(`${srv.url}/api/shutdown`, { method: "POST" })).status, 403, "no header");
      assert.equal((await fetch(`${srv.url}/api/shutdown`, { method: "POST", headers: { "x-walkcast-shutdown": "wrong" } })).status, 403, "wrong token");
      const ok = await fetch(`${srv.url}/api/shutdown`, { method: "POST", headers: { "x-walkcast-shutdown": "shutdown-token-for-tests-123" } });
      assert.equal(ok.status, 202);
      for (let i = 0; i < 100 && exited === 0; i++) await new Promise((r) => setTimeout(r, 50));
      assert.equal(exited, 1, "onShutdown ran once the server closed");
      await assert.rejects(fetch(`${srv.url}/healthz`), "the listener is closed");
    } finally {
      delete process.env.WALKCAST_SHUTDOWN_TOKEN;
      await srv.close(100);
    }
  });

  test("without WALKCAST_SHUTDOWN_TOKEN the route does not exist", async () => {
    delete process.env.WALKCAST_SHUTDOWN_TOKEN;
    let exited = 0;
    const { srv } = await harness({ requireAuth: false, onShutdown: () => exited++ });
    const r = await fetch(`${srv.url}/api/shutdown`, { method: "POST", headers: { "x-walkcast-shutdown": "" } });
    assert.equal(r.status, 404);
    assert.equal(exited, 0);
    await srv.close(100);
  });
});

describe("DNS rebinding and headers", () => {
  test("a loopback server refuses a Host that isn't loopback", async () => {
    const { srv } = await harness();
    const port = new URL(srv.url).port;
    assert.equal((await rawGet(srv.url, "/healthz", `evil.example:${port}`)).status, 421);
    assert.equal((await rawGet(srv.url, "/healthz", "127.0.0.1:1")).status, 421, "right name, wrong port");
    assert.equal((await rawGet(srv.url, "/healthz", `localhost:${port}`)).status, 200);
    assert.equal((await rawGet(srv.url, "/healthz", `127.0.0.1:${port}`)).status, 200);
    await srv.close(100);
  });

  test("allowedLoopbackHost", () => {
    assert.ok(allowedLoopbackHost("[::1]:4320", 4320));
    assert.ok(allowedLoopbackHost("LOCALHOST:4320", 4320));
    assert.ok(!allowedLoopbackHost("localhost.evil.example:4320", 4320));
    assert.ok(!allowedLoopbackHost(undefined, 4320));
  });

  test("/app carries a CSP that pins its inline scripts by hash", async () => {
    const { srv } = await harness({ requireAuth: false });
    const r = await fetch(`${srv.url}/app`);
    const csp = r.headers.get("content-security-policy") ?? "";
    const html = await r.text();
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.ok(r.headers.get("referrer-policy"));
    assert.match(csp, /frame-ancestors 'self'/);
    const scriptSrc = /script-src ([^;]+)/.exec(csp)![1]!;
    assert.ok(!scriptSrc.includes("'unsafe-inline'"), "scripts are pinned, not blanket-allowed");
    for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
      const hash = `'sha256-${createHash("sha256").update(m[1]!, "utf8").digest("base64")}'`;
      assert.ok(scriptSrc.includes(hash), "every inline script's hash is allowed");
    }
    await srv.close(100);
  });

  test("dashboardCsp / inlineScriptHashes on a small page", () => {
    const hashes = inlineScriptHashes(`<script>a()</script><script type="module">b()</script><script src="/x.js"></script>`);
    assert.equal(hashes.length, 2);
    assert.match(dashboardCsp(hashes), /object-src 'none'/);
  });

  test("polling routes log at debug, everything else at info", () => {
    assert.equal(requestLogLevel("GET", "/healthz"), "debug");
    assert.equal(requestLogLevel("GET", "/readyz"), "debug");
    assert.equal(requestLogLevel("GET", "/api/jobs/abc"), "debug");
    assert.equal(requestLogLevel("GET", "/api/jobs/abc/live/live.m3u8"), "debug");
    assert.equal(requestLogLevel("GET", "/api/launch-videos/jobs/abc"), "debug");
    assert.equal(requestLogLevel("POST", "/api/jobs/abc/cancel"), "info");
    assert.equal(requestLogLevel("POST", "/api/record"), "info");
  });
});

describe("recordings: reveal, authorization, reattach", () => {
  test("POST /api/recordings/:id/reveal validates the name and opens the file manager", async () => {
    const revealed: string[] = [];
    const { root, srv, account } = await harness({ reveal: (p) => revealed.push(p) });
    const a = await account("a@example.com");
    const b = await account("b@example.com");
    makeRecording(root, "rec-1", a.owner);
    const call = (cookie: string, body: unknown) => fetch(`${srv.url}/api/recordings/rec-1/reveal`, { method: "POST", headers: { cookie }, body: JSON.stringify(body) });
    assert.equal((await fetch(`${srv.url}/api/recordings/rec-1/reveal`, { method: "POST", body: "{}" })).status, 401);
    assert.equal((await call(b.cookie, {})).status, 404, "another account's recording");
    assert.equal((await call(a.cookie, { file: "../secret.key" })).status, 400);
    assert.equal((await call(a.cookie, { file: "a/b.mp4" })).status, 400);
    assert.equal((await call(a.cookie, { file: "missing.mp4" })).status, 404);
    assert.equal((await call(a.cookie, { file: "recording-vertical.mp4" })).status, 204);
    assert.equal((await call(a.cookie, {})).status, 204, "no file: the recording's folder");
    assert.deepEqual(revealed, [join(root, "recordings", "rec-1", "recording-vertical.mp4"), join(root, "recordings", "rec-1")]);
    await srv.close(100);
  });

  test("a recording job keeps who confirmed authorization, when, and for which address", async () => {
    const { srv, store, account } = await harness();
    const a = await account("a@example.com");
    const r = await fetch(`${srv.url}/api/record`, { method: "POST", headers: { cookie: a.cookie }, body: JSON.stringify({ url: "https://site.example/start", authorized: true }) });
    assert.equal(r.status, 202);
    const { job } = (await r.json()) as { job: { id: string } };
    const input = (await store.job(job.id))!.input as Record<string, unknown>;
    assert.equal(input.authorizedBy, a.owner);
    assert.equal(input.authorizedUrl, "https://site.example/start");
    assert.ok(Math.abs(Date.parse(String(input.authorizedAt)) - Date.now()) < 60_000);
    await srv.close(100);
  });

  test("/api/jobs/mine finds an active batch render (kind=batch-render and kind=any)", async () => {
    const { root, srv, account } = await harness();
    const a = await account("a@example.com");
    makeRecording(root, "rec-1", a.owner);
    const made = await fetch(`${srv.url}/api/recordings/batch-render`, { method: "POST", headers: { cookie: a.cookie }, body: JSON.stringify({ recordingIds: ["rec-1"], shape: "vertical" }) });
    const { jobId } = (await made.json()) as { jobId: string };
    const mine = async (q: string) => ((await (await fetch(`${srv.url}/api/jobs/mine${q}`, { headers: { cookie: a.cookie } })).json()) as { job: { id: string; kind: string } | null }).job;
    assert.equal(await mine(""), null, "default is record jobs, as before");
    assert.equal((await mine("?kind=batch-render"))?.id, jobId);
    const any = await mine("?kind=any");
    assert.equal(any?.id, jobId);
    assert.equal(any?.kind, "batch-render");
    await srv.close(100);
  });
});

describe("diagnostics", () => {
  test("GET /api/diagnostics needs a session and contains no secret", async () => {
    const planted = {
      key: "sk-ant-api03-PLANTEDKEYVALUE0123456789abcdef",
      password: "hunter2-planted-password",
      cookie: "lab_session=PLANTEDCOOKIE0123456789",
      bearer: "PLANTEDBEARERTOKEN0123456789",
    };
    const saved = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = planted.key;
    const { srv, store, account } = await harness();
    try {
      assert.equal((await fetch(`${srv.url}/api/diagnostics`)).status, 401);
      const a = await account("a@example.com");
      await store.insertFailed(
        { kind: "record", owner: a.owner, input: { url: "https://site.example/", password: planted.password } },
        `Sign-in failed with password=${planted.password}; ${planted.cookie}; Authorization: Bearer ${planted.bearer}; key ${planted.key}`,
      );
      log.warn("test.planted", { header: `Cookie: ${planted.cookie}`, key: planted.key });
      const r = await fetch(`${srv.url}/api/diagnostics`, { headers: { cookie: a.cookie } });
      assert.equal(r.status, 200);
      assert.match(r.headers.get("content-disposition") ?? "", /attachment; filename="walkcast-diagnostics-/);
      const text = await r.text();
      for (const [what, value] of Object.entries(planted)) assert.ok(!text.includes(value), `the planted ${what} is not in the bundle`);
      assert.ok(!text.includes("PLANTEDCOOKIE"), "no cookie value");
      assert.ok(!text.includes(a.cookie.split("=")[1]!), "not the requester's own session either");
      const bundle = JSON.parse(text) as Record<string, any>;
      assert.equal(bundle.versions.node, process.versions.node);
      assert.ok(bundle.os.platform);
      assert.equal(bundle.capabilities.credentials.ANTHROPIC_API_KEY, true, "configured: yes/no only");
      assert.equal(bundle.failedJobs.length, 1);
      assert.equal(bundle.failedJobs[0].input.url, "https://site.example/", "site addresses may appear");
      assert.equal(bundle.failedJobs[0].input.password, undefined);
      assert.ok(typeof bundle.limits.maxBatchRenderItems === "number");
      assert.ok(Array.isArray(bundle.log));
    } finally {
      if (saved === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = saved;
      await srv.close(100);
    }
  });

  test("redactText strips key shapes, bearer tokens, JWTs and URL passwords", () => {
    const out = redactText("token=abc12345 Bearer abcdefghijkl sk-proj-abcdefghijklmnop eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.c2lnbmF0dXJlc2ln https://u:pw123@host/x", []);
    for (const leak of ["abc12345", "abcdefghijkl", "sk-proj-abcdefghijklmnop", "eyJhbGciOiJIUzI1", "pw123"]) assert.ok(!out.includes(leak), leak);
    assert.ok(out.includes("https://u:[redacted]@host/x"));
  });
});

test("the dashboard file the CSP is computed from exists (sanity)", () => {
  assert.ok(readFileSync(join(import.meta.dirname, "..", "apps", "desktop", "dashboard", "dist", "index.html"), "utf8").includes("<script"));
});
