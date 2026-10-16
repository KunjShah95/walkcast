import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import {
  Captions,
  Check,
  Eye,
  Film,
  FlaskConical,
  Globe,
  KeyRound,
  LayoutGrid,
  Library,
  Lock,
  OctagonX,
  Play,
  Settings,
  ShieldCheck,
  User,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Eyebrow, Reveal, Tile, WindowBar } from "../ui.tsx";

/* ------------------------------------------------------------------ one take, three files */

const TABS = [
  { id: "video", label: "Video", ext: ".mp4" },
  { id: "vtt", label: "Captions", ext: ".vtt" },
  { id: "pages", label: "Pages", ext: ".json" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const PAGES = [
  ["/", "Real Estate CRM for Indian Sales Teams"],
  ["/product", "Product: Inventory, Bookings, Site Visits"],
  ["/pricing", "Pricing: Plans from ₹1,499/month"],
  ["/contact", "Contact: Talk to the Estate360 Team"],
  ["/login", "Sign in"],
  ["/signup", "Start Free: 14-Day Trial"],
] as const;

export function Outputs() {
  const [tab, setTab] = useState<TabId>("video");
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const keys = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    const n = (i + d + TABS.length) % TABS.length;
    setTab(TABS[n]!.id);
    refs.current[n]?.focus();
  };
  return (
    <section className="sec" id="features">
      <div className="wrap split">
        <Reveal>
          <Eyebrow n={1}>One take</Eyebrow>
          <h2>
            Record once. Get the <Tile icon={Play} tone="ochre" tilt={-6} fill /> video and the <Tile icon={Captions} tone="yellow" tilt={5} /> words.{" "}
            <span className="dim">Same run.</span>
          </h2>
          <p className="lede left">The video, its captions and a list of every page visited all come from one recording. Nothing to sync, nothing to retype, nothing to cut.</p>
          <div className="seg" role="tablist" aria-label="Output">
            {TABS.map((t, i) => (
              <button
                key={t.id}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                role="tab"
                id={`t-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls="outputs-panel"
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => setTab(t.id)}
                onKeyDown={(e) => keys(e, i)}
              >
                {tab === t.id && <motion.span className="seg-bg" layoutId="seg-bg" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                <span className="seg-label">
                  {t.label} <small>{t.ext}</small>
                </span>
              </button>
            ))}
          </div>
          <p className="note">
            <b className="mono">H.264 + AAC.</b> Captions are embedded in the MP4 and shipped as a file.
          </p>
        </Reveal>
        <Reveal className="stage" delay={0.1}>
          <div id="outputs-panel" role="tabpanel" aria-labelledby={`t-${tab}`} className="stage-in">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                className="stage-card"
                initial={{ opacity: 0, y: 14, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.98 }}
                transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
              >
                {tab === "video" && (
                  <div className="card vid-card">
                    <img src="/assets/demo-poster.jpg" alt="First frame of the Estate360 walkthrough" loading="lazy" />
                    <div className="vid-meta">
                      <b>walkthrough.mp4</b>
                      <span className="mono">1:11 · 1280×800 · narrated</span>
                    </div>
                  </div>
                )}
                {tab === "vtt" && (
                  <pre className="card code">
                    {"WEBVTT\n\n"}
                    <b>00:00:00.410 --&gt; 00:00:03.670</b>
                    {"\nOpening agentic-crm-henna.vercel.app.\n\n"}
                    <b>00:00:10.550 --&gt; 00:00:15.770</b>
                    {'\nScrolling through "Real Estate CRM for\nIndian Sales Teams — Estate360".\n\n'}
                    <b>00:00:16.500 --&gt; 00:00:18.720</b>
                    {"\nOpening the product page."}
                  </pre>
                )}
                {tab === "pages" && (
                  <ul className="card pages">
                    {PAGES.map(([path, title], i) => (
                      <motion.li key={path} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}>
                        <Check size={16} className="ok" />
                        <span>{title}</span>
                        <span className="mono ok">
                          {path} 200
                        </span>
                      </motion.li>
                    ))}
                  </ul>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ recorder mock */

const URL_TEXT = "app.estate360.in/login";
const USER_TEXT = "you@estate360.in";
const LOG = [
  ["Opening /login", "200"],
  ["Typing into Email", ""],
  ["Typing into Password · hidden", ""],
  ["Signed in, now on /dashboard", "200"],
  ["Visiting /leads", "200"],
  ["Visiting /bookings", "200"],
] as const;
const T = { user: 25, pass: 43, check: 55, press: 60, log: 66, logGap: 10, popup: 132, end: 190 };

/** A looping, scripted run of the recorder: fill the form, record, sign in, stop at 2FA. */
function useScript(active: boolean) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setT((v) => (v + 1) % T.end), 100);
    return () => clearInterval(id);
  }, [active]);
  return t;
}

export function Recorder() {
  const box = useRef<HTMLDivElement>(null);
  const still = useReducedMotion();
  const inView = useInView(box, { margin: "-80px" });
  const live = useScript(inView && !still);
  const t = still ? T.popup + 10 : live;

  const url = URL_TEXT.slice(0, Math.min(URL_TEXT.length, t));
  const user = USER_TEXT.slice(0, Math.max(0, Math.min(USER_TEXT.length, t - T.user)));
  const pass = Math.max(0, Math.min(10, t - T.pass));
  const checked = t >= T.check;
  const recording = t >= T.press;
  const lines = recording ? Math.max(0, Math.min(LOG.length, Math.floor((t - T.log) / T.logGap) + 1)) : 0;
  const stopped = t >= T.popup;
  const elapsed = recording ? Math.floor((Math.min(t, T.popup) - T.press) / 10) : 0;
  const page = lines >= 4 ? LOG[lines - 1]![0].replace(/^.*?(\/\w*)$/, "$1") : "/login";
  const field = t < T.user ? "url" : t < T.pass ? "user" : t < T.check ? "pass" : "";

  return (
    <section className="sec" id="login">
      <div className="wrap">
        <Reveal className="sec-head center">
          <Eyebrow n={2}>Behind the login</Eyebrow>
          <h2>
            Records the pages <Tile icon={Lock} tone="ink" tilt={-6} /> only users see. <span className="dim">Your password <Tile icon={KeyRound} tone="green" tilt={5} /> never hits disk.</span>
          </h2>
          <p className="lede">Walkcast finds the sign-in form, including two-step email-then-password flows, signs in with what you give it, and walks the signed-in site.</p>
          <div className="chips">
            <span className="chip"><KeyRound size={15} />Held in memory only</span>
            <span className="chip"><OctagonX size={15} />Stops at CAPTCHA and 2FA</span>
            <span className="chip"><Eye size={15} />Read-only after sign-in</span>
            <span className="chip"><Globe size={15} />Same site, respects robots.txt</span>
          </div>
        </Reveal>

        <Reveal className="mock" delay={0.1}>
          <div ref={box} className="mock-win">
            <WindowBar title="Walkcast · Record">
              <span className={`status ${stopped ? "stop" : recording ? "rec" : ""}`}>
                {stopped ? "Stopped safely" : recording ? `REC 00:${String(elapsed).padStart(2, "0")}` : "Ready"}
              </span>
            </WindowBar>
            <div className="mock-body">
              <nav className="mock-rail" aria-hidden="true">
                <span className="on"><Play size={16} /></span>
                <span><Library size={16} /></span>
                <span><FlaskConical size={16} /></span>
                <span><LayoutGrid size={16} /></span>
                <span className="end"><Settings size={16} /></span>
              </nav>
              <div className="mock-main">
                <div className="form">
                  <label className={field === "url" ? "focus" : ""}>
                    <span>Site link</span>
                    <b className="mono">{url}<i className="caret" hidden={field !== "url"} /></b>
                  </label>
                  <div className="form-row">
                    <label className={field === "user" ? "focus" : ""}>
                      <span>Username</span>
                      <b className="mono">{user}<i className="caret" hidden={field !== "user"} /></b>
                    </label>
                    <label className={field === "pass" ? "focus" : ""}>
                      <span>Password</span>
                      <b className="mono dots">{"•".repeat(pass)}<i className="caret" hidden={field !== "pass"} /></b>
                    </label>
                  </div>
                  <div className="form-foot">
                    <span className={`check ${checked ? "on" : ""}`}>
                      <i>{checked && <Check size={12} strokeWidth={3} />}</i>I own this site or may test it
                    </span>
                    <motion.span className={`rec-btn ${recording ? "on" : ""}`} animate={t >= T.press && t < T.press + 3 ? { scale: 0.94 } : { scale: 1 }}>
                      <i />
                      {recording ? "Recording" : "Record"}
                    </motion.span>
                  </div>
                </div>
                <div className="browser">
                  <div className="browser-bar mono">
                    <Lock size={11} /> estate360.in{recording ? page : ""}
                  </div>
                  <div className="browser-page">
                    <AnimatePresence mode="wait">
                      <motion.div key={recording ? page : "idle"} className="skel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <i style={{ width: "42%" }} />
                        <i style={{ width: "64%" }} />
                        <div className="skel-row">
                          <i />
                          <i />
                          <i />
                        </div>
                      </motion.div>
                    </AnimatePresence>
                    {recording && !stopped && <span className="cap">{LOG[Math.max(0, lines - 1)]![0]}.</span>}
                  </div>
                  <AnimatePresence>
                    {stopped && (
                      <motion.div
                        className="popup"
                        initial={{ opacity: 0, y: 12, scale: 0.94 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ type: "spring", stiffness: 420, damping: 28 }}
                      >
                        <span className="popup-ic"><ShieldCheck size={18} /></span>
                        <div>
                          <b>Two-step code requested</b>
                          <small>Walkcast stops here. It never tries to get past 2FA.</small>
                        </div>
                        <div className="popup-actions">
                          <span className="pill sm">Keep 6 pages</span>
                          <span className="pill sm solid">Save video</span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              <aside className="mock-log">
                <div className="mock-log-head">
                  Run log <span>{lines} steps</span>
                </div>
                <ul>
                  <AnimatePresence initial={false}>
                    {LOG.slice(0, lines).map(([text, code]) => (
                      <motion.li key={text} layout initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                        <Check size={13} className="ok" />
                        <span>{text}</span>
                        {code && <b className="mono">{code}</b>}
                      </motion.li>
                    ))}
                    {stopped && (
                      <motion.li key="stop" className="warn" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}>
                        <OctagonX size={13} />
                        <span>2FA prompt, stopped</span>
                      </motion.li>
                    )}
                  </AnimatePresence>
                </ul>
                <div className="mock-log-foot">
                  <span className="mono">password</span>
                  <b className="mono">[hidden]</b>
                </div>
              </aside>
            </div>
          </div>
        </Reveal>

        <ul className="feats">
          {[
            [User, "You confirm the site", "Every recording asks you to say you own the site or may test it. No confirmation, no recording."],
            [KeyRound, "A placeholder, not a password", "Traces, captions and files show a placeholder. The narration says a password was entered and never reads it out."],
            [OctagonX, "No bot-check games", "It never tries to get past a CAPTCHA, bot check or second-factor prompt. It stops and tells you."],
            [Eye, "Looks, never touches", "No form submissions. Sign-out, delete, cancel and unsubscribe links are skipped."],
          ].map(([Icon, title, text], i) => {
            const I = Icon as typeof User;
            return (
              <Reveal as="li" key={title as string} delay={i * 0.07}>
                <I size={20} />
                <h3>{title as string}</h3>
                <p>{text as string}</p>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ pages to narration */

const FLOW = [
  ["/", "Home", "Opening agentic-crm-henna.vercel.app."],
  ["/product", "Product", "Opening the product page."],
  ["/pricing", "Pricing", "Opening the pricing page."],
  ["/contact", "Contact", "Opening the contact page."],
] as const;
const FLOW_COLORS = ["#c8551e", "#9c5700", "#2d4f73", "#2c6a3d"];

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(1000);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function Flow() {
  const still = useReducedMotion();
  const [ref, w] = useWidth<HTMLDivElement>();
  const inView = useInView(ref, { margin: "-80px" });
  const [shown, setShown] = useState(1);
  useEffect(() => {
    if (!inView) return;
    if (still) return setShown(FLOW.length);
    const id = setInterval(() => setShown((n) => (n >= FLOW.length + 2 ? 1 : n + 1)), 1100);
    return () => clearInterval(id);
  }, [inView, still]);

  const H = 440;
  const ys = [70, 170, 270, 370];
  const x0 = 210;
  const x1 = Math.max(x0 + 120, w - 400);
  const ty = 250;

  return (
    <section className="sec">
      <div className="wrap">
        <Reveal className="sec-head center">
          <Eyebrow n={3}>Narration</Eyebrow>
          <h2>
            Every <Tile icon={Globe} tone="blue" tilt={-6} /> page. <br />
            <span className="dim">One <Tile icon={Captions} tone="ink" tilt={5} /> voice-over.</span>
          </h2>
          <p className="lede">Lines are written from what the browser actually did: the page it opened, the field it typed into, what the site answered. Nothing is made up.</p>
        </Reveal>
        <Reveal className="flow" delay={0.1}>
          <div ref={ref} className="flow-in" style={{ height: H }}>
            <svg className="flow-lines" width={w} height={H} aria-hidden="true">
              {ys.map((y, i) => {
                const d = `M ${x0} ${y} C ${(x0 + x1) / 2} ${y}, ${(x0 + x1) / 2} ${ty}, ${x1} ${ty}`;
                return (
                  <g key={i}>
                    <path d={d} fill="none" stroke={FLOW_COLORS[i]} strokeOpacity={0.55} strokeWidth={1.4} strokeDasharray="4 5" />
                    {!still && (
                      <circle r={3.5} fill={FLOW_COLORS[i]}>
                        <animateMotion dur={`${2.6 + i * 0.35}s`} repeatCount="indefinite" path={d} />
                      </circle>
                    )}
                  </g>
                );
              })}
              <circle cx={x1} cy={ty} r={4} fill="#111110" />
            </svg>
            {FLOW.map(([path, name], i) => (
              <div key={path} className={`node ${i < shown ? "on" : ""}`} style={{ top: ys[i]! - 28 }}>
                <span className="node-ic" style={{ background: FLOW_COLORS[i] }}>
                  <Globe size={16} />
                </span>
                <span>
                  <b>{name}</b>
                  <small className="mono">{path} · 200</small>
                </span>
              </div>
            ))}
            <div className="narr card">
              <div className="narr-head">
                <span><Film size={15} /> Narration</span>
                <span className="live">REC</span>
              </div>
              <div className="narr-pin mono">walkthrough.mp4 · en · 13 lines</div>
              <ul>
                <AnimatePresence initial={false}>
                  {FLOW.slice(0, Math.min(shown, FLOW.length)).map(([path, , text], i) => (
                    <motion.li key={path} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                      <span className="dot" style={{ background: FLOW_COLORS[i] }} />
                      <span>
                        <small className="mono">{path}</small>
                        {text}
                      </span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
              <div className="narr-foot">
                <span>Voice</span>
                <b className="mono">flite · slt</b>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
