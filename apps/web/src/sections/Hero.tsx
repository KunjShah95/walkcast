import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AudioLines, Captions, FileText, Film, Globe, Link, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BrandMark, DownloadButton, Tile, WindowBar } from "../ui.tsx";
import { WINDOWS_MSI_URL } from "../site.ts";

interface Cue {
  start: number;
  end: number;
  text: string;
}

const secs = (t: string) => t.split(":").reduce((a, v) => a * 60 + parseFloat(v), 0);
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** The narration track of the demo recording, parsed from the real caption file. */
function useCues(src: string): Cue[] {
  const [cues, setCues] = useState<Cue[]>([]);
  useEffect(() => {
    let live = true;
    fetch(src)
      .then((r) => r.text())
      .then((vtt) => {
        const found = [...vtt.matchAll(/([\d:.]+) --> ([\d:.]+)\r?\n([\s\S]*?)(?:\r?\n\r?\n|$)/g)].map(([, a, b, text]) => ({
          start: secs(a!),
          end: secs(b!),
          text: text!.trim(),
        }));
        if (live) setCues(found);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [src]);
  return cues;
}

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [past, setPast] = useState(false);
  useEffect(() => {
    const on = () => {
      setScrolled(scrollY > 8);
      setPast(scrollY > 520);
    };
    on();
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);
  return (
    <header className={`nav ${scrolled ? "scrolled" : ""}`}>
      <div className="wrap nav-row">
        <a className="brand" href="#top" aria-label="Walkcast home">
          <BrandMark />
          walkcast
        </a>
        <nav className="nav-links" aria-label="Main">
          <a href="#features">Features</a>
          <a href="#login">Logins</a>
          <a href="#uses">Use cases</a>
          <a href="#pricing">Pricing</a>
          <a href="#download">Download</a>
          <a href="#faq">FAQ</a>
        </nav>
        <AnimatePresence mode="popLayout" initial={false}>
          {past ? (
            <motion.div key="dark" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.2 }}>
              <DownloadButton />
            </motion.div>
          ) : (
            <motion.a key="light" className="pill" href="#download" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.2 }}>
              Download
            </motion.a>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}

const STRIP = [
  [Film, "MP4"],
  [Film, "WebM"],
  [Captions, "WebVTT captions"],
  [FileText, "Transcript"],
  [AudioLines, "WAV narration"],
  [Globe, "Page list"],
] as const;

export function Hero() {
  const still = useReducedMotion();
  const cues = useCues("/assets/demo.vtt");
  const video = useRef<HTMLVideoElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const [now, setNow] = useState(0);
  const active = cues.findIndex((c) => now >= c.start && now < c.end + 0.6);

  useEffect(() => {
    const el = list.current?.children[active] as HTMLElement | undefined;
    if (el && list.current) list.current.scrollTo({ top: el.offsetTop - 8, behavior: "smooth" });
  }, [active]);

  const line = (i: number) => ({
    initial: still ? false : { opacity: 0, y: 28, filter: "blur(10px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    transition: { duration: 0.8, ease: [0.2, 0.7, 0.2, 1] as const, delay: 0.08 + i * 0.12 },
  });

  return (
    <section className="hero" id="top">
      <div className="wrap">
        <h1>
          <motion.span className="line" {...line(0)}>
            Paste a <Tile icon={Link} tone="ink" tilt={-6} /> link.
          </motion.span>
          <motion.span className="line" {...line(1)}>
            Get it <Tile icon={Play} tone="rec" tilt={5} fill /> narrated.
          </motion.span>
          <motion.span className="line grad" {...line(2)}>
            No mic. No editor.
          </motion.span>
        </h1>
        <motion.p className="lede" {...line(3)}>
          A real browser signs in, walks your pages and hands back an MP4 with a spoken voice-over, captions and a transcript. One Windows app, from a single link.
        </motion.p>
        <motion.div className="actions" {...line(4)}>
          <DownloadButton big />
        </motion.div>
        <motion.p className="fineprint" {...line(5)}>
          Free and open source. Windows 10 or 11, 64-bit. Also as an <a href={WINDOWS_MSI_URL}>.msi installer</a>.
        </motion.p>

        <motion.div
          className="ring"
          id="demo"
          initial={still ? false : { opacity: 0, y: 60, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1.1, ease: [0.2, 0.7, 0.2, 1], delay: 0.55 }}
        >
          <div className="app">
            <WindowBar title={<span className="mono">Estate360 · real output, unedited</span>}>
              <span className="live">REC</span>
            </WindowBar>
            <div className="app-body">
              <figure className="screen">
                <video
                  ref={video}
                  controls
                  playsInline
                  muted
                  preload="metadata"
                  poster="/assets/demo-poster.jpg"
                  onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
                >
                  <source src="/assets/demo.mp4" type="video/mp4" />
                  <source src="/assets/demo.webm" type="video/webm" />
                  <track kind="captions" src="/assets/demo.vtt" srcLang="en" label="Narration" default />
                </video>
              </figure>
              <aside className="side" aria-label="Narration transcript">
                <div className="side-head">
                  <span className="side-title"><BrandMark size={16} /> Narration</span>
                  <span className="mono">click to seek</span>
                </div>
                <ol className="cues" ref={list}>
                  {cues.map((c, i) => (
                    <li key={i}>
                      <button
                        className={i === active ? "on" : ""}
                        onClick={() => {
                          const v = video.current;
                          if (!v) return;
                          v.currentTime = c.start + 0.01;
                          v.play().catch(() => {});
                        }}
                      >
                        <time>{clock(c.start)}</time>
                        <span>{c.text}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </aside>
            </div>
            <div className="app-foot">
              <span className="chip"><Film size={14} />walkthrough.mp4</span>
              <span className="chip"><Captions size={14} />captions.vtt</span>
              <span className="chip"><FileText size={14} />transcript.txt</span>
              <span className="chip"><Globe size={14} />6 pages <b>200 OK</b></span>
            </div>
          </div>
        </motion.div>

        <div className="strip" aria-label="What you get">
          {STRIP.map(([Icon, label], i) => (
            <motion.span
              key={label}
              initial={still ? false : { opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06 }}
            >
              <Icon size={20} />
              {label}
            </motion.span>
          ))}
        </div>
      </div>
    </section>
  );
}
