import { Doc } from "./Doc.tsx";

/**
 * Five ways a browser agent fails, each taken from a real fixture in `results/fixtures/`. The
 * numbers on this page are quoted from those reports; nothing is estimated. The agents in these
 * runs are deterministic scripts, not language models, and the page says so, because the point
 * is what each failure looks like in the browser's trace, not how often a model makes it.
 */
const FAILURES: {
  cause: string;
  symptom: string;
  fixture: string;
  what: string;
  evidence: string;
  claim: string;
  state: string;
  fix: string;
}[] = [
  {
    cause: "stale-observation",
    symptom: "false-success",
    fixture: "stale-owners-s1-stale-observation",
    what: "The agent reads a list of owners, waits, and then picks from the list by position. The list was refreshed in between, so the same position now holds a different person.",
    evidence: "Step 10 targeted “Priya Shah” from the observation in step 7, 1,725 ms old, but the element at that position was “Alex Kim” when the action ran.",
    claim: "“Lead 1001 created for Acme Corp, owner Priya Shah.”",
    state: "The lead was saved with the owner Alex Kim.",
    fix: "Re-read the page, or re-resolve the control by name, immediately before acting on an observation that is more than a moment old.",
  },
  {
    cause: "unsafe-retry",
    symptom: "duplicate-action",
    fixture: "gateway-timeout-s1-unsafe-retry",
    what: "A save ends with a 504, so the agent cannot tell whether it worked. It sends the same write again without checking.",
    evidence: "The write in step 12 ended ambiguously (504); step 20 sent the same write again without first reading back whether the first one had succeeded.",
    claim: "“The server returned an error twice.” The agent reported failure.",
    state: "Two leads were created (ids 1001 and 1002) for the same request.",
    fix: "After an ambiguous response, read the state back before repeating a write.",
  },
  {
    cause: "auth-lost",
    symptom: "false-success",
    fixture: "session-expiry-s1-auth-lost",
    what: "The session expires while the form is being filled in. The save is bounced to the login page and the agent carries on as if it had gone through.",
    evidence: "Session was lost mid-task: 1 write rejected for authentication; redirected to login at step 12.",
    claim: "“Submitted the lead for Acme Corp; the session was refreshed afterwards.”",
    state: "No lead exists.",
    fix: "Treat a redirect to the sign-in page after a write as a failed write, and sign in again before retrying.",
  },
  {
    cause: "app-dropped-field",
    symptom: "false-success",
    fixture: "silent-owner-drop-s1-app-dropped-field",
    what: "The agent does everything right and the application quietly ignores one field. This one is the application's bug, not the agent's.",
    evidence: "The browser submitted owner “Priya Shah” (as form field ownerId) but the application stored “Unassigned”. The agent's input was correct; the application ignored it.",
    claim: "“Lead 1001 created for Acme Corp, owner Priya Shah.”",
    state: "The lead exists, with the owner Unassigned.",
    fix: "Read the saved record back and compare it with what was entered, instead of trusting the confirmation message.",
  },
  {
    cause: "locator-not-found",
    symptom: "wrong-outcome",
    fixture: "ui-drift-s1-locator-not-found",
    what: "The page changed and the control the agent was told to click is no longer there. Here the agent fails honestly.",
    evidence: "Step 11 (click on “#save-lead”) found no matching element: page.click timed out after 2,000 ms.",
    claim: "“Could not submit the form.” The agent reported failure, and was right.",
    state: "No lead exists.",
    fix: "Locate controls by what they are called on the page rather than by a fixed selector, and re-record the fixture when the page changes on purpose.",
  },
];

