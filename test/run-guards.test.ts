import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { validateRun } from "../apps/desktop/server/server.ts";
import { Recorder } from "../packages/core/src/capture/recorder.ts";
import { LabData, stampOwner } from "../packages/core/src/data.ts";
import { runOnce } from "../packages/core/src/lab/runner.ts";
import { ModelGateway } from "../packages/core/src/llm/gateway.ts";
import { ScriptedModel } from "../packages/core/src/llm/scripted-model.ts";
import { guardedLookup, startGuardProxy } from "../packages/core/src/record/ssrf.ts";
import { FileStore } from "../packages/core/src/store/index.ts";

process.env.LAB_LOG = "off";

/**
 * The guards around a run: what may spend money, what stops a run, whose output is whose, and
 * where a recording browser may connect.
 */

const roots: string[] = [];
const mkroot = (): string => {
  const r = mkdtempSync(join(tmpdir(), "walkcast-guards-"));
  roots.push(r);
  return r;
};
after(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

test("leaving out the model mode is not a way past the live-run switch", () => {
  const root = mkroot();
  // A model-backed agent with no mode runs live. With live runs off, that is refused...
  assert.throws(() => validateRun({ agent: "sh-p0" }, false, root), /Live model runs are disabled/);
  // ...and allowed where live runs are on, or when the mode says it costs nothing.
  assert.equal(validateRun({ agent: "sh-p0" }, true, root).agent, "sh-p0");
  assert.equal(validateRun({ agent: "sh-p0", modelMode: "scripted" }, false, root).modelMode, "scripted");
  // Scripted agents never call a model, so they need no mode.
  assert.equal(validateRun({ agent: "v0" }, false, root).agent, "v0");
});

test("a replay with no mode plays the recorded calls, or is refused when it would go live", () => {
  const root = mkroot();
  const fixture = (name: string, agent: string, cassette: boolean) => {
    const dir = join(root, "fixtures", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "manifest.json"), JSON.stringify({ original: { agent: { id: agent }, model: { cassette: "model-calls.jsonl" } } }));
    if (cassette) writeFileSync(join(dir, "model-calls.jsonl"), "");
    return `fixtures/${name}`;
  };
  const recorded = fixture("recorded", "sh-p0", true);
  assert.equal(validateRun({ op: "replay", fixture: recorded, agent: "sh-p0" }, false, root).modelMode, "replay");
  // Another agent, or no cassette on disk: the replay would call the model live.
  assert.throws(() => validateRun({ op: "replay", fixture: recorded, agent: "sh-p1" }, false, root), /would call the model live/);
  assert.throws(() => validateRun({ op: "replay", fixture: fixture("bare", "sh-p0", false), agent: "sh-p0" }, false, root), /would call the model live/);
});

test("a stopped run makes no model call and never starts", async () => {
  const stop = new AbortController();
  const gateway = new ModelGateway("scripted", new ScriptedModel(), new Recorder(mkroot(), { screenshots: false }), undefined, undefined, stop.signal);
  stop.abort(new Error("cancelled by its owner"));
  await assert.rejects(() => gateway.agent({ system: "s", tools: [], messages: [] }), /cancelled by its owner/);
  assert.equal(gateway.status.calls, 0);
  // A run asked to start after its job was cancelled throws before it opens a browser.
  await assert.rejects(runOnce({ fault: "none", seed: 1, agent: "v0", outDir: mkroot(), signal: stop.signal }), /cancelled by its owner/);
});

test("lab output knows its owner from the nearest stamp above it", () => {
  const root = mkroot();
  const data = new LabData(root);
  stampOwner(join(root, "results", "exp-1"), "user-a");
  mkdirSync(join(root, "results", "exp-1", "runs", "r1"), { recursive: true });
  mkdirSync(join(root, "runs", "cli-run"), { recursive: true });
  assert.equal(data.ownerOf("results/exp-1/runs/r1"), "user-a", "a run inside an experiment belongs to the experiment's owner");
  assert.equal(data.ownerOf(join(root, "results", "exp-1")), "user-a");
  assert.equal(data.ownerOf("runs/cli-run"), null, "unstamped output belongs to nobody in particular");
  assert.equal(data.ownerOf("../outside"), null);
});

test("a refunded hit is taken off the count", async () => {
  const store = new FileStore(join(mkroot(), "store.json"));
  assert.equal(await store.hit("k", 60_000), 1);
  assert.equal(await store.hit("k", 60_000), 2);
  await store.unhit("k");
  assert.equal(await store.hit("k", 60_000), 2);
  await store.close();
});

test("the guarded lookup refuses a name that resolves to a local address", async () => {
  const err = await new Promise<NodeJS.ErrnoException | null>((resolve) => guardedLookup("localhost", {}, (e) => resolve(e)));
  assert.equal(err?.code, "EBLOCKED");
});

test("the recording proxy refuses local targets, whether tunnelled or forwarded", async () => {
  const proxy = await startGuardProxy();
  try {
    const port = Number(new URL(proxy.server).port);
    // HTTPS and WebSockets arrive as CONNECT tunnels.
    const tunnel = await new Promise<string>((resolve, reject) => {
      const s = connect(port, "127.0.0.1", () => s.write("CONNECT localhost:443 HTTP/1.1\r\nHost: localhost:443\r\n\r\n"));
      s.once("data", (d) => {
        resolve(d.toString().split("\r\n")[0]!);
        s.destroy();
      });
      s.on("error", reject);
    });
    assert.match(tunnel, /403/);
    // Plain HTTP is forwarded by absolute URL.
    const status = await new Promise<number>((resolve, reject) => {
      const r = request({ host: "127.0.0.1", port, path: "http://localhost:9/", method: "GET" }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      r.on("error", reject);
      r.end();
    });
    assert.equal(status, 403);
    assert.ok(proxy.blocked.length >= 2, "both refusals are reported");
  } finally {
    await proxy.close();
  }
});

test("a local server's sealing key survives a restart, so a queued password still opens", async () => {
  const { open, seal, useLocalKeyFile } = await import("../packages/core/src/jobs/secret-box.ts");
  const saved = process.env.LAB_SECRET_KEY;
  delete process.env.LAB_SECRET_KEY;
  try {
    const dir = mkroot();
    useLocalKeyFile(dir);
    const sealed = seal("demo-pass");
    const key = readFileSync(join(dir, "secret.key"), "utf8");
    useLocalKeyFile(dir); // the next start reads the same file
    assert.equal(readFileSync(join(dir, "secret.key"), "utf8"), key);
    assert.equal(open(sealed), "demo-pass");
  } finally {
    if (saved !== undefined) process.env.LAB_SECRET_KEY = saved;
  }
});

test("a FileStore acknowledges an enqueue only once it is on disk, and leaves no lock when closed", async () => {
  const dir = mkroot();
  const file = join(dir, "store.json");
  const store = new FileStore(file);
  const job = await store.enqueueLimited({ kind: "record", owner: null, input: { url: "https://a.example" }, secret: null, idempotencyKey: null }, 5);
  assert.ok(job);
  assert.ok(readFileSync(file, "utf8").includes(job.id), "on disk before the caller hears 202");
  await store.close();
  assert.equal(existsSync(`${file}.lock`), false, "a closed store releases its lock");
});
