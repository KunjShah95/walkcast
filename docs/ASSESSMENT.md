# Browser Agent Failure Lab — Technical and Product Assessment

*Research date: 2026-10-14. Author: research pass for `kunjshah95/browser-user`.*

> **How to read the evidence labels**
>
> - **[Code]**: I read the source in a fresh clone of the repository at the commit given in
>   [Appendix A](#appendix-a-inspected-repositories). This is primary evidence.
> - **[Commit]**: a merged commit or PR description in that clone. This is primary evidence.
> - **[Search]**: a search-engine summary of a page I couldn't open. The session's network policy
>   blocked most vendor docs sites (docs.stagehand.dev, browserbase.com, laminar.sh, arxiv.org, and
>   others), but GitHub was reachable. Treat these as secondary and verify them before citing.
> - **[Hypothesis]**: my inference. It is not verified.
>
> No experiment has been run yet. This document contains **no measured results**.

---

## 1. Executive summary

**The broad "Failure Lab" as originally framed isn't defensible.** Every major piece of
capture → classify → replay → report → dashboard already ships somewhere, usually in more depth than
a new project could reach:

| Proposed piece | Already shipped by |
|---|---|
| Capture (DOM, screenshots, network, console, LLM I/O) | browser-use (HAR, video, history), Stagehand trajectory recorder, Browserbase session replay, Laminar spans synced to recordings |
| Failure classification | Skyvern's deterministic 20-category `FailureCategory` classifier; Stagehand's LLM rubric verifier with a 7-category error taxonomy and first-point-of-failure attribution; browser-use's `JudgementResult`; Laminar "Signals"; Transluce Docent |
| Replay | browser-use `rerun_history`; Stagehand action caching and self-heal; Skyvern explore→compiled-Playwright scripts; AgentLab `ReproducibilityAgent` (replays recorded LLM answers and diffs prompts) |
| Traces → regression datasets → CI gates | LangSmith, Braintrust, Laminar evals, Stagehand's regression evals on PRs (#2826) |

**One narrow gap is real, current, and documented by a maintainer-facing issue:**
*turning a browser-agent bug report into a deterministic, state-asserting regression fixture for
**state-changing** (`act()`-style) failures*.

- Stagehand issue [#2841](https://github.com/browserbase/stagehand/issues/2841) asks for exactly
  this: "fixture recorder to turn bug reports into deterministic repros".
- The first step merged on 2026-10-07 (PR #3105 / #3106, `34be780d`). It is a **static observation**
  recorder only. Its README says it "does not generate assertions or replay click handlers, fetches,
  navigation, authentication, or state transitions. Network response recording and bug-report
  automation are future work." It also notes that "there is no maintainer answer in that discussion
  yet." **[Code]** `packages/evals/tasks/README.md`
- The follow-up PR #3137 (migrate benchmarks to recorded tasks) keeps "frame-dependent and
  post-action evals" on live sites, and it wasn't merged at `1da73591` (2026-10-13). **[Search]** +
  **[Code]** (absent from `main`)
- In browser-use, recent fixes for exactly the failure classes in this brief shipped as prompt or
  code edits with **no regression test in the same commit**. **[Commit]**
  - #4403 and #4416: false "done" claims.
  - #4658: stale extraction after scroll, fixing #4631.
  - #4481: stale history on timeout.
- browser-use's end-to-end "agent tasks" CI runs against live sites (for example `amazon.com`) and is
  graded by an LLM judge. **[Code]** `tests/agent_tasks/`

**Recommendation: a conditional GO, narrowed to "contribute first, build second".** Build a small
TypeScript/Playwright harness that produces **interaction-tier regression fixtures** for state-changing
browser-agent failures. Each fixture contains:

- a controlled app with a seeded fault;
- the recorded LLM responses and network traffic;
- **independent assertions on the application's own state**, not on the agent's claim or on an LLM
  judge.

Validate it with the three-fault experiment in §7. If it works, upstream the fixture format as the
"dynamic tier" of Stagehand #2841 rather than launching a competing product. If the experiment shows
that existing LLM verifiers already catch these failures at least as well (see the kill criteria in §9
and §11), stop.

---

## 2. Current competitor capability matrix

Legend: ✅ shipped (primary evidence) · 🟡 partial or limited · ❌ not found · ❓ claimed, unverified

| Capability | browser-use (MIT) | Stagehand v4 (MIT) | Skyvern (AGPL-3.0) | BrowserGym + AgentLab (Apache-2.0) | Browserbase (SaaS) | Laminar (Apache-2.0) | LangSmith / Braintrust (SaaS) |
|---|---|---|---|---|---|---|---|
| LLM browser agent loop | ✅ `Agent` | ❌ **`agent()` removed in v4**; "code mode" or tool calling instead | ✅ tasks/workflows | ✅ GenericAgent (research) | — | — | — |
| Video / session recording | ✅ `record_video_dir` | via Browserbase | ✅ | 🟡 screenshots per step | ✅ | ✅ synced to spans ❓ | ❌ |
| Network capture (HAR) | ✅ `record_har_path` (CDP watchdog) | 🟡 Browserbase network view | ❓ | ❌ | ✅ | ❓ | ❌ |
| Playwright `trace.zip` | 🟡 `traces_dir` is declared in `BrowserProfile`, but I found no consumer in the code (likely a leftover from the CDP migration) | ❌ | ✅ (Playwright-based) | ❌ | ❓ | ❌ | ❌ |
| Per-step LLM I/O + action history | ✅ `AgentHistoryList`, `save_history` | ✅ trajectory recorder (#2131) | ✅ DB-backed steps/actions | ✅ exp dirs + AgentXray | 🟡 | ✅ | ✅ |
| Action replay | ✅ `rerun_history` (live site, element re-matching, redundant-retry skip) | ✅ act cache / self-heal; server cache (Browserbase only) | ✅ compiled scripts, "run with code", self-heal | ✅ `ReproducibilityAgent` (replays LLM answers, prompt diff) | — | 🟡 trace replay ❓ | ❌ |
| Deterministic **environment** for replay | ❌ live site | 🟡 static DOM snapshot only (#3106) | ❌ live site | ✅ self-hosted benchmark sites (WebArena etc.) | ❌ | ❌ | ❌ |
| Failure classification | 🟡 LLM judge: verdict, failure_reason, impossible_task, reached_captcha | ✅ LLM rubric verifier, 7-category taxonomy, first-point-of-failure (#2133) | ✅ **deterministic** 20-category classifier + copilot "suspicious success" diagnosis | 🟡 manual via AgentXray | ❌ | ✅ NL "Signals" | 🟡 custom evaluators |
| Independent outcome verification | 🟡 LLM judge (+ ground truth) | ✅ rubric verifier; fails closed on uncertainty (#2901) | ✅ validation blocks, completion verification | ✅ task-specific programmatic validators (benchmarks) | ❌ | 🟡 | 🟡 |
| Failure → regression test | ❌ (manual) | 🟡 static observations only (#3106); dynamic is "future work" | 🟡 scripts are regression artifacts for *its own* workflows | ❌ | ❌ | 🟡 datasets from traces | ✅ trace→dataset ❓(vendor-claimed one-click in Braintrust) |
| CI gate | 🟡 live-site LLM-judged tasks | ✅ regression evals on PRs (#2826) | — | — | — | ✅ evals in CI | ✅ |
| Repeated-trial reliability (pass^k) | ❌ | ✅ trials flag `-t` | — | ✅ seeds/studies | — | — | 🟡 |

Other tools in the landscape, all **[Search]** unless noted:

- **Playwright 1.56+ "test agents"** (planner, generator, healer). These write and heal conventional
  E2E tests. They don't test agents.
- **Momentic and QA Wolf**: AI-assisted E2E testing for apps.
- **Octomind**: reported shut down in 2026.
- **Transluce Docent**: transcript clustering and LLM-judge refinement.
- **REAL / agisdk**: deterministic clones of 11 sites with state checks.
- **WASP**: a prompt-injection benchmark on VisualWebArena.
- **τ-bench**: database-state grading plus the **pass^k** metric.
- **AgentRx, WebSuite, Who&When, TRAIL, AgentDebug, CatchBench**: academic failure taxonomies and
  attribution benchmarks.

---

## 3. Existing implementations that overlap with each proposed capability

| Proposed capability (§3 of brief) | Closest existing implementation | Overlap | Evidence |
|---|---|---|---|
| 1. Capture failed execution | browser-use `BrowserProfile(record_har_path, record_video_dir)`, `Agent.save_history`; Stagehand `TrajectoryRecorder` (screenshots, ARIA trees, tool outputs per step); Browserbase recordings | **High** | [Code] `browser_use/browser/profile.py:383-464`, `agent/service.py:3911`; [Commit] stagehand `e102a89c` |
| 2. Preserve state + metadata | AgentLab `Study` reproducibility dict (package versions, commit hash, benchmark version) | **High** for metadata, **low** for *app* state | [Code] AgentLab README §Reproducibility |
| 3. Classify failure | Skyvern `forge/failure_classifier.py` (rules for proxy/anti-bot/timeout/locator/auth...), `copilot/diagnosis_repair_contract.py` (`SUSPICIOUS_SUCCESS`); Stagehand `errorTaxonomy.ts` (Selection, Hallucination, Execution & Strategy, Critical Point, Unsolicited Side-Effect, ...) + `firstPointOfFailure` prompt; browser-use `JudgementResult` | **High** | [Code] skyvern `failure_classifier.py:16-36`; [Commit] stagehand `840aac8b` |
| 4. Reproduce in controlled env | AgentLab `ReproducibilityAgent` (mock chat model replays the conversation, diffs prompts); BrowserGym self-hosted sites; REAL clones; Stagehand static fixture recorder | **Medium**: replays the *model*, or freezes a *static page*; nobody freezes **application behaviour and server state** for a user's own failure | [Code] `agentlab/agents/generic_agent/reproducibility_agent.py`; stagehand `packages/evals/tasks/README.md` |
| 5. Generate minimal repro | Stagehand #3106 (manual setup script + static HTML); Skyvern script generation (full workflow, not minimal) | **Low–medium** | [Code] |
| 6. Run against modified prompt/model/framework | Stagehand evals (`-t` trials, model matrix, Braintrust experiments compare); Laminar/LangSmith/Braintrust datasets | **High** for *running*; **low** for *on a frozen, state-checked fixture* | [Code] stagehand `packages/evals/README.md` |
| 7. Fixed / regressed verdict | Stagehand regression eval gate on PRs; Braintrust/LangSmith CI gates | **Medium-high** | [Commit] stagehand `4d88741a` |
| 8. Evidence-based report | Stagehand verifier persists judge verdict + deterministic evidence gates, uncertainty fails closed; Skyvern `WorkflowVerificationEvidence` | **High** | [Commit] `d55f30ba`; [Code] skyvern `copilot/verification_evidence.py` |

**Conclusion:** the novel surface is narrow. It is the **controlled reproduction of state-changing
failures** (step 4) together with **assertions on application state** (steps 5 and 7). Classification,
capture, dashboards and LLM judging are commoditized.

---

## 4. Specific unresolved problems supported by evidence

| # | Problem | Evidence | Strength |
|---|---|---|---|
| P1 | A bug report can't easily become a deterministic repro. Stagehand's maintainers restored PR regression evals, then opened a request for a fixture recorder. Only the static tier exists. | Issue #2841, PR #3105/#3106 README: dynamic `act()` regressions need "network recordings"; "no maintainer answer in that discussion yet"; "bug-report automation [is] future work" | **Strong** (primary, current: 2026-10-07) |
| P2 | Post-action and frame-dependent evals remain on live sites. | PR #3137 description **[Search]**; not on `main` at 2026-10-13 **[Code]** | Medium |
| P3 | False "task complete" claims are a recurring defect class, fixed by prompt edits without regression tests. | browser-use #4403 "prevent compaction hallucination" and #4416 "better data grounding in done action". Both touch only prompts and `views.py`, with no test files in the diff. **[Commit]** `4106186b`, `04099c97` | Strong (that it happens); medium (that the missing test is a *problem* to maintainers [Hypothesis]) |
| P4 | Stale observations after DOM change are a recurring defect class. | browser-use #4631 → #4658 "clear dom cache after scroll to prevent stale extract data" (7-line fix, no test); #4480 → #4481 stale history on timeout **[Commit]** | Strong |
| P5 | Live-site replay isn't a regression test. browser-use `rerun_history` re-executes against the current live site with element re-matching, retries, and an explicit "redundant retry" heuristic, because the original run's double-clicks may not be needed on replay. | [Code] `agent/service.py:3103-3200` | Strong (design fact) |
| P6 | browser-use's CI end-to-end tasks hit live third-party sites with LLM grading (for example "Go to amazon.com... return the first result"). These are inherently nondeterministic. | [Code] `tests/agent_tasks/amazon_laptop.yaml`, README | Strong |
| P7 | Agent self-reports are unreliable evidence of outcomes. One practitioner reports 160 browser-agent runs in which every failure was reported as success. | EA Forum post **[Search]**; Stagehand #2901 preserves `agentReportedSuccess` separately from verified outcome **[Commit]** | Medium (anecdote) + strong (vendors design around it) |
| P8 | Reproducibility is acknowledged as unsolved by framework authors. | AgentLab README "Factors affecting reproducibility": live sites, silent API-model changes, stochastic agents **[Code]**; TinyFish newsletter claims browser-use lists "reproducibility" as an open problem on its hiring page **[Search, unverified]** | Medium |
| P9 | Prompt injection from page content is real and benchmarked, but it's a separate research area. | WASP (agents begin injected instructions 16–86% of the time, complete the attacker goal 0–17%) **[Search]**; Brave's Comet disclosures **[Search]** | Strong, but out of scope for an MVP |

What I did **not** find: maintainer complaints that *classification* or *dashboards* are missing.
**[Hypothesis]**: the market already treats those as solved.

---

## 5. Proposed differentiation and why users would care

**Narrowed thesis:** *"pytest fixtures for browser-agent bugs."* Given a failed run, produce a
self-contained, offline, deterministic test that:

1. **Reproduces** the failure against a controlled application. This is a local app or a
   network-recorded app, with seeded server state and an explicit **fault toggle** for timing,
   duplicate or wrong-outcome behaviour.
2. **Asserts on ground truth**, not on agent claims. It inspects the app's own state, for example
   `SELECT owner FROM leads WHERE id=?` or `count(POST /leads) == 1`. This is the τ-bench / REAL idea
   (grading by final database state) applied to a *user's own* failure rather than to a fixed
   benchmark.
3. **Runs in two replay modes:**
   - **Recorded-LLM mode** feeds back the recorded model responses, so the run is fully
     deterministic. It catches *framework and app* regressions, such as a DOM serializer or cache
     bug. AgentLab's `ReproducibilityAgent` and Stagehand's `ClientLLM` in the #3106 test both prove
     the approach.
   - **Live-LLM mode runs k trials** and reports **pass^k**. It catches *prompt and model*
     regressions, and states the result as a probability rather than a single verdict.
4. **Diffs** the observations and prompts between the original and the replay. This localizes the first point of divergence. AgentLab
   already does this for prompts.

**Who cares** **[Hypothesis, to validate]**:

- Framework maintainers, who need regression tests for agent-behaviour bugs (P1, P3, P4).
- Teams running production browser automations on internal apps (CRM, ERP, back-office). Their
  failures are *wrong business outcomes* that a screenshot or a judge won't reliably catch, and their
  apps can be run locally.

Teams that only automate third-party sites benefit less, because they can't seed server state.

**Why this is defensible (weakly):** it is a *testing-methodology* contribution, not a platform. Its
value is the fixture format, the fault-injection patterns, and the state-based assertions. Those are
portable, and they're most valuable *inside* existing frameworks. That makes "contribute upstream" the
natural path, not "out-compete Browserbase".

---

## 6. Three alternative directions (if the primary idea is already solved or rejected upstream)

1. **Upstream-only contribution: the Stagehand #2841 "dynamic tier".** Add HAR-backed or
   local-app-backed `act()` regression fixtures, plus a deterministic `ClientLLM` replay to the
   Stagehand evals package. This is the smallest scope with the clearest user (the maintainers) and
   portfolio credibility through a merged PR. Risk: there's no maintainer response on #2841 yet, so
   ask first.
2. **"Outcome oracle" and side-effect ledger.** This is a framework-agnostic test double for apps:
   - a small proxy or middleware that logs every mutating request with an idempotency fingerprint;
   - deterministic oracles such as *duplicate write*, *missing write*, *wrong field value* and
     *write after claimed failure*.

   It plugs into browser-use, Stagehand or Playwright tests, and it addresses P3 and P7 without
   replay at all.
3. **Fault-injection kit for browser agents ("chaos for agents").** A tiny set of reference mini-apps
   whose faults can be toggled:
   - delayed re-render or list reorder (stale DOM);
   - slow or 504-after-commit submit (duplicate);
   - silently dropped field (false success);
   - an injected instruction in the page (prompt injection).

   Each comes with deterministic oracles. This is narrower than REAL, WASP or BrowserGym: it covers
   *failure mechanics*, not task breadth, and could ship as a BrowserGym task family or a Stagehand
   eval category.

(Directions 2 and 3 are also the components that the primary idea needs, so the work isn't wasted
whichever path wins.)

---

## 7. Recommended minimum viable experiment

### 7.1 Setup

- **App under test:** "MiniCRM". This is Node 22 + Express + SQLite (in-memory, reseeded per trial).
  It has three pages:
  - `/leads` (list)
  - `/leads/new` (form: name, company, owner `<select>`)
  - `/leads/:id`

  Faults are controlled by a `FAULT=<id>` environment variable and a fixed `FAULT_SEED`.
- **Agent under test:** a minimal **Stagehand v4 tool-calling loop**. v4 removed `agent()`, and
  Browserbase recommends either "code mode" or tool calling, so the loop is about 150 lines on the AI
  SDK, exposing `goto`, `act`, `observe`, `extract` and `done(claim)` tools. It runs on a local
  Chromium with one pinned model, temperature 0, and the exact model version recorded.
  - *Fallback:* browser-use (Python), if the Stagehand loop proves too custom. It has a full agent,
    `save_history` and `rerun_history`, which also makes it a natural baseline.
- **Task:** "Create a lead for *Acme Corp* (contact Jane Roe) assigned to **Priya Shah**, then report
  the lead ID."
- **Ground-truth oracle (never visible to the agent):**
  - exactly one `leads` row for Acme;
  - `owner='Priya Shah'`;
  - the reported ID equals the DB ID.

### 7.2 Injected faults

| Fault | Mechanism | Expected failure | Reproducible from trace alone? |
|---|---|---|---|
| **F1 stale page / timing** | The owner `<select>` options load via `fetch` after 300–1500 ms (seeded) and are **re-sorted** on arrival. An early observation sees a placeholder list. | Wrong owner selected (stale observation or locator drift) | **No.** Timing must be *injected* (controlled simulation), because a HAR records responses but not the race. |
| **F2 duplicate / retry** | `POST /leads` commits, then responds after 8 s, or returns 504 *after* commit (seeded). The button is not disabled. | Agent or framework retries, so 2 rows exist | **Partially.** A HAR shows two POSTs, but server state must come from the controlled app. |
| **F3 false success** | The server silently ignores `owner` when the select's `name` attribute is `ownerId` (a schema mismatch) and assigns the default owner, while the UI shows a "Lead created ✓" toast. | Agent reports success; the DB shows the wrong owner | **Yes in a controlled app** (deterministic). It's invisible to a screenshot-only judge unless the agent opens the detail page. |
| **C0 control** | No fault | Should succeed | Used for the false-positive rate |

### 7.3 Arms

- **A. Baseline.** The agent runs. Success equals the agent's `done(claim)`. As an extra comparator,
  grade with an LLM judge in the style of browser-use's `construct_judge_messages`, or with Stagehand's
  verifier if it's runnable offline.
- **B. Capture + recovery.** Arm A plus full capture (per-step DOM/ARIA snapshot, screenshot, HAR,
  console, LLM I/O, action arguments and results, with timestamps on one monotonic clock) and simple
  deterministic recovery rules:
  - re-observe if the DOM fingerprint changed between observe and act;
  - don't re-submit a mutating action without a read-back check;
  - verify the outcome by reading the detail page.
- **C. Failure → regression fixture.** For every failed run in A, generate a fixture directory
  containing:
  - `manifest.json`: app commit, fault id + seed, DB seed, browser and Playwright version, model id,
    and the prompt hash;
  - `llm.jsonl`: the recorded model responses;
  - `network.har`;
  - `assertions.ts`: the DB oracle plus the failure-specific assertion, for example
    `count(leads where company='Acme') == 1`.

  Replay each fixture in **recorded-LLM** mode (10×) and **live-LLM** mode (k = 10) against
  agent v0 (buggy), v1 (fixed: recovery rules from B) and v2 (v1 + a deliberately reintroduced
  F2 regression, for example removing the read-back check).

### 7.4 Trials

- 20 trials per fault (F1, F2, F3, C0) per arm, with fixed seeds per trial index, so that A, B and C
  see identical fault timing.
- Report every proportion with a Wilson 95% interval.
- Total runs are roughly 4 × 20 × 2 = 160 live agent runs, plus the replays.
- At about 15 steps × about 5k tokens per run, budget roughly 12M tokens. Measure the actual figure
  and report it; don't extrapolate.

---

## 8. Architecture and implementation plan (only after §7 validates the gap)

Keep it to a single package plus the test app. No dashboard, no database, no multi-framework support.

```
browser-user/
  apps/minicrm/            # Express + SQLite, FAULT toggles, /__oracle endpoints (test-only, loopback)
  packages/capture/        # Playwright/CDP listeners -> events.jsonl (one clock), HAR, snapshots
  packages/fixture/        # manifest schema (zod), writer, redaction pass, loader
  packages/replay/         # recorded-LLM client, HAR router (routeFromHAR + serviceWorkers:'block'),
                           # DB reseed, fault re-injection, prompt/observation diff
  packages/oracles/        # deterministic assertions: dbEquals, mutationCount, idempotency, claimMatchesState
  agent/                   # ~150-line Stagehand v4 tool-calling loop (the system under test)
  experiments/             # runner, seeds, metrics -> results/*.json (raw, committed)
  .github/workflows/       # run fixtures in recorded-LLM mode on every PR (no API keys needed)
```

**Correlating events.** Each tool call gets a `stepId`. Network requests (CDP `requestWillBeSent`),
console messages, DOM snapshots and screenshots are all stamped with `{stepId, monotonicTs}`. Then:

- "action caused request" is the set of requests between `actStart` and `actEnd + settle`;
- a stale observation is detected when the DOM fingerprint at `act` differs from the fingerprint at
  the `observe` that chose the target.

**Diagnosis split:**

| Failure class | Deterministic rule (no LLM) | Needs LLM | Confidence signal |
|---|---|---|---|
| Duplicate action / retry side effect | ≥2 mutating requests with the same fingerprint within a task | — | Exact (oracle) |
| Wrong business outcome / false success | `claim` ≠ DB state | — | Exact (oracle) |
| Stale DOM observation | target node hash or fingerprint changed between observe and act | — | High (rule) |
| Locator ambiguity | `observe` returned more than one candidate with similar scores; the action hit a non-unique selector | Sometimes | Medium |
| Navigation / timing | navigation or timeout errors; act during `loading`; requests pending at act time | — | High |
| Auth / session expiry | 401/403, redirect to login, cookie expiry before the failing step | — | High |
| Application-side failure | 5xx, console error from app code, oracle shows server rejection | — | High |
| Incorrect plan / reasoning | — | Yes (compare plan to task spec) | Low; report as a hypothesis with cited evidence steps |
| Incorrect target identification | Rule: clicked element's accessible name ≠ the name in the instruction | Yes, for semantic mismatch | Medium |
| Prompt injection | Rule: page text contains imperative instructions *and* the next action deviates from the task | Yes | Low–medium |

Confidence should come from **agreement**: whether the oracle confirms the failure, and whether a
deterministic rule fires. Report LLM-only attributions as *unconfirmed*.

**Reproducibility limits (stated explicitly in each fixture):**

| Exactly reproducible | Needs controlled simulation | Not reproducible |
|---|---|---|
| Observation-processing bugs on a frozen DOM (as in Stagehand #3106); framework bugs given recorded LLM output; deterministic app logic with seeded DB | Timing races (F1); server side effects and duplicates (F2); auth expiry; third-party API responses (HAR with static responses only) | Arbitrary production sessions on third-party sites (server state is unobservable); silent provider model updates; WebSockets/SSE/service-worker-served content (HAR replay bypassed); anti-bot/CAPTCHA behaviour |

---

## 9. Evaluation methodology and measurable success criteria

All metrics are computed by script from raw per-trial JSON that is committed to the repo.

| Metric | Definition | GO threshold [proposed, adjust before running] |
|---|---|---|
| Failure detection accuracy | Precision and recall of each arm's "failed" verdict vs the DB oracle, per fault | Arm C oracle recall ≥ 0.95 on F1–F3. Also report the *baseline judge's* recall on F3. |
| False-positive rate | Fraction of C0 (clean) runs flagged as failed | ≤ 0.05 |
| Reproduction rate | Fraction of failing fixtures that fail again under replay. Recorded-LLM mode: 10/10 identical; live mode: report pass^k | Recorded-LLM: ≥ 0.9 of fixtures reproduce 10/10. Live: report only, no threshold. |
| Regression detection | On v0/v1/v2: suite flags v0 and v2, passes v1 | 3/3 correct verdicts across all fixture types, 0 flaky verdicts in recorded mode |
| Time to diagnose + reproduce | Wall-clock for a person to go from failed run to a failing test, manual (Playwright trace + logs) vs with the tool, on the same failures | Report only. n is tiny (1–3 people), so it's a weak signal and should be labelled as such. |
| Cost | Model calls, tokens, latency per run and per replay (recorded mode should be 0 tokens) | Recorded-mode CI run < 2 min, $0 |

**Kill criteria (stop or pivot):**

1. If the baseline LLM judge (browser-use style or Stagehand verifier) already catches F3 false
   successes with recall ≥ 0.95 and FP ≤ 0.05, the "state oracle beats judge" claim fails. Pivot to
   Direction 1 only, framed as determinism and cost (no tokens), not accuracy.
2. If recorded-LLM replay cannot reproduce F2 or F3 deterministically, the fixture format is unsound.
3. If Stagehand maintainers decline the dynamic tier *and* no second framework expresses interest,
   it's a portfolio piece only.

---

## 10. Risks, limitations, licensing and security

**Technical risks**

- Recorded-LLM replay is brittle. If the framework changes the prompt, the recorded responses no
  longer apply. Mitigation: key responses by step index, *and* detect prompt drift with a diff and
  report it as "fixture invalidated" rather than "pass" or "fail".
- HAR replay matches on URL, method and POST body. Dynamic tokens (CSRF tokens, timestamps) need
  normalisation, and service workers must be blocked. **[Search]** Playwright docs.
- A controlled test app proves the method, not production generality. Be explicit that this targets
  *apps you can run*.
- Stagehand v4's API churn (agent removed, Browserbase-only server cache) may change again.

**Licensing**

- Stagehand, browser-use: MIT.
- BrowserGym, AgentLab, Laminar: Apache-2.0.
- **Skyvern: AGPL-3.0.** Study its classifier design, but don't copy its code into an MIT or Apache
  project.
- Recorded third-party pages in fixtures may carry copyright and terms-of-service restrictions. Only
  commit fixtures from your own or test apps.

**Security and privacy requirements**

- Redact by default before writing anything to disk:
  - cookie and authorization headers;
  - `password` and `file` inputs, plus configurable field and URL-parameter allowlists;
  - LLM prompts and responses scrubbed with the same patterns.

  Stagehand's recorder notes it is "not a general-purpose redactor". Don't claim more than you
  implement.
- Fixtures are untrusted input:
  - replay in a Docker container with network egress denied;
  - strip scripts from static snapshots;
  - treat setup scripts as code execution.
- Oracle endpoints exist only in the test app, bound to loopback, and are never exposed to the agent.
- Prompt-injection fixtures must never run against real accounts.

---

## 11. Recommended go/no-go decision

**Decision criteria (§9 of the brief):**

| Criterion | Met? | Basis |
|---|---|---|
| Meaningful capability gap | **Yes, narrow**: dynamic and state-changing failure → deterministic regression fixture with state assertions | Stagehand #2841 + #3106 README; browser-use live-site `rerun_history` and live-site CI tasks |
| Reproducible failure mode handled poorly | **Plausible, untested** | F1–F3 are standard patterns; whether *existing judges* miss F3 is the key open question (kill criterion 1) |
| Clear improvement in regression detection or debug efficiency | **Unknown.** The §7 experiment exists to measure it. | No results yet |
| Concrete user group with a recurring problem | **Partially**: framework maintainers (P1, P3, P4). Production users are hypothesized. | Primary for maintainers |
| Credible contribution to an existing project | **Yes**: Stagehand #2841 explicitly lists the missing pieces as future work | Primary |

**Decision:**

- **NO-GO** on a standalone "Browser Agent Failure Lab" platform with capture, classification,
  dashboards and multi-framework support. It isn't differentiated.
- **Conditional GO** on a two-to-three-week validation build:
  1. MiniCRM + the three faults + the oracles (Direction 3's core).
  2. A minimal Stagehand v4 tool-calling agent, with capture.
  3. A fixture writer and recorded-LLM replay; run the §7 experiment and publish the raw results.
  4. **In parallel, before step 3:** post a design comment on Stagehand #2841 proposing the dynamic
     tier (fixture manifest, HAR + seeded app, `ClientLLM` replay, state assertions) and ask for
     maintainer direction.

  Proceed to an upstream PR if the results meet §9. Otherwise publish the negative result, which is
  also credible portfolio work.

---

## Appendix A: inspected repositories

Shallow clones at these commits, fetched 2026-10-14:

| Repo | Commit | Date | License |
|---|---|---|---|
| browserbase/stagehand | `1da7359172` | 2026-10-13 | MIT |
| browser-use/browser-use (v0.13.11) | `c75e8476e2` | 2026-10-07 | MIT |
| Skyvern-AI/skyvern | `75665582ee` | 2026-10-14 | AGPL-3.0 |
| ServiceNow/BrowserGym | `e71419aef5` | 2026-10-05 | Apache-2.0 |
| ServiceNow/AgentLab | `8488c564ee` | 2026-10-05 | Apache-2.0 |
| browser-use/benchmark | `1e0e2f1ed1` | 2026-09-25 | (not checked) |
| lmnr-ai/lmnr (Laminar) | `7e8db4bbab` | 2026-10-13 | Apache-2.0 |

Key files and commits cited:

- **Stagehand**
  - `packages/docs/v4/migrations/v3.mdx`: "`agent()` is gone".
  - `packages/docs/v4/best-practices/caching.mdx`: server cache, Browserbase only.
  - `packages/docs/v3/best-practices/deterministic-agent.mdx`
  - `packages/evals/tasks/README.md`: #3106 scope and limits; negative-control experiment on #2624.
  - `packages/evals/docs/verifier-gates.md`
  - Commits `34be780d` (#3106), `e102a89c` (#2131), `840aac8b` (#2133), `d55f30ba` (#2901),
    `4d88741a` (#2826).
- **browser-use**
  - `browser_use/agent/service.py:3103` (`rerun_history`), `agent/judge.py`,
    `agent/views.py:288` (`JudgementResult`).
  - `browser/profile.py:383-464`, `browser/watchdogs/har_recording_watchdog.py`.
  - `tests/ci/conftest.py` (mock LLM + `pytest_httpserver`), `tests/agent_tasks/`.
  - Commits `4106186b` (#4403), `04099c97` (#4416), `184c4971` (#4658), `86d33635` (#4481).
- **Skyvern**
  - `skyvern/forge/failure_classifier.py`, `skyvern/forge/sdk/copilot/diagnosis_repair_contract.py`,
    `skyvern/forge/sdk/copilot/verification_evidence.py`.
  - `skyvern/core/script_generations/CLAUDE.md`, `skyvern/services/self_heal_reliability_service.py`.
- **AgentLab**
  - README §Reproducibility, `src/agentlab/agents/generic_agent/reproducibility_agent.py`,
    `src/agentlab/analyze/agent_xray.py`.

## Appendix B: blogs, articles and papers on browser agents

Most were reached via search summaries ([Search]) because the network policy blocked direct fetches.
Read them before citing any as primary.

**Framework and vendor engineering posts**

- Skyvern: "Asking AI to build scrapers should be easy right?" (explore → compiled Playwright,
  intent capture). https://www.skyvern.com/blog/asking-ai-to-build-scrapers-should-be-easy-right/
- Browserbase: "Unit-testing AI Agents in the Browser" (Kamath & McGuire, 2025-04-09). Listing only;
  body not retrieved. https://www.browserbase.com/blog/unit-testing-ai-agents-in-the-browser
- Browserbase: Stagehand caching. https://www.browserbase.com/blog/stagehand-caching (linked from
  `caching.mdx`)
- Browserbase observability product page. https://www.browserbase.com/observability
- Braintrust: Browserbase customer story (session replay + model-level tracing).
  https://www.braintrust.dev/customers/browserbase
- Laminar: browser agent observability docs.
  https://docs.laminar.sh/tracing/browser-agent-observability
- Laminar: 20× agent trace compression. https://laminar.sh/blog/laminar-20x-agent-trace-compression
- Anchor Browser: "Observability for Browser Agents: Logs, Tracing, and Replay".
  https://anchorbrowser.io/blog/observability-for-browser-agents-logs-tracing-and-replay
- Notte: "What is browser agent observability".
  https://www.notte.cc/glossary/ai-browser-agents/what-is-browser-agent-observability
- Mastra: "Introducing Browser Recording for Mastra Agents".
  https://mastra.ai/blog/introducing-browser-recording
- Transluce Docent docs. https://docs.transluce.org/analysis/overview
- Playwright: mock and HAR replay docs. https://playwright.dev/docs/mock

**Failure analysis and practitioner reports**

- Invariant Labs: "What we learned from analyzing web agents".
  https://invariantlabs.ai/blog/what-we-learned-from-analyzing-web-agents
- Future AGI: "Evaluating browser-use agents in 2026" (six production failure modes).
  https://futureagi.com/blog/evaluating-browser-use-agents-2026/
- TinyFish "Practitioner's Corner" (browser-use reproducibility, retry vs nondeterminism; secondary).
  https://current.tinyfish.ai/issue/31/practitioners-corner
- Taprun: deterministic vs AI browser automation; why browser-use gets stuck in loops (vendor
  content). https://taprun.dev/blog/deterministic-vs-ai-browser-automation.html,
  https://taprun.dev/blog/browser-use-stuck-loops-why.html
- EA Forum: "An agent's account of its own work is not evidence of what it did" (160 runs).
  https://forum.effectivealtruism.org/posts/tAycmGwS83d9sqKJT/an-agent-s-account-of-its-own-work-is-not-evidence-of-what
- Tallyfy: "Browser agents fail in production". https://tallyfy.com/browser-agents-fail-in-production/
- AI Weekly: "Puppeteer agent silently fails 40% of production runs" (Reddit-sourced, unverified).
  https://aiweekly.co/alerts/puppeteer-agent-silently-fails-40-of-production-runs
- "Failure Modes of OpenAI Operator" (MIT team, 5-task informal test).
  https://twisty-oval-d44.notion.site/Failure-Modes-of-OpenAI-Operator-185c58cbbfe280359873f7a8c132b0a5
- Understanding AI: "ChatGPT agent: a big improvement but…".
  https://www.understandingai.org/p/chatgpt-agent-a-big-improvement-but
- Leon Furze: "Initial impressions of OpenAI's agents".
  https://leonfurze.com/2025/07/19/initial-impressions-of-openais-agents-unfinished-unsuccessful-and-unsafe/

**Security**

- Brave: "Agentic Browser Security: Indirect Prompt Injection in Perplexity Comet".
  https://brave.com/blog/comet-prompt-injection/
- Brave: "Unseeable prompt injections in screenshots".
  https://brave.com/blog/unseeable-prompt-injections/
- WASP (Meta FAIR, NeurIPS 2025 D&B). https://arxiv.org/abs/2504.18575

**Benchmarks and papers**

- REAL / agisdk (deterministic site clones). https://arxiv.org/abs/2504.11543,
  https://github.com/agi-inc/agisdk
- τ-bench (database-state grading, pass^k). https://arxiv.org/abs/2406.12045
- BrowserArena (captcha, pop-ups, direct URL navigation failure modes). arXiv 2510.02418
- WebSuite: "Why web agents fail". https://arxiv.org/abs/2406.01623
- AgentRx (failure attribution, 115 trajectories). arXiv 2602.02475
- AgentErrata. arXiv 2609.02371. CatchBench. arXiv 2608.22808. WebXSkill. arXiv 2604.13318
- Also referenced: Who&When, TRAIL, AgentDebug (attribution benchmarks).

**Testing products**

- Playwright 1.56 test agents (planner, generator, healer).
- Momentic, QA Wolf; Octomind (reported shut down in 2026).
- LangSmith and Braintrust trace→dataset (vendor-authored comparisons).
  https://www.braintrust.dev/articles/langsmith-vs-braintrust

---

## Addendum (2026-10-14): community research and the v0.1 build

The team's follow-up research (Hacker News, Reddit and Product Hunt; I haven't independently opened
these sources) adds three points to this assessment:

- **Stale state after an interaction** (modals, re-renders, layout shifts) is a recurring complaint.
  → v0.1 records page state before and after *every* action and checks target identity at action time.
- **Authentication and session continuity** are first-order problems. → `session-expiry` fault and the
  `auth-lost` rule.
- **Recording-plus-report products already exist**: Replay QA, BrowserOS neo, Trainer, Ripplica and
  "Fire Your QA Today". → Recording isn't the differentiator. Ground-truth oracles, deterministic
  causes and failure→fixture→pass^k are. A Manifest maker on Product Hunt reportedly agreed that
  "compare against a stored baseline and identify which locators broke" would be valuable, which
  matches the `ui-drift` fixture path.

The v0.1 harness described in the README implements §7 with **scripted** agents. Results are in
`results/`. They validate the harness only; the LLM-agent arm of §7 is still to be run.