export function AgentFailuresPage() {
  return (
    <Doc path="/guides/how-browser-agents-fail" eyebrow="Guide">
      <h1>
        How browser agents fail. <span className="dim">Five causes, each with the evidence that proves it.</span>
      </h1>
      <p className="answer">
        <strong>Short answer:</strong> a browser agent that fails usually fails in one of a few ways, and most of them look like
        success from the agent's own report. Three of the five failures below end with the agent saying it worked. Each one is a
        real run recorded by Walkcast Lab against a sample app, with the cause worked out from the browser's own trace and checked
        against what the application actually stored.
      </p>

      <h2>What this is, and what it is not</h2>
      <p>
        The agents in these runs are deterministic scripts, not language models, and each fault was injected into the sample app on
        purpose. That makes the five fixtures reproducible and the causes unambiguous. It also means this page says nothing about how
        often a language model makes any of these mistakes. A live-model run exists too, from one seed, and the project's own notes
        say it is a first look rather than a benchmark. What the page shows is what each failure leaves behind in a trace, which is
        what you need in order to recognise it in your own agent.
      </p>

      <h2>The task</h2>
      <p>
        Every run is the same task: sign in, create a lead for Acme Corp with the contact Jane Roe and the owner Priya Shah, then
        report the lead's id. The oracle is the application's own records, not the agent's account of what it did.
      </p>

      {FAILURES.map((f, i) => (
        <section key={f.cause} aria-labelledby={`f-${f.cause}`}>
          <h2 id={`f-${f.cause}`}>
            {i + 1}. <code>{f.cause}</code>
          </h2>
          <p>{f.what}</p>
          <table>
            <tbody>
              <tr><th scope="row">Evidence</th><td>{f.evidence}</td></tr>
              <tr><th scope="row">The agent said</th><td>{f.claim}</td></tr>
              <tr><th scope="row">The application held</th><td>{f.state}</td></tr>
              <tr><th scope="row">Symptom</th><td><code>{f.symptom}</code></td></tr>
              <tr><th scope="row">What helps</th><td>{f.fix}</td></tr>
              <tr><th scope="row">Fixture</th><td><code>results/fixtures/{f.fixture}</code></td></tr>
            </tbody>
          </table>
        </section>
      ))}

      <h2>What happened when a fixed agent replayed them</h2>
      <p>
        The naive script (v0) fails all five fixtures. A fixed version (v1) passes all five. A third version (v2) is v1 with the
        read-back step removed on purpose, and it passes four and fails the unsafe-retry fixture again, which is the point of
        keeping the fixture: the regression is caught. Replaying each fixture with the script that originally failed reproduced the
        original cause 5 times out of 5. These are counts from one run per fault, so they show the mechanism works, not a rate.
      </p>

      <h2>How this sits against public benchmarks</h2>
      <p>
        Public benchmarks measure a different thing: how often an agent succeeds, not why it failed. In{" "}
        <a href="https://arxiv.org/abs/2307.13854" rel="noopener" target="_blank">
          WebArena
        </a>
        , a benchmark of self-hosted versions of real websites, the best GPT-4-based agent completed 14.41% of tasks
        against 78.24% for humans. In{" "}
        <a href="https://arxiv.org/abs/2406.12045" rel="noopener" target="_blank">
          &tau;-bench
        </a>
        , which tests tool-using agents against domain rules over repeated trials, even state-of-the-art function-calling
        agents succeeded on fewer than 50% of tasks, and reliability over eight trials (pass^8) fell below 25% in the
        retail domain. Both papers are from 2023 and 2024 and both numbers move as models change, so treat them as
        evidence that browser agents fail often, not as a current scoreboard. Neither paper classifies the cause of a
        failure, which is the gap the fixtures above fill.
      </p>

      <h2>Sources</h2>
      <ul className="sources">
        <li>
          Zhou et al.,{" "}
          <a href="https://arxiv.org/abs/2307.13854" rel="noopener" target="_blank">
            WebArena: A Realistic Web Environment for Building Autonomous Agents
          </a>
          , 2023 (revised 2024). The 14.41% agent and 78.24% human task-success figures quoted above are from this paper.
        </li>
        <li>
          Yao et al.,{" "}
          <a href="https://arxiv.org/abs/2406.12045" rel="noopener" target="_blank">
            &tau;-bench: A Benchmark for Tool-Agent-User Interaction in Real-World Domains
          </a>
          , 2024. The sub-50% success rate and the pass^8 reliability figure quoted above are from this paper.
        </li>
      </ul>

      <h2>Use it on your own agent</h2>
      <p>
        Everything above is what Walkcast Lab produces for any agent that drives a real browser: the cause, the step and request that
        show it, and a fixture you can replay. See <a href="/guides/stagehand-evals">Stagehand evals and testing</a> for the commands,
        or the <a href="/lab">Lab page</a> for the whole picture.
      </p>
    </Doc>
  );
}
