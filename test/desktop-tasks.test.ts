import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { type DesktopTask, DesktopTasks, launchRenderTimeoutMs, sweepLaunchWork } from "../apps/desktop/server/desktop-tasks.ts";

process.env.LAB_LOG = "off";

/**
 * Launch Studio renders: a deadline, a whole-tree kill (the renderer starts Chromium and ffmpeg),
 * a kill of everything when the server closes, and a sweep of working folders left by a crash.
 */
const dirs: string[] = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const fresh = () => {
  const d = mkdtempSync(join(tmpdir(), "dtask-"));
  dirs.push(d);
  return d;
};

function task(id: string, temporaryDir?: string): DesktopTask {
  const now = new Date().toISOString();
  return { id, kind: "launch-video", owner: null, status: "running", progress: 1, message: "", startedAt: now, updatedAt: now, ...(temporaryDir ? { temporaryDir } : {}) };
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** A parent that starts a long-lived grandchild (as the renderer starts Chromium) and records its pid. */
function parentScript(pidFile: string): string[] {
  const child = `require("child_process").spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" }).pid`;
  return ["-e", `require("fs").writeFileSync(${JSON.stringify(pidFile)}, String(${child})); setInterval(()=>{},1000)`];
}

async function until(cond: () => boolean, ms = 10_000) {
  for (const end = Date.now() + ms; Date.now() < end && !cond(); ) await new Promise((r) => setTimeout(r, 50));
}

test("LAB_LAUNCH_RENDER_TIMEOUT_MS sets the deadline (default 20 min)", () => {
  delete process.env.LAB_LAUNCH_RENDER_TIMEOUT_MS;
  assert.equal(launchRenderTimeoutMs(), 20 * 60_000);
  process.env.LAB_LAUNCH_RENDER_TIMEOUT_MS = "1234";
  assert.equal(launchRenderTimeoutMs(), 1234);
  delete process.env.LAB_LAUNCH_RENDER_TIMEOUT_MS;
});

test("a render past its deadline is failed, its process tree killed, and its folder removed", async () => {
  const dir = fresh();
  const work = join(dir, "work");
  mkdirSync(work);
  const pidFile = join(dir, "grandchild.pid");
  const tasks = new DesktopTasks(() => 1500);
  const t = task("t1", work);
  tasks.start(t, process.execPath, parentScript(pidFile), dir, process.env);
  await until(() => existsSync(pidFile) && readFileSync(pidFile, "utf8").length > 0);
  const grandchild = Number(readFileSync(pidFile, "utf8"));
  assert.ok(alive(grandchild));
  await until(() => t.status !== "running");
  assert.equal(t.status, "failed");
  assert.match(t.error ?? "", /took too long/);
  await until(() => !alive(grandchild));
  assert.ok(!alive(grandchild), "the grandchild (Chromium's stand-in) died with its parent");
  assert.ok(!existsSync(work), "the working folder is gone");
});

test("killAll stops every running task (the server is closing)", async () => {
  const dir = fresh();
  const pidFile = join(dir, "grandchild.pid");
  const tasks = new DesktopTasks(() => 60_000);
  const t = task("t2");
  tasks.start(t, process.execPath, parentScript(pidFile), dir, process.env);
  await until(() => existsSync(pidFile) && readFileSync(pidFile, "utf8").length > 0);
  const grandchild = Number(readFileSync(pidFile, "utf8"));
  assert.ok(tasks.busy);
  assert.equal(tasks.killAll(), 1);
  assert.equal(t.status, "failed");
  assert.ok(!tasks.busy);
  await until(() => !alive(grandchild));
  assert.ok(!alive(grandchild));
});

test("a task that finishes normally completes and runs its completion step", async () => {
  const dir = fresh();
  const tasks = new DesktopTasks(() => 60_000);
  const t = task("t3");
  let completed = false;
  tasks.start(t, process.execPath, ["-e", "console.log('frame 5 / 10')"], dir, process.env, async () => {
    completed = true;
  });
  await until(() => t.status !== "running");
  assert.equal(t.status, "complete");
  assert.ok(completed);
});

test("stale launch-video-work folders are swept at startup", () => {
  const root = fresh();
  mkdirSync(join(root, "launch-video-work", "dead-task", "rendered"), { recursive: true });
  writeFileSync(join(root, "launch-video-work", "dead-task", "rendered", "frame.png"), "x");
  assert.equal(sweepLaunchWork(root), 1);
  assert.ok(!existsSync(join(root, "launch-video-work", "dead-task")));
  assert.equal(sweepLaunchWork(fresh()), 0, "no folder at all is fine");
});
