import {
  AnimatePresence,
  motion,
  type PanInfo,
  useAnimationFrame,
  useInView,
  useMotionValue,
  useReducedMotion,
  type MotionValue,
  type Transition,
  type Variants,
} from "motion/react";
import { ArrowLeft, ArrowRight, ArrowUpRight, MessageSquareQuote, Pause, Play } from "lucide-react";
import { type ComponentProps, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { GithubIcon, Reveal, Tile } from "../ui.tsx";
import { VOICE_PLACEHOLDERS, VOICES, type Voice } from "../voices.ts";

/** Fewer than this and a carousel reads as padding, so the section stays out. */
const MIN = 3;

/** Seconds each post holds the front of the stack. */
const DWELL = 7;

/** One spring for every card that settles, so the whole stack moves with one feel. */
const SPRING = { type: "spring", bounce: 0.15, duration: 0.6 } as const;

/** The deal: out to the left, under the stack at the halfway mark, back into place. */
const DEAL: Transition = { duration: 0.8, ease: [0.32, 0.72, 0, 1], times: [0, 0.5, 0.5001, 1] };
const DEAL_X = -150;

/** Fixed tilts for the cards behind, so the fan is the same on the server and in the browser. */
const TILTS = [-5, 4, -2.5, 6, -4, 3];

/** How far a flick has to travel, or how fast, before it counts as "next". */
const SWIPE_PX = 70;
const SWIPE_V = 500;

const SOURCE: Record<Voice["source"]["kind"], string> = {
  x: "View on X",
  github: "View on GitHub",
  hn: "View on Hacker News",
  reddit: "View on Reddit",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-01" → "1 Oct 2026", without the locale, so prerender and hydration agree. */
function day(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

/** The author's own page: given, or derived from the handle where the site has one. */
function profileOf(v: Voice) {
  if (v.profile) return v.profile;
  if (v.source.kind === "x") return `https://x.com/${v.handle}`;
  if (v.source.kind === "github") return `https://github.com/${v.handle}`;
  return undefined;
}

/**
 * Posts people made about Walkcast, each one linked to where it was said. Hidden until there are
 * enough real ones; /?voices=preview shows the layout with labelled placeholders.
 */
export function Voices() {
  const real = VOICES.filter((v) => v.source.url);
  const [preview, setPreview] = useState(false);
  // Read after hydration: the prerendered page never contains the placeholders.
  useEffect(() => {
    if (new URLSearchParams(location.search).get("voices") === "preview") setPreview(true);
  }, []);
  const items = real.length >= MIN ? real : preview ? VOICE_PLACEHOLDERS : null;
  return items ? <VoicesSection items={items} /> : null;
}

/** Which post is in front, which one it replaced, and which way the deck moved (0: a jump). */
type Turn = { active: number; from: number; dir: -1 | 0 | 1 };

function VoicesSection({ items }: { items: Voice[] }) {
  const still = !!useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { margin: "-15%" });
  const [turn, setTurn] = useState<Turn>({ active: 0, from: 0, dir: 0 });
  const [held, setHeld] = useState(false); // hover or focus inside the section
  const [paused, setPaused] = useState(false); // the visitor pressed pause
  const [hidden, setHidden] = useState(false); // the tab is in the background
  const n = items.length;
  const { active } = turn;
  const v = items[active]!;
  const profile = profileOf(v);

  useEffect(() => {
    const on = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  // The timer is a value that climbs from 0 to 1 per post. Its speed eases toward 0 when the
  // visitor hovers or the section leaves view, so the bar coasts to a stop instead of freezing.
  const progress = useMotionValue(0);
  const speed = useRef(0);
  const stop = still || paused || held || hidden || !inView;
  const turnRef = useRef(turn);
  turnRef.current = turn;

  const move = (to: number, dir: Turn["dir"]) => {
    const from = turnRef.current.active;
    const next = ((to % n) + n) % n;
    if (next === from) return;
    progress.set(0);
    setTurn({ active: next, from, dir });
  };
  const step = (dir: 1 | -1) => move(turnRef.current.active + dir, dir);
  const pick = (i: number) => {
    const at = turnRef.current.active;
    move(i, i === (at + 1) % n ? 1 : i === (at - 1 + n) % n ? -1 : 0);
  };

  useAnimationFrame((_, delta) => {
    if (still) return;
    const k = 1 - Math.exp(-delta / 120);
    speed.current += ((stop ? 0 : 1) - speed.current) * k;
    if (speed.current < 0.001) return;
    const p = progress.get() + (delta / 1000 / DWELL) * speed.current;
    if (p >= 1) step(1);
    else progress.set(p);
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft") step(-1);
    else return;
    e.preventDefault();
  };

  const onSwipe = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -SWIPE_PX || info.velocity.x < -SWIPE_V) step(1);
    else if (info.offset.x > SWIPE_PX || info.velocity.x > SWIPE_V) step(-1);
  };

  return (
    <section className="sec" id="voices" ref={ref} aria-roledescription="carousel" aria-label="What people say about Walkcast">
      <div className="wrap uses-head">
        <Reveal>
          <h2>
            Said in public. <Tile icon={MessageSquareQuote} tone="yellow" tilt={6} />
            <br />
            <span className="dim">Every quote links to the post.</span>
          </h2>
        </Reveal>
        {!still && (
          <button className="pill sm" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
            {paused ? <Play size={13} fill="currentColor" /> : <Pause size={13} fill="currentColor" />}
            {paused ? "Play" : "Pause"}
          </button>
        )}
      </div>

      <Reveal className="wrap">
        <div
          className="voices"
          onMouseEnter={() => setHeld(true)}
          onMouseLeave={() => setHeld(false)}
          onFocus={() => setHeld(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false);
          }}
          onKeyDown={onKey}
        >
          <Fan items={items} turn={turn} onPick={pick} onSwipe={onSwipe} still={still} />

          <div className="voice-panel">
            {/* Announce changes only when the visitor is driving; an autoplaying live region talks every 7s. */}
            <div className="voice-stage" aria-live={stop ? "polite" : "off"}>
              {/* Old and new quotes share one grid cell, so they cross instead of taking turns. */}
              <AnimatePresence initial={false}>
                <motion.figure
                  key={active}
                  className="voice-quote"
                  initial="hidden"
                  animate="shown"
                  exit={{ opacity: 0, y: still ? 0 : -12, transition: { duration: 0.25, ease: "easeIn" } }}
                  variants={{ hidden: {}, shown: { transition: { staggerChildren: still ? 0 : 0.014 } } }}
                >
                  <blockquote cite={v.source.url}>
                    <Quote text={v.quote} highlight={v.highlight} still={still} />
                  </blockquote>
                  <motion.figcaption variants={rise(still, 0.3)}>
                    <span className="voice-who">
                      <Avatar v={v} size={40} />
                      <span>
                        {profile ? (
                          <a href={profile} target="_blank" rel="noopener noreferrer"><b>{v.name}</b></a>
                        ) : (
                          <b>{v.name}</b>
                        )}
                        <span>{v.role ?? `@${v.handle}`}</span>
                      </span>
                    </span>
                    <a className="voice-src mono" href={v.source.url} target="_blank" rel="noopener noreferrer">
                      <SourceIcon kind={v.source.kind} />
                      {day(v.source.date)} · {SOURCE[v.source.kind]}
                      <ArrowUpRight size={13} />
                    </a>
                  </motion.figcaption>
                </motion.figure>
              </AnimatePresence>
            </div>

            <div className="voice-nav">
              <div className="voice-segs" role="group" aria-label="Choose a post">
                {items.map((it, i) => (
                  <button
                    key={i}
                    className="voice-seg"
                    onClick={() => pick(i)}
                    aria-label={`Post ${i + 1} of ${n}, ${it.name}`}
                    aria-current={i === active}
                  >
                    <Segment state={i < active ? "done" : i === active ? "on" : "todo"} progress={progress} still={still} />
                  </button>
                ))}
              </div>
              <span className="voice-count mono" aria-hidden="true">
                {String(active + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}
              </span>
              <button className="pill sm icon" onClick={() => step(-1)} aria-label="Previous post">
                <ArrowLeft size={15} />
              </button>
              <button className="pill sm icon" onClick={() => step(1)} aria-label="Next post">
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/** A rise from below a mask; the parent's stagger decides when. */
const rise = (still: boolean, delay = 0): Variants => ({
  hidden: still ? { opacity: 0 } : { opacity: 0, y: "105%" },
  shown: { opacity: 1, y: 0, transition: { duration: still ? 0.15 : 0.6, ease: [0.2, 0.7, 0.2, 1] as const, delay } },
});

/** One track of the progress bar. The front one fills from the shared timer. */
function Segment({ state, progress, still }: { state: "done" | "on" | "todo"; progress: MotionValue<number>; still: boolean }) {
  return (
    <span className={`voice-track ${state}`}>
      {state === "on" && !still ? <motion.i style={{ scaleX: progress }} /> : <i />}
    </span>
  );
}

/**
 * The stack of post cards. The one in front sits square; the rest fan out behind it at fixed
 * tilts, a step lower and smaller for each place back. Moving on deals the front card out to the
 * left and slides it under the deck; the rest step forward one after another.
 */
function Fan({
  items,
  turn,
  onPick,
  onSwipe,
  still,
}: {
  items: Voice[];
  turn: Turn;
  onPick: (i: number) => void;
  onSwipe: (e: unknown, info: PanInfo) => void;
  still: boolean;
}) {
  const n = items.length;
  const { active, from, dir } = turn;
  return (
    <div className="voice-fan">
      {items.map((v, i) => {
        const depth = (i - active + n) % n; // 0 is the front card
        const front = depth === 0;
        const rest = {
          x: 0,
          rotate: front || still ? 0 : TILTS[i % TILTS.length]!,
          y: depth * 14,
          scale: 1 - Math.min(depth, 3) * 0.045,
          opacity: depth > 3 ? 0 : 1 - depth * 0.12,
          zIndex: n - depth,
        };
        // Forward: the card that was in front is dealt to the back. Back: the card from the back
        // is dealt over the top to the front. Both swap layers at the far point of the arc.
        const dealt = !still && ((dir === 1 && i === from) || (dir === -1 && i === active));
        const animate = dealt
          ? {
              x: [null, DEAL_X, DEAL_X, 0],
              y: [null, -18, -18, rest.y],
              rotate: [null, -12, -12, rest.rotate],
              scale: [null, 0.97, 0.97, rest.scale],
              opacity: [null, 1, 1, rest.opacity],
              zIndex: dir === 1 ? [n + 1, n + 1, rest.zIndex, rest.zIndex] : [0, 0, n + 1, n + 1],
            }
          : rest;
        const transition = still
          ? { duration: 0 }
          : dealt
            ? DEAL
            : { ...SPRING, delay: dir === 0 ? 0 : 0.08 + depth * 0.04, zIndex: { duration: 0 } };
        return (
          <motion.button
            key={i}
            type="button"
            className={`voice-card ${front ? "front" : ""}`}
            onClick={front ? undefined : () => onPick(i)}
            tabIndex={front ? -1 : 0}
            aria-hidden={front}
            aria-label={`Show the post from ${v.name}`}
            initial={false}
            animate={animate}
            transition={transition}
            whileHover={front || still ? undefined : { y: depth * 14 - 8, transition: SPRING }}
            drag={front && !still ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.7}
            onDragEnd={onSwipe}
          >
            <span className="voice-card-head">
              <Avatar v={v} size={36} />
              <span className="voice-card-id">
                <b>{v.name}</b>
                <span className="mono">@{v.handle}</span>
              </span>
              <SourceIcon kind={v.source.kind} />
            </span>
            <span className="voice-card-text">{v.quote}</span>
            <span className="voice-card-date mono">{day(v.source.date)}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

function Avatar({ v, size }: { v: Voice; size: number }) {
  return v.avatar ? (
    <img className="voice-av" src={v.avatar} alt="" width={size} height={size} loading="lazy" style={{ width: size, height: size }} />
  ) : (
    <span className="voice-av" aria-hidden="true" style={{ width: size, height: size }}>{initials(v.name)}</span>
  );
}

/**
 * The quote, word by word, each rising from behind its own line mask. The chosen phrase is drawn
 * under in exhibit yellow once the last word has landed.
 */
function Quote({ text, highlight, still }: { text: string; highlight?: string; still: boolean }) {
  const at = highlight ? text.indexOf(highlight) : -1;
  const parts = at < 0 || !highlight ? [text] : [text.slice(0, at), highlight, text.slice(at + highlight.length)];
  const count = text.split(/\s+/).length;
  const word = (w: string, k: string) => (
    <span className="vw" key={k}>
      <motion.span variants={rise(still)}>{w}</motion.span>
    </span>
  );
  const run = (s: string, p: number) =>
    s.split(/(\s+)/).map((w, j) => (/^\s+$/.test(w) ? w : w ? word(w, `${p}-${j}`) : null));
  return (
    <p>
      {parts.map((s, p) =>
        p === 1 ? (
          <mark key={p} className="hl voice-hl" style={{ animationDelay: `${0.35 + count * 0.014}s` }}>
            {run(s, p)}
          </mark>
        ) : (
          run(s, p)
        ),
      )}
    </p>
  );
}

function SourceIcon({ kind }: { kind: Voice["source"]["kind"] }) {
  if (kind === "github") return <GithubIcon width={14} height={14} className="voice-src-icon" />;
  if (kind === "x") return <XIcon className="voice-src-icon" />;
  return <span className="voice-src-icon voice-src-tag mono" aria-hidden="true">{kind === "hn" ? "Y" : "r/"}</span>;
}

function XIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} fill="currentColor" aria-hidden="true" {...props}>
      <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23zm-1.16 17.52h1.83L7.08 4.13H5.12z" />
    </svg>
  );
}
