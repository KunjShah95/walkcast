import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import {
  AppWindow,
  AudioLines,
  Captions,
  Check,
  Clapperboard,
  Download,
  FileText,
  Film,
  Gift,
  GraduationCap,
  Handshake,
  LifeBuoy,
  Lock,
  Pause,
  Play,
  Plus,
  Presentation,
  Rocket,
  ScanEye,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ISSUES_URL, LICENSE_URL, RELEASES_URL, REPO_URL, VERSION, WINDOWS_EXE_URL, WINDOWS_MSI_URL } from "../site.ts";
import { BrandMark, DownloadButton, Eyebrow, GithubIcon, Reveal, Tile, WindowsIcon } from "../ui.tsx";

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
  ["Signing in", "#f6c343"],
  ["Stopped safely", "#7a5af8"],
  ["Done", "#2c8a4a"],
] as const;

function Statuses() {
  const still = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (still) return;
    const id = setInterval(() => setI((v) => (v + 1) % STATES.length), 1400);
    return () => clearInterval(id);
  }, [still]);
  return (
    <div className="states">
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
  const bars = [6, 12, 9, 18, 26, 14, 30, 20, 11, 24, 16, 8, 14, 6];
  return (
    <div className="wave" aria-hidden="true">
      {bars.map((h, i) => (
        <motion.i
          key={i}
          style={{ height: h }}
          animate={still ? undefined : { scaleY: [1, 0.45, 1.15, 0.7, 1] }}
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
          <Eyebrow>Features</Eyebrow>
          <h2>
            A whole <Tile icon={Clapperboard} tone="ink" tilt={-6} /> video team. <br />
            <span className="dim">One <Tile icon={AppWindow} tone="yellow" tilt={5} /> app.</span>
          </h2>
        </Reveal>
        <div className="bento">
          <Card className="b-pages">
            <h3>Walks the whole site in one go.</h3>
            <p>Follows links on the same site, page by page, and narrates each one.</p>
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
                <small>Same site only. Paced, and robots.txt is respected.</small>
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
            <p>MP4, WebM, captions, transcript and the narration audio.</p>
          </Card>
          <Card className="b-dark" delay={0.15}>
            <span className="rec-tag">REC</span>
            <div className="huge">HD</div>
            <h3>Record and narrate</h3>
            <p>H.264 video, AAC voice, captions on.</p>
          </Card>
          <Card className="b-setup">
            <h3>Works with your setup.</h3>
            <p>Install on Windows, sign in to the site you test, and press Record. Nothing to configure first.</p>
            <div className="setup-chips">
              {[
                [<WindowsIcon key="w" />, "Windows 10 / 11", true],
                [<AppWindow key="c" size={15} />, "Chromium", true],
                [<AudioLines key="f" size={15} />, "ffmpeg voice", true],
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
            <h3>A clear voice</h3>
            <p>Four built-in voices. No microphone, no retakes.</p>
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
        <span className="tag" style={{ right: 16, top: 14, color: "#2f6bf0" }}>Step 1 of 4</span>
      </>
    ),
  },
  {
    title: "Product demos",
    text: "A narrated tour for sales calls, from one link.",
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
        <span className="tag" style={{ left: 40, top: 56, color: "#2c8a4a" }}>/pricing 200</span>
        <span className="tag" style={{ left: 40, top: 90, color: "#2c8a4a" }}>/product 200</span>
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
  const stop = paused || !!still;
  return (
    <section className="sec" id="uses">
      <div className="wrap uses-head">
        <Reveal>
          <h2>
            Made for <Tile icon={Sparkles} tone="violet" tilt={-6} />
            <br />
            <span className="dim">every kind of <Tile icon={Play} tone="rec" tilt={5} fill /> tour.</span>
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

/* ------------------------------------------------------------------ pricing */

export function Pricing() {
  return (
    <section className="sec" id="pricing">
      <div className="wrap">
        <Reveal className="sec-head center">
          <h2>
            Start <Tile icon={Gift} tone="green" tilt={-6} /> free.
            <br />
            <span className="dim"><Tile icon={Check} tone="ink" tilt={5} /> Stay free.</span>
          </h2>
          <p className="lede">MIT licensed. No paid tier, no seat limit, no usage meter. Walkcast runs on your own machine, so your recordings and passwords stay there too.</p>
        </Reveal>
        <div className="plans">
          <Reveal className="plan">
            <h3>Desktop app</h3>
            <p className="plan-sub">For anyone who wants a video of their site today.</p>
            <div className="price">$0 <small>forever</small></div>
            <DownloadButton className="wide" />
            <ul>
              {["Windows installer, one click", "Up to 30 pages per recording", "MP4, WebM, captions, transcript", "Sign in to the sites you test"].map((x) => (
                <li key={x}><Check size={15} />{x}</li>
              ))}
            </ul>
          </Reveal>
          <Reveal className="plan" delay={0.08}>
            <h3>Source</h3>
            <p className="plan-sub">For teams who want to read, fork or self-host it.</p>
            <div className="price">$0 <small>MIT license</small></div>
            <a className="pill solid wide" href={REPO_URL}><GithubIcon />View on GitHub</a>
            <ul>
              {["Everything in the app", "The CLI for CI and scripts", "Walkcast Lab for browser agents", "Windows, macOS and Linux"].map((x) => (
                <li key={x}><Check size={15} />{x}</li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ faq */

const FAQ: [string, string][] = [
  ["Which computers does Walkcast run on?", "The desktop app installs on Windows 10 or 11, 64-bit. On macOS and Linux you can run it from source with Node.js 22, Rust and ffmpeg."],
  ["Can it record pages behind a login?", "Yes. It finds the sign-in form, including two-step email-then-password forms, signs in with the credentials you give it, and then records the pages you only see when signed in."],
  ["Is my password stored?", "No. It is held in memory for the recording only. Traces, captions and files on disk show a placeholder, and the narration never reads it out."],
  ["Will it change anything on my site?", "After signing in it only follows links on the same site with ordinary page loads. It submits no forms, skips sign-out, delete, cancel and unsubscribe links, and respects robots.txt."],
  ["What happens with CAPTCHAs or two-factor?", "The recorder stops and tells you. It never tries to get past a CAPTCHA, bot check or second-factor prompt."],
  ["Does the narration make things up?", "No. Every line is written from what the browser actually did: which page it opened, which field it typed into, what it clicked and what the site answered."],
];

export function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section className="sec" id="faq">
      <div className="wrap faq">
        <Reveal>
          <h2 className="faq-title">Questions.</h2>
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

/* ------------------------------------------------------------------ download */

const INSTALLERS = [
  {
    name: "Windows installer",
    file: `walkcast_${VERSION}_x64-setup.exe`,
    href: WINDOWS_EXE_URL,
    size: "about 35 MB",
    badge: "Recommended",
    text: "A guided setup that installs for your user account. No admin rights needed.",
    dark: true,
  },
  {
    name: "Windows MSI package",
    file: `walkcast_${VERSION}_x64_en-US.msi`,
    href: WINDOWS_MSI_URL,
    size: "about 58 MB",
    badge: "For IT",
    text: "Installs for every user on the PC. Use it for managed rollouts like Intune or Group Policy.",
    dark: false,
  },
] as const;

const STEPS = [
  ["Download", "Pick the .exe unless your IT team asked for the .msi."],
  ["Run the installer", "WebView2 is fetched automatically if your PC does not have it yet."],
  ["Paste a link", "Open Walkcast, paste your site's address and press Record."],
] as const;

/** Windows is the only packaged build; other systems are pointed at the source. */
function useNotWindows() {
  const [other, setOther] = useState<string | null>(null);
  useEffect(() => {
    const ua = navigator.userAgent;
    if (/Windows/i.test(ua)) return;
    if (/Android|iPhone|iPad/i.test(ua)) setOther("a phone");
    else if (/Mac/i.test(ua)) setOther("macOS");
    else if (/Linux/i.test(ua)) setOther("Linux");
  }, []);
  return other;
}

export function DownloadSection() {
  const other = useNotWindows();
  return (
    <section className="sec" id="download">
      <div className="wrap">
        <Reveal className="sec-head center">
          <Eyebrow>Download</Eyebrow>
          <h2>
            Get Walkcast for <Tile icon={AppWindow} tone="blue" tilt={-6} /> Windows.
            <br />
            <span className="dim">Free, <Tile icon={Gift} tone="green" tilt={5} /> two ways.</span>
          </h2>
          <p className="lede">Version {VERSION} for Windows 10 and 11, 64-bit. Both installers contain the same app.</p>
          {other && (
            <p className="dl-other">
              You seem to be on {other}. The packaged app is Windows only for now. Download it for a Windows PC, or{" "}
              <a href={`${REPO_URL}#quick-start`}>run Walkcast from source</a>.
            </p>
          )}
        </Reveal>
        <div className="dl-grid">
          {INSTALLERS.map((d, i) => (
            <Reveal key={d.file} className={`dl-card ${d.dark ? "dark" : ""}`} delay={i * 0.08}>
              <div className="dl-top">
                <span className="dl-ic"><WindowsIcon width={26} height={26} /></span>
                <span className="dl-badge">{d.badge}</span>
              </div>
              <h3>{d.name}</h3>
              <p>{d.text}</p>
              <div className="dl-file mono">
                <span>{d.file}</span>
                <span>{d.size}</span>
              </div>
              <motion.a className={`pill big wide ${d.dark ? "" : "solid"}`} href={d.href} whileTap={{ scale: 0.97 }}>
                <Download size={18} strokeWidth={2.2} />
                Download {d.file.endsWith(".exe") ? ".exe" : ".msi"}
              </motion.a>
            </Reveal>
          ))}
        </div>
        <ol className="dl-steps">
          {STEPS.map(([title, text], i) => (
            <Reveal as="li" key={title} delay={i * 0.06}>
              <span className="dl-n mono">{String(i + 1).padStart(2, "0")}</span>
              <b>{title}</b>
              <p>{text}</p>
            </Reveal>
          ))}
        </ol>
        <Reveal className="dl-foot">
          <span className="mono">Windows 10 / 11 · x64 · v{VERSION}</span>
          <span className="dl-links">
            <a href={RELEASES_URL}>All releases and notes</a>
            <a href={`${REPO_URL}#quick-start`}>macOS and Linux: run from source</a>
          </span>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ closing hub */

const HUB = [
  { label: "walkthrough.mp4", meta: "1:11 · H.264", icon: Film, color: "#c0321c", side: "l", y: 0.28 },
  { label: "captions.vtt", meta: "13 lines", icon: Captions, color: "#7a5af8", side: "l", y: 0.72 },
  { label: "transcript.txt", meta: "6 pages", icon: FileText, color: "#2f6bf0", side: "r", y: 0.28 },
  { label: "narration.wav", meta: "voice · slt", icon: AudioLines, color: "#2c8a4a", side: "r", y: 0.72 },
] as const;

export function Closing() {
  const still = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(900);
  const [t, setT] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (still) return;
    const id = setInterval(() => setT((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [still]);
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
            <span className="dim">Now it has a <Tile icon={AudioLines} tone="rec" tilt={5} /> voice.</span>
          </h2>
          <div ref={ref} className="hub" style={{ height: H }}>
            <svg width={w} height={H} aria-hidden="true">
              {HUB.map((n) => {
                const x = nodeX(n.side);
                const y = n.y * H;
                const d = `M ${cx} ${cy} C ${(cx + x) / 2} ${cy}, ${(cx + x) / 2} ${y}, ${x} ${y}`;
                return (
                  <g key={n.label}>
                    <path d={d} fill="none" stroke="#c9c8c3" strokeWidth={1.3} />
                    {!still && (
                      <circle r={3.5} fill={n.color}>
                        <animateMotion dur="2.4s" repeatCount="indefinite" path={d} />
                      </circle>
                    )}
                  </g>
                );
              })}
            </svg>
            <div className="hub-core" style={{ left: cx, top: cy }}>
              <span className="hub-ic"><BrandMark size={52} /></span>
              <span className="live mono">REC 00:{String(t % 60).padStart(2, "0")}</span>
            </div>
            {HUB.map((n) => {
              const I = n.icon;
              return (
                <div key={n.label} className={`hub-node ${n.side}`} style={{ top: n.y * H - 26, [n.side === "l" ? "left" : "right"]: 0 }}>
                  <span className="node-ic" style={{ background: n.color }}><I size={15} /></span>
                  <span>
                    <b className="mono">{n.label}</b>
                    <small>{n.meta}</small>
                  </span>
                </div>
              );
            })}
          </div>
          <DownloadButton big />
          <p className="fineprint">Free. Windows 10 or 11, 64-bit. Version {VERSION}.</p>
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
            <a className="brand" href="#top"><BrandMark />walkcast</a>
            <p>Narrated video walkthroughs of any website, made on your Windows PC.</p>
            <DownloadButton />
            <span className="ver mono"><a href={RELEASES_URL}>v{VERSION}</a> · Windows 10/11 · x64</span>
          </div>
          <div>
            <h4>Product</h4>
            <ul>
              <li><a href="#features">Features</a></li>
              <li><a href="#login">Logins</a></li>
              <li><a href="#studio">The app</a></li>
              <li><a href="#uses">Use cases</a></li>
              <li><a href="#pricing">Pricing</a></li>
              <li><a href="#faq">FAQ</a></li>
            </ul>
          </div>
          <div>
            <h4>Download</h4>
            <ul>
              <li><a href={WINDOWS_EXE_URL}><WindowsIcon width={14} height={14} />Windows .exe</a></li>
              <li><a href={WINDOWS_MSI_URL}><WindowsIcon width={14} height={14} />Windows .msi</a></li>
              <li><a href={RELEASES_URL}><Rocket size={14} />All releases</a></li>
            </ul>
          </div>
          <div>
            <h4>Project</h4>
            <ul>
              <li><a href={REPO_URL}>Source on GitHub</a></li>
              <li><a href={`${REPO_URL}#walkcast-lab`}>Walkcast Lab</a></li>
              <li><a href={ISSUES_URL}>Issues</a></li>
              <li><a href={LICENSE_URL}>MIT License</a></li>
            </ul>
          </div>
        </div>
        <div className="legal">
          <span>© 2026 Walkcast. Open source under MIT.</span>
          <a href={REPO_URL} aria-label="Walkcast on GitHub"><GithubIcon width={17} height={17} /></a>
        </div>
      </div>
      <div className="word" aria-hidden="true">walkcast</div>
    </footer>
  );
}
