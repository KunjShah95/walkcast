import type { StepEvent, TraceEvent } from "../capture/recorder.ts";
import { scrubText } from "../capture/secrets.ts";
import type { PageVisit, SignInOutcome } from "./site.ts";

/** One narrated line, in seconds from the start of the video. */
export interface Caption {
  start: number;
  end: number;
  text: string;
}

interface Context {
  videoStart: number;
  signIn: { attempted: boolean; outcome: SignInOutcome; detail: string };
  pages: PageVisit[];
  origin: string;
}

/**
 * Narration is written from recorded events only: what was opened, typed, clicked and seen.
 * It never states intent the recorder did not have, and it never speaks a credential.
 */
export function captionsFor(events: TraceEvent[], ctx: Context): Caption[] {
  const steps = events.filter((e): e is StepEvent => e.type === "step");
  const out: { at: number; text: string }[] = [];
  const say = (atMs: number, text: string) => out.push({ at: Math.max(0, (atMs - ctx.videoStart) / 1000), text });
  let lastPath = "";

  for (const step of steps) {
    const name = typeof step.args.name === "string" && step.args.name ? `"${step.args.name}"` : "the control";
    switch (step.tool) {
      case "goto": {
        const path = pathOf(String(step.args.path), ctx.origin);
        say(step.startedAt, out.length === 0 ? `Opening ${hostOf(ctx.origin)}${path === "/" ? "" : `, at ${spoken(path)}`}.` : `Opening ${spoken(path)}.`);
        lastPath = path;
        break;
      }
      case "fill": {
        const value = scrubText(String(step.args.value ?? ""));
        if (/\{\{secret:site_username\}\}/.test(value)) say(step.startedAt, `Typing the username into ${name}.`);
        else if (/\{\{secret:|\[REDACTED\]/.test(value)) say(step.startedAt, "Entering the password. It is hidden on screen and never saved.");
        else say(step.startedAt, `Typing into ${name}.`);
        break;
      }
      case "click":
        say(step.startedAt, `Clicking ${name}.`);
        break;
      case "press":
        say(step.startedAt, "Pressing Enter to submit.");
        break;
      case "scroll": {
        const path = step.before ? pathOf(step.before.url, ctx.origin) : lastPath;
        const title = step.before?.title && !/pending/.test(step.before.title) ? step.before.title : "";
        say(step.startedAt, `Scrolling through ${title ? `"${title}"` : spoken(path)}.`);
        lastPath = path;
        break;
      }
      case "signInResult":
        say(step.startedAt, signInSentence(step.result as Context["signIn"]));
        break;
    }
    if (step.error) say(step.endedAt, `That step failed: ${step.error.slice(0, 120)}.`);
  }
  const last = steps.at(-1);
  if (last) say(last.endedAt, `Recording finished. ${ctx.pages.length} page${ctx.pages.length === 1 ? "" : "s"} visited.`);

  out.sort((a, b) => a.at - b.at);
  return out.map((c, i) => ({ start: round(c.at), end: round(Math.max(c.at + 1.5, out[i + 1]?.at ?? c.at + 3)), text: c.text }));
}

function signInSentence(s: Context["signIn"]): string {
  switch (s.outcome) {
    case "signed-in":
      return "Sign-in succeeded.";
    case "rejected":
      return `Sign-in was rejected. ${s.detail}`;
    case "captcha":
      return "A CAPTCHA appeared. The recorder stops at bot checks and does not try to get past them.";
    case "mfa-required":
      return "The site asked for a second factor. The recorder stops here.";
    case "no-form":
      return `No sign-in form was found. ${s.detail}`;
    default:
      return s.detail;
  }
}

export function toWebVtt(captions: Caption[]): string {
  const ts = (s: number) => {
    const ms = Math.round(s * 1000);
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
  };
  // Cue text comes from the recorded site (page titles): keep it from breaking cue syntax.
  const cue = (t: string) => t.replace(/\s+/g, " ").replace(/-->/g, "→").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return "WEBVTT\n\n" + captions.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${cue(c.text)}\n`).join("\n");
}

function pathOf(url: string, origin: string): string {
  try {
    const u = new URL(url, origin);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

function hostOf(origin: string): string {
  return new URL(origin).hostname.replace(/^www\./, "");
}

/** "/leads/1002/edit" -> "leads, 1002, edit": reads better aloud than slashes. */
function spoken(path: string): string {
  if (path === "/" || path === "") return "the home page";
  const parts = path.replace(/\?.*/, "").split("/").filter(Boolean);
  return parts.length ? `the ${parts.join(", ")} page` : "the home page";
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
