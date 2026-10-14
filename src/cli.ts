import { mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { FAULTS, isFaultId } from "./app/faults.ts";
import { startApp } from "./app/server.ts";
import { AGENTS } from "./agents/scripted.ts";
import { causes, symptoms } from "./lab/classifier.ts";
import { runExperiment } from "./lab/experiment.ts";
import { loadFixture, replayFixture, writeFixture } from "./lab/fixture.ts";
import { closeBrowser, runOnce } from "./lab/runner.ts";
import { createLeadTask } from "./lab/task.ts";

const HELP = `Browser Agent Failure Lab

Usage: npm run lab -- <command> [options]

Commands:
  list                                  List faults and agent versions
  app --fault <id> [--seed n] [--port p]  Serve MiniCRM for manual exploration
  run --fault <id> --agent <id> [--seed n] [--fixtures dir] [--screenshots] [--video]
                                        Run once; write trace + report; save a fixture if it fails
  replay <fixtureDir> --agent <id> [--trials k]
                                        Re-run a fixture; exits 1 unless the agent passes every trial
  compare <fixturesDir> --agents v0,v1,v2 [--trials k]
                                        pass^k table for every fixture × agent; exits 1 on any failure
                                        of the last agent listed
  experiment [--seeds n] [--trials k] [--concurrency c] [--out dir]
                                        Full validation experiment (docs/ASSESSMENT.md §7)
`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    fault: { type: "string" },
    agent: { type: "string", default: "v0" },
    agents: { type: "string", default: "v0,v1,v2" },
    seed: { type: "string", default: "1" },
    seeds: { type: "string", default: "5" },
    trials: { type: "string", default: "3" },
    concurrency: { type: "string", default: "3" },
    port: { type: "string", default: "4310" },
    fixtures: { type: "string", default: "fixtures" },
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
      console.log("Faults:");
      for (const [id, f] of Object.entries(FAULTS)) console.log(`  ${id.padEnd(18)} ${f.description}`);
      console.log("\nAgents:");
      for (const a of Object.values(AGENTS)) console.log(`  ${a.id.padEnd(4)} ${a.description}`);
      return 0;
    }
    case "app": {
      const fault = requireFault();
      const app = await startApp({ fault, seed: Number(values.seed), port: Number(values.port) });
      console.log(`MiniCRM (fault=${fault}, seed=${values.seed}) at ${app.url}  — login demo / demo-pass`);
      await new Promise(() => undefined);
      return 0;
    }
    case "run": {
      const fault = requireFault();
      const task = createLeadTask();
      const result = await runOnce({
        fault,
        seed: Number(values.seed),
        agent: values.agent!,
        task,
        outDir: runsDir,
        screenshots: values.screenshots,
        video: values.video,
      });
      console.log(`${result.diagnosis.verdict.toUpperCase()}  symptoms=[${symptoms(result.diagnosis).join(", ")}] causes=[${causes(result.diagnosis).join(", ")}]`);
      console.log(`report: ${join(result.runDir, "report.md")}`);
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
      const summary = await replayFixture(loadFixture(target), values.agent!, Number(values.trials), runsDir);
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
          const summary = await replayFixture(loadFixture(dir), agent, Number(values.trials), runsDir);
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
        baseline: "v0",
        candidates: ["v1", "v2"],
        outDir: out,
      });
      return 0;
    }
    default:
      console.error(`Unknown command '${command}'.\n${HELP}`);
      return 2;
  }
}

function requireFault() {
  const fault = values.fault ?? "";
  if (!isFaultId(fault)) throw new Error(`--fault must be one of: ${Object.keys(FAULTS).join(", ")}`);
  return fault;
}

function printReplay(s: Awaited<ReturnType<typeof replayFixture>>): void {
  const causesSeen = [...new Set(s.trials.flatMap((t) => t.causes))];
  console.log(
    `${s.passAll ? "PASS" : "FAIL"}  ${s.fixture.padEnd(42)} agent=${s.agent} pass=${s.passes}/${s.trials.length} reproduced=${s.reproduced}/${s.trials.length}` +
      (causesSeen.length ? ` causes=[${causesSeen.join(", ")}]` : "") +
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
