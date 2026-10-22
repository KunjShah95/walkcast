import { AnimatePresence, motion, useAnimationFrame, useInView, useReducedMotion, useScroll, useTransform } from "motion/react";
import {
  AppWindow,
  AudioLines,
  CalendarClock,
  Captions,
  Clapperboard,
  FileText,
  Film,
  GraduationCap,
  Handshake,
  LifeBuoy,
  ListOrdered,
  Lock,
  Pause,
  Play,
  Plus,
  Presentation,
  Rocket,
  ScanEye,
  ShieldCheck,
  Sparkles,
  Webhook,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ISSUES_URL, LAB_URL, LICENSE_URL, LINUX_APPIMAGE_URL, LINUX_DEB_URL, RELEASES_URL, REPO_URL, VERSION, WINDOWS_EXE_URL, WINDOWS_MSI_URL } from "../site.ts";
import { AppleIcon, BrandMark, DownloadButton, Eyebrow, GithubIcon, LinuxIcon, Reveal, Tile, WindowsIcon } from "../ui.tsx";
import { AUTHOR, FAQ } from "../content.ts";

/* ------------------------------------------------------------------ bento */

function Count({ to, className }: { to: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const still = useReducedMotion();
  const [n, setN] = useState(still ? to : 0);
  useEffect(() => {
    if (!inView || still) return;
    let f = 0;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 1100);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) f = requestAnimationFrame(step);
    };
    f = requestAnimationFrame(step);
    return () => cancelAnimationFrame(f);
  }, [inView, still, to]);
  return (
    <span ref={ref} className={className}>
      {n}
    </span>
  );
}

const STATES = [
  ["Recording", "#c0321c"],
  ["Signing in", "#d9a441"],
  ["Stopped safely", "#9c5700"],
  ["Done", "#2c6a3d"],
] as const;

