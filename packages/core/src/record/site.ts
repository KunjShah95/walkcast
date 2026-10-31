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
import { getBrowser, warmBrowserEnabled } from "./browser.ts";
import { captionsFor, type Caption, type NarrationStyle } from "./narration.ts";
import { briefInPage, type Brief } from "./brief.ts";
import { blockedHost, guardContext, startGuardProxy } from "./ssrf.ts";
import { OVERLAY_SCRIPT, clearOverlays, overlaysEnabled } from "./overlays.ts";
import { parseRobots, robotsAllows, type RobotsRule } from "./robots.ts";
import { attachEvidence } from "./failure.ts";
import { analyzeRecording, type RecordingInsights } from "./insights.ts";
import { parseJourney, type JourneyStep } from "./journey.ts";
import { CURSOR_SCRIPT, clearRing, pointAt, press } from "./cursor.ts";
import { writeFocus, type Focus } from "./zoom.ts";
import type { GuideAction } from "./guide.ts";
import { pushLiveFrame, startLiveView, stopLiveView } from "./live-view.ts";

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
  /** The job this recording runs as, if any: keys the live preview (record/live-view.ts). */
  jobId?: string;
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
  /**
   * Zoom the MP4 in on each click and fill (default on). The moments are kept in focus.json
   * either way, so zoom can be turned on or off later without recording again.
   */
  zoom?: boolean;
  /** How the narration talks: "presenter" (default) reads what each page says; "plain" only what the browser did. */
  narration?: NarrationStyle;
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
  /** Every click and fill, with a picture of the screen just before it: the step-by-step guide. */
  actions?: GuideAction[];
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
  if (options.jobId) startLiveView(options.jobId, dir);
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
  let tools: NarratedTools | null = null;
  try {
    options.signal?.throwIfAborted();
    // Reuse a warm Chromium instance for the worker/process lifetime; this is the 1–2 s launch
    // that decided whether a recording "starts" instantly (docs/SCALING.md §4.3).
    options.onProgress?.("Starting the browser");
    const browser = await getBrowser();
    options.signal?.throwIfAborted();
    let contextRef: Awaited<ReturnType<typeof browser.newContext>> | null = null;
    const abort = () => void contextRef?.close().catch(() => undefined);
    options.signal?.addEventListener("abort", abort, { once: true });
    // On a shared server the browser reaches the web only through a local proxy that checks the
    // address each connection really uses (ssrf.ts): Chromium's own DNS lookup can be rebound.
    const proxy = options.blockPrivate ? await startGuardProxy() : null;
    try {
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        recordVideo: { dir, size: { width: 1920, height: 1080 } },
        serviceWorkers: "block",
        // "<-loopback>" sends even localhost through the proxy, which refuses it.
        ...(proxy ? { proxy: { server: proxy.server, bypass: "<-loopback>" } } : {}),
      });
      contextRef = context;
      // Cancelled while the browser was starting: the abort listener had no context to close
      // then, so stop here, before anything is opened or typed.
      options.signal?.throwIfAborted();
      if (options.blockPrivate) blockedRequests = await guardContext(context);
      await context.addInitScript("window.__name = (fn) => fn;");
      // The pointer the viewer follows: Playwright's video has no mouse of its own.
      await context.addInitScript(CURSOR_SCRIPT);
      // Consent banners and chat bubbles stay out of the video (overlays.ts).
      if (overlaysEnabled()) await context.addInitScript(OVERLAY_SCRIPT);
      const page = await context.newPage();
      videoStart = recorder.now();
      recorder.attach(context, page);
      tools = new NarratedTools(page, recorder, start.origin, () => ({ videoStart, signIn, pages, origin: start.origin, style: options.narration ?? "presenter" }), engine, dir);

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
      if (proxy) {
        // What the proxy refused belongs in the same report as what the route guard refused.
        for (const u of proxy.blocked) if (!blockedRequests.includes(u)) blockedRequests.push(u);
        await proxy.close();
      }
      // Only in disabled mode does this process own a browser; warm mode keeps it ready for
      // the next recording (docs/SCALING.md §4.3). "Disabled" is whatever getBrowser decided,
      // not one variable: LAB_WORKER=off turns warm mode off too, and checking only
      // LAB_WARM_BROWSER left a Chromium running after every recording in that mode.
      if (!warmBrowserEnabled()) await browser.close().catch(() => undefined);
    }
    options.signal?.throwIfAborted();

    recorder.flush();
    // Where the pointer went and when: the zoom plan for the MP4, kept beside the video.
    writeFocus(dir, { zoom: options.zoom !== false, width: 1920, height: 1080, moments: tools?.moments ?? [] });
    const captions = captionsFor(recorder.events, { videoStart, signIn, pages, origin: start.origin, style: options.narration ?? "presenter" });
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
      ...(tools?.actions.length ? { actions: tools.actions } : {}),
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
  } finally {
    if (options.jobId) stopLiveView(options.jobId);
  }
}

