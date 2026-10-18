import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Page } from "playwright";
import { Recorder, type TargetCheck } from "../capture/recorder.ts";
import { registerSecret, scrub } from "../capture/secrets.ts";
import { BrowserTools, type Observation } from "../capture/tools.ts";
import { buildMedia, pickEngine, speechMs, type MediaResult, type Voice } from "./media.ts";
import { engineFor } from "./voice.ts";
import { defaultVoiceFor, providerLabel } from "./voices.ts";
import { getBrowser } from "./browser.ts";
import { captionsFor, type Caption } from "./narration.ts";
import { blockedHost, guardContext } from "./ssrf.ts";

/**
 * Site recorder: open a URL the user is authorized to test, sign in if credentials are given,
 * browse same-origin pages, and produce a narrated recording.
 *
 * Guardrails: requires an explicit authorization attestation; never bypasses CAPTCHA or 2FA
 * (it stops and reports); after sign-in it only follows same-origin links with GET
 * navigations, submits no forms, skips destructive and sign-out links, honours robots.txt,
 * and paces requests. Credentials are registered as secrets and never written to disk.
 */
export interface RecordOptions {
  url: string;
  username?: string;
  password?: string;
  maxPages: number;
  /** Stop the walk once the recording has run this long, in seconds. Omitted means pages decide. */
  maxSeconds?: number;
  /** The user confirms they own the site or are authorized to test it. */
  authorized: boolean;
  outDir: string;
  /** Minimum time between page visits. */
  paceMs?: number;
  ignoreRobots?: boolean;
  /** Abort every request to private/loopback addresses (servers reachable from other machines). */
  blockPrivate?: boolean;
  /** Account id of whoever asked for the recording (the dashboard only shows it to them). */
  owner?: string;
  /** Aborting stops the recording at once (job deadline, worker shutdown). */
  signal?: AbortSignal;
  /** Called as the recording advances ("Signing in", "Page 3 of 8"). */
  onProgress?: (message: string) => void;
  /** Narration voice (default: LAB_VOICE, else slt). */
  voice?: Voice;
  /** TTS provider override (env default if omitted). */
  ttsProvider?: string;
  /** Which voice inside that provider to speak with (e.g. an ElevenLabs voice id). Omitted means the provider's default. */
  ttsVoice?: string;
  /** Which language that provider speaks in, for providers whose voices are free-text ids. */
  ttsLanguage?: string;
}

export type SignInOutcome = "not-attempted" | "no-form" | "signed-in" | "rejected" | "captcha" | "mfa-required" | "unknown";

export interface PageVisit {
  url: string;
  title: string;
  status: number | null;
  controls: number;
  skipped?: string;
}

export interface RecordingResult {
  kind: "recording";
  id: string;
  url: string;
  origin: string;
  createdAt: string;
  durationMs: number;
  signIn: { attempted: boolean; outcome: SignInOutcome; detail: string };
  pages: PageVisit[];
  skipped: { url: string; reason: string }[];
  captions: Caption[];
  media: MediaResult;
  dir: string;
  owner?: string;
  /** What the person asked the narration to be, and what actually spoke. */
  narration?: { asked: string; askedVoice: string; spoke: string; reachable: boolean };
  /** Why the walk ended, and how far it got. */
  stopped?: { reason: "pages" | "time" | "no-more-links"; pages: number; seconds: number; limitSeconds?: number };
  /** Requests the SSRF guard refused. */
  blockedRequests?: string[];
}

/** A problem with the request (bad URL, not authorized, blocked target): the caller's to fix. */
export class RecordError extends Error {}

const SKIP_LINK = /log ?out|sign ?out|delete|remove|destroy|unsubscribe|cancel (my |your )?(account|subscription)|deactivate/i;
const SKIP_HREF = /^(mailto|tel|javascript|data):|\.(pdf|zip|gz|dmg|exe|png|jpe?g|gif|svg|mp4|mp3)(\?|$)/i;

