import { motion, useReducedMotion } from "motion/react";
import { ArrowDown, ArrowRight, Check } from "lucide-react";
import { type CSSProperties, useEffect } from "react";
import { DownloadButton, Reveal } from "../ui.tsx";
import { VERSION } from "../site.ts";
import { trackSiteEvent } from "../analytics.ts";

/** The homepage hero makes the product promise first and lets a real walkthrough prove it. */
export function Hero() {
  const still = useReducedMotion();
  useEffect(() => {
    const sections = ["what", "compare", "pricing", "faq"]
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => !!section);
    if (!("IntersectionObserver" in window)) return;
    const seen = new Set<string>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || seen.has(entry.target.id)) continue;
        seen.add(entry.target.id);
        trackSiteEvent("homepage_section_view", { section: entry.target.id });
      }
    }, { threshold: 0.25 });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);
  const enter = (delay = 0) => ({
    initial: still ? false : { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.62, ease: [0.2, 0.7, 0.2, 1] as const, delay },
  });
  const trust = ["Free and MIT licensed", "No recording setup", "Your files stay on your PC"];

  return (
    <section className="sec landing-hero" id="top">
      <div className="wrap landing-hero-wrap">
        <div className="landing-hero-shell">
          <Reveal>
            <motion.a
              className="landing-release"
              href={`https://github.com/KunjShah95/walkcast/releases/tag/v${VERSION}`}
              target="_blank"
              rel="noopener"
              {...enter(0)}
            >
              <span>Walkcast {VERSION}</span>
              <span className="landing-release-sep" />
              <span>Video tours from a link</span>
              <ArrowRight size={13} />
            </motion.a>
          </Reveal>

          <Reveal className="landing-hero-copy" delay={0.06}>
            <motion.h1 className="landing-title" {...enter(0.06)}>
              Turn your live site
              <br />
              into a <em>video tour.</em>
            </motion.h1>
            <motion.p className="landing-lede" {...enter(0.13)}>
              Paste a link. A real browser walks your site and hands you the video, captions and transcript.
            </motion.p>
            <motion.div className="landing-actions" {...enter(0.2)}>
              <DownloadButton big placement="hero" />
              <a className="landing-watch" href="#demo" onClick={() => trackSiteEvent("demo_anchor_click", { placement: "hero" })}><span><ArrowDown size={14} /></span> Watch a real walkthrough</a>
            </motion.div>
            <motion.ul className="landing-trust" aria-label="Included with Walkcast" {...enter(0.26)}>
              {trust.map((item, i) => (
                <li key={item} style={{ "--i": i } as CSSProperties}><Check size={14} strokeWidth={2.6} />{item}</li>
              ))}
            </motion.ul>
          </Reveal>

          <Reveal className="landing-hero-visual" delay={0.16}>
            <div className="landing-browser" id="demo">
              <div className="landing-browser-bar">
                <span className="landing-browser-lights" aria-hidden="true"><i /><i /><i /></span>
                <span className="landing-browser-address">agentic-crm-henna.vercel.app</span>
                <span className="landing-rec"><i /> REAL RECORDING</span>
              </div>
              <video
                className="landing-demo"
                poster="/assets/demo-poster.jpg"
                controls
                playsInline
                preload="none"
                onPlay={() => trackSiteEvent("demo_play", { placement: "homepage_hero" })}
                onEnded={() => trackSiteEvent("demo_complete", { placement: "homepage_hero" })}
              >
                <source src="/assets/demo.mp4" type="video/mp4" />
                <source src="/assets/demo.webm" type="video/webm" />
                <track kind="captions" src="/assets/demo.vtt" srcLang="en" label="English" default />
                Your browser does not support the video tag.
              </video>
            </div>
            <div className="landing-visual-caption"><span>01</span> A real browser. Your real product. One take.</div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
