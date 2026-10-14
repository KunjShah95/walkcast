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

> **Status: v0.2.** The harness is validated on deterministic scripted agents (`results/`). The
> Stagehand v4 LLM agent and the multi-provider gateway are built and tested end to end against a
> scripted stand-in model and a mock provider server. **No live-model experiment has been run yet**
> (no API keys in the build environment), so no claim about any model's behaviour is made.

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
| Cause | `stale-observation`, `navigation-timeout`, `unsafe-retry`, `action-failed`, `auth-lost`, `locator-not-found`, `app-dropped-field`, `app-error` | Deterministic trace rules |
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
| LLM agent integration | ✅ Model-driven tool loop + Stagehand v4 `act()`; record/replay of every model call; 15 provider routes |

## LLM agent: Claude-style tool loop + Stagehand v4

`sh-p0` / `sh-p1` are real LLM agents in the shape Browserbase recommends for Stagehand v4
(v4 removed `agent()`): a model runs the loop and picks a tool (`navigate`, `read_page`, `act`,
`done`); `act("type Jane Roe into the Contact name field")` is executed by Stagehand, whose own
element-resolution calls also go through the lab via Stagehand's `ClientLLM` hook.

| Agent | Prompt |
|---|---|
| `sh-p0` | Neutral baseline prompt |
| `sh-p1` | Adds verification and safe-retry guidance (the "prompt fix" to regression-test) |

**Every model call goes through one gateway** (`src/llm/gateway.ts`), in one of three modes:

| Mode | What happens | Use |
|---|---|---|
| `live` | Calls the selected provider(s); records request and response to `model-calls.jsonl` | New runs; pass^k for prompt or model changes |
| `replay` | Returns the recorded responses in order; Stagehand element ids are remapped by accessibility-tree line; prompt drift is detected and reported | Exact, $0 reproduction of a failure (default when re-running the fixture's own agent) |
| `scripted` | Deterministic stand-in model | Testing the plumbing without keys (not evidence about any model) |

```sh
export LAB_CHROME_PATH=/path/to/chrome-for-testing/chrome   # Stagehand v4 needs a recent Chrome
npx @puppeteer/browsers install chrome@stable                # one way to get it
export ANTHROPIC_API_KEY=...                                 # or any provider below
npm run lab -- run --fault silent-owner-drop --agent sh-p0             # live, writes a fixture on failure
npm run lab -- replay fixtures/<id> --agent sh-p0 --trials 3           # replays recorded model calls: $0, exact
npm run lab -- replay fixtures/<id> --agent sh-p1 --trials 10          # live pass^k for the prompt fix
```

## Model providers

Pick models as `provider:model`, separately for the agent loop and for Stagehand's element
resolution, optionally as a comma-separated fallback chain:

```sh
npm run lab -- providers                                   # which keys are set
npm run lab -- check-model groq:openai/gpt-oss-120b        # smoke test: tool call + JSON schema
npm run lab -- run --fault gateway-timeout --agent sh-p0 \
  --agent-model anthropic:claude-opus-5-5 \
  --stagehand-model "groq:openai/gpt-oss-120b,openrouter:openai/gpt-oss-120b"
# or: LAB_AGENT_MODEL / LAB_STAGEHAND_MODEL
```

| Provider | id (aliases) | Key | Route |
|---|---|---|---|
| Anthropic Claude | `anthropic` (`claude`) | `ANTHROPIC_API_KEY` | Native Anthropic SDK, refusal fallbacks on (default model `claude-opus-5-5`) |
| OpenAI | `openai` | `OPENAI_API_KEY` | Chat Completions |
| Vercel AI Gateway | `vercel` (`ai-gateway`) | `AI_GATEWAY_API_KEY` | `https://ai-gateway.vercel.sh/v1`, models as `creator/model` |
| OpenRouter | `openrouter` | `OPENROUTER_API_KEY` | `https://openrouter.ai/api/v1` |
| Google Gemini | `gemini` (`google`) | `GEMINI_API_KEY` | OpenAI-compatibility endpoint |
| Groq | `groq` | `GROQ_API_KEY` | `https://api.groq.com/openai/v1` |
| Mistral | `mistral` | `MISTRAL_API_KEY` | `https://api.mistral.ai/v1` |
| DeepSeek | `deepseek` | `DEEPSEEK_API_KEY` | JSON mode (no json_schema) |
| Hugging Face | `huggingface` (`hf`) | `HF_TOKEN` | Inference Providers router |
| xAI | `xai` (`grok`) | `XAI_API_KEY` | `https://api.x.ai/v1` |
| Together, Fireworks, Cerebras | `together`, `fireworks`, `cerebras` | `TOGETHER_API_KEY`, `FIREWORKS_API_KEY`, `CEREBRAS_API_KEY` | OpenAI-compatible |
| Ollama (local) | `ollama` | none | `http://localhost:11434/v1` |
| Anything else | `custom` (`litellm`) | `LAB_CUSTOM_API_KEY` | `LAB_CUSTOM_BASE_URL` (LiteLLM, vLLM, Azure OpenAI v1, ...) |

Any base URL can be overridden with `LAB_<PROVIDER>_BASE_URL`. The cassette format is the same
whatever the provider (Anthropic-shaped content blocks), so a fixture recorded with one model can
be replayed, or re-run live against another model to see whether it fixes the failure.
Structured output: `json_schema` first; if a model rejects it, the backend falls back to JSON mode
with the schema in the prompt and remembers that for later calls. The example model ids are
examples, not defaults; check each provider's model list.

## Dashboard and timeline viewer

```sh
npm run ui                       # builds, then serves http://127.0.0.1:4320 (read-only, local only)
npm run lab -- ui-export --out failure-lab.html --max-runs 40 --screenshot-runs 10
                                 # one self-contained HTML file with the data baked in (CI uploads one per run)
```

![Overview](docs/screenshots/overview.png)
![Run: agent said vs app recorded, diagnosis](docs/screenshots/run.png)
![Timeline (dark)](docs/screenshots/timeline-dark.png)

- **Overview:** how many runs failed and how many claimed success anyway. An agent × fault matrix
  (latest verdict per cell). A said/recorded quadrant comparing the agent's claim with the app's
  records. Cause frequencies, and recent runs.
- **Run timeline:** the agent's report beside the application's records and write ledger. The
  diagnosis, with each finding linking to its evidence steps. A flight strip drawing the whole run
  (steps, model calls, network, errors) on one time scale. Then the recording: every tool step with
  before/after page state, target identity checks, network and screenshots. Agent decisions are
  interleaved, and Stagehand's element resolution sits inside the `act()` step that asked for it.
  A scroll beam tracks your place in the run.
- **Fixtures** with copyable replay commands, and **Experiments** with detection, reproduction
  and the regression (pass^k) matrix.

The look is an instrument report on engineering graph paper: highlighter for evidence, red only for
failure, condensed display type, mono for data. Light and dark themes are both supported. Interaction
patterns follow Aceternity UI's idioms (sticky-header timeline with scroll beam, bento overview,
cursor spotlight cards), reimplemented here with Tailwind and Motion. Stack: Vite, React 19,
Tailwind 4, Motion; built to a single file.