export async function recordSite(options: RecordOptions): Promise<RecordingResult> {
  if (!options.authorized) throw new RecordError("Recording needs your confirmation that you own this site or are authorized to test it.");
  let start: URL;
  try {
    start = new URL(options.url);
  } catch {
    throw new RecordError("That doesn't look like a web address. Paste the full link, starting with https://");
  }
  if (start.protocol !== "http:" && start.protocol !== "https:") throw new RecordError("Only http(s) URLs can be recorded.");
  if (options.blockPrivate) {
    const blocked = await blockedHost(start.hostname);
    if (blocked) throw new RecordError(`This server does not record private or local addresses: ${blocked}`);
  }
  const maxPages = Number.isFinite(options.maxPages) ? Math.max(1, Math.min(50, Math.floor(options.maxPages))) : 8;
  // The length cap is a wall-clock budget from the moment the browser opens, so a sign-in plus a
  // slow first page still lands inside it. 15 s is the floor: anything shorter can't say anything.
  const maxSeconds = Number.isFinite(options.maxSeconds) ? Math.max(15, Math.min(3600, Math.floor(options.maxSeconds!))) : undefined;
  options = { ...options, maxPages, ...(maxSeconds ? { maxSeconds } : {}) };
  if (options.password) registerSecret("site_password", options.password);
  if (options.username) registerSecret("site_username", options.username);

  const id = `${start.hostname.replace(/[^a-z0-9.-]/gi, "_")}-${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
  const dir = join(options.outDir, id);
  mkdirSync(dir, { recursive: true });
  // Request bodies stay out of the trace: they belong to the recorded site, not to us.
  const recorder = new Recorder(dir, { screenshots: false, bodies: false });
  const pace = options.paceMs ?? 800;
  const started = Date.now();
  const pages: PageVisit[] = [];
  const skipped: { url: string; reason: string }[] = [];
  let signIn: RecordingResult["signIn"] = { attempted: false, outcome: "not-attempted", detail: "No credentials were given." };
  let blockedRequests: string[] = [];
  let videoStart = 0;
  // Why the walk ended: the page cap, the length cap, or the site running out of links.
  let stopReason: "pages" | "time" | "no-more-links" = "pages";

  options.signal?.throwIfAborted();
  // Reuse a warm Chromium instance for the worker/process lifetime; this is the 1–2 s launch
  // that decided whether a recording "starts" instantly (docs/SCALING.md §4.3).
  const browser = await getBrowser();
  let contextRef: Awaited<ReturnType<typeof browser.newContext>> | null = null;
  const abort = () => void contextRef?.close().catch(() => undefined);
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      recordVideo: { dir, size: { width: 1920, height: 1080 } },
      serviceWorkers: "block",
    });
    contextRef = context;
    if (options.blockPrivate) blockedRequests = await guardContext(context);
    await context.addInitScript("window.__name = (fn) => fn;");
    const page = await context.newPage();
    videoStart = recorder.now();
    recorder.attach(context, page);
    const tools = new NarratedTools(page, recorder, start.origin, () => ({ videoStart, signIn, pages, origin: start.origin }));

    // The budget covers the walk itself, starting the moment recording begins — browser launch and
    // sign-in still happen, but the cap is about the video the person watches, not our overhead.
        try {
      stopReason = await browse(tools, page, recorder, options, start, pace, pages, skipped, (s) => (signIn = s), () => signIn, maxSeconds);
    } finally {
      const video = page.video();
      await context.close().catch(() => undefined);
      contextRef = null;
      const raw = video ? await video.path().catch(() => null) : null;
      if (raw && existsSync(raw)) renameSync(raw, join(dir, "video.webm"));
    }
  } finally {
    if (contextRef) await contextRef.close().catch(() => undefined);
    options.signal?.removeEventListener("abort", abort);
    // Only in disabled mode does this process own a browser; warm mode keeps it ready for
    // the next recording (docs/SCALING.md §4.3).
    if (process.env.LAB_WARM_BROWSER === "0") await browser.close().catch(() => undefined);
  }
  options.signal?.throwIfAborted();

  recorder.flush();
  const captions = captionsFor(recorder.events, { videoStart, signIn, pages, origin: start.origin });
  options.onProgress?.("Adding narration and encoding the video");
  // A selected provider that can't be reached must not pass for one that spoke: ask for it, then
  // keep whichever engine actually narrates, and say so in the recording itself. "flite" is the
  // dashboard's default choice: captions only (the free trial voice sounded robotic, so it is no
  // longer used; the offline voice only with LAB_ROBOT_VOICE=1, see pickEngine).
  const chose = options.ttsProvider && options.ttsProvider !== "flite" ? options.ttsProvider : undefined;
  const askedEngine = chose ? engineFor(chose, options.voice ?? "slt", options.ttsVoice, options.ttsLanguage) : null;
  const engine = askedEngine ?? pickEngine(options.voice ?? "slt");
  // The narration loop and the encode below are the longest stretch of a recording that has
  // nothing to report, so they forward their own beats to the worker's stall guard.
  const media = await buildMedia(dir, captions, options.voice ?? "slt", engine, options.onProgress);
  if (chose && !askedEngine) {
    const fallback = media.voice === "none" ? "so the video has captions and no voice" : `so the "${engine?.id}" voice spoke instead`;
    media.note = `${media.note} ${providerLabel(chose)} was selected but this recording could not reach it, ${fallback}.`;
  }
  const result: RecordingResult = {
    ...(options.owner ? { owner: options.owner } : {}),
    ...(blockedRequests.length ? { blockedRequests } : {}),
    kind: "recording",
    id,
    url: start.toString(),
    origin: start.origin,
    createdAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    signIn,
    pages,
    skipped,
    captions,
    media,
    dir,
    ...(options.ttsProvider
      ? {
          narration: {
            /** What was asked for, and what spoke — they differ when a provider is unreachable. */
            asked: providerLabel(options.ttsProvider),
            askedVoice: options.ttsVoice ?? defaultVoiceFor(options.ttsProvider),
            spoke: media.voice === "none" ? "none" : (askedEngine?.id ?? engine?.id ?? "none"),
            reachable: !chose || askedEngine !== null,
          },
        }
      : {}),
    stopped: { reason: stopReason, pages: pages.length, seconds: Math.round((Date.now() - started) / 1000), ...(maxSeconds ? { limitSeconds: maxSeconds } : {}) },
  };
  writeFileSync(join(dir, "recording.json"), JSON.stringify(scrub(result), null, 2));
  return result;
}

/**
 * Tools that hold each action on screen for as long as its narration line takes to say, so the
 * spoken track lines up with the video instead of drifting behind it.
 */
class NarratedTools extends BrowserTools {
  private narrated = 0;
  constructor(
    page: ConstructorParameters<typeof BrowserTools>[0],
    recorder: Recorder,
    baseUrl: string,
    private context: () => Parameters<typeof captionsFor>[1],
  ) {
    super(page, recorder, baseUrl);
  }

  override async record<T>(
    tool: string,
    args: Record<string, unknown>,
    run: (stepId: number) => Promise<T>,
    summarize?: (value: T) => unknown,
    preCheck?: () => Promise<TargetCheck>,
  ): Promise<T> {
    const value = await super.record(tool, args, run, summarize, preCheck);
    const steps = this.recorder.steps().filter((s) => s.stepId > this.narrated);
    this.narrated = this.recorder.currentStep;
    const last = steps.at(-1);
    if (!last) return value;
    const lines = captionsFor(steps, { ...this.context(), signIn: { attempted: false, outcome: "not-attempted", detail: "" }, pages: [] })
      .map((c) => c.text)
      .filter((t) => !t.startsWith("Recording finished"));
    let speech = 0;
    for (const t of lines) speech += await speechMs(t);
    const owed = speech - (this.recorder.now() - last.startedAt);
    if (owed > 0) await this.page.waitForTimeout(owed);
    return value;
  }
}

async function browse(
  tools: NarratedTools,
  page: Page,
  recorder: Recorder,
  options: RecordOptions,
  start: URL,
  pace: number,
  pages: PageVisit[],
  skipped: { url: string; reason: string }[],
  setSignIn: (s: RecordingResult["signIn"]) => void,
  getSignIn: () => RecordingResult["signIn"],
  maxSeconds: number | undefined,
): Promise<"pages" | "time" | "no-more-links"> {
  const disallowed = options.ignoreRobots ? [] : await robotsDisallow(tools, start.origin);
  await tools.goto(start.toString());
  await tools.waitForQuiet(400, 8000);

  if (options.username || options.password) {
    options.onProgress?.("Signing in");
    const outcome = await signInFlow(tools, options.username ?? "", options.password ?? "");
    setSignIn(outcome);
    // A marker step so the outcome is narrated at the moment it is known.
    await tools.record("signInResult", { outcome: outcome.outcome }, async () => outcome);
  }
  const signIn = getSignIn();

  // Breadth-first over same-origin links, starting from wherever sign-in left us.
  const queue: string[] = [normalize(page.url())];
  const seen = new Set<string>(queue);
  let reason: "pages" | "time" | "no-more-links" = "pages";
  // The budget covers the pages themselves; sign-in already happened above and is narrated on its
  // own, so it must not eat the cap the person asked for.
  const deadline = maxSeconds ? Date.now() + maxSeconds * 1000 : null;
  const outOfTime = () => deadline !== null && Date.now() >= deadline;
  // Checked before a page and again after it: the budget ends the walk at the next page boundary,
  // never mid-page, so the last thing on screen is a whole page rather than a cut-off scroll.
  while (queue.length && pages.length < options.maxPages && !outOfTime()) {
    options.signal?.throwIfAborted();
    const remaining = deadline === null ? null : Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    options.onProgress?.(remaining === null ? `Page ${pages.length + 1} of up to ${options.maxPages}` : `Page ${pages.length + 1} · ${formatLength(remaining)} left`);
    const next = queue.shift()!;
    if (disallowed.some((p) => new URL(next).pathname.startsWith(p))) {
      skipped.push({ url: next, reason: "robots.txt disallows it" });
      continue;
    }
    if (normalize(page.url()) !== next) {
      await page.waitForTimeout(pace);
      await tools.goto(next).catch(() => undefined);
      await tools.waitForQuiet(400, 8000);
    }
    const status = await lastDocumentStatus(recorder, next);
    await scrollThrough(tools);
    const obs = await tools.observe();
    pages.push({ url: page.url(), title: obs.title, status, controls: obs.elements.length });
    if (outOfTime()) {
      reason = "time";
      break;
    }
    if (isAuthWall(obs) && signIn.outcome !== "signed-in" && pages.length > 1) continue;
    for (const link of await collectLinks(tools)) {
      const target = normalize(link.href);
      if (seen.has(target)) continue;
      seen.add(target);
      if (new URL(target).origin !== start.origin) continue;
      if (SKIP_HREF.test(link.href)) continue;
      if (SKIP_LINK.test(link.text) || SKIP_LINK.test(target)) {
        skipped.push({ url: target, reason: `skipped "${link.text || target}" (sign-out or destructive)` });
        continue;
      }
      queue.push(target);
    }
  }
  if (reason !== "time" && deadline !== null && Date.now() >= deadline) reason = "time";
if (reason !== "time" && queue.length === 0) reason = "no-more-links";
  const ok = !signIn.attempted || signIn.outcome === "signed-in";
  // The closing line says why the walk stopped, so the video itself explains its own length.
  const tail =
    reason === "time"
      ? `Stopping at your ${formatLength(options.maxSeconds ?? 0)} limit after ${pages.length} page${pages.length === 1 ? "" : "s"}.`
      : `Visited ${pages.length} page${pages.length === 1 ? "" : "s"}.`;
  await tools.done(ok, `${signIn.attempted ? `Sign-in: ${signIn.outcome}. ` : ""}${tail}`);
  return reason;
}

/** "45 seconds", "2 minutes" — spoken as part of the narration, so it reads as a person would say it. */
export function formatLength(seconds: number): string {
  if (seconds < 60) return `${Math.max(15, Math.round(seconds / 15) * 15)} seconds`;
  const minutes = Math.round(seconds / 30) / 2;
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

// ------------------------------------------------------------------ sign-in

async function signInFlow(tools: BrowserTools, username: string, password: string): Promise<RecordingResult["signIn"]> {
  let obs = await tools.observe();
  if (!hasPasswordField(obs) && !usernameField(obs)) {
    const link = obs.elements.find((e) => (e.tag === "a" || e.tag === "button") && /^(sign|log) ?in\b|^login$/i.test(e.name));
    if (!link) return { attempted: true, outcome: "no-form", detail: "No sign-in form or sign-in link on the page." };
    await tools.click(link.index, obs);
    await tools.waitForQuiet(400, 10000);
    obs = await tools.observe();
  }
  const blocked = barrier(obs);
  if (blocked) return { attempted: true, ...blocked };

  const user = usernameField(obs);
  if (user && username) await tools.fill(user.index, username, obs);
  if (!hasPasswordField(obs)) {
    // Two-step sign-in: identifier first, then a password page.
    const next = submitButton(obs);
    if (!next) return { attempted: true, outcome: "no-form", detail: "Found a username field but no way to continue." };
    await tools.click(next.index, obs);
    await tools.waitForQuiet(400, 10000);
    obs = await tools.observe();
    const blocked2 = barrier(obs);
    if (blocked2) return { attempted: true, ...blocked2 };
  }
  const pass = obs.elements.find((e) => e.type === "password");
  if (!pass) return { attempted: true, outcome: "no-form", detail: "No password field appeared." };
  await tools.fill(pass.index, password, obs);
  const submit = submitButton(obs);
  const before = tools.page.url();
  if (submit) await tools.click(submit.index, obs);
  else await tools.record("press", { key: "Enter" }, () => tools.page.keyboard.press("Enter"));
  await tools.waitForQuiet(600, 15000);

  const after = await tools.observe();
  const blocked3 = barrier(after);
  if (blocked3) return { attempted: true, ...blocked3 };
  const errorText = after.text.match(/(invalid|incorrect|wrong|not recognized|try again)[^\n.]{0,80}/i)?.[0];
  if (hasPasswordField(after)) {
    return { attempted: true, outcome: "rejected", detail: errorText ? `The site said: "${errorText.trim()}".` : "The sign-in form is still shown." };
  }
  return {
    attempted: true,
    outcome: "signed-in",
    detail: tools.page.url() !== before ? `Signed in; landed on ${new URL(tools.page.url()).pathname}.` : "Signed in; the form is gone.",
  };
}

function hasPasswordField(obs: Observation): boolean {
  return obs.elements.some((e) => e.type === "password");
}

function usernameField(obs: Observation) {
  return (
    obs.elements.find((e) => e.type === "email") ??
    obs.elements.find((e) => e.role === "textbox" && /user|e-?mail|login|account|phone/i.test(`${e.name} ${e.selector}`)) ??
    obs.elements.find((e) => e.role === "textbox" && e.type !== "search")
  );
}

function submitButton(obs: Observation) {
  return (
    obs.elements.find((e) => e.tag === "button" && /^(sign|log) ?in\b|^login$|continue|next|submit/i.test(e.name)) ??
    obs.elements.find((e) => (e.tag === "button" || e.type === "submit") && e.type === "submit")
  );
}

/** CAPTCHA and second-factor walls: the recorder stops here and never tries to get past them. */
function barrier(obs: Observation): { outcome: SignInOutcome; detail: string } | null {
  const text = obs.text;
  if (/verify (that )?you('| a)re (a )?human|i'?m not a robot|captcha|security check/i.test(text) || obs.elements.some((e) => /captcha|turnstile|challenge/i.test(e.selector))) {
    return { outcome: "captcha", detail: "A CAPTCHA or bot check appeared. The recorder does not bypass it." };
  }
  if (/verification code|two-factor|2fa|authenticator app|one-time (pass)?code|enter the code/i.test(text)) {
    return { outcome: "mfa-required", detail: "The site asked for a second factor. The recorder stops here." };
  }
  return null;
}

function isAuthWall(obs: Observation): boolean {
  return hasPasswordField(obs);
}

// ------------------------------------------------------------------ browsing

async function collectLinks(tools: BrowserTools): Promise<{ href: string; text: string }[]> {
  return tools.record(
    "collectLinks",
    {},
    () =>
      tools.page.evaluate(() =>
        Array.from(document.querySelectorAll("a[href]"))
          .map((a) => ({ href: (a as HTMLAnchorElement).href, text: (a.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80) }))
          .filter((l) => l.href.startsWith("http")),
      ),
    (links) => ({ links: links.length }),
  );
}

/** Scroll the page top to bottom in viewport steps so the video shows all of it. */
async function scrollThrough(tools: BrowserTools): Promise<void> {
  await tools.record("scroll", {}, async () => {
    const height = await tools.page.evaluate(() => document.documentElement.scrollHeight);
    const viewport = 800;
    for (let y = viewport * 0.8; y < height && y < viewport * 8; y += viewport * 0.8) {
      await tools.page.evaluate((top) => window.scrollTo({ top, behavior: "smooth" }), y);
      await tools.page.waitForTimeout(450);
    }
    await tools.page.evaluate(() => window.scrollTo({ top: 0 }));
    await tools.page.waitForTimeout(250);
    return { height };
  });
}

async function robotsDisallow(tools: BrowserTools, origin: string): Promise<string[]> {
  try {
    const res = await tools.page.request.get(`${origin}/robots.txt`, { timeout: 5000 });
    if (!res.ok()) return [];
    const lines = (await res.text()).split(/\r?\n/);
    const out: string[] = [];
    let applies = false;
    for (const raw of lines) {
      const line = raw.replace(/#.*/, "").trim();
      const [k, ...v] = line.split(":");
      const key = k?.trim().toLowerCase();
      const value = v.join(":").trim();
      if (key === "user-agent") applies = value === "*";
      else if (applies && key === "disallow" && value) out.push(value);
    }
    return out;
  } catch {
    return [];
  }
}

async function lastDocumentStatus(recorder: Recorder, url: string): Promise<number | null> {
  for (let i = recorder.events.length - 1; i >= 0; i--) {
    const e = recorder.events[i]!;
    if (e.type === "request" && e.method === "GET" && normalize(e.url) === url && e.status !== undefined) return e.status;
  }
  return null;
}

function normalize(url: string): string {
  const u = new URL(url);
  u.hash = "";
  return u.toString();
}
