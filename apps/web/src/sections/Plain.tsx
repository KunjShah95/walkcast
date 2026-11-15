import { Film, Terminal } from "lucide-react";
import { LAB_URL } from "../site.ts";
import { DownloadButton, Eyebrow, GithubIcon, Reveal } from "../ui.tsx";
import { LabDemo } from "../visuals/LabDemo.tsx";
import { Captions, Showcase } from "../visuals/Showcase.tsx";
import { TourDemo } from "../visuals/TourDemo.tsx";

/* ------------------------------------------------------------------ what it actually does */

/**
 * The section that answers "what does this thing actually do". The picture does the explaining:
 * a link goes in, a browser walks the pages, and the files come out.
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
        </Reveal>

        <Showcase label="Walkcast app: a link is pasted, a browser walks three pages with narration, and an MP4, captions and a transcript appear.">
          <TourDemo />
        </Showcase>

        <Captions
          items={[
            { title: "Paste a link", text: "Any page, even behind a login." },
            { title: "It walks the site", text: "A real browser clicks through and narrates." },
            { title: "Take the files", text: "MP4, captions and a transcript." },
          ]}
        />
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
            Building a browser agent? <span className="dim">See why a run failed.</span>
          </h2>
        </Reveal>

        <Showcase label="Walkcast Lab: a failed agent run, its stale-selector cause, and the run saved as a test that passes on replay.">
          <LabDemo />
        </Showcase>

        <Captions
          items={[
            { title: "Pick the broken step", text: "The cause and the evidence behind it." },
            { title: "Save it as a test", text: "A fixture you can replay." },
            { title: "Rerun on every version", text: "Base against candidate, over repeated trials." },
          ]}
        />

        <Reveal className="agent-links">
          <DownloadButton label="Download free" placement="agent_recorder" />
          <a className="pill ghost" href={LAB_URL}>
            <GithubIcon /> Read the Lab docs
          </a>
          <span className="agent-links-note">
            <Film size={14} /> Video recorder for everyone · <Terminal size={14} /> Lab for agent teams
          </span>
        </Reveal>
      </div>
    </section>
  );
}
