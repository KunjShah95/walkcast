# Browser Agent Failure Lab

Turn a failed browser-agent run into a **classified, reproducible regression test** that checks
the application's real state, then use it to tell whether the next agent version fixed the bug
or broke something else.

This is not another browser agent, recorder or dashboard. The ecosystem already has those (see
[`docs/ASSESSMENT.md`](docs/ASSESSMENT.md)). The narrow bet:

1. **Before/after state on every action**, so a failure is pinned to the step that caused it.
2. **Ground truth from the application, not the agent's claim or an LLM judge**, which catches
   "reported success, did the wrong thing".
3. **Deterministic causes with cited evidence.** Anything the rules can't explain is marked
   `unexplained` for review rather than guessed.
4. **Failure → fixture → replay → pass^k across versions**, runnable as a CI release gate.

> **Status: v0.1, harness validated on scripted agents only.** The agents in `src/agents/` are
> deterministic scripts that reproduce known agent failure behaviours. They exist to prove that the
> capture, oracle, classifier and fixture loop work before spending tokens on an LLM agent. No claim
> about LLM agents is made yet.

## Quick start

```sh
npm ci
npx playwright install chromium         # skip if Chromium is already available
npm run lab -- list                     # faults and agent versions
npm run lab -- run --fault stale-owners --agent v0 --screenshots
#   FAIL  symptoms=[false-success] causes=[stale-observation]
#   report: runs/<id>/report.md      fixture: fixtures/stale-owners-s1-stale-observation
npm run lab -- replay fixtures/stale-owners-s1-stale-observation --agent v1 --trials 3
npm run lab -- compare fixtures --agents v0,v1,v2 --trials 3
npm run lab -- experiment --seeds 5 --trials 3        # full validation experiment
npm test                                               # unit + end-to-end tests
```

## How it works

```
 MiniCRM (src/app)           Agent under test (src/agents)
 seeded fault toggles  ◄──── acts only through BrowserTools (src/capture/tools.ts)
        │                             │  each call = one step: state before/after,
        │                             │  target identity check, network, console
        ▼                             ▼
 Oracle (src/lab/task.ts)     Trace (runs/<id>/trace.jsonl) + claim
 app state, never the agent   │
        └──────────┬──────────┘
                   ▼
       Classifier (src/lab/classifier.ts): symptoms + causes, each citing steps
                   │ fail
                   ▼
       Fixture (fixtures/<id>/manifest.json): task, fault, seed, timings, versions,
       expectation, original diagnosis  →  replay with any agent version, k trials
```

### Faults (the controlled application)

| Fault | Mechanism | Primary cause the classifier must find |
|---|---|---|
| `stale-owners` | The owner list re-sorts 300–1200 ms after load; index targets go stale | `stale-observation` |
| `gateway-timeout` | The write commits, then the gateway returns 504; a blind retry duplicates | `unsafe-retry` (+ `app-error`) |
| `silent-owner-drop` | The app ignores the owner field but shows a success toast; the task is impossible | `app-dropped-field` |
| `session-expiry` | The session dies between form load and submit | `auth-lost` |
| `ui-drift` | The submit button's id and label change | `locator-not-found` |
| `none` | Control | none (false-positive check) |

### Findings

| Kind | Labels | Basis |
|---|---|---|
| Symptom | `false-success`, `wrong-outcome`, `duplicate-action` | Application state (oracle) |
| Cause | `stale-observation`, `navigation-timeout`, `unsafe-retry`, `auth-lost`, `locator-not-found`, `app-dropped-field`, `app-error` | Deterministic trace rules |
| Cause | `unexplained` | No rule fired; needs human or LLM review |
| Incident | Any cause on a run that still passed | The agent recovered |

### Agent versions (for regression comparison)

| Version | Behaviour |
|---|---|
| `v0` | Naive: one observation, index targets, cached selector, blind retry, trusts the toast |
| `v1` | Fixed: waits for the DOM to settle, re-observes, targets by label, reads back before retrying, verifies the saved record, re-authenticates safely |
| `v2` | v1 with the read-back removed: a deliberate regression the suite must catch |

## Scope against the v0.1 plan

| Planned capability | Status |
|---|---|
| Playwright integration | ✅ All agent actions go through `BrowserTools` |
| Session timeline linking actions to page state | ✅ `report.md` per run: before/after URL and DOM fingerprint, network, target checks, optional screenshots (`--screenshots`) and video (`--video`) |
| Failure classifier with evidence | ✅ Deterministic rules; every finding cites steps |
| Reproducible test cases | ✅ Fixtures re-create the app, seed, fault and timings (controlled simulation, not network replay) |
| Before/after evaluation | ✅ `compare` / `experiment`: pass^k, duration, causes per agent version |
| Video narration | ⏸ Deferred, as agreed. When added, generate it from recorded events only. |
| LLM agent integration | ⏭ Next: record model I/O (`ModelCallEvent` is already in the trace schema) and replay recorded outputs |

## Lessons from building it (real failures of the harness itself)

- **Capture changed agent timing.** Snapshotting the page after a click (`page.title()` and
  `evaluate`) blocks while a navigation is pending, which stretched a 2 s timeout to 5.5 s and hid
  the race being tested. Snapshots are now bounded at 250 ms and recorded as `pending`.
- **Playwright's `click` waits for the navigation it triggers.** A slow submit surfaced as a click
  timeout and was misdiagnosed as "locator not found". Clicks now return immediately, and
  "locator not found" requires that the action had no network or DOM effect.
- **A retry during a pending navigation doesn't double-submit in Playwright.** Duplicates came from
  the realistic path instead: the backend commits, the gateway returns 504, and the agent retries.

## Layout

```
src/app/        MiniCRM test application and fault definitions
src/capture/    Recorder (trace on one clock, redaction) and BrowserTools (the agent's only interface)
src/agents/     Scripted agent versions v0/v1/v2
src/lab/        Task + oracle, classifier, runner, report, fixtures/replay, experiment
fixtures/       Committed regression fixtures (CI release gate)
results/        Experiment outputs (summary.md / summary.json; per-run traces are not committed)
docs/           Research assessment
```

## Limits

- Fixtures reproduce failures in **an application you control**. Arbitrary production sessions on
  third-party sites can't be reproduced exactly; see `docs/ASSESSMENT.md` §8.
- Request bodies and tool arguments are redacted by key name (`password`, `token`, `cookie`, …).
  That isn't a general-purpose PII redactor.
- The agents are scripts. Measured numbers in `results/` validate the harness, not any model.
