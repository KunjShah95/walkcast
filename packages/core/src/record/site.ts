import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Page } from "playwright";
import { Recorder, type TargetCheck } from "../capture/recorder.ts";
import { registerSecret, scrub } from "../capture/secrets.ts";
import { BrowserTools, type Observation, type ObservedElement } from "../capture/tools.ts";
import { buildMedia, localVoice, pickEngine, speechMs, type MediaResult, type Voice } from "./media.ts";
import { engineFor, type VoiceEngine } from "./voice.ts";
import { defaultVoiceFor, providerLabel } from "./voices.ts";
import { getBrowser } from "./browser.ts";
import { captionsFor, type Caption } from "./narration.ts";
import { blockedHost, guardContext } from "./ssrf.ts";
import { attachEvidence } from "./failure.ts";
import { analyzeRecording, type RecordingInsights } from "./insights.ts";
import { parseJourney, type JourneyStep } from "./journey.ts";

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
  /**
   * A journey: the path through the site to record, one step per line.
   *
   * With a journey the recorder follows it exactly instead of crawling the site's links. The
   * steps are read by `parseJourney`; a line that cannot be read is reported, not skipped.
   */
  journey?: string;
}

export type SignInOutcome = "not-attempted" | "no-form" | "signed-in" | "rejected" | "captcha" | "mfa-required" | "unknown";

export interface PageVisit {
  url: string;
  title: string;
  status: number | null;
  controls: number;
  skipped?: string;
  /** A picture of the page, taken at the top of it before the walk scrolled down. */
  screenshot?: string;
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
  /** What the recorder found on the site while it walked it. */
  insights?: RecordingInsights;
  /** The journey that was followed, and the lines of it that could not be read. */
  journey?: { steps: number; problems: { line: number; text: string; why: string }[] };
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
  // The journey, read once. A line that cannot be read is said out loud rather than skipped:
  // a journey that quietly does less than it says is worse than one that admits it.
  const parsedJourney = options.journey ? parseJourney(options.journey) : { steps: [], problems: [] };
  // Request bodies stay out of the trace: they belong to the recorded site, not to us.
  const recorder = new Recorder(dir, { screenshots: false, bodies: false });
  const pace = options.paceMs ?? 800;
  // The voice is known before the walk starts, and the walk is paced by it: every action stays on
  // screen for as long as that voice needs to say its line. Pacing by the offline voice's speed
  // instead meant a cloud voice's narration arrived after the action it describes had moved on.
  // A selected provider that can't be reached must not pass for one that spoke: ask for it, then
  // keep whichever engine actually narrates, and say so in the recording itself. The dashboard
  // asks each person once: a cloud voice (their own key), "flite" (the offline voice, chosen on
  // purpose) or "none" (captions only). With no choice at all (the CLI), pickEngine decides.
  const picked = options.ttsProvider;
  const chose = picked && picked !== "flite" && picked !== "none" ? picked : undefined;
  const askedEngine = chose ? engineFor(chose, options.voice ?? "slt", options.ttsVoice, options.ttsLanguage) : null;
  const engine = picked === "none" ? null : (askedEngine ?? (picked ? localVoice(options.voice ?? "slt") : pickEngine(options.voice ?? "slt")));
  const started = Date.now();
  const pages: PageVisit[] = [];
  const skipped: { url: string; reason: string }[] = [];
  let signIn: RecordingResult["signIn"] = { attempted: false, outcome: "not-attempted", detail: "No credentials were given." };
  let blockedRequests: string[] = [];
  let videoStart = 0;
  // Why the walk ended: the page cap, the length cap, or the site running out of links.
  let stopReason: "pages" | "time" | "no-more-links" = "pages";

