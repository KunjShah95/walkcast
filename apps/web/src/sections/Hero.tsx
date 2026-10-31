import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { ArrowRight, Captions, Check, FileText, Film, Globe, Pause, Play } from "lucide-react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { LINUX_APPIMAGE_URL, RELEASES_URL, WINDOWS_EXE_URL } from "../site.ts";
import { BrandMark, DownloadButton } from "../ui.tsx";

interface Cue {
  start: number;
  end: number;
  text: string;
}

const secs = (t: string) => t.split(":").reduce((a, v) => a * 60 + parseFloat(v), 0);
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** The sections, in one place: the bar and the phone sheet read the same list. */
const NAV_LINKS: [string, string][] = [
  ["How it works", "/#what"],
  ["Compare", "/#compare"],
  ["Use cases", "/#uses"],
  ["Pricing", "/#pricing"],
  ["Lab", "/lab"],
  ["FAQ", "/#faq"],
];

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
  const [open, setOpen] = useState(false);
  const still = useReducedMotion();
  // How far down the page the reader is. Drawn as a hairline along the foot of the bar, so the
  // nav says where you are on a page this long without asking for a second click.
  const { scrollYProgress } = useScroll();
  useEffect(() => {
    const on = () => setScrolled(scrollY > 8);
    on();
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);
  // The sheet is the only nav under 640px, so it has to behave like one: Escape closes it, a
  // resize past the breakpoint closes it, and the page behind it does not scroll while it is up.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onWide = () => {
      if (matchMedia("(min-width: 641px)").matches) setOpen(false);
    };
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    addEventListener("keydown", onKey);
    addEventListener("resize", onWide);
    return () => {
      document.body.style.overflow = overflow;
      removeEventListener("keydown", onKey);
      removeEventListener("resize", onWide);
    };
  }, [open]);
  return (
    <header className={`nav ${scrolled ? "scrolled" : ""} ${open ? "open" : ""}`}>
      <div className="wrap nav-row">
        <a className="brand" href="/#top" aria-label="Walkcast home" onClick={() => setOpen(false)}>
          <BrandMark size={21} />
          walkcast
        </a>
        <nav className="nav-links" aria-label="Main">
          {NAV_LINKS.map(([label, href]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
        </nav>
        <div className="nav-end">
          <DownloadButton label="Download" className="nav-cta" />
          <button
            className="nav-burger"
            type="button"
            aria-expanded={open}
            aria-controls="nav-sheet"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            key="sheet"
            id="nav-sheet"
            className="nav-sheet"
            initial={still ? false : { opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={still ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <nav aria-label="Sections">
              {NAV_LINKS.map(([label, href], i) => (
                <motion.a
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  initial={still ? false : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, ease: [0.2, 0.7, 0.2, 1], delay: 0.04 + i * 0.035 }}
                >
                  <span className="mono nav-sheet-n">{String(i + 1).padStart(2, "0")}</span>
                  {label}
                  <ArrowRight size={15} aria-hidden="true" />
                </motion.a>
              ))}
            </nav>
            <p className="nav-sheet-foot">
              Free, MIT licensed · Windows &amp; Linux ·{" "}
              <a href="/download" onClick={() => setOpen(false)}>
                All downloads
              </a>
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.span className="nav-progress" style={{ scaleX: scrollYProgress }} aria-hidden="true" />
    </header>
  );
}

/**
 * The product shot: the real demo recording, running, with the narration it spoke on the
 * caption bar and the visit log underneath. Nothing here is drawn to look like a recording.
 */
/** The address the demo recording visited. The hero types it, as if pasted, before the visit starts. */
const DEMO_URL = "agentic-crm-henna.vercel.app";

/**
 * "Paste a link", acted out: the address types into the bar, a load line runs along it, and only
 * then does the recording start. Returns how much of the address shows and whether it has loaded.
 * The prerendered page shows the whole address; the typing starts after hydration.
 */
function useTypedUrl(still: boolean) {
  const [typed, setTyped] = useState(DEMO_URL.length);
  const [loaded, setLoaded] = useState(true);
  useEffect(() => {
    if (still) return;
    setTyped(0);
    setLoaded(false);
    let i = 0;
    let tick: ReturnType<typeof setTimeout>;
    const type = () => {
      i += 1;
      setTyped(i);
      if (i < DEMO_URL.length) tick = setTimeout(type, 28 + Math.random() * 34);
      else tick = setTimeout(() => setLoaded(true), 720);
    };
    // Wait for the window to settle into place before the first keystroke.
    tick = setTimeout(type, 900);
    return () => clearTimeout(tick);
  }, [still]);
  return { typed, loaded, typing: typed < DEMO_URL.length };
}

function StageShot({ wide = false }: { wide?: boolean }) {
  const still = useReducedMotion();
  const { typed, loaded, typing } = useTypedUrl(!!still);
  const shot = useRef<HTMLDivElement>(null);
  // The window leans back as it comes up from below the fold and stands flat as it reaches the
  // reader, the way a laptop lid opens. Transform only, so it never costs a layout.
  const { scrollYProgress } = useScroll({ target: shot, offset: ["start end", "start 0.2"] });
  const tilt = useTransform(scrollYProgress, [0, 1], [16, 0]);
  const lift = useTransform(scrollYProgress, [0, 1], [0.93, 1]);
  const cues = useCues("/assets/demo.vtt");
  const video = useRef<HTMLVideoElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const [now, setNow] = useState(0);
  const [playing, setPlaying] = useState(false);
  // The line being spoken: the last one the recorder started, kept up through the gaps
  // between lines, so the caption never blinks back to a placeholder.
  let spoken: Cue | undefined;
  for (const c of cues) if (now >= c.start) spoken = c;
  const active = spoken ? cues.indexOf(spoken) : -1;

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.muted = true;
    if (still || !loaded) return;
    // Start on the recorded site, not on the blank first frame the visit opens with.
    const open = () => {
      v.currentTime = 12;
      v.play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    };
    if (v.readyState >= 1) open();
    else v.addEventListener("loadedmetadata", open, { once: true });
    return () => v.removeEventListener("loadedmetadata", open);
  }, [still, loaded]);

  useEffect(() => {
    const el = list.current?.children[active] as HTMLElement | undefined;
    if (el && list.current) list.current.scrollTo({ top: el.offsetTop - 8, behavior: "smooth" });
  }, [active]);

  const play = () => {
    const v = video.current;
    if (!v) return;
    v.play()
      .then(() => setPlaying(true))
      .catch(() => {});
  };

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) play();
    else {
      v.pause();
      setPlaying(false);
    }
  };

  const seek = (t: number) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = t + 0.01;
    play();
  };

  return (
    <motion.div
      ref={shot}
      className="stage-shot"
      id="demo"
      initial={still ? false : { opacity: 0, y: 36, scale: 0.975 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 1.05, ease: [0.2, 0.7, 0.2, 1], delay: 0.2 }}
    >
      <motion.div className="mat stage-mat" style={still ? undefined : { rotateX: tilt, scale: lift }}>
        <div className={`stage-card ${wide ? "stage-wide" : ""}`}>
          <div className="stage-bar">
            <span className="lights" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className={`stage-url mono ${typing ? "typing" : ""}`}>
              {DEMO_URL.slice(0, typed)}
              {!loaded && <span className="caret" aria-hidden="true" />}
            </span>
            {/* The load line: runs once the address is in, then the recording starts. */}
            {typed === DEMO_URL.length && !loaded && <span className="stage-load" aria-hidden="true" />}
            <span className={`live ${loaded ? "" : "idle"}`}>REC</span>
          </div>

          <div className="stage-screen">
            <video
              ref={video}
              muted
              loop
              playsInline
              preload="metadata"
              poster="/assets/demo-poster.jpg"
              onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
            >
              <source src="/assets/demo.mp4" type="video/mp4" />
              <source src="/assets/demo.webm" type="video/webm" />
            </video>
            <p className="stage-cap">
              {spoken?.text ?? "A real browser signs in, walks the pages and narrates what it did."}
            </p>
            <button className="stage-play" onClick={toggle} aria-label={playing ? "Pause the recording" : "Play the recording"}>
              {playing ? <Pause size={13} /> : <Play size={13} />}
            </button>
          </div>

          <div className="stage-side">
            <div className="stage-side-head">
              <span className="stage-title">
                <BrandMark size={15} /> Visit log
              </span>
              <span className="mono">click to seek</span>
            </div>
            <ol className="stage-cues" ref={list}>
              {cues.map((c, i) => (
                <li key={i}>
                  <button
                    className={i === active ? "on" : ""}
                    onClick={() => seek(c.start)}
                    aria-current={i === active ? "true" : undefined}
                  >
                    <time>{clock(c.start)}</time>
                    <span>{c.text}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>

          <div className="stage-foot">
            <span className="chip">
              <Film size={13} /> walkthrough.mp4
            </span>
            <span className="chip">
              <Captions size={13} /> captions.vtt
            </span>
            <span className="chip">
              <FileText size={13} /> transcript.txt
            </span>
            <span className="chip">
              <Globe size={13} /> 6 pages <b>200 OK</b>
            </span>
          </div>
        </div>
      </motion.div>
      <span className="stage-tab mono">A real recording · unedited</span>
    </motion.div>
  );
}

export function Hero() {
  const still = useReducedMotion();

  const line = (i: number) => ({
    initial: still ? false : { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.8, ease: [0.2, 0.7, 0.2, 1] as const, delay: 0.06 + i * 0.1 },
  });

  return (
    <section className="hero" id="top">
      <div className="hero-aura" aria-hidden="true" />
      <div className="wrap">
        <div className="hero-copy">
          <motion.a className="announce" href={RELEASES_URL} target="_blank" rel="noopener" {...line(0)}>
            <span className="announce-tag">New in 0.5</span>
            <span>Notes on a walkthrough, share links and a run budget</span>
            <ArrowRight size={14} />
          </motion.a>
          <h1>
            <motion.span className="line" {...line(1)}>
              Paste a link. Get a <em className="serif hl hero-hl">video tour</em>{" "}
            </motion.span>
            <motion.span className="line" {...line(2)}>
              of your site. <span className="dim">Nothing to film.</span>
            </motion.span>
          </h1>
          <motion.p className="lede" {...line(3)}>
            Every launch needs a walkthrough. Nobody enjoys making it. Walkcast is a free desktop app: a real browser
            opens your site, signs in and clicks through your pages. You get the visit as an MP4 with captions, a
            transcript and an optional voice-over.
          </motion.p>
          <motion.div className="hero-dl" {...line(4)}>
            <div className="hero-ctas">
              <DownloadButton big />
              <a className="pill ghost big" href="#demo">
                <Play size={15} fill="currentColor" /> Watch a real recording
              </a>
            </div>
            <ul className="trust" aria-label="What it costs and includes">
              {["Free, MIT licensed", "No account needed", "No watermark on the video", "Every seat included"].map((t, i) => (
                <li key={t} style={{ "--i": i } as CSSProperties}>
                  <Check size={14} strokeWidth={2.8} />
                  {t}
                </li>
              ))}
            </ul>
            <p className="fineprint">
              Installers for <a href={WINDOWS_EXE_URL}>Windows</a> and{" "}              <a href={LINUX_APPIMAGE_URL}>Linux</a> · <a href="/download">All downloads</a>
            </p>
          </motion.div>
        </div>

        <StageShot wide />
      </div>
    </section>
  );
}
