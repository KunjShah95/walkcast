# The regression gate

A fixture is a failure you can reproduce. The gate is what keeps it fixed: it replays every
fixture and fails when one that used to pass stops passing.

```bash
npm run lab -- ci fixtures --agents v1 --trials 3
```

That exits 0 when nothing regressed and 1 when something did, so it drops straight into a
pipeline. `--out gate.json` writes the machine-readable result; `--json` prints it.

## What the gate remembers

A file next to the fixtures — `fixtures/baseline.json` — says what each fixture did last
time:

```json
{
  "ui-drift-s1-locator-not-found@v1": {
    "agent": "v1",
    "verdict": "pass",
    "trials": 3,
    "updatedAt": "2026-10-20T10:00:00.000Z"
  }
}
```

`--update` writes it after a run. The key is the fixture and the agent, because the same
fixture is expected to behave differently for different agents.

## The rules

| The baseline says | The run says | The gate |
|---|---|---|
| pass | fail | **regression** — the build fails |
| pass | pass | fine |
| fail | fail | a known failure — reported, the build holds |
| fail | pass | a fix — reported, so the baseline can be updated |
| nothing | pass | a new fixture that works |
| nothing | fail | a new broken fixture — the build fails |

A fixture that was already broken does not fail the build. It is already red, and a gate
that is always red is a gate people learn to ignore. What fails the build is the thing a
person can act on: something that used to work and no longer does.

## In a pull request

`.github/workflows/regression-gate.yml` runs the gate on every pull request, writes the
result to the job summary, and comments the table on the pull request. Copy it into your
own repository, point it at your fixtures, and change the agent.

The scripted agents (`v0`, `v1`, `v2`) need no browser and no model key, so the gate runs
in a plain CI runner. A stagehand agent (`sh-p0`, `sh-p1`) needs Chromium and a provider
key: install the browser in the workflow and pass `--model-mode replay` to replay the
model calls recorded with the fixture, which keeps the run free and deterministic.
