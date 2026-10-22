import { Ban, EyeOff, FileLock2, KeyRound, OctagonX } from "lucide-react";
import { Reveal } from "../ui.tsx";

/**
 * Where a customer-logo strip would usually go. Walkcast has no customer logos to show, so the
 * strip names what it is actually built on and works with, grouped by the job each one does.
 */
const STACK: [string, string[]][] = [
  ["Records with", ["Chromium", "Playwright", "ffmpeg"]],
  ["Speaks with", ["ElevenLabs", "OpenAI", "Offline voices"]],
  ["Tests agents built on", ["Stagehand", "browser-use", "OpenRouter"]],
];

export function Stack() {
  return (
    <section className="stack" aria-label="What Walkcast works with">
      <div className="wrap">
        <Reveal className="stack-row">
          {STACK.map(([label, names]) => (
            <div key={label} className="stack-group">
              <span className="stack-label mono">{label}</span>
              <ul>
                {names.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

/** The numbers, then the rules. Each one is a property of the app, not a usage figure. */
const STATS: [string, string, string][] = [
  ["<1", "min", "to record and encode a six-page site on an ordinary laptop"],
  ["30", "pages", "walked in one recording, on one site, paced and polite"],
  ["0", "passwords", "written to disk. Held in memory for the run, then dropped"],
  ["$0", "per seat", "for every feature, on every machine, with no trial clock"],
];

const RULES: [typeof KeyRound, string][] = [
  [KeyRound, "Password never on disk"],
  [OctagonX, "Stops at CAPTCHA and 2FA"],
  [Ban, "Never submits a form"],
  [EyeOff, "No analytics in the app"],
  [FileLock2, "Recordings stay on your PC"],
];

export function Proof() {
  return (
    <section className="proof-wrap">
      <div className="wrap">
        <div className="proof">
          <span className="proof-aura" aria-hidden="true" />
          <Reveal className="proof-head">
            <p className="proof-kicker mono">By the numbers</p>
            <h2>
              Fast enough to re-run on every release.
              <br />
              <span className="dim">Strict enough to point at production.</span>
            </h2>
          </Reveal>
          <ul className="proof-stats">
            {STATS.map(([n, unit, text], i) => (
              <Reveal as="li" key={unit} delay={i * 0.07}>
                <b>
                  {n}
                  <small>{unit}</small>
                </b>
                <p>{text}</p>
              </Reveal>
            ))}
          </ul>
          <Reveal className="proof-rules" delay={0.1}>
            {RULES.map(([Icon, label]) => (
              <span key={label}>
                <Icon size={15} />
                {label}
              </span>
            ))}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
