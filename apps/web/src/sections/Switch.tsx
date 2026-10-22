import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, Minus, Scale, Wallet, X } from "lucide-react";
import { useState } from "react";
import { DownloadButton, Eyebrow, Reveal, Tile } from "../ui.tsx";

/* ------------------------------------------------------------------ the comparison matrix */

type Mark = "yes" | "no" | "some";

const TOOLS = [
  { name: "Walkcast", href: "/download", us: true },
  { name: "Loom", href: "/compare/loom" },
  { name: "Screen Studio", href: "/compare/screen-studio" },
  { name: "Scribe", href: "/compare/scribe" },
] as const;

/**
 * Each row is one question a buyer asks, answered for all four tools. The marks come from the
 * comparison pages (content.ts), which carry the sources. The second block is where the others
 * win: a matrix that only lists our wins is an advert, and readers know it.
 */
const WINS: [string, Mark[]][] = [
  ["The whole visit recorded with nobody on camera", ["yes", "no", "no", "no"]],
  ["Signs in and walks the site on its own", ["yes", "no", "no", "no"]],
  ["Narration written from what the browser actually did", ["yes", "no", "no", "no"]],
  ["The video and the written steps from one visit", ["yes", "no", "no", "some"]],
  ["The same take again after every release, in one click", ["yes", "no", "no", "no"]],
  ["Runs on Windows and Linux", ["yes", "yes", "no", "yes"]],
  ["Free for every seat, with no watermark on the video", ["yes", "some", "no", "some"]],
];
const THEIRS: [string, Mark[]][] = [
  ["Films your face and your own commentary", ["no", "yes", "yes", "no"]],
  ["Automatic zoom and cursor smoothing", ["some", "no", "yes", "no"]],
  ["Annotated screenshot guides", ["some", "no", "no", "yes"]],
  ["Hosted share links with comments", ["some", "yes", "no", "yes"]],
];

function MarkIcon({ m }: { m: Mark }) {
  if (m === "yes") return <span className="mk yes" title="Yes"><Check size={15} strokeWidth={2.6} /><span className="sr">Yes</span></span>;
  if (m === "no") return <span className="mk no" title="No"><X size={14} strokeWidth={2.4} /><span className="sr">No</span></span>;
  return <span className="mk some" title="Partly, or at a cost"><Minus size={14} strokeWidth={2.6} /><span className="sr">Partly</span></span>;
}

