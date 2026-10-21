import type { PageVisit, SignInOutcome } from "./site.ts";

/**
 * Why a recording failed, kept so the Lab can show it afterwards: what the error was in plain
 * words, how far the walk got, and what was on screen when it stopped. A failed recording used to
 * leave only a one-line job error that vanished with the Record page's session list.
 */

/** What a failed `recordSite` knew when it stopped. Carried on the thrown error, not in its message. */
export interface FailureEvidence {
  /** The recording's working folder (partial trace, video, screenshot), when one was made. */
  dir: string | null;
  pages: PageVisit[];
  signIn: { attempted: boolean; outcome: SignInOutcome; detail: string };
  skipped: { url: string; reason: string }[];
  durationMs: number;
  /** File names inside `dir`. */
  screenshot: string | null;
  video: string | null;
}

/** The report written for a recording job that will not be retried. */
export interface FailureReport {
  jobId: string;
  url: string;
  owner: string | null;
  createdAt: string;
  failedAt: string;
  attempts: number;
  error: string;
  /** The last progress label: where in the recording it died ("Signing in", "Page 4 of up to 8"). */
  stage: string | null;
  category: FailureCategory;
  title: string;
  hint: string;
  pages: PageVisit[];
  signIn: FailureEvidence["signIn"] | null;
  skipped: FailureEvidence["skipped"];
  durationMs: number | null;
  /** File names served from /api/failures/<jobId>/<name>. */
  files: { screenshot: string | null; video: string | null };
  /** Turned away before it started (browser not ready, address not allowed, ...): it never ran. */
  refused?: boolean;
}

export type FailureCategory =
  | "address"
  | "unreachable"
  | "slow-site"
  | "certificate"
  | "offline"
  | "browser"
  | "browser-crash"
  | "stuck"
  | "too-long"
  | "interrupted"
  | "encoding"
  | "narration"
  | "not-allowed"
  | "model"
  | "refused"
  | "unknown";

/** A Lab agent run that failed to produce a result (it crashed or could not start). */
export interface RunFailure {
  jobId: string;
  agent: string;
  fault: string;
  task: string;
  seed: number;
  modelMode: string | null;
  createdAt: string;
  failedAt: string;
  attempts: number;
  error: string;
  category: FailureCategory;
  title: string;
  hint: string;
}

const evidence = new WeakMap<object, FailureEvidence>();

export function attachEvidence(error: unknown, ev: FailureEvidence): void {
  if (error && typeof error === "object" && !evidence.has(error)) evidence.set(error, ev);
}

export function evidenceOf(error: unknown): FailureEvidence | null {
  return error && typeof error === "object" ? (evidence.get(error) ?? null) : null;
}

const RULES: [RegExp, FailureCategory, string, string][] = [
  [/server is restarting|can't run recordings|is selected but this server has no/i, "refused", "The recording was refused before it started", "Fix what the message says, then record again."],
  [/still downloading|could not be installed/i, "browser", "The recording browser wasn't ready yet", "It downloads once on first run; wait for the banner to say it's ready, then record again."],
  [/Stagehand agents need|LAB_CHROME_PATH/i, "browser", "No Chrome for the Stagehand agent", "Install Google Chrome or Microsoft Edge, or set LAB_CHROME_PATH, then run again."],
  [/budget exhausted/i, "model", "The run reached its model budget", "Raise LAB_AGENT_TOKEN_BUDGET or LAB_AGENT_COST_BUDGET_USD for a higher ceiling, or replay a recorded run, which costs nothing."],
  [/set \w+_API_KEY|API key|api_key|OPENROUTER|chatgpt: |All model backends failed|needs a model backend|Replay mode needs a recorded cassette|Model refused|did not return JSON|\bstatus (401|429)\b|insufficient_quota|out of credits?/i, "model", "The AI model couldn't be used", "Check the provider key in Settings (or its credit), or run the agent in scripted or replay mode, which needs no model."],
  [/private or local addresses|doesn't look like a web address|Only http\(s\) (URLs|addresses)|needs your confirmation/i, "not-allowed", "The address can't be recorded", "Use the site's full public https:// address."],
  [/ERR_NAME_NOT_RESOLVED|ENOTFOUND|getaddrinfo/i, "address", "The site's address could not be found", "Check the spelling, and that the site is online from this machine."],
  [/ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_NETWORK_ACCESS_DENIED|ENETUNREACH/i, "offline", "This machine lost its internet connection", "Reconnect and record again."],
  [/ERR_CERT|SSL|certificate|ERR_SSL/i, "certificate", "The site's security certificate was rejected", "The site's HTTPS certificate is invalid or expired; fix it on the site, or record its http:// address if it has one."],
  [/ERR_CONNECTION_REFUSED|ECONNREFUSED|ERR_CONNECTION_RESET|ECONNRESET|ERR_EMPTY_RESPONSE|ERR_CONNECTION_CLOSED/i, "unreachable", "The site refused or dropped the connection", "Check the site is up; a firewall, VPN or bot protection may be blocking automated browsers."],
  [/ERR_CONNECTION_TIMED_OUT|ERR_TIMED_OUT|ETIMEDOUT|Timeout \d+ms exceeded|timed out/i, "slow-site", "The site took too long to respond", "Try again when the site is faster, or record fewer pages."],
  [/Executable doesn't exist|browserType\.launch|Failed to launch|recording browser/i, "browser", "The recording browser could not start", "Restart Walkcast; if it keeps happening, let the browser download finish or retry it from the banner."],
  [/Target page, context or browser has been closed|Target closed|Browser closed|crashed|Page crashed/i, "browser-crash", "The recording browser crashed", "Usually a heavy page or low memory. Close other apps and record again."],
  [/^Stopped: no progress/i, "stuck", "The recording got stuck", "Nothing moved for a long time at the stage shown. The site may hang on load; try again or record fewer pages."],
  [/^Stopped: took longer than/i, "too-long", "The recording ran past its time budget", "Ask for fewer pages or a shorter length."],
  [/^Stopped: (lease|worker)|stopped responding/i, "interrupted", "The recording was interrupted", "Walkcast was closed, restarted or put to sleep while it ran. Record again and leave it open."],
  [/ffmpeg|encod|libx264|muxing/i, "encoding", "The video could not be encoded", "Free some disk space and record again."],
  [/narrat|tts|elevenlabs|openai|voice/i, "narration", "The narration failed", "Check the voice provider key in Settings, or pick the offline voice."],
];

/** Plain words for an error, so the Lab says what went wrong and what to try. */
export function explainFailure(error: string): { category: FailureCategory; title: string; hint: string } {
  for (const [pattern, category, title, hint] of RULES) {
    if (pattern.test(error)) return { category, title, hint };
  }
  return { category: "unknown", title: "The recording failed", hint: "The error below is what the recorder reported. Recording again often works; if not, it is a bug worth reporting." };
}