/**
 * Tools that hold each action on screen for as long as its narration line takes to say, so the
 * spoken track lines up with the video instead of drifting behind it.
 */
class NarratedTools extends BrowserTools {
  private narrated = 0;
  /** What the current page says about itself, for the presenter narration. */
  private brief: Brief | undefined;
  /** Each click and fill, for the zoom plan. Seconds are video time. */
  readonly moments: Focus[] = [];
  /** Each click and fill, for the step-by-step guide. */
  readonly actions: GuideAction[] = [];
  /** Forget the page brief: a page that could not be read must not borrow the last one. */
  clearBrief(): void {
    this.brief = undefined;
  }
  constructor(
    page: ConstructorParameters<typeof BrowserTools>[0],
    recorder: Recorder,
    baseUrl: string,
    private context: () => Parameters<typeof captionsFor>[1],
    /** The voice that will speak this recording: it decides how long each action is held. */
    private readonly voice: VoiceEngine | null,
    /** The recording folder, where the pictures of each step are written. */
    private readonly dir: string,
  ) {
    super(page, recorder, baseUrl);
  }

  override async click(index: number, from?: Observation): Promise<void> {
    const element = this.element(index, from);
    const done = await this.point(element, "click");
    await press(this.page);
    try {
      await super.click(index, from);
    } finally {
      done();
      await clearRing(this.page);
    }
  }

  override async fill(index: number, value: string, from?: Observation): Promise<void> {
    const element = this.element(index, from);
    const done = await this.point(element, "fill");
    try {
      await super.fill(index, value, from);
    } finally {
      done();
      await clearRing(this.page);
    }
  }

  /** Choosing an option is a moment of its own: the pointer rings the control, the guide names it. */
  override async selectByLabel(index: number, label: string, from?: Observation): Promise<string> {
    const element = this.element(index, from);
    const done = await this.point(element, "select");
    try {
      return await super.selectByLabel(index, label, from);
    } finally {
      done();
      await clearRing(this.page);
    }
  }

