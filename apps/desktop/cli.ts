import "../../packages/core/src/env.ts";
import { mkdirSync, readdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { diagnose } from "../../packages/core/src/lab/classifier.ts";
import { writeRunReport } from "../../packages/core/src/lab/report.ts";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { FAULTS, TASK_FAULTS, TASK_IDS, allScenarios, isTaskId, normalizeScenario } from "../../packages/core/src/app/faults.ts";
import { startApp } from "../../packages/core/src/app/server.ts";
import { allAgents } from "../../packages/core/src/agents/registry.ts";
import type { GatewayMode } from "../../packages/core/src/llm/gateway.ts";
import { backendFor, defaultSelection, type ModelSelection } from "../../packages/core/src/llm/model-spec.ts";
import { PROVIDERS, apiKey, baseURL } from "../../packages/core/src/llm/providers.ts";
import { causes, symptoms } from "../../packages/core/src/lab/classifier.ts";
import { runExperiment } from "../../packages/core/src/lab/experiment.ts";
import { loadFixture, replayFixture, writeFixture } from "../../packages/core/src/lab/fixture.ts";
import { closeBrowser, runOnce } from "../../packages/core/src/lab/runner.ts";
import { exportDashboard, serveDashboard } from "./server/server.ts";
import { LabData } from "../../packages/core/src/data.ts";
import { compareRuns, type DiffReport } from "../../packages/core/src/lab/diff.ts";
import { spawnSync } from "node:child_process";
import { cpSync } from "node:fs";
import { SEED_LEADS, createLeadTask, requestedValues, taskById, type Task } from "../../packages/core/src/lab/task.ts";
import { recordSite } from "../../packages/core/src/record/site.ts";
import { Worker } from "../../packages/core/src/jobs/worker.ts";
import { createMedia } from "../../packages/core/src/media/store.ts";
import { log } from "../../packages/core/src/ops/log.ts";
import { PgStore, createStore, databaseUrl, migrate } from "../../packages/core/src/store/index.ts";

function untilSignal(): Promise<NodeJS.Signals> {
  return new Promise((resolve) => {
    process.once("SIGTERM", () => resolve("SIGTERM"));
    process.once("SIGINT", () => resolve("SIGINT"));
  });
}

const HELP = `Walkcast: narrated website walkthroughs and a failure lab for browser agents

Usage: npm run lab -- <command> [options]

Commands:
  list                                  List faults and agent versions
  app --fault <id> [--seed n] [--port p]  Serve MiniCRM for manual exploration (login demo / demo-pass)
  run --fault <id> --agent <id> [--task t] [--seed n] [--fixtures dir] [--screenshots] [--video]
      [--model-mode m] [--agent-model spec] [--stagehand-model spec]
                                        Run once; write trace + report; on failure save a fixture
                                        (default runs/_fixtures) and exit 1. Tasks: create-lead,
                                        reassign-lead, lookup-owner
  replay <fixtureDir> --agent <id> [--trials k] [--model-mode m]
                                        Re-run a fixture; exits 1 unless the agent passes every trial
  compare <fixturesDir> --agents v0,v1,v2 [--trials k]
                                        pass^k table for every fixture × agent; exits 1 on any failure
                                        of the last agent listed
  experiment [--task t] [--scenarios singles|pairs] [--baseline id] [--candidates a,b] [--seeds n]
      [--trials k] [--concurrency c] [--model-mode m] [--agent-model spec] [--stagehand-model spec] [--out dir]
                                        Full validation experiment (docs/ASSESSMENT.md §7). Writes
                                        summary.md with Wilson 95% intervals and the false-success rate.

  ui [--port 4320]                      The app server the desktop shell opens: accounts (email or Google)
                                        and the dashboard at /app over runs/, fixtures/, results/, recordings/.
                                        Env: LAB_SITE_URL (public origin), LAB_HOST, GOOGLE_CLIENT_ID,
                                        GOOGLE_CLIENT_SECRET, LAB_AUTH=on|off (default: sign-in only when
                                        LAB_HOST is not loopback)
                                        (build first: npm run ui:build, or just npm run ui)
  worker                                Run queued recordings and runs (scale these separately from the web
                                        service; needs SUPABASE_DB_URL so they share the queue)
  db migrate                            Apply supabase/migrations to SUPABASE_DB_URL (same as supabase db push)
  ui-export [--out file.html] [--max-runs n] [--screenshot-runs n] [--max-recordings n] [--lean]
                                        One self-contained HTML file with the data baked in
  diff <baselineRun> <candidateRun>     Align two runs' actions, find what broke, how pages changed, and
                                        the likely replacement for each broken element; exits 1 on breakage
  baseline save <runDir> --name n       Store a passing run as a baseline (baselines/n)
  check --against <baseline> --agent a --fault f
                                        Run, then diff against the baseline (workflow regression check)
  record --url <https://site> --i-am-authorized [--username u] [--password-env VAR] [--max-pages n]
                                        Sign in to a site you own or may test, browse its same-origin pages,
                                        and save a narrated MP4 (video + spoken narration + captions) under
                                        recordings/. Stops at CAPTCHA or 2FA. The password is read from the
                                        env var (default LAB_SITE_PASSWORD) and never written to disk.
  rediagnose [dirs...]                  Re-apply the current classifier rules to stored runs (default runs/)
  providers                             List model providers and whether their API key is set
  doctor                                Check environment: node, browsers, ffmpeg/flite, .env keys, and repository state
  check-model <provider:model>          Smoke-test a model on both channels (tool call + JSON schema)

Model selection (live mode): --agent-model and --stagehand-model take "provider:model", or a
comma-separated fallback chain ("groq:x,openrouter:y"). Env: LAB_AGENT_MODEL, LAB_STAGEHAND_MODEL.
Providers: anthropic (claude), openai, vercel (AI Gateway), openrouter, gemini, groq, mistral,
deepseek, huggingface (hf), xai (grok), together, fireworks, cerebras, ollama (local), custom
(any OpenAI-compatible URL via LAB_CUSTOM_BASE_URL).

Agents: v0/v1/v2 are scripted; sh-p0/sh-p1 are Claude + Stagehand v4 (need LAB_CHROME_PATH).
Model modes (Stagehand agents): live (any configured provider; see "providers"), replay
(recorded model calls, $0), scripted (deterministic stand-in for plumbing tests).
`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    fault: { type: "string" },
    agent: { type: "string", default: "v0" },
    agents: { type: "string", default: "v0,v1,v2" },
    "model-mode": { type: "string" },
    "agent-model": { type: "string" },
    "stagehand-model": { type: "string" },
    baseline: { type: "string", default: "v0" },
    candidates: { type: "string", default: "v1,v2" },
    seed: { type: "string", default: "1" },
    seeds: { type: "string", default: "5" },
    trials: { type: "string", default: "3" },
    concurrency: { type: "string", default: "3" },
    port: { type: "string" },
    "max-runs": { type: "string", default: "80" },
    "max-recordings": { type: "string", default: "1" },
    lean: { type: "boolean", default: false },
    fragment: { type: "boolean", default: false },
    "screenshot-runs": { type: "string" },
    scenarios: { type: "string", default: "singles" },
    task: { type: "string", default: "create-lead" },
    name: { type: "string" },
    url: { type: "string" },
    username: { type: "string" },
    "password-env": { type: "string", default: "LAB_SITE_PASSWORD" },
    "max-pages": { type: "string", default: "8" },
    "i-am-authorized": { type: "boolean", default: false },
    "pace-ms": { type: "string" },
    "against": { type: "string" },
    // New failures go to runs/_fixtures; pass --fixtures fixtures to add one to the committed CI gate.
    fixtures: { type: "string", default: join("runs", "_fixtures") },
    out: { type: "string" },
    screenshots: { type: "boolean", default: false },
    video: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

const [command, target] = positionals;
const runsDir = resolve("runs");

async function main(): Promise<number> {
  if (values.help || !command) {
    console.log(HELP);
    return 0;
  }
  switch (command) {
    case "list": {
      console.log("Faults (combine with +, e.g. --fault stale-owners+session-expiry):");
      for (const [id, f] of Object.entries(FAULTS)) console.log(`  ${id.padEnd(18)} ${f.description}`);
      console.log("\nTasks (--task):");
      for (const id of TASK_IDS) console.log(`  ${id.padEnd(14)} ${taskById(id).goal}  [faults: ${TASK_FAULTS[id].join(", ")}; ${allScenarios("pairs", id).length} scenarios]`);
      console.log(`\nBenchmark grid: ${TASK_IDS.reduce((n, id) => n + allScenarios("pairs", id).length, 0)} scenarios across ${TASK_IDS.length} tasks (control, single faults, every pair).`);
      console.log("\nAgents:");
      for (const a of allAgents()) console.log(`  ${a.id.padEnd(6)} [${a.kind}] ${a.description}`);
      return 0;
    }
    case "diff": {
      const [, a, b] = positionals;
      if (!a || !b) throw new Error("diff needs two run directories: diff <baseline> <candidate>");
      const report = diffDirs(a, b);
      printDiff(report);
      return report.broken.length || report.outcome.verdict[1] === "fail" ? 1 : 0;
    }
    case "baseline": {
      const [, sub, runDir] = positionals;
      if (sub !== "save" || !runDir || !values.name) throw new Error("usage: baseline save <runDir> --name <name>");
      const detail = new LabData().run(runDir);
      if (!detail) throw new Error(`No run at ${runDir}`);
      if (detail.summary.verdict !== "pass") throw new Error("A baseline must be a passing run.");
      const dest = join("baselines", values.name);
      if (existsSync(dest)) throw new Error(`${dest} already exists; choose another --name or delete it first.`);
      cpSync(runDir, dest, { recursive: true });
      console.log(`Saved baseline ${dest} (${detail.summary.agent} on ${detail.summary.fault}, ${detail.summary.steps} steps)`);
      return 0;
    }
    case "check": {
      const against = values.against;
      if (!against) throw new Error("check needs --against <baselineDir>, plus --agent and --fault for the new run");
      const fault = requireFault();
      const result = await runOnce({ fault, seed: Number(values.seed), agent: values.agent!, task: requireTask(), outDir: runsDir, ...(modelMode() ? { modelMode: modelMode() } : {}), ...(models() ? { models: models() } : {}) });
      const report = diffDirs(against, join("runs", result.runDir.split(/[\\/]/).pop()!));
      printDiff(report);
      return report.broken.length || report.outcome.verdict[1] === "fail" ? 1 : 0;
    }
    case "rediagnose": {
      // Re-apply the current classifier rules to stored recordings (trace + app state).
      const roots = positionals.slice(1).length ? positionals.slice(1) : ["runs"];
      let changed = 0;
      let total = 0;
      for (const root of roots) {
        for (const name of existsSync(root) ? readdirSync(root) : []) {
          const dir = join(root, name);
          const resultPath = join(dir, "result.json");
          if (!existsSync(resultPath)) continue;
          const result = JSON.parse(readFileSync(resultPath, "utf8"));
          const events = readFileSync(join(dir, "trace.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
          const before = JSON.stringify(result.diagnosis);
          const task: Task = result.task ?? createLeadTask();
          result.diagnosis = diagnose({
            events,
            oracle: result.oracle,
            ledger: result.appState?.ledger ?? [],
            leads: result.appState?.leads ?? [],
            expectation: result.expectation,
            requestedValues: requestedValues(task),
            agentError: result.agentError ?? null,
          });
          total++;
          if (JSON.stringify(result.diagnosis) !== before) {
            changed++;
            writeFileSync(resultPath, JSON.stringify(result, null, 2));
            writeRunReport({ ...result, runDir: dir }, events, task);
            console.log(`${name}: ${JSON.parse(before).verdict} -> ${result.diagnosis.verdict}`);
          }
        }
      }
      console.log(`Re-diagnosed ${total} runs; ${changed} changed.`);
      return 0;
    }
    case "doctor": {
      console.log("Walkcast doctor — environment check");
      const major = Number(process.versions.node.split(".")[0]);
      console.log(`  Node ${process.versions.node}: ${major >= 22 ? "PASS" : "FAIL"} (need >=22)`);
      const envFile = ".env";
      console.log(`  .env: ${existsSync(envFile) ? "present" : "missing — copy .env.example => .env"}`);
      const apiKeys = ["ANTHROPIC_API_KEY","OPENAI_API_KEY","OPENROUTER_API_KEY","GROQ_API_KEY","AI_GATEWAY_API_KEY","GEMINI_API_KEY","MISTRAL_API_KEY","DEEPSEEK_API_KEY","XAI_API_KEY","HF_TOKEN","TOGETHER_API_KEY","FIREWORKS_API_KEY","CEREBRAS_API_KEY"];
      console.log("  AI provider keys:");
      for (const key of apiKeys) {
        console.log(`    ${key.padEnd(22)} ${process.env[key]?.trim() ? "set" : "empty"}`);
      }
      const chromePath = process.env.LAB_CHROME_PATH;
      console.log(`  LAB_CHROME_PATH: ${chromePath ? (existsSync(chromePath) ? "ok (" + chromePath + ")" : "path set but missing: " + chromePath) : "unset (Stagehand uses playwright chromium)"}`);
      const playwrightCache = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "ms-playwright") : undefined;
      console.log(`  Playwright cache: ${playwrightCache && existsSync(playwrightCache) ? "present" : "missing — run npx playwright install chromium"}`);
      const ffmpegBin = process.env.LAB_FFMPEG || "ffmpeg";
      const ffprobe = process.env.LAB_FFPROBE || "ffprobe";
      const filterProbe = spawnSync(ffmpegBin, ["-hide_banner","-filters"], { encoding: "utf8" });
      const encProbe = spawnSync(ffmpegBin, ["-hide_banner","-encoders"], { encoding: "utf8" });
      const hasFlite = filterProbe.status === 0 && /\bflite\b/.test(filterProbe.stdout || "") && /libx264/.test(encProbe.stdout || "");
      console.log(`  ffmpeg: ${filterProbe.status === 0 ? "present" : "missing"} (${ffmpegBin})`);
      console.log(`  flite voice + libx264: ${hasFlite ? "ready (narration OK)" : "MISSING (captions only)"}`);
      const gitInfo = spawnSync("git", ["status","--porcelain"], { cwd: process.cwd(), encoding: "utf8" });
      const dirty = gitInfo.status === 0 ? gitInfo.stdout.split(/\r?\n/).filter(Boolean).length : 0;
      console.log(`  repo dirty files: ${dirty} (WIP is expected; not an error)`);
      if (major < 22) return 1;
      return 0;
    }
    case "providers": {
      console.log("Provider       Key        Endpoint / notes");
      for (const p of Object.values(PROVIDERS)) {
        const key = apiKey(p) ? "set" : p.keyOptional ? "optional" : "missing";
        console.log(`  ${p.id.padEnd(12)} ${key.padEnd(9)} ${p.kind === "anthropic" ? "Anthropic SDK" : (baseURL(p) ?? `set LAB_${p.id.toUpperCase()}_BASE_URL`)}  (env: ${p.apiKeyEnv.join(" | ")}; e.g. ${p.id}:${p.exampleModel})`);
      }
      const d = defaultSelection();
      console.log(`\nCurrent selection: agent=${d.agent} stagehand=${d.stagehand}`);
      return 0;
    }
    case "check-model": {
      if (!target) throw new Error("check-model needs a spec, e.g. groq:openai/gpt-oss-120b");
      return checkModel(target);
    }
    case "ui": {
      // Sign-in guards a server other machines can reach. Bound to loopback (the default, and how
      // the desktop app runs) nobody else can, so it opens straight to the dashboard.
      // LAB_AUTH=on or LAB_AUTH=off overrides either way.
      const host = process.env.LAB_HOST ?? "127.0.0.1";
      const local = ["127.0.0.1", "localhost", "::1"].includes(host);
      const requireAuth = process.env.LAB_AUTH ? process.env.LAB_AUTH !== "off" : !local;
      const server = await serveDashboard(Number(values.port ?? process.env.PORT ?? 4320), { requireAuth });
      console.error(`Walkcast: dashboard at ${server.url}/app`);
      // ECS sends SIGTERM on deploy/scale-in and waits stopTimeout before SIGKILL.
      await untilSignal();
      await server.close(Number(process.env.LAB_SHUTDOWN_GRACE_MS ?? 25_000));
      return 0;
    }
    case "worker": {
      // A queue worker on its own (the web service then runs with LAB_WORKER=off).
      process.env.LAB_WARM_BROWSER = process.env.LAB_WARM_BROWSER || "1";
      const store = createStore(process.cwd());
      if (store.kind === "file") console.error("Note: with the local file store a separate worker can't share the web server's queue; set SUPABASE_DB_URL.");
      const worker = new Worker({ store, media: createMedia(process.cwd()), root: process.cwd() }).start();
      log.info("worker.started", { id: worker.id, store: store.kind });
      await untilSignal();
      await worker.stop(Number(process.env.LAB_SHUTDOWN_GRACE_MS ?? 90_000));
      await store.close();
      return 0;
    }
    case "db": {
      if (target !== "migrate") throw new Error("usage: lab db migrate");
      const url = databaseUrl();
      if (!url) throw new Error("Set SUPABASE_DB_URL (or DATABASE_URL) to your Supabase Postgres connection string.");
      const store = new PgStore(url, { max: 1 });
      const applied = await migrate(store, (line) => console.log(line));
      console.log(applied.length ? `Applied ${applied.length} migration(s).` : "Database is up to date.");
      await store.close();
      return 0;
    }
    case "ui-export": {
      const out = resolve(values.out ?? "walkcast.html");
      const r = exportDashboard({
        out,
        maxRuns: Number(values["max-runs"]),
        screenshots: !values.lean,
        fragment: values.fragment,
        recordings: Number(values["max-recordings"]),
        ...(values["screenshot-runs"] ? { screenshotRuns: Number(values["screenshot-runs"]) } : {}),
      });
      console.log(`Wrote ${r.path}: ${r.runs} runs, ${(r.bytes / 1024 / 1024).toFixed(1)} MB`);
      return 0;
    }
    case "record": {
      if (!values.url) throw new Error("record needs --url");
      if (!values["i-am-authorized"]) {
        console.error("Only record sites you own or are authorized to test. Re-run with --i-am-authorized to confirm.");
        return 2;
      }
      const password = process.env[values["password-env"]!];
      if (values.username && !password) console.warn(`No password in $${values["password-env"]}; sign-in will try the username only.`);
      const r = await recordSite({
        url: values.url,
        ...(values.username ? { username: values.username } : {}),
        ...(password ? { password } : {}),
        maxPages: Number(values["max-pages"]),
        authorized: true,
        outDir: resolve("recordings"),
        ...(values["pace-ms"] ? { paceMs: Number(values["pace-ms"]) } : {}),
      });
      console.log(`sign-in: ${r.signIn.outcome}${r.signIn.attempted ? ` — ${r.signIn.detail}` : ""}`);
      for (const p of r.pages) console.log(`  ${p.status ?? "   "}  ${p.url}  "${p.title}"`);
      if (r.skipped.length) console.log(`skipped ${r.skipped.length}: ${r.skipped.slice(0, 5).map((s) => s.url).join(", ")}`);
      console.log(`media: ${r.media.note}`);
      console.log(`recording: ${join(r.dir, r.media.mp4 ?? r.media.video ?? "recording.json")}`);
      return r.signIn.attempted && r.signIn.outcome !== "signed-in" ? 1 : 0;
    }
    case "app": {
      const fault = requireFault();
      const task = requireTask();
      const app = await startApp({ fault, seed: Number(values.seed), port: Number(values.port ?? 4310), task: task.id, seedLeads: SEED_LEADS });
      console.log(`MiniCRM (fault=${fault}, seed=${values.seed}) at ${app.url}  — login demo / demo-pass`);
      await new Promise(() => undefined);
      return 0;
    }
    case "run": {
      const fault = requireFault();
      const task = requireTask();
      const result = await runOnce({
        fault,
        seed: Number(values.seed),
        agent: values.agent!,
        task,
        outDir: runsDir,
        screenshots: values.screenshots,
        video: values.video,
        ...(modelMode() ? { modelMode: modelMode() } : {}),
        ...(models() ? { models: models() } : {}),
      });
      console.log(`${result.diagnosis.verdict.toUpperCase()}  symptoms=[${symptoms(result.diagnosis).join(", ")}] causes=[${causes(result.diagnosis).join(", ")}]`);
      console.log(`report: ${join(result.runDir, "report.md")}`);
      if (result.agentError) {
        console.log(`agent error: ${result.agentError}  (no fixture saved: this is a harness/infra failure, not agent behaviour)`);
        return 1;
      }
      if (result.diagnosis.verdict === "fail") {
        mkdirSync(values.fixtures!, { recursive: true });
        const fixture = await writeFixture(result, task, resolve(values.fixtures!));
        console.log(`fixture: ${fixture.dir}`);
        return 1;
      }
      return 0;
    }
    case "replay": {
      if (!target) throw new Error("replay needs a fixture directory");
      const summary = await replayFixture(loadFixture(target), values.agent!, Number(values.trials), runsDir, replayOptions());
      printReplay(summary);
      return summary.passAll ? 0 : 1;
    }
    case "compare": {
      if (!target) throw new Error("compare needs a fixtures directory");
      const dirs = readdirSync(target).map((d) => join(target, d)).filter((d) => existsSync(join(d, "manifest.json")));
      const agents = values.agents!.split(",");
      let gateFailed = false;
      for (const dir of dirs) {
        for (const agent of agents) {
          const summary = await replayFixture(loadFixture(dir), agent, Number(values.trials), runsDir, replayOptions());
          printReplay(summary);
          if (agent === agents.at(-1) && !summary.passAll) gateFailed = true;
        }
      }
      return gateFailed ? 1 : 0;
    }
    case "experiment": {
      const out = resolve(values.out ?? join("results", new Date().toISOString().replace(/[:.]/g, "-")));
      await runExperiment({
        seeds: Number(values.seeds),
        trials: Number(values.trials),
        concurrency: Number(values.concurrency),
        scenarios: values.scenarios === "pairs" ? "pairs" : "singles",
        task: requireTask().id,
        baseline: values.baseline!,
        candidates: values.candidates!.split(","),
        ...(modelMode() ? { modelMode: modelMode() } : {}),
        ...(models() ? { models: models() } : {}),
        outDir: out,
      });
      return 0;
    }
    default:
      console.error(`Unknown command '${command}'.\n${HELP}`);
      return 2;
  }
}

function modelMode(): GatewayMode | undefined {
  const mode = values["model-mode"];
  if (mode === undefined) return undefined;
  if (mode !== "live" && mode !== "replay" && mode !== "scripted") throw new Error("--model-mode must be live, replay or scripted");
  return mode;
}

function replayOptions() {
  const mode = modelMode();
  return { ...(mode ? { modelMode: mode } : {}), ...(models() ? { models: models() } : {}) };
}

/** --agent-model / --stagehand-model, falling back to LAB_* env vars and then Claude. */
function models(): ModelSelection | undefined {
  if (!values["agent-model"] && !values["stagehand-model"]) return undefined;
  const defaults = defaultSelection();
  const agent = values["agent-model"] ?? defaults.agent;
  return { agent, stagehand: values["stagehand-model"] ?? values["agent-model"] ?? defaults.stagehand };
}

/** Two small live calls: one agent turn that must call a tool, one schema-constrained Stagehand-style call. */
async function checkModel(spec: string): Promise<number> {
  const backend = backendFor(spec);
  let ok = true;
  try {
    const started = Date.now();
    const r = await backend.agent({
      system: "You are testing tool calling. Call the done tool.",
      tools: [{ name: "done", description: "Finish.", input_schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false } }],
      messages: [{ role: "user", content: "Call done with ok=true." }],
    });
    const call = r.content.find((b) => b.type === "tool_use");
    console.log(`agent channel:     ${call ? "tool call OK" : "NO tool call"} (${r.stop_reason}, ${Date.now() - started} ms, model ${r.model})`);
    ok &&= Boolean(call);
  } catch (error) {
    ok = false;
    console.log(`agent channel:     FAILED ${(error as Error).message.split("\n")[0]}`);
  }
  try {
    const started = Date.now();
    const r = await backend.stagehand({
      messages: [{ role: "user", content: { type: "text", text: "instruction: find the Save button\nAccessibility Tree:\n[0-1] RootWebArea: Test\n  [0-7] button: Save" } }],
      systemPrompt: "Return the element that matches the instruction.",
      responseFormat: {
        type: "json_schema",
        name: "Observation",
        schema: { type: "object", properties: { elementId: { type: "string" } }, required: ["elementId"], additionalProperties: false },
      },
    });
    const structured = r.outputFormat === "json_schema" ? r.structuredContent : null;
    const correct = JSON.stringify(structured).includes("0-7");
    console.log(`stagehand channel: ${correct ? "structured output OK" : "unexpected output"} ${JSON.stringify(structured)} (${Date.now() - started} ms)`);
    ok &&= correct;
  } catch (error) {
    ok = false;
    console.log(`stagehand channel: FAILED ${(error as Error).message.split("\n")[0]}`);
  }
  return ok ? 0 : 1;
}

function diffDirs(a: string, b: string): DiffReport {
  const data = new LabData();
  const base = data.run(a);
  const cand = data.run(b);
  if (!base) throw new Error(`No run at ${a}`);
  if (!cand) throw new Error(`No run at ${b}`);
  return compareRuns({ result: base.result, events: base.events }, { result: cand.result, events: cand.events });
}

function printDiff(r: DiffReport): void {
  console.log(`baseline  ${r.baseline.agent} on ${r.baseline.fault}: ${r.baseline.verdict}`);
  console.log(`candidate ${r.candidate.agent} on ${r.candidate.fault}: ${r.candidate.verdict}`);
  console.log(`\n${r.summary}\n`);
  for (const b of r.broken) {
    console.log(`BROKEN step ${b.stepId}: ${b.target}${b.error ? `  (${b.error})` : ""}`);
    if (b.was) console.log(`  was:        ${b.was.role} "${b.was.name}" ${b.was.selector}`);
    if (b.suggestion) console.log(`  try:        ${b.suggestion.control.role} "${b.suggestion.control.name}" ${b.suggestion.control.selector}  (${b.suggestion.reason})`);
  }
  for (const p of r.pages) {
    console.log(`PAGE ${p.path}`);
    for (const x of p.renamed) console.log(`  ~ ${x.from.role} "${x.from.name}" ${x.from.selector}  ->  "${x.to.name}" ${x.to.selector}  [by ${x.by}]`);
    for (const x of p.removed) console.log(`  - ${x.role} "${x.name}" ${x.selector}`);
    for (const x of p.added) console.log(`  + ${x.role} "${x.name}" ${x.selector}`);
  }
}

function requireTask(): Task {
  const id = values.task ?? "create-lead";
  if (!isTaskId(id)) throw new Error(`--task must be one of: ${TASK_IDS.join(", ")}`);
  return taskById(id);
}

function requireFault() {
  if (!values.fault) throw new Error(`--fault is required: one of ${Object.keys(FAULTS).join(", ")}, or several joined with "+"`);
  return normalizeScenario(values.fault);
}

function printReplay(s: Awaited<ReturnType<typeof replayFixture>>): void {
  const causesSeen = [...new Set(s.trials.flatMap((t) => t.causes))];
  console.log(
    `${s.passAll ? "PASS" : "FAIL"}  ${s.fixture.padEnd(42)} agent=${s.agent} pass=${s.passes}/${s.trials.length} reproduced=${s.reproduced}/${s.trials.length}` +
      (causesSeen.length ? ` causes=[${causesSeen.join(", ")}]` : "") +
      (s.modelMode ? ` model=${s.modelMode} calls=${s.trials.reduce((n, t) => n + t.modelCalls, 0)}` : "") +
      (s.environmentDrift.length ? ` DRIFT: ${s.environmentDrift.join("; ")}` : ""),
  );
}

main()
  .then(async (code) => {
    await closeBrowser();
    process.exitCode = code;
  })
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    await closeBrowser();
    process.exitCode = 2;
  });
