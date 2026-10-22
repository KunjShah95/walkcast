import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import {
  Check,
  Eye,
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
          <Eyebrow n={3}>Behind the login</Eyebrow>
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
            [User, "You confirm the site", "Every recording asks you to say you own the site or may test it. Leave it unticked and there is no recording."],
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