  /**
   * Glide the pointer to a control and ring it, then picture the screen: the guide's image for
   * this step, taken before anything is typed, so it never shows a value. Returns a function
   * that marks the action finished, which closes the moment the zoom holds on.
   */
  private async point(element: ObservedElement, kind: "click" | "fill" | "select"): Promise<() => void> {
    const seconds = () => Math.max(0, (this.recorder.now() - this.context().videoStart) / 1000);
    const start = seconds();
    const url = this.page.url();
    const box = await pointAt(this.page, element.selector);
    if (!box) return () => undefined;
    const shot = `step-${String(this.actions.length + 1).padStart(2, "0")}.jpg`;
    // A window around the control, not the whole screen: a guide's picture is read at a
    // glance, and a 1920-wide page shrunk to a column turns the control into a speck.
    const clip = {
      x: Math.round(Math.min(Math.max(0, box.x + box.w / 2 - 480), 1920 - 960)),
      y: Math.round(Math.min(Math.max(0, box.y + box.h / 2 - 270), 1080 - 540)),
      width: 960,
      height: 540,
    };
    const shotOk = await this.page.screenshot({ path: join(this.dir, shot), type: "jpeg", quality: 80, clip }).then(
      () => true,
      () => false,
    );
    const at = seconds();
    this.actions.push({ at: round2(at), kind, name: element.name, url, ...(shotOk ? { shot } : {}), ...(element.type === "password" ? { secret: true } : {}) });
    const moment: Focus = { start: round2(start), end: round2(at), box, kind };
    this.moments.push(moment);
    return () => {
      moment.end = round2(seconds());
    };
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
    // A scroll is narrated from the page's own words, read in an earlier step: hand them over,
    // or the hold is timed for a shorter line than the one that will be spoken.
    const lines = captionsFor(steps, { ...this.context(), signIn: { attempted: false, outcome: "not-attempted", detail: "" }, pages: [], ...(this.brief ? { brief: this.brief } : {}) })
      .map((c) => c.text)
      .filter((t) => !t.startsWith("Recording finished") && !t.startsWith("That's the tour"));
    if (tool === "brief") this.brief = value as Brief;
    let speech = 0;
    for (const t of lines) speech += await speechMs(t, this.voice);
    const owed = speech - (this.recorder.now() - last.startedAt);
    if (owed > 0) await this.page.waitForTimeout(owed);
    return value;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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
  limits: { outOfTime: () => boolean; maxPages: number },
): Promise<{ done: number; stopped: "time" | "pages" | null }> {
  let shot = 1;
  let done = 0;
  // Whatever moved the page on - a goto, a click, a key press - gets the same picture of where
  // it landed, once, at the top of the page.
  const notePage = async () => {
    const after = normalize(page.url());
    if (pages.length === 0 || pages[pages.length - 1]!.url !== after) {
      shot += 1;
      await recordPage(tools, page, recorder, pages, dir, `page-${String(shot).padStart(2, "0")}.jpg`, after, false);
    }
  };
  /** A step that did not happen is part of the walkthrough, not a reason to stop the journey. */
  const misfire = async (kind: JourneyStep["kind"], name: string, why: string, error?: string) => {
    const result = error ? { found: true, error } : { found: false };
    await tools.record("journeyStep", { kind, name, why, ...result }, async () => result);
    options.onProgress?.(why);
  };
  for (const step of steps) {
    options.signal?.throwIfAborted();
    // The limits the person set hold for a journey as they do for a crawl.
    if (limits.outOfTime()) return { done, stopped: "time" };
    if (step.kind === "goto" && pages.length >= limits.maxPages) return { done, stopped: "pages" };
    done += 1;
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
      const went = await tools.goto(url).then(
        () => true,
        () => false,
      );
      await tools.waitForQuiet(400, 8000);
      if (!went && normalize(page.url()) !== normalize(url)) {
        // The page did not open: say so, and do not count the page that is still on screen.
        await misfire(step.kind, step.path, `Could not open ${step.path}`);
        continue;
      }
      await clearOverlays(page);
      shot += 1;
      await recordPage(tools, page, recorder, pages, dir, `page-${String(shot).padStart(2, "0")}.jpg`, url, false);
      continue;
    }
    if (step.kind === "press") {
      try {
        // The key press is a recorded step of its own, so the trace shows the Enter that
        // submitted the form, not just the page it landed on.
        await tools.record("press", { key: step.key }, () => page.keyboard.press(step.key));
      } catch (e) {
        const error = (e instanceof Error ? e.message : String(e)).split("\n")[0]!.slice(0, 160);
        await misfire(step.kind, step.key, `Could not press ${step.key}`, error);
        continue;
      }
      await tools.waitForQuiet(400, 8000);
      await notePage();
      continue;
    }
    if (step.kind === "waitFor" || step.kind === "expect") {
      // Waiting is how a journey reaches a page that loads late; expecting is how it says what
      // the page should show. Neither one ends the walk when it fails: it is said out loud.
      const found = step.kind === "waitFor" ? await tools.waitForText(step.text) : await tools.expectText(step.text);
      if (!found) {
        await misfire(step.kind, step.text, step.kind === "waitFor" ? `“${step.text}” never appeared` : `The page does not say “${step.text}”`);
      }
      await tools.waitForQuiet(400, 8000);
      await notePage();
      continue;
    }
    const obs = await tools.observe();
    const target = findControl(obs, step.name);
    if (!target) {
      await misfire(step.kind, step.name, `No control named “${step.name}” on this page`);
      continue;
    }
    try {
      switch (step.kind) {
        case "click":
          await tools.click(target.index, obs);
          break;
        case "fill":
          await tools.fill(target.index, step.value, obs);
          break;
        case "select":
          await tools.selectByLabel(target.index, step.option, obs);
          break;
        case "check":
        case "uncheck":
          // A checkbox is pressed, not filled: the click path already rings it and pictures it.
          await tools.click(target.index, obs);
          break;
        case "hover":
          await tools.hover(target.index, obs);
          break;
      }
    } catch (e) {
      // A control that is there but will not take the action is a step that failed, recorded
      // as such; the rest of the journey still runs.
      const error = (e instanceof Error ? e.message : String(e)).split("\n")[0]!.slice(0, 160);
      await misfire(step.kind, step.name, `Could not ${step.kind} “${step.name}”`, error);
      continue;
    }
    await tools.waitForQuiet(400, 8000);
    await notePage();
  }
  return { done, stopped: null };
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
  if (shotOk) pushLiveFrame(dir, join(dir, shotName));
  await readBrief(tools);
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
  const robots = options.ignoreRobots ? [] : await robotsRules(tools, start.origin);
  await tools.goto(start.toString());
  await tools.waitForQuiet(400, 8000);
  await clearOverlays(page);

