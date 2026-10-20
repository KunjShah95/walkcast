import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { serveDashboard } from "../apps/desktop/server/server.ts";
import { closeBrowser } from "../packages/core/src/lab/runner.ts";
import { FileStore } from "../packages/core/src/store/index.ts";

process.env.LAB_LOG = "off";

/**
 * The Lab from the app, without a terminal: a failed run saves its fixture, and that fixture can be
 * replayed from the app. Both used to need `npm run lab`, which the desktop app has no way to run.
 */
const root = mkdtempSync(join(tmpdir(), "lab-app-"));
let srv: Awaited<ReturnType<typeof serveDashboard>>;
let cookie = "";
before(async () => {
  srv = await serveDashboard(6300 + Math.floor(Math.random() * 300), { root, unref: true, store: new FileStore(join(root, ".lab", "store.json")), worker: true });
  const signup = await fetch(`${srv.url}/auth/signup`, { method: "POST", body: JSON.stringify({ email: "lab@example.com", password: "a-good-password" }) });
  cookie = signup.headers.get("set-cookie")!.split(";")[0]!;
});
after(async () => {
  await srv.close?.();
  // The runs share one warm browser; left open it keeps the test process alive.
  await closeBrowser();
  rmSync(root, { recursive: true, force: true });
});

async function submit(body: unknown): Promise<Response> {
  return fetch(`${srv.url}/api/run`, { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

async function finish(res: Response): Promise<Record<string, unknown>> {
  assert.equal(res.status, 202, await res.clone().text());
  let { job } = (await res.json()) as { job: { id: string; status: string; error?: string; result?: Record<string, unknown> } };
  for (let i = 0; i < 400 && (job.status === "queued" || job.status === "running"); i++) {
    await new Promise((r) => setTimeout(r, 300));
    ({ job } = (await (await fetch(`${srv.url}/api/jobs/${job.id}`, { headers: { cookie } })).json()) as { job: typeof job });
  }
  assert.equal(job.status, "succeeded", job.error ?? "");
  return job.result!;
}

test("a run the agent fails saves a fixture, and the app can replay it", { timeout: 240_000 }, async () => {
  const run = await finish(await submit({ agent: "v0", fault: "gateway-timeout", seed: 1 }));
  assert.match(String(run.fixture), /^runs\/_fixtures\/gateway-timeout-s1-/, "the failure became a fixture");
  assert.ok(existsSync(join(root, String(run.fixture), "manifest.json")));

  const fixed = await finish(await submit({ op: "replay", fixture: run.fixture, agent: "v1", trials: 2 }));
  const replay = fixed.replay as { passAll: boolean; passes: number; trials: { runDir: string }[] };
  assert.equal(replay.passAll, true, "v1 holds on the fixture");
  assert.equal(replay.trials.length, 2);
  assert.ok(replay.trials.every((t) => t.runDir.startsWith("runs/")), "each trial links to its run");

  const again = await finish(await submit({ op: "replay", fixture: run.fixture, agent: "v0", trials: 1 }));
  assert.equal((again.replay as { reproduced: number }).reproduced, 1, "v0 reproduces the original failure");
});

test("replays and experiments refuse what they can't run", async () => {
  for (const fixture of ["../etc", "runs/_fixtures/does-not-exist", "/abs/path"]) {
    const r = await submit({ op: "replay", fixture, agent: "v1" });
    assert.equal(r.status, 400, fixture);
  }
  const ai = await submit({ op: "experiment", baseline: "v0", candidates: ["sh-p1"] });
  assert.equal(ai.status, 400, "an experiment from the app never spends model credits");
  assert.match(((await ai.json()) as { error: string }).error, /scripted/);
  assert.equal((await submit({ op: "nonsense" })).status, 400);
});
