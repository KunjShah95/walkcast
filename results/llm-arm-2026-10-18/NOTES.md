# Live-LLM arm, first run (2026-10-18)

Command:

```sh
walkcast experiment --scenarios singles --baseline sh-p0 --candidates sh-p1 --seeds 1 --trials 3 \
  --model-mode live --agent-model openrouter:anthropic/claude-sonnet-5 \
  --stagehand-model openrouter:anthropic/claude-haiku-4.5 --out results/llm-arm-2026-10-18
```

Live spend: 244,426 input / 9,010 output tokens over 626 model calls (25 runs; fixture replays are $0).

How to read it:

- **One seed per scenario.** Every rate has a wide interval. This is a first look at LLM-agent
  behaviour under the six faults, not a benchmark. Re-run with `--seeds 5` or more before quoting
  numbers.
- **sh-p0 handled stale-owners and gateway-timeout** (no false success, no duplicate write) and
  failed silent-owner-drop (honest-failure task: it claimed success against the oracle) and
  session-expiry (`auth-lost`).
- **The ui-drift failure is not agent behaviour.** Chrome's CDP connection dropped while the agent
  clicked "Create" (step 10: `CDP connection closed (close code 1006)`). The agent reported the
  crash honestly. The classifier at the time called it `unexplained`, and a fixture
  (`fixtures/ui-drift-s1-unexplained`) was saved from it. That fixture and its row in the
  regression table should be ignored. Since this run, the runner treats a lost browser as
  `agent-error` (an infrastructure failure, never saved as a fixture).
- **sh-p1 passing 9/9 fixture trials** comes from replays of sh-p0's fixtures with the sh-p1
  prompt. Replays use recorded model calls, so a different prompt drifts from the recording; the
  pass^k numbers are only meaningful for silent-owner-drop and session-expiry, and even there a
  live re-run of sh-p1 is the honest comparison.
