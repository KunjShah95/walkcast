import {
  Captions,
  Check,
  FileText,
  Film,
  Globe,
  Play,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { NOT, PLAIN, STEPS } from "../content.ts";
import { LAB_URL } from "../site.ts";
import { DownloadButton, Eyebrow, GithubIcon, Reveal, Tile } from "../ui.tsx";

/* ------------------------------------------------------------------ what it actually does */

/** The files one recording leaves behind, named the way the app names them. */
const FILES: { icon: typeof Film; name: string; note: string }[] = [
  { icon: Film, name: "walkthrough.mp4", note: "The whole visit, H.264" },
  { icon: Play, name: "walkthrough.webm", note: "The same take, VP8" },
  { icon: Captions, name: "captions.vtt", note: "Every step, timed" },
  { icon: FileText, name: "transcript.txt", note: "The narration, plain text" },
  { icon: Globe, name: "pages.json", note: "Every URL and its status" },
];

/**
 * The section that answers "what does this thing actually do". It sits right under the demo
 * and says the same thing three times: once in a sentence, once in steps, once in file names.
 */
export function Plain() {
  return (
    <section className="sec" id="what">
      <div className="wrap">
        <Reveal className="sec-head center">
          <Eyebrow n={1}>How it works</Eyebrow>
          <h2>
            You paste a link and <span className="dim">it does the walking.</span>
          </h2>
          <p className="lede">{PLAIN}</p>
        </Reveal>

        <Reveal className="oldway" delay={0.06}>
          <span className="oldway-label mono">The old way</span>
          <p>
            Write the script, record the screen, retake it, record the voice, sync the captions. Then you ship one
            update, and it is already out of date.
          </p>
        </Reveal>

        <ol className="steps">
          {STEPS.map(([title, text], i) => (
            <Reveal as="li" key={title} delay={i * 0.08}>
              <span className="step-n mono">{String(i + 1).padStart(2, "0")}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </Reveal>
          ))}
        </ol>

        <Reveal className="files" delay={0.1}>
          <span className="files-label mono">One recording leaves you with</span>
          <ul>
            {FILES.map((f) => (
              <li key={f.name}>
                <f.icon size={16} />
                <span>
                  <b className="mono">{f.name}</b>
                  <small>{f.note}</small>
                </span>
              </li>
            ))}
          </ul>
        </Reveal>

        <ul className="nots">
          {NOT.map(([title, text], i) => (
            <Reveal as="li" key={title} delay={i * 0.07}>
              <b>
                <span className="x" aria-hidden="true">✕</span> {title}
              </b>
              <p>{text}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ two products, one recorder */

/** The second half of the product: the same recorder, used on browser agents. */
export function Agents() {
  return (
    <section className="sec" id="agents">
      <div className="wrap">
        <Reveal className="sec-head center">
          <Eyebrow n={6}>Also in the app: Walkcast Lab</Eyebrow>
          <h2>
            Building a browser <Tile icon={Terminal} tone="ink" tilt={-6} /> AI agent?
            <br />
            <span className="dim">
              The Lab shows why it <Tile icon={Play} tone="rec" tilt={5} fill /> failed.
            </span>
          </h2>
          <p className="lede">
            Most people only need the video recorder above. If you build AI agents that use a browser, the same app has a
            Lab. When an agent fails a task, it shows the cause and the evidence, and turns the failure into a test you
            can rerun on the next version. It is in the sidebar under Lab.
          </p>
        </Reveal>

        <div className="agents">
          <Reveal className="agent-card">
            <span className="agent-tag">
              <Film size={14} /> The recorder · for everyone
            </span>
            <h3>A video tour of your site, without a script</h3>
            <p>
              Founders, marketers and PMs paste one link and get the whole visit as an MP4 with captions, a transcript
              and a voice-over. Pages behind a login are included.
            </p>
            <ul>
              {[
                "One link in, one video out. The browser signs in, walks the site and records the visit.",
                "Records behind a login, so demos and onboarding work.",
                "The narration is written from what the browser did, so it cannot invent a feature.",
              ].map((p) => (
                <li key={p}>
                  <Check size={16} className="ok" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <DownloadButton label="Download free" />
          </Reveal>

          <Reveal className="agent-card dark" delay={0.08}>
            <span className="agent-tag">
              <Terminal size={14} /> The Lab · for AI agent teams
            </span>
            <h3>A failed agent run, turned into a test</h3>
            <p>
              Teams building browser AI agents use the same recorder to turn a failed run into a classified,
              reproducible regression test. You get a cause, the evidence behind it, and a fixture that holds.
            </p>
            <ul>
              {[
                "A cause, the evidence it points at, and a fixture you can replay.",
                "Compare a base agent against a candidate over repeated trials.",
                "A cause the rules cannot explain stays marked ‘unexplained’ instead of being guessed.",
              ].map((p) => (
                <li key={p}>
                  <Check size={16} className="ok" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <a className="pill solid" href={LAB_URL}>
              <GithubIcon /> Read the Lab docs
            </a>
          </Reveal>
        </div>

        <Reveal className="agent-note">
          <ShieldCheck size={16} />
          <p>
            Both halves read the same evidence: what the browser actually did, not what an agent claimed. No LLM judge
            scores either, and every cause is traceable to the trace.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
