import { LAB_URL } from "../site.ts";
import { GUIDE_STEPS } from "../content.ts";
import { Doc } from "./Doc.tsx";

/**
 * "Stagehand evals", "Stagehand testing", "Stagehand alternatives": three small searches with one
 * honest answer. Stagehand drives the browser; Lab explains the run that failed and keeps it as a
 * test. Every command and file name below exists in the repository; nothing is claimed about
 * Stagehand beyond what its own documentation says.
 */
export function StagehandEvalsPage() {
  const steps = GUIDE_STEPS["/guides/stagehand-evals"]!;
  return (
    <Doc path="/guides/stagehand-evals" eyebrow="Guide">
      <h1>
        Stagehand evals and testing. <span className="dim">Find out why a run failed, then keep it as a test.</span>
      </h1>
      <p className="answer">
        <strong>Short answer:</strong> Stagehand runs your browser agent; it does not decide why a run went wrong or promise
        that a fix holds. Walkcast Lab is the testing half. It records a Stagehand run in a real browser, classifies the cause
        from the browser's own trace (not from an LLM judge), saves the failure as a fixture, and replays that fixture against
        the next version of your agent, offline, from the recorded model calls. It is free and MIT licensed.
      </p>

      <h2>Where Stagehand evals stop</h2>
      <p>
        An eval answers one question: did the agent complete this task? When the answer is no, you are left with the
        question that costs the time: why. An agent that fails usually cannot explain itself, and a pass rate over a handful
        of runs cannot tell a real improvement from a lucky one. Those are the two gaps Lab fills.
      </p>

      <h2>Steps</h2>
      <ol className="steps">
        {steps.map((s, i) => (
          <li key={s.title} id={`step-${i + 1}`}>
            <h3>
              {i + 1}. {s.title}
            </h3>
            <p>{s.text}</p>
          </li>
        ))}
      </ol>

      <h2>The commands</h2>
      <pre className="code-block">
        <code>{`# Run a Stagehand-based agent against a sample app with an injected fault.
# A failed run saves a fixture (and a report.md with the cause and the evidence).
npm run lab -- run --agent sh-p0 --fault silent-owner-drop

# Replay that fixture three times against the same or another agent version.
npm run lab -- replay fixtures/<fixture> --agent sh-p1 --trials 3

# Compare agent versions over every fixture. Non-zero exit if the last one fails: a CI gate.
npm run lab -- compare fixtures --agents sh-p0,sh-p1 --trials 3`}</code>
      </pre>
      <p>
        <code>sh-p0</code> and <code>sh-p1</code> are the two Stagehand agents that ship with Lab: a neutral baseline prompt, and
        one that adds verification and safe-retry guidance. Stagehand's own model calls go through Lab's gateway, which is what
        makes an exact replay possible without an API key or a network call.
      </p>

      <h2>What a failure turns into</h2>
      <table>
        <thead>
          <tr>
            <th>Piece</th>
            <th>What it is</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Symptom</td><td>What went wrong from the outside: <code>false-success</code>, <code>missed-success</code>, <code>wrong-outcome</code>, <code>duplicate-action</code>.</td></tr>
          <tr><td>Cause</td><td>Derived from the trace: for example <code>stale-observation</code>, <code>unsafe-retry</code>, <code>app-dropped-field</code>. A failure the rules cannot explain stays <code>unexplained</code>.</td></tr>
          <tr><td>Evidence</td><td>The step, the page state before and after it, and the request that shows it.</td></tr>
          <tr><td>Fixture</td><td>The task, the starting state and the recorded model calls, so the run can be replayed.</td></tr>
        </tbody>
      </table>

      <h2>Stagehand alternatives: which tool for which job</h2>
      <table>
        <thead>
          <tr>
            <th>You want to</th>
            <th>Use</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Drive a page with code plus natural-language instructions</td><td>Stagehand (or Playwright directly, or browser-use from Python)</td></tr>
          <tr><td>Find out why an agent run failed and keep it as a test</td><td>Walkcast Lab</td></tr>
          <tr><td>Check whether a new agent version fixed a bug or broke another task</td><td>Walkcast Lab, <code>compare</code> over your fixtures</td></tr>
          <tr><td>Trace token counts and latency of runs you already have</td><td>An observability tool, alongside Lab</td></tr>
        </tbody>
      </table>
      <p>
        Lab is not a replacement for Stagehand's way of driving a browser, and it does not need you to change it: it reads the
        recorder's output, so it also works with agents built on Playwright or browser-use. The Walkcast author has also
        proposed network record-and-replay to Stagehand's own eval tasks in{" "}
        <a href="https://github.com/browserbase/stagehand/pull/3230" target="_blank" rel="noopener">browserbase/stagehand#3230</a> and{" "}
        <a href="https://github.com/browserbase/stagehand/pull/3231" target="_blank" rel="noopener">#3231</a>.
      </p>

      <h2>Sources</h2>
      <ul className="sources">
        <li>
          Stagehand's documentation describes its AI primitives (<code>act</code>, <code>extract</code>, <code>observe</code>),
          its Playwright-style <code>page</code> methods and the SDKs for TypeScript, Python and Go.{" "}
          <a href="https://docs.stagehand.dev/" rel="noopener" target="_blank">
            docs.stagehand.dev
          </a>
        </li>
        <li>
          &tau;-bench introduced pass^k, a reliability measure over repeated trials; it found even strong
          function-calling agents succeeded on under half the tasks and were inconsistent across runs. That is the
          problem repeated trials are meant to expose.{" "}
          <a href="https://arxiv.org/abs/2406.12045" rel="noopener" target="_blank">
            Yao et al., &tau;-bench (2024)
          </a>
        </li>
      </ul>

      <h2>More</h2>
      <p>
        The full picture of runs, fixtures, experiments and the fault simulator is on the <a href="/lab">Walkcast Lab page</a>, and
        the commands are in the{" "}
        <a href={LAB_URL} target="_blank" rel="noopener">
          Lab chapter of the README
        </a>
        .
      </p>
    </Doc>
  );
}
