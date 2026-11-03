import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, Download, EyeOff, Film, Play } from "lucide-react";
import { type CSSProperties, useRef, useState } from "react";
import { BrandMark, DownloadButton, Reveal, Tile } from "../ui.tsx";
import { VERSION } from "../site.ts";

/**
 * Premium hero for the landing page. Built from shadcn-style blocks:
 * a centred split hero, a product shot that is a real recording,
 * and an install block with the three platforms as large, unambiguous buttons.
 *
 * Copy is written to the eye first in one line: "Paste a link. Get a video tour of your site."
 * Everything after that is supporting detail.
 */
export function Hero() {
  const still = useReducedMotion();

  const line = (i: number) => ({
    initial: still ? false : { opacity: 0, y: 22 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.8, ease: [0.2, 0.7, 0.2, 1] as const, delay: 0.05 + i * 0.09 },
  });

  return (
    <section className="sec" id="top">
      <div className="wrap">
        <div className="hero">
          <div className="hero-scroll">
            <div className="hero-copy">
              <Reveal>
                <motion.a
                  className="hero-announce"
                  href={`https://github.com/KunjShah95/walkcast/releases/tag/v${VERSION}`}
                  target="_blank"
                  rel="noopener"
                  {...line(0)}
                >
                  <span className="hero-announce-tag">New in {VERSION}</span>
                  <span>A live preview while the recording still runs</span>
                  <ArrowRight size={14} />
                </motion.a>
              </Reveal>

              <Reveal className="hero-headline" delay={0.08}>
                <h1>
                  Paste a link. Get a <em className="serif hero-hl">video tour</em> of your site.
                  <br />
                  <span className="dim">Nothing to film.</span>
                </h1>
              </Reveal>

              <Reveal className="hero-lede" delay={0.14}>
                <p>
                  A real browser opens your site, signs in and clicks through your pages.
                  You get the visit as an MP4 with captions, a transcript and an optional voice-over.
                  First recording is free, and it takes less than a minute.
                </p>
              </Reveal>

              <Reveal className="hero-actions" delay={0.2}>
                <div className="hero-ctas">
                  <DownloadButton big />
                  <a className="pill ghost big" href="#demo">
                    <Play size={15} fill="currentColor" /> Watch a real recording
                  </a>
                </div>
                <ul className="hero-trust" aria-label="What it costs and includes">
                  {["Free, MIT licensed", "No account needed", "No watermark on the video", "Every seat included"].map((t, i) => (
                    <li key={t} style={{ "--i": i } as CSSProperties}>
                      <Check size={14} strokeWidth={2.8} />
                      {t}
                    </li>
                  ))}
                </ul>
              </Reveal>

              <Reveal className="hero-fact" delay={0.28}>
                <span className="hero-fact-label mono">The proof is in the visit</span>
                <span className="hero-fact-value">A demo recording plays below while it is still running.</span>
              </Reveal>
            </div>

            <div className="hero-shot">
              <div className="hero-stage">
                <div className="hero-stage-card">
                  <div className="hero-stage-bar">
                    <span className="hero-stage-lights" aria-hidden="true"><i /><i /><i /></span>
                    <span className="hero-stage-url mono">agentic-crm-henna.vercel.app</span>
                    <span className="hero-stage-live">REC</span>
                  </div>
                  <div className="hero-stage-screen">
                    <video
                      className="hero-stage-video"
                      autoPlay
                      muted
                      loop
                      playsInline
                      aria-hidden="true"
                    >
                      <source src="/assets/demo.mp4" type="video/mp4" />
                      <source src="/assets/demo.webm" type="video/webm" />
                      Your browser does not support the video tag. Get a better browser.
                    </video>
                    <div className="hero-stage-cap">A real browser signs in, walks the pages and narrates what it did.</div>
                    <button className="hero-stage-play" aria-label="Play the recording"><Play size={14} /></button>
                  </div>
                  <div className="hero-stage-side">
                    <div className="hero-side-head">
                      <span className="hero-title">Visit log</span>
                      <span className="mono">click to seek</span>
                    </div>
                    <ol className="hero-cues">
                      <li><button aria-current="true"><time>0:11</time><span>A real browser signs in, walks the pages and narrates what it did.</span></button></li>
                      <li><button aria-current="false"><time>0:23</time><span>It signs in and walks the site, page by page.</span></button></li>
                      <li><button aria-current="false"><time>0:35</time><span>One continuous visit, no timeline to work in.</span></button></li>
                      <li><button aria-current="false"><time>0:47</time><span>H.264 with captions, a transcript, the page list.</span></button></li>
                    </ol>
                  </div>
                  <div className="hero-stage-foot">
                    <span className="chip"><Film size={13} /> walkthrough.mp4</span>
                    <span className="chip"><EyeOff size={13} /> captions.vtt</span>
                    <span className="chip"><Film size={13} /> transcript.txt</span>
                    <span className="chip"><Film size={13} /> 6 pages <b>200 OK</b></span>
                  </div>
                </div>
                <span className="hero-tab">A real recording · unedited</span>
              </div>
            </div>
          </div>

          <div className="hero-cta-row">
            <div className="hero-cta-card">
              <div className="hero-cta-card-head">
                <span className="hero-cta-card-icon"><Film size={15} /></span>
                <div className="hero-cta-card-copy">
                  <strong className="hero-cta-card-title">No camera, no microphone, no script</strong>
                  <p className="hero-cta-card-text">
                    Walkcast drives its own browser. It opens your site, signs in and clicks through
                    your pages. You end up with a video tour that is identical every time you re-record it.
                  </p>
                </div>
                <div className="hero-cta-card-cta">
                  <DownloadButton />
                </div>
              </div>
            </div>

            <div className="hero-cta-card">
              <div className="hero-cta-card-head">
                <span className="hero-cta-card-icon"><Play size={15} /></span>
                <div className="hero-cta-card-copy">
                  <strong className="hero-cta-card-title">Start from any page</strong>
                  <p className="hero-cta-card-text">
                    Paste the link a new visitor would land on and Walkcast follows the links on the
                    same site. Sign-out, delete, cancel and unsubscribe links are skipped automatically.
                  </p>
                </div>
                <div className="hero-cta-card-cta">
                  <a className="pill solid big" href="#what">
                    See how it works <ArrowRight size={14} />
                  </a>
                </div>
              </div>
            </div>

            <div className="hero-cta-card">
              <div className="hero-cta-card-head">
                <span className="hero-cta-card-icon"><Check size={15} /></span>
                <div className="hero-cta-card-copy">
                  <strong className="hero-cta-card-title">Same take after every release</strong>
                  <p className="hero-cta-card-text">
                    Regenerate a tour in a minute after a redesign. Every caption is timed to the
                    voice you chose, and every narration line is written from what the browser actually did.
                  </p>
                </div>
                <div className="hero-cta-card-cta">
                  <a className="pill ghost big" href="#what">
                    How it works <ArrowRight size={14} />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
