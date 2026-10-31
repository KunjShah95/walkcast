import { LAB_FACTS, LAB_FAQ } from "../content.ts";
import { LAB_URL } from "../site.ts";
import { Doc } from "./Doc.tsx";

/**
 * The Lab page. It is the second product: the same recorder, used to find out why a browser AI
 * agent failed. It is written for the developer searching "browser agent testing" or "stagehand
 * evals", so it answers in the first paragraph and uses the vocabulary those tools use.
 */
export function LabPage() {
  return (
    <Doc path="/lab" eyebrow="Walkcast Lab">
      <h1>
        Walkcast Lab. <span className="dim">Why the browser agent failed, and the test that proves it.</span>
      </h1>
      <p className="answer">
        <strong>Short answer:</strong> Walkcast Lab is browser agent testing for teams that build AI agents which drive a
        web browser. When a run fails, Lab turns the failure into a cause, the evidence behind it and a replayable
        regression fixture, then compares the base agent against a candidate over repeated trials using 95% Wilson score
        intervals. Nothing is scored by an LLM judge: causes come from the browser's own trace, and a cause the rules
        cannot explain is left marked <code>unexplained</code> instead of being guessed.
      </p>

      <h2>The problem with testing a browser agent</h2>
      <p>
        A browser agent is a program that cannot be unit tested. It reads a page and decides what to click. The result
        depends on what the site returned, what the model decided and what the page looked like three steps ago. When a
        run fails, the agent usually cannot explain itself, and the log is a wall of DOM snapshots with no clear cause.
      </p>
      <p>
        The usual response is to watch the recording and squint. That does not scale, it does not survive the next
        release, and it tells you what happened without telling you what changed. Lab closes that gap: it captures the
        run as evidence, classifies the cause from that evidence, and writes the failure down as a test.
      </p>

      <h2>The vocabulary</h2>
      <dl className="faq-list">
        {LAB_FACTS.map(([term, meaning]) => (
          <div key={term}>
            <dt>
              <h3>{term}</h3>
            </dt>
            <dd>{meaning}</dd>
          </div>
        ))}
      </dl>

      <h2>Browser agent evals, in one page</h2>
      <p>
        If you are building a browser agent, you already know the shape of the problem. You write an eval for a
        task, you run it, and one day it goes red. The hard part is working out why it went red, proving
        the fix, and noticing that the fix broke a different task last week.
      </p>
      <p>
        That is what Walkcast Lab is: the evals half of browser agent testing, built on the recorder rather than on
        an agent's own logs. A run that fails becomes a cause, the evidence behind it, and a fixture you can replay.
        When you compare two versions of the agent, the same task is run repeatedly against both. The 95% Wilson score
        intervals separate a real improvement from a lucky run.
      </p>

      <h2>How a failure becomes a regression test</h2>
      <ol className="steps">
        <li id="step-1">
          <h3>1. Run the agent</h3>
          <p>
            The agent drives a real browser against a real site. Everything it does is recorded: the pages, the
            elements, the requests, the responses.
          </p>
        </li>
        <li id="step-2">
          <h3>2. Classify the cause</h3>
          <p>
            When the run fails, the cause is derived from the trace, not from the agent's own account of what it did. An
            agent that claims it clicked the right button is not evidence; the browser's trace is.
          </p>
        </li>
        <li id="step-3">
          <h3>3. Freeze it as a fixture</h3>
          <p>
            The failing run becomes a fixture: the task, the starting state and the point of failure. It is replayable,
            so it can be run again against the next version of the agent without re-creating the conditions by hand.
          </p>
        </li>
        <li id="step-4">
          <h3>4. Compare base and candidate</h3>
          <p>
            An experiment runs the task repeatedly against both agents and reports 95% Wilson score intervals, so a real
            improvement is distinguishable from a lucky run. A fix that broke something else shows up as a
            regression rather than hiding in the average.
          </p>
        </li>
        <li id="step-5">
          <h3>5. Replay faults in the simulator</h3>
          <p>
            Recorded failures can be pushed back through the fault replay simulator to check a candidate agent still
            trips over the same thing.
          </p>
        </li>
      </ol>

      <h2>How this compares to Stagehand, Playwright and browser-use</h2>
      <p>
        Those are ways of <em>running</em> an agent. Stagehand is an open-source browser automation framework built on
        Playwright, driven by a mix of code and natural-language instructions; browser-use is an agent that drives a
        browser from Python. Both are excellent at getting an agent to act. Neither is about what happens after the run
        fails.
      </p>
      <p>
        Walkcast Lab sits one step downstream. It works with any agent that drives a real browser, because it reads the
        recorder's own output rather than an agent's logs. If you build on Stagehand, Playwright or browser-use, Lab is
        the part that tells you whether your change fixed anything. It is the Stagehand alternative for the testing
        half of the job, not for the driving half.
      </p>

      <h2>Questions people ask</h2>
      <dl className="faq-list">
        {LAB_FAQ.map(([q, a]) => (
          <div key={q} id={q.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}>
            <dt>
              <h3>{q}</h3>
            </dt>
            <dd>{a}</dd>
          </div>
        ))}
      </dl>

      <h2>Read the Lab documentation</h2>
      <p>
        The Lab chapter of the README walks through runs, fixtures, experiments, compare and the fault replay simulator,
        with the commands to run them:{" "}
        <a href={LAB_URL} target="_blank" rel="noopener">
          Walkcast Lab on GitHub
        </a>
        .
      </p>
    </Doc>
  );
}