## Lessons from building it (real failures of the harness itself)

- **Capture changed agent timing.** Snapshotting the page after a click (`page.title()` and
  `evaluate`) blocks while a navigation is pending, which stretched a 2 s timeout to 5.5 s and hid
  the race being tested. Snapshots are now bounded at 250 ms and recorded as `pending`.
- **Playwright's `click` waits for the navigation it triggers.** A slow submit surfaced as a click
  timeout and was misdiagnosed as "locator not found". Clicks now return immediately, and
  "locator not found" requires that the action had no network or DOM effect.
- **Replay drift detection found a race in the agent's own tool.** Stagehand's `act()` can return
  before the navigation it triggered has even started, so the tool reported `/login` on one run
  and `/leads/new` on the next. The agent saw different observations from identical actions.
  `act` now waits for no requests in flight and a stable URL (`waitForQuiet`) before reporting.
- **Stagehand v4 needs a recent Chrome.** It loads its runtime with `Extensions.loadUnpacked` over a
  CDP port, which Playwright 1.56's Chromium 141 rejects. Chrome for Testing 155 works.
- **Ignored action failures were invisible.** `act()` returned `success: false` for a dropdown, the
  agent submitted anyway and claimed success, and no rule explained it. That led to the new
  `action-failed` rule.
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
dashboard/      Dashboard and timeline viewer (React); src/ui/ serves and exports it
docs/           Research assessment
```

## Limits

- Fixtures reproduce failures in **an application you control**. Arbitrary production sessions on
  third-party sites can't be reproduced exactly; see `docs/ASSESSMENT.md` §8.
- Request bodies and tool arguments are redacted by key name (`password`, `token`, `cookie`, …).
  That isn't a general-purpose PII redactor.
- The agents are scripts. Measured numbers in `results/` validate the harness, not any model.