  // A failure keeps what it knew (pages, sign-in, a screenshot, the partial video) on the error,
  // so the Lab can show why it failed instead of a one-line message.
  let screenshot: string | null = null;
  try {
    options.signal?.throwIfAborted();
    // Reuse a warm Chromium instance for the worker/process lifetime; this is the 1–2 s launch
    // that decided whether a recording "starts" instantly (docs/SCALING.md §4.3).
    options.onProgress?.("Starting the browser");
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
      const tools = new NarratedTools(page, recorder, start.origin, () => ({ videoStart, signIn, pages, origin: start.origin }), engine);

      // The budget covers the walk itself, starting the moment recording begins — browser launch and
      // sign-in still happen, but the cap is about the video the person watches, not our overhead.
      try {
        stopReason = await browse(tools, page, recorder, options, start, pace, pages, skipped, (s) => (signIn = s), () => signIn, maxSeconds, dir, parsedJourney.steps);
      } catch (e) {
        // A blank tab (the first page never loaded) says nothing; only keep a page that drew.
        if (page.url() !== "about:blank") {
          screenshot = await page.screenshot({ path: join(dir, "failure.png"), timeout: 5000 }).then(
            () => "failure.png",
            () => null,
          );
        }
        throw e;
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
    // What the recorder saw on the site, measured while it was there: the console errors, the
    // requests that failed, how long each page took to load, the links each page offered and
    // the controls it saw. The trace holds all of it; without this step the dashboard threw
    // it away and a walkthrough could only be watched, never read.
    const insights = analyzeRecording({ id, url: start.toString(), createdAt: new Date().toISOString(), durationMs: Date.now() - started, pages, skipped, stopped: { reason: stopReason, pages: pages.length, seconds: Math.round((Date.now() - started) / 1000), ...(maxSeconds ? { limitSeconds: maxSeconds } : {}) } }, recorder.events);
    options.onProgress?.("Adding narration and encoding the video");
    // The narration loop and the encode below are the longest stretch of a recording that has
    // nothing to report, so they forward their own beats to the worker's stall guard.
    let media = await buildMedia(dir, captions, options.voice ?? "slt", engine, options.onProgress);
    // Someone who chose a voice should get one: when the cloud voice fails part-way (no credits,
    // a revoked key, the service down), narrate with the offline voice and say why, rather than
    // handing back a silent video.
    let spokeEngine = engine;
    if (media.voice === "none" && engine?.kind === "cloud") {
      const backup = localVoice(options.voice ?? "slt");
      if (backup) {
        const why = media.note.replace(/; the video has captions and a transcript.$/, ".");
        options.onProgress?.("The chosen voice failed; narrating with the offline voice");
        media = await buildMedia(dir, captions, options.voice ?? "slt", backup, options.onProgress);
        if (media.voice !== "none") {
          media.note = `${why} Narrated with the basic offline voice instead.`;
          spokeEngine = backup;
        }
      }
    }
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
      insights,
      ...(options.journey ? { journey: { steps: parsedJourney.steps.length, problems: parsedJourney.problems } } : {}),
      ...(options.ttsProvider
        ? {
            narration: {
              /** What was asked for, and what spoke — they differ when a provider is unreachable. */
              asked: providerLabel(options.ttsProvider),
              askedVoice: options.ttsVoice ?? defaultVoiceFor(options.ttsProvider),
              spoke: media.voice === "none" ? "none" : (spokeEngine?.id ?? "none"),
              // The provider reached the person only if it is the engine that actually narrated:
              // a provider that answered with an error page left the offline voice speaking.
              reachable: !chose ? true : askedEngine ? spokeEngine?.id === askedEngine.id : false,
            },
          }
        : {}),
      stopped: { reason: stopReason, pages: pages.length, seconds: Math.round((Date.now() - started) / 1000), ...(maxSeconds ? { limitSeconds: maxSeconds } : {}) },
    };
    writeFileSync(join(dir, "recording.json"), JSON.stringify(scrub(result), null, 2));
    return result;
  } catch (e) {
    // Same for the video: without a page it is seconds of white.
    const video = existsSync(join(dir, "video.webm")) && (screenshot || pages.length > 0) ? "video.webm" : null;
    attachEvidence(e, { dir, pages, signIn, skipped, durationMs: Date.now() - started, screenshot, video });
    throw e;
  }
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
    /** The voice that will speak this recording: it decides how long each action is held. */
    private readonly voice: VoiceEngine | null,
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
    for (const t of lines) speech += await speechMs(t, this.voice);
    const owed = speech - (this.recorder.now() - last.startedAt);
    if (owed > 0) await this.page.waitForTimeout(owed);
    return value;
  }
}

/**
 * Follow a journey: the path through the site that somebody chose.
 *
 * Each step is one recorded action, so the narration says what happened and the trace holds
 * the evidence, exactly as it does for a crawl. A step whose control is not on the page is
 * recorded as a step that could not be done: the walkthrough says so rather than quietly
 * doing something else.
 */