  // Last moment to honour a cancel before a password is typed into the site.
  options.signal?.throwIfAborted();
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
    const walked = await followJourney(tools, page, recorder, options, start, pages, dir, journey, { outOfTime, maxPages: options.maxPages });
    const ok = !signIn.attempted || signIn.outcome === "signed-in";
    const steps = (n: number) => `${n} step${n === 1 ? "" : "s"}`;
    const tail =
      walked.stopped === "time"
        ? `Stopping at your ${formatLength(options.maxSeconds ?? 0)} limit after ${steps(walked.done)} of ${journey.length}.`
        : walked.stopped === "pages"
          ? `Stopping at your ${options.maxPages}-page limit after ${steps(walked.done)} of ${journey.length}.`
          : `Followed ${steps(journey.length)}.`;
    await tools.done(ok, tail);
    return walked.stopped ?? "pages";
  }
  // Checked before a page and again after it: the budget ends the walk at the next page boundary,
  // never mid-page, so the last thing on screen is a whole page rather than a cut-off scroll.
  while (queue.length && pages.length < options.maxPages && !outOfTime()) {
    options.signal?.throwIfAborted();
    const remaining = deadline === null ? null : Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    options.onProgress?.(remaining === null ? `Page ${pages.length + 1} of up to ${options.maxPages}` : `Page ${pages.length + 1} · ${formatLength(remaining)} left`);
    const next = queue.shift()!;
    const nextUrl = new URL(next);
    if (!robotsAllows(robots, `${nextUrl.pathname}${nextUrl.search}`)) {
      skipped.push({ url: next, reason: "robots.txt disallows it" });
      continue;
    }
    if (normalize(page.url()) !== next) {
      await page.waitForTimeout(pace);
      const went = await tools.goto(next).then(
        () => true,
        () => false,
      );
      await tools.waitForQuiet(400, 8000);
      // A page that would not open leaves the last one on screen: that is not a second visit.
      if (!went && normalize(page.url()) !== next) {
        skipped.push({ url: next, reason: "the page could not be opened" });
        continue;
      }
      await clearOverlays(page);
      // Sent back somewhere already in the walkthrough (a redirect to sign-in, or home).
      const landed = normalize(page.url());
      if (landed !== next && pages.some((p) => normalize(p.url) === landed)) {
        skipped.push({ url: next, reason: `it led back to ${landed}, which is already in the walkthrough` });
        continue;
      }
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
    if (shotOk) pushLiveFrame(dir, join(dir, shot));
    await readBrief(tools);
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

/**
 * Read what the page says about itself (headline, tagline, main button, sections, prices) as
 * one recorded step, so the presenter narration can speak it while the page is on screen. A
 * page that will not answer is narrated plainly instead.
 */
async function readBrief(tools: NarratedTools): Promise<void> {
  // The brief belongs to the page on screen. Clearing it first means a failed read leaves the
  // scroll narration plain instead of repeating the page before this one.
  tools.clearBrief();
  await tools
    .record("brief", {}, () => tools.page.evaluate(briefInPage), (b) => b)
    .catch(() => undefined);
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

/** The site's robots.txt rules for every crawler (robots.ts), or none when it has no file. */
async function robotsRules(tools: BrowserTools, origin: string): Promise<RobotsRule[]> {
  try {
    const res = await tools.page.request.get(`${origin}/robots.txt`, { timeout: 5000 });
    return res.ok() ? parseRobots(await res.text()) : [];
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
