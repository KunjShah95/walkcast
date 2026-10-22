import assert from "node:assert/strict";
import { test } from "node:test";
import { costSummary } from "../packages/core/src/lab/experiment.ts";
import type { ReplaySummary } from "../packages/core/src/lab/fixture.ts";
import type { RunResult } from "../packages/core/src/lab/runner.ts";

/** Only the fields costSummary reads. */
const run = (mode: "live" | "replay", input: number, output: number, calls: number) =>
  ({ durationMs: 10, modelCalls: calls, model: { mode, inputTokens: input, outputTokens: output } }) as unknown as RunResult;

const trial = (calls: number, input = 0, output = 0) =>
  ({ durationMs: 5, modelCalls: calls, liveInputTokens: input, liveOutputTokens: output }) as unknown as ReplaySummary["trials"][number];

test("live tokens from replay trials are part of the experiment's cost, not just phase-1 runs", () => {
  const cost = costSummary(
    [run("live", 300, 120, 4), run("replay", 999, 999, 2)],
    [
      { trials: [trial(2), trial(3, 40, 15)] } as unknown as ReplaySummary,
      { trials: [trial(1, 5, 2)] } as unknown as ReplaySummary,
    ],
  );
  // 300 + 0 from the runs (a replay run's recorded tokens were never spent), 40 + 5 from replays.
  assert.equal(cost.liveInputTokens, 345);
  assert.equal(cost.liveOutputTokens, 137);
  assert.equal(cost.modelCalls, 4 + 2 + 2 + 3 + 1);
  assert.equal(cost.agentRuns, 5);
});

test("summaries written before replay usage was recorded still add up", () => {
  const cost = costSummary([run("live", 10, 4, 1)], [{ trials: [trial(1)] } as unknown as ReplaySummary]);
  assert.equal(cost.liveInputTokens, 10);
  assert.equal(cost.liveOutputTokens, 4);
});