async function followJourney(
  tools: NarratedTools,
  page: Page,
  recorder: Recorder,
  options: RecordOptions,
  start: URL,
  pages: PageVisit[],
  dir: string,
  steps: JourneyStep[],
): Promise<void> {
  let shot = 1;
  for (const step of steps) {
    options.signal?.throwIfAborted();
    if (step.kind === "wait") {
      await page.waitForTimeout(step.ms);
      continue;
    }
    if (step.kind === "scroll") {
      await scrollThrough(tools);
      continue;
    }
    if (step.kind === "goto") {
      const url = new URL(step.path, start.origin).toString();
      await tools.goto(url);
      await tools.waitForQuiet(400, 8000);
      shot += 1;
      await recordPage(tools, page, recorder, pages, dir, `page-${String(shot).padStart(2, "0")}.jpg`, url, false);
      continue;
    }
    const obs = await tools.observe();
    const target = findControl(obs, step.name);
    if (!target) {
      // A step that could not be done is part of the walkthrough, not a reason to stop.
      await tools.record("journeyStep", { kind: step.kind, name: step.name, found: false }, async () => ({ found: false }));
      options.onProgress?.(`No control named “${step.name}” on this page`);
      continue;
    }
    if (step.kind === "click") await tools.click(target.index, obs);
    else await tools.fill(target.index, step.value, obs);
    await tools.waitForQuiet(400, 8000);
    const after = normalize(page.url());
    if (pages.length === 0 || pages[pages.length - 1]!.url !== after) {
      shot += 1;
      await recordPage(tools, page, recorder, pages, dir, `page-${String(shot).padStart(2, "0")}.jpg`, after, false);
    }
  }
}

/** The control a journey step names, matched the way a person would match it. */
function findControl(obs: Observation, name: string): ObservedElement | undefined {
  const wanted = name.trim().toLowerCase();
  const byName = (e: ObservedElement) => e.name.trim().toLowerCase();
  return (
    obs.elements.find((e) => byName(e) === wanted) ??
    obs.elements.find((e) => byName(e).includes(wanted)) ??
    obs.elements.find((e) => e.selector.toLowerCase().includes(wanted))
  );
}

/**
 * Note a page in the walkthrough: its status, its picture, and what was on it.
 *
 * The picture is taken at the top of the page, before any scrolling, so a journey that
 * scrolls later still has a picture of the page as it was.
 */
async function recordPage(
  tools: NarratedTools,
  page: Page,
  recorder: Recorder,
  pages: PageVisit[],
  dir: string,
  shotName: string,
  url: string,
  scroll: boolean,
): Promise<void> {
  const status = await lastDocumentStatus(recorder, url);
  const shotOk = await page.screenshot({ path: join(dir, shotName), type: "jpeg", quality: 72 }).then(
    () => true,
    () => false,
  );
  if (scroll) await scrollThrough(tools);
  const obs = await tools.observe();
  pages.push({ url: page.url(), title: obs.title, status, controls: obs.elements.length, ...(shotOk ? { screenshot: shotName } : {}) });
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
  dir: string,
  journey: JourneyStep[] = [],
): Promise<"pages" | "time" | "no-more-links"> {
  options.onProgress?.("Opening the site");
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
  // A journey is a path somebody chose. It is followed exactly, and the walk ends when the
  // journey does — not when the site's links run out.
  if (journey.length > 0) {
    // The page the walkthrough starts on is part of it: the journey says where to go next,
    // not where to begin.
    await recordPage(tools, page, recorder, pages, dir, "page-01.jpg", normalize(page.url()), false);
    await followJourney(tools, page, recorder, options, start, pages, dir, journey);
    const ok = !signIn.attempted || signIn.outcome === "signed-in";
    await tools.done(ok, `Followed ${journey.length} step${journey.length === 1 ? "" : "s"}.`);
    return "pages";
  }
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
    // One picture of each page, at the top of it, before the scroll.
    //
    // The video says what the walkthrough shows; a picture says what it contains. Without one,
    // the only way to know that a walkthrough visited a page is to watch the whole thing.
    const shot = `page-${String(pages.length + 1).padStart(2, "0")}.jpg`;
    const shotOk = await page.screenshot({ path: join(dir, shot), type: "jpeg", quality: 72 }).then(
      () => true,
      () => false,
    );
    await scrollThrough(tools);
    const obs = await tools.observe();
    pages.push({ url: page.url(), title: obs.title, status, controls: obs.elements.length, ...(shotOk ? { screenshot: shot } : {}) });
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