function Rows({ rows }: { rows: [string, Mark[]][] }) {
  return (
    <>
      {rows.map(([q, marks]) => (
        <tr key={q}>
          <th scope="row">{q}</th>
          {marks.map((m, i) => (
            <td key={i} className={i === 0 ? "us" : ""}>
              <MarkIcon m={m} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function Versus() {
  return (
    <section className="sec" id="compare">
      <div className="wrap">
        <Reveal className="sec-head center">
          <Eyebrow n={2}>Compared</Eyebrow>
          <h2>
            Loom films you. <Tile icon={Scale} tone="ink" tilt={-6} />
            <br />
            <span className="dim">Walkcast films your site.</span>
          </h2>
          <p className="lede">
            Screen recorders need someone at the keyboard, a microphone and an edit. Walkcast drives its own browser,
            so the tour comes out the same every time you re-run it. Here is the honest version, including where the
            others are better.
          </p>
        </Reveal>

        <Reveal className="vs" delay={0.08}>
          <div className="vs-scroll">
            <table className="vs-table">
              <caption className="sr">Walkcast compared with Loom, Screen Studio and Scribe</caption>
              <thead>
                <tr>
                  <td />
                  {TOOLS.map((t) => (
                    <th key={t.name} scope="col" className={"us" in t ? "us" : ""}>
                      {"us" in t ? <span className="vs-us">Walkcast</span> : <a href={t.href}>{t.name}</a>}
                    </th>
                  ))}
                </tr>
                <tr className="vs-price">
                  <th scope="row">Price for one person</th>
                  <td className="us"><b>$0</b><small>MIT, forever</small></td>
                  <td><b>$18</b><small>per month</small></td>
                  <td><b>$29</b><small>a month, or $108 a year</small></td>
                  <td><b>$23</b><small>per month</small></td>
                </tr>
              </thead>
              <tbody>
                <tr className="vs-group"><th colSpan={5} scope="colgroup">Where Walkcast is built for the job</th></tr>
                <Rows rows={WINS} />
                <tr className="vs-group"><th colSpan={5} scope="colgroup">Where the others are better</th></tr>
                <Rows rows={THEIRS} />
              </tbody>
            </table>
          </div>
          <div className="vs-foot">
            <p>
              Paid plan for one person, checked 20 October 2026 on each tool's own pricing page. Loom and Scribe
              also have limited free tiers. <span className="mk-key"><MarkIcon m="some" /> means partly, or only on a paid plan.</span>
            </p>
            <nav aria-label="Full comparisons">
              {TOOLS.slice(1).map((t) => (
                <a key={t.name} href={t.href}>
                  vs {t.name} <ArrowRight size={13} />
                </a>
              ))}
            </nav>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ what the alternatives cost */

/** Yearly cost for a team of n, on each tool's lowest plan that fits the team. */
const COST: { name: string; color: string; per: (n: number) => number; plan: (n: number) => string }[] = [
  { name: "Loom", color: "#8a7f72", per: (n) => 18 * 12 * n, plan: () => "Business, $18 per user a month" },
  { name: "Screen Studio", color: "#a8998a", per: (n) => 108 * n, plan: () => "Yearly, $108 per person" },
  {
    name: "Scribe",
    color: "#bfb3a4",
    per: (n) => (n === 1 ? 23 * 12 : (59 + 12 * Math.max(0, n - 5)) * 12),
    plan: (n) => (n === 1 ? "Pro Personal, $23 a month" : "Team, $59 a month for 5, then $12 each"),
  },
];
const usd = (v: number) => `$${v.toLocaleString("en-US")}`;

export function Savings() {
  const still = useReducedMotion();
  const [n, setN] = useState(5);
  const rows = COST.map((c) => ({ ...c, cost: c.per(n) }));
  const max = Math.max(...rows.map((r) => r.cost));
  return (
    <section className="sec" id="pricing">
      <div className="wrap">
        <div className="save">
          <Reveal className="save-copy">
            <Eyebrow n={5}>Pricing</Eyebrow>
            <h2>
              Free to <Tile icon={Wallet} tone="green" tilt={-6} /> use.
              <br />
              <span className="dim">For the whole team.</span>
            </h2>
            <p className="lede left">
              Every feature is in the free download. Walkcast is MIT licensed and runs on your own machine, so there is
              no server bill to pass on to you and nothing to sign up for.
            </p>
            <ul className="save-list">
              {["Unlimited recordings and seats", "Up to 30 pages per recording", "MP4, WebM, captions, transcript", "Voice-over with your own key, or offline"].map((x) => (
                <li key={x}><Check size={15} strokeWidth={2.6} />{x}</li>
              ))}
            </ul>
            <div className="save-cta">
              <DownloadButton big label="Download free" />
              <a className="pill ghost big" href="/pricing">Pricing details</a>
            </div>
          </Reveal>

          <Reveal className="calc" delay={0.08}>
            <div className="calc-head">
              <label htmlFor="seats">
                What a team of <b className="mono">{n}</b> {n === 1 ? "person" : "people"} pays in a year
              </label>
              <input
                id="seats"
                type="range"
                min={1}
                max={50}
                value={n}
                onChange={(e) => setN(Number(e.target.value))}
                style={{ ["--p" as string]: `${((n - 1) / 49) * 100}%` }}
              />
              <div className="calc-scale mono" aria-hidden="true"><span>1</span><span>25</span><span>50</span></div>
            </div>
            <ul className="calc-bars">
              {rows.map((r) => (
                <li key={r.name}>
                  <div className="calc-row">
                    <b>{r.name}</b>
                    <span className="mono">{usd(r.cost)}</span>
                  </div>
                  <div className="calc-track">
                    <motion.i
                      style={{ background: r.color }}
                      animate={{ width: `${(r.cost / max) * 100}%` }}
                      transition={still ? { duration: 0 } : { type: "spring", stiffness: 220, damping: 30 }}
                    />
                  </div>
                  <small>{r.plan(n)}</small>
                </li>
              ))}
              <li className="calc-us">
                <div className="calc-row">
                  <b>Walkcast</b>
                  <span className="mono">$0</span>
                </div>
                <div className="calc-track"><i /></div>
                <small>Every feature, every seat</small>
              </li>
            </ul>
            <p className="calc-note">
              Prices from each tool's pricing page, 20 October 2026. They do different jobs; see the comparison above.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