function Statuses() {
  const still = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  // The cycle only runs while the card is on screen. A row of pills flipping forever in a
  // section nobody is looking at is a timer that never stops.
  const inView = useInView(ref, { margin: "-20%" });
  const [i, setI] = useState(0);
  useEffect(() => {
    if (still || !inView) return;
    const id = setInterval(() => setI((v) => (v + 1) % STATES.length), 1400);
    return () => clearInterval(id);
  }, [still, inView]);
  return (
    <div className="states" ref={ref}>
      {STATES.map(([label, color], k) => (
        <span key={label} className={`state ${k === i ? "on" : ""}`}>
          {k === i && <motion.span className="state-bg" layoutId="state-bg" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
          <i style={{ background: color }} />
          <span>{label}</span>
        </span>
      ))}
    </div>
  );
}

function Wave() {
  const still = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  // Same rule as the status pills: the bars hold still until the card is in view.
  const inView = useInView(ref, { margin: "-20%" });
  const bars = [6, 12, 9, 18, 26, 14, 30, 20, 11, 24, 16, 8, 14, 6];
  return (
    <div className="wave" aria-hidden="true" ref={ref}>
      {bars.map((h, i) => (
        <motion.i
          key={i}
          style={{ height: h }}
          animate={still || !inView ? undefined : { scaleY: [1, 0.45, 1.15, 0.7, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.07, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

function Card({ className = "", children, delay = 0 }: { className?: string; children: ReactNode; delay?: number }) {
  return (
    <Reveal className={`bento-card ${className}`} delay={delay}>
      {children}
    </Reveal>
  );
}

export function Bento() {
  return (
    <section className="sec" id="studio">
      <div className="wrap">
        <Reveal className="sec-head center">
          <Eyebrow n={4}>The app</Eyebrow>
          <h2>
            One run, <Tile icon={Clapperboard} tone="ink" tilt={-6} /> five files.
            <br />
            <span className="dim">Every page visited, with its status.</span>
          </h2>
        </Reveal>
        <div className="bento">
          <Card className="b-pages">
            <h3>Walks the whole site in one go.</h3>
            <p>Visits your site the way a first-time user would, page by page, and records all of it.</p>
            <div className="path-chips">
              {["/", "/product", "/pricing", "/contact", "/login", "/signup", "/dashboard", "/leads"].map((p, i) => (
                <motion.span
                  key={p}
                  className="mono"
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 + i * 0.05 }}
                >
                  {p}
                </motion.span>
              ))}
            </div>
            <div className="big-num">
              <Count to={30} className="num" />
              <span>
                <b>pages per recording</b>
                <small>8 by default, 30 at most. Same site only. Paced, and robots.txt is respected.</small>
              </span>
            </div>
          </Card>
          <Card className="b-formats" delay={0.05}>
            <h3>Every format. Same take.</h3>
            <div className="fmt">
              <span className="fmt-wide"><Film size={14} /> .mp4</span>
              <span className="fmt-tall"><Film size={14} /> .webm</span>
            </div>
          </Card>
          <Card className="b-files" delay={0.1}>
            <div className="huge"><Count to={5} /></div>
            <div className="files-row" aria-hidden="true">
              {[Film, Film, Captions, FileText, AudioLines].map((I, k) => (
                <span key={k}><I size={15} /></span>
              ))}
            </div>
            <h3>files per run</h3>
            <p>MP4, WebM, captions, a transcript and the page list.</p>
          </Card>
          <Card className="b-dark" delay={0.15}>
            <span className="rec-tag">REC</span>
            <div className="huge">HD</div>
            <h3>The whole visit</h3>
            <p>H.264 video with captions on, ready to share.</p>
          </Card>
          <Card className="b-setup">
            <h3>Works with your setup.</h3>
            <p>Install on Windows, sign in to the site you test, and press Record. Nothing to configure first.</p>
            <div className="setup-chips">
              {[
                [<WindowsIcon key="w" />, "Windows 10 / 11", true],
                [<AppWindow key="c" size={15} />, "Chromium", true],
                [<Film key="f" size={15} />, "ffmpeg encoder", true],
                [<GithubIcon key="g" />, "Open source", true],
                [<Lock key="l" size={15} />, "Optional account", false],
              ].map(([icon, label, on]) => (
                <span key={label as string} className="setup-chip">
                  {icon}
                  {label}
                  <i className={on ? "on" : ""} />
                </span>
              ))}
            </div>
          </Card>
          <Card className="b-voice" delay={0.05}>
            <span className="soft-ic"><AudioLines size={18} /></span>
            <Wave />
            <h3>A voice, if you want one</h3>
            <p>Pick it before your first recording: your own ElevenLabs or OpenAI key, a basic offline voice, or captions only.</p>
          </Card>
          <Card className="b-safe" delay={0.1}>
            <span className="soft-ic"><ShieldCheck size={18} /></span>
            <div className="redact mono">
              <span>password</span>
              <span className="bar"><motion.i initial={{ width: "0%" }} whileInView={{ width: "100%" }} viewport={{ once: true }} transition={{ duration: 1.4, delay: 0.3 }} /></span>
              <span>[hidden]</span>
            </div>
            <h3>Never saves a password</h3>
            <p>Held in memory for the run, then dropped.</p>
          </Card>
          <Card className="b-mini">
            <h3>Pick up any run in the Library.</h3>
            <div className="thumbs" aria-hidden="true">
              <span className="sel"><i /></span>
              <span />
              <span className="tall" />
              <span className="dark" />
            </div>
          </Card>
          <Card className="b-states" delay={0.05}>
            <h3>Always know where it is.</h3>
            <Statuses />
          </Card>
          <Card className="b-auto">
            <span className="soft-ic"><CalendarClock size={18} /></span>
            <h3>Put the walk on a schedule.</h3>
            <p>Every morning, every Monday at nine, or any five-field cron. Each visit lands in the Library, where the what-changed panel can line it up against an earlier visit.</p>
            <div className="auto-days" aria-hidden="true">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <span key={i} className={i === 4 ? "on" : ""}>{d}</span>
              ))}
              <b>09:00</b>
            </div>
          </Card>
          <Card className="b-hook" delay={0.05}>
            <span className="soft-ic"><Webhook size={18} /></span>
            <h3>Send it into your stack.</h3>
            <p>A <code>job.completed</code> webhook posts to Slack, Zapier or your own server when a walkthrough or Lab run finishes. Deliveries retry, and the app logs every attempt.</p>
            <div className="hook-line" aria-hidden="true">
              <span>POST /hooks/walkcast</span>
              <b>200 OK</b>
            </div>
          </Card>
          <Card className="b-guide">
            <div className="guide-copy">
              <span className="soft-ic"><ListOrdered size={18} /></span>
              <div>
                <h3>The same visit, as a written guide.</h3>
                <p>Every page and every click as numbered steps, each with the picture the recorder took. Read it in the app, send it with a share link, or copy the Markdown into your docs.</p>
              </div>
            </div>
            <div className="guide-sheet" aria-hidden="true">
              {["Open the shop", "Click the product", "Fill in the form"].map((t, k) => (
                <span key={t} className={`guide-row ${k === 0 ? "on" : ""}`}>
                  <b>{k + 1}</b>
                  <span className="gs-lines">
                    <i />
                    <i />
                  </span>
                  <span className="gs-shot" />
                </span>
              ))}
            </div>
          </Card>
          <Card className="b-private">
            <span className="soft-ic white"><Lock size={18} /></span>
            <span>
              <b>Private by design.</b>
              <small>Recordings, the browser and your passwords stay on your PC. Nothing is uploaded unless you share it.</small>
            </span>
            <WindowsIcon width={26} height={26} />
          </Card>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ use cases marquee */

const USES: { title: string; text: string; art: ReactNode }[] = [
  {
    title: "Onboarding",
    text: "Show new users around before their first login.",
    art: (
      <>
        <div className="bw" />
        <i className="bar" style={{ left: 40, top: 58, width: "46%" }} />
        <i className="bar" style={{ left: 40, top: 76, width: "30%" }} />
        <i className="blk anim-a" style={{ left: 40, top: 100, width: "34%", height: 62, background: "#dce7fd" }} />
        <i className="blk anim-b" style={{ left: "47%", top: 100, width: "34%", height: 62, background: "#fde7c4" }} />
        <span className="tag" style={{ right: 16, top: 14, color: "#2d4f73" }}>Step 1 of 4</span>
      </>
    ),
  },
  {
    title: "Product demos",
    text: "A full product tour for sales calls, from one link.",
    art: (
      <>
        <div className="bw" />
        <i className="blk" style={{ left: 40, top: 54, right: 40, height: 86, background: "linear-gradient(135deg,#ffd9cc,#ffe9b8)" }} />
        <span className="pb anim-pulse" style={{ left: "calc(50% - 22px)", top: 75 }}><Play size={15} fill="#fff" /></span>
        <span className="cap">Opening the product page.</span>
      </>
    ),
  },
  {
    title: "Help articles",
    text: "Drop the video and its transcript into a support doc.",
    art: (
      <>
        <div className="bw" />
        <i className="bar" style={{ left: 40, top: 56, width: "56%" }} />
        <i className="bar" style={{ left: 40, top: 74, width: "64%" }} />
        <i className="bar" style={{ left: 40, top: 92, width: "48%" }} />
        <i className="blk" style={{ left: 40, top: 116, width: "44%", height: 48, background: "#e9e2fd" }} />
        <span className="tag anim-b" style={{ right: 20, top: 110 }}>captions.vtt</span>
      </>
    ),
  },
  {
    title: "QA evidence",
    text: "A recorded pass over the site, with every status.",
    art: (
      <>
        <div className="bw" />
        <span className="tag" style={{ left: 40, top: 56, color: "#2c6a3d" }}>/pricing 200</span>
        <span className="tag" style={{ left: 40, top: 90, color: "#2c6a3d" }}>/product 200</span>
        <span className="tag anim-pulse" style={{ left: 40, top: 124, color: "#c0321c" }}>/billing 500</span>
        <i className="blk" style={{ right: 36, top: 58, width: 70, height: 92, background: "#dcf3e3" }} />
      </>
    ),
  },
  {
    title: "Client handover",
    text: "Walk the client through the site you built, no call.",
    art: (
      <>
        <div className="bw" />
        <i className="blk" style={{ left: 40, top: 56, width: "40%", height: 108, background: "#f3f3f1" }} />
        <i className="blk anim-a" style={{ left: "calc(40px + 40% + 10px)", top: 56, right: 40, height: 49, background: "#fde3ec" }} />
        <i className="blk anim-b" style={{ left: "calc(40px + 40% + 10px)", top: 115, right: 40, height: 49, background: "#fff1c9" }} />
      </>
    ),
  },
  {
    title: "Release notes",
    text: "Record what changed after every deploy.",
    art: (
      <>
        <div className="bw" />
        <i className="bar" style={{ left: 40, top: 60, width: "40%" }} />
        <i className="blk" style={{ left: 40, top: 84, right: 40, height: 30, background: "#e8f0fe" }} />
        <i className="blk anim-a" style={{ left: 40, top: 122, width: "50%", height: 30, background: "#e8f0fe" }} />
        <span className="tag" style={{ right: 16, top: 14 }}>v2.4 → v2.5</span>
      </>
    ),
  },
];
const USE_ICONS = [GraduationCap, Presentation, LifeBuoy, ScanEye, Handshake, Rocket];

export function Uses() {
  const still = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const ref = useRef<HTMLElement>(null);
  // The track scrolls for 48 seconds. It only needs to do that while it can be seen.
  const inView = useInView(ref, { margin: "-10%" });
  const stop = paused || !!still || !inView;
  return (
    <section className="sec" id="uses" ref={ref}>
      <div className="wrap uses-head">
        <Reveal>
          <h2>
            One recorder. <Tile icon={Sparkles} tone="violet" tilt={-6} />
            <br />
            <span className="dim">Six ways to use the same visit.</span>
          </h2>
        </Reveal>
        <button className="pill sm" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
          {paused ? <Play size={13} fill="currentColor" /> : <Pause size={13} fill="currentColor" />}
          {paused ? "Play animations" : "Pause animations"}
        </button>
      </div>
      <div className={`marquee ${stop ? "paused" : ""}`}>
        <div className="marquee-track">
          {[...USES, ...USES].map((u, i) => {
            const Icon = USE_ICONS[i % USES.length]!;
            return (
              <article className="use" key={i} aria-hidden={i >= USES.length}>
                <div className="art" aria-hidden="true">{u.art}</div>
                <h3><Icon size={16} />{u.title}</h3>
                <p>{u.text}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ faq */


export function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section className="sec" id="faq">
      <div className="wrap faq">
        <Reveal>
          <h2 className="faq-title">Before you<br /><span className="dim">press record.</span></h2>
          <p className="lede left">Everything you might want to know before your first recording.</p>
          <div className="ask">
            <b>Still have a question?</b>
            <p>Open an issue and we will help you get set up.</p>
            <a className="pill solid" href={ISSUES_URL}><GithubIcon />Ask on GitHub</a>
          </div>
        </Reveal>
        <Reveal className="qa" delay={0.08}>
          {FAQ.map(([q, a], i) => {
            const on = open === i;
            return (
              <div key={q} className={`qa-item ${on ? "open" : ""}`}>
                <h3>
                  <button aria-expanded={on} aria-controls={`qa-${i}`} onClick={() => setOpen(on ? -1 : i)}>
                    <span className="n mono">{String(i + 1).padStart(2, "0")}</span>
                    <span className="q">{q}</span>
                    <motion.span className="x" animate={{ rotate: on ? 45 : 0 }} transition={{ type: "spring", stiffness: 400, damping: 26 }}>
                      <Plus size={15} />
                    </motion.span>
                  </button>
                </h3>
                <AnimatePresence initial={false}>
                  {on && (
                    <motion.div
                      id={`qa-${i}`}
                      key="a"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.2, 0.7, 0.2, 1] }}
                      style={{ overflow: "hidden" }}
                    >
                      <p>{a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ closing hub */

/** Files in flight on each curve at once. */
const DOTS = 2;

const HUB = [
  { label: "walkthrough.mp4", meta: "1:11 · H.264", icon: Film, color: "#c0321c", side: "l", y: 0.28 },
  { label: "captions.vtt", meta: "13 lines", icon: Captions, color: "#9c5700", side: "l", y: 0.72 },
  { label: "transcript.txt", meta: "6 pages", icon: FileText, color: "#2d4f73", side: "r", y: 0.28 },
  { label: "narration.wav", meta: "optional voice", icon: AudioLines, color: "#2c6a3d", side: "r", y: 0.72 },
] as const;

export function Closing() {
  const still = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(900);
  const [t, setT] = useState(0);
  const [hot, setHot] = useState(false); // the download button is under the pointer or focused
  const inView = useInView(ref, { margin: "-10%" });
  const paths = useRef<(SVGPathElement | null)[]>([]);
  const dots = useRef<(SVGCircleElement | null)[]>([]);
  const phase = useRef(0);
  const speed = useRef(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // The record clock runs only while the panel is on screen, so it reads 00:00:00 when it arrives.
  useEffect(() => {
    if (still || !inView) return;
    const id = setInterval(() => setT((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [still, inView]);
  // The files leave the recorder along the curves. Hovering the download button speeds the
  // flow up, easing in and out of it, so the button reads as the thing that starts all of this.
  useAnimationFrame((_, delta) => {
    if (still || !inView) return;
    speed.current += ((hot ? 2.6 : 1) - speed.current) * (1 - Math.exp(-delta / 220));
    phase.current = (phase.current + (delta / 2600) * speed.current) % 1;
    HUB.forEach((_, i) => {
      const path = paths.current[i];
      if (!path) return;
      const len = path.getTotalLength();
      for (let k = 0; k < DOTS; k++) {
        const dot = dots.current[i * DOTS + k];
        if (!dot) continue;
        const f = (phase.current + k / DOTS + i * 0.13) % 1;
        const pt = path.getPointAtLength(f * len);
        dot.setAttribute("cx", String(pt.x));
        dot.setAttribute("cy", String(pt.y));
        // Fade in leaving the core, fade out arriving at the file.
        dot.setAttribute("opacity", String(Math.min(1, f * 6, (1 - f) * 6)));
      }
    });
  });
  const clockText = `${String(Math.floor(t / 3600)).padStart(2, "0")}:${String(Math.floor(t / 60) % 60).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  const H = 260;
  const cx = w / 2;
  const cy = H / 2;
  const nodeX = (side: string) => (side === "l" ? 180 : w - 180);
  return (
    <section className="sec" id="get">
      <div className="wrap">
        <Reveal className="closing">
          <h2>
            Your site has <Tile icon={AppWindow} tone="ink" tilt={-6} /> pages.
            <br />
            <span className="dim">Now it has a <Tile icon={Play} tone="rec" tilt={5} fill /> video tour.</span>
          </h2>
          <div ref={ref} className="hub" style={{ height: H }}>
            <svg width={w} height={H} aria-hidden="true">
              {HUB.map((n) => {
                const x = nodeX(n.side);
                const y = n.y * H;
                const d = `M ${cx} ${cy} C ${(cx + x) / 2} ${cy}, ${(cx + x) / 2} ${y}, ${x} ${y}`;
                const i = HUB.indexOf(n);
                return (
                  <g key={n.label}>
                    <path ref={(el) => { paths.current[i] = el; }} d={d} fill="none" stroke="#c9c8c3" strokeWidth={1.3} />
                    {!still &&
                      Array.from({ length: DOTS }, (_, k) => (
                        <circle key={k} ref={(el) => { dots.current[i * DOTS + k] = el; }} r={3.5} fill={n.color} cx={cx} cy={cy} opacity={0} />
                      ))}
                  </g>
                );
              })}
            </svg>
            <div className="hub-core" style={{ left: cx, top: cy }}>
              <span className="hub-ic"><BrandMark size={52} /></span>
              <span className="live mono" aria-hidden="true">REC {clockText}</span>
            </div>
            {HUB.map((n) => {
              const I = n.icon;
              return (
                <div key={n.label} className={`hub-node ${n.side} ${hot ? "hot" : ""}`} style={{ top: n.y * H - 26, [n.side === "l" ? "left" : "right"]: 0 }}>
                  <span className="node-ic" style={{ background: n.color }}><I size={15} /></span>
                  <span>
                    <b className="mono">{n.label}</b>
                    <small>{n.meta}</small>
                  </span>
                </div>
              );
            })}
          </div>
          <motion.p
            className="closing-cue"
            initial={false}
            animate={still || t >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
          >
            Your tour is one click away.
          </motion.p>
          <span
            className="closing-dl"
            onMouseEnter={() => setHot(true)}
            onMouseLeave={() => setHot(false)}
            onFocus={() => setHot(true)}
            onBlur={() => setHot(false)}
          >
            <DownloadButton big />
          </span>
          <p className="fineprint">Free. Windows, macOS (Apple Silicon) and Linux. Version {VERSION}.</p>
          <p className="fineprint">
            The installers are not code-signed yet, so Windows may show "Windows protected your PC" and macOS may block
            the first launch. Both are expected, and the <a href="/download">download page</a> has the steps to get past
            them.
          </p>
          <p className="fineprint">
            Built by <a href={AUTHOR.url}>{AUTHOR.name}</a>. If it does not do what you need,{" "}
            <a href={ISSUES_URL}>open an issue</a> and tell us what you were trying to do.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ footer */

export function Footer() {
  return (
    <footer>
      <div className="wrap">
        <div className="foot">
          <div>
            <a className="brand" href="/#top"><BrandMark />walkcast</a>
            <p>
              A free desktop app that opens your website in a real browser, signs in, walks your pages and records
              the whole visit as a video.
            </p>
            <DownloadButton />
            <span className="ver mono"><a href={RELEASES_URL}>v{VERSION}</a> · Windows 10/11 · x64</span>
          </div>
          <div>
            <h4>Product</h4>
            <ul>
              <li><a href="/#what">How it works</a></li>
              <li><a href="/#compare">Compare</a></li>
              <li><a href="/#login">Logins</a></li>
              <li><a href="/#studio">The app</a></li>
              <li><a href="/#agents">Walkcast Lab</a></li>
              <li><a href="/#uses">Use cases</a></li>
              <li><a href="/#pricing">Pricing</a></li>
              <li><a href="/pricing">Pricing details</a></li>
              <li><a href="/download">All downloads</a></li>
              <li><a href="/#faq">FAQ</a></li>
            </ul>
          </div>
          <div>
            <h4>Download</h4>
            <ul>
              <li><a href={WINDOWS_EXE_URL}><WindowsIcon width={14} height={14} />Windows .exe</a></li>
              <li><a href={WINDOWS_MSI_URL}><WindowsIcon width={14} height={14} />Windows .msi</a></li>
              <li><a href={LINUX_APPIMAGE_URL}><LinuxIcon width={14} height={14} />Linux .AppImage</a></li>
              <li><a href={LINUX_DEB_URL}><LinuxIcon width={14} height={14} />Linux .deb</a></li>
              <li><a href={RELEASES_URL}><Rocket size={14} />All releases</a></li>
            </ul>
          </div>
          <div>
            <h4>Learn</h4>
            <ul>
              <li><a href="/guides">All guides</a></li>
              <li><a href="/guides/product-demo-video">Product demo video</a></li>
              <li><a href="/guides/website-tutorial-video">Website tutorial video</a></li>
              <li><a href="/compare/loom">Loom alternative</a></li>
              <li><a href="/compare/scribe">Scribe alternative</a></li>
              <li><a href="/compare/screen-studio">Screen Studio alternative</a></li>
              <li><a href="/compare/screen-recording">vs screen recording</a></li>
              <li><a href="/faq">All questions</a></li>
            </ul>
          </div>
          <div>
            <h4>Project</h4>
            <ul>
              <li><a href={REPO_URL}>Source on GitHub</a></li>
              <li><a href={LAB_URL}>Walkcast Lab</a></li>
              <li><a href={ISSUES_URL}>Issues</a></li>
              <li><a href={LICENSE_URL}>MIT License</a></li>
            </ul>
          </div>
        </div>
        <div className="legal">
          <span>© 2026 Walkcast. Open source under MIT.</span>
          <a href="/privacy">Privacy</a>
          <a href="/download">Download details</a>
          <a href="/pricing.md" rel="noopener">
            pricing.md
          </a>
          <a href="/llms.txt" rel="noopener">
            llms.txt
          </a>
          <a href={REPO_URL} aria-label="Walkcast on GitHub"><GithubIcon width={17} height={17} /></a>
        </div>
      </div>
      <Wordmark />
    </footer>
  );
}

/**
 * The huge faded name at the foot of every page. Its fill wipes in left to right as the reader
 * scrolls the last stretch, so the page ends on the name being written.
 */
function Wordmark() {
  const still = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start 0.85"] });
  const clip = useTransform(scrollYProgress, [0, 1], ["inset(0 100% 0 0)", "inset(0 0% 0 0)"]);
  return (
    <div className="word" aria-hidden="true" ref={ref}>
      walkcast
      <motion.span className="word-fill" style={{ clipPath: still ? "none" : clip }}>walkcast</motion.span>
    </div>
  );
}
