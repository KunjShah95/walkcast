/**
 * An optional narration writer that runs on the person's own Claude Code login.
 *
 * Walkcast writes narration from what the browser did: "Opening the pricing page. Clicking
 * “Sign in”." That is accurate and it reads like a log. This pass hands those same lines to the
 * `claude` command-line tool, which is already signed in on this computer, and asks it to say
 * them the way a person presenting the site would. It uses the person's subscription through the
 * tool they installed; Walkcast never reads or stores a Claude credential.
 *
 * The product's promise is that narration comes from what actually happened, so the model is
 * given the facts and held to them. Every rewritten line is checked against the line it replaces:
 * the same quoted control names, no number the original lacked, a sensible length. A line that
 * fails any check, or a run that fails at all, keeps the original wording. The pass can make the
 * script better; it cannot make a recording worse or make the narration claim something new.
 *
 * Off unless asked for: it sends the narration lines (page titles and control names from the site
 * being recorded) to Anthropic through Claude Code, so it is the person's choice to make.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Caption } from "./narration.ts";

export interface WriterContext {
  /** The host being recorded, for the model's orientation only. */
  site: string;
  /** Page titles seen on the visit. */
  pages: string[];
  /** Claude Code model alias or id. Unset uses the tool's default. */
  model?: string;
}

/** Runs the model: a prompt in, the model's text out. Injected so tests never start a process. */
export type ModelRunner = (input: { system: string; prompt: string; model?: string; timeoutMs: number; signal?: AbortSignal }) => Promise<string>;

/** Whether the person asked for this writer, by option or environment. */
export function writerWanted(option?: string | null, env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (option ?? env.WALKCAST_NARRATION_WRITER ?? "").trim().toLowerCase();
  return v === "claude-code" || v === "claude";
}

const SYSTEM = [
  "You write the voice-over for a screen recording of someone using a website.",
  "You are given the narration lines in order, as a JSON array of strings. Rewrite each one as a presenter would say it: warm, plain, specific, one or two short sentences.",
  "Hard rules:",
  "- Return a JSON array of strings with exactly the same number of items, in the same order. Output only that JSON, no code fence, no commentary.",
  "- Keep every fact, including every number. Do not add anything the line does not say: no features, benefits, numbers, names, page descriptions or intentions. A line that only says what was opened or clicked stays about exactly that.",
  "- You may add connecting words so the lines flow as one tour (Next, From there, Once we are in, Back on the home page), and you may rephrase freely.",
  "- Example: \"Opening the pricing page.\" -> \"Next, the pricing page.\"  Example: \"Clicking \\\"Sign in\\\".\" -> \"From here we click \\\"Sign in\\\".\"",
  "- Keep any quoted name (a button, a field, a page title) exactly as written, with its quotes.",
  "- Do not make a line longer than about one and a half times the original.",
  "- Vary how lines begin. Do not start more than two lines in a row with the same word.",
  "- Never use marketing filler: seamless, effortless, powerful, unlock, elevate, game-changing, dive in, let's explore.",
  "- No emoji, no exclamation marks, no questions.",
].join("\n");

export function buildPrompt(lines: string[], ctx: WriterContext, before: string[] = []): string {
  const facts = [`Site: ${ctx.site}`, ctx.pages.length ? `Pages on the visit: ${ctx.pages.slice(0, 12).join(" | ")}` : ""].filter(Boolean).join("\n");
  // The lines already written just before this batch, so the voice carries on instead of starting over.
  const earlier = before.length ? `\n\nThe script so far ends with these lines (for continuity only; do not return them):\n${JSON.stringify(before)}` : "";
  return `${facts}${earlier}\n\nNarration lines:\n${JSON.stringify(lines)}`;
}

const WORDS = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const QUOTED = /[“"]([^“”"]{1,80})[”"]/g;
const NUMBER = /\d[\d,.]*/g;

/** Whether `next` may replace `orig`: the same facts, nothing new, a sensible length. */
export function acceptLine(orig: string, next: unknown, facts: string): next is string {
  if (typeof next !== "string") return false;
  const text = next.replace(/\s+/g, " ").trim();
  if (!text || text.length > 400 || /[!?]/.test(text) || /^[[{`]/.test(text)) return false;
  if (WORDS(text) > Math.max(12, Math.ceil(WORDS(orig) * 1.6) + 2)) return false;
  // Every quoted name in the original survives, exactly: these are the controls the viewer sees.
  for (const m of orig.matchAll(QUOTED)) if (!text.includes(m[1]!)) return false;
  // No number the recorder did not state, and none it did state left out.
  const known = facts.replace(/,/g, "");
  const clean = (n: string) => n.replace(/,/g, "").replace(/[.]$/, "");
  for (const m of text.matchAll(NUMBER)) if (!known.includes(clean(m[0]))) return false;
  for (const m of orig.matchAll(NUMBER)) if (!text.replace(/,/g, "").includes(clean(m[0]))) return false;
  // No name the line did not carry: a capitalised word mid-sentence must already be in the original.
  const before = orig.toLowerCase();
  for (const m of text.matchAll(/(?<=[a-z,;:] )([A-Z][A-Za-z0-9]{2,})/g)) if (!before.includes(m[1]!.toLowerCase())) return false;
  return true;
}

/** Pulls the JSON array out of the model's reply, tolerating a code fence around it. */
export function parseLines(reply: string): unknown[] | null {
  const body = reply.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed: unknown = JSON.parse(body);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    const start = body.indexOf("[");
    const end = body.lastIndexOf("]");
    if (start < 0 || end <= start) return null;
    try {
      const parsed: unknown = JSON.parse(body.slice(start, end + 1));
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

export interface PolishResult {
  captions: Caption[];
  /** How many lines were rewritten. 0 when the writer was off, unavailable or refused. */
  rewritten: number;
  /** A sentence for the recording's note, when something is worth saying. */
  note: string;
}

/** Lines sent per request: long enough to keep the voice consistent, short enough to finish well inside the timeout. */
export const BATCH = 24;

/**
 * Rewrites `captions` in the presenter's voice, line for line. Never throws and never reorders:
 * whatever goes wrong, the caller gets its own captions back.
 *
 * A long tour is written in batches, each told how the script so far ends, so a thirty-page
 * recording is not one request that can time out and lose every line. A batch that fails (after
 * one retry) keeps its recorded wording and the rest of the script is still polished.
 */
export async function polishCaptions(captions: Caption[], ctx: WriterContext, run: ModelRunner = runClaudeCode, signal?: AbortSignal): Promise<PolishResult> {
  const untouched = (note: string): PolishResult => ({ captions, rewritten: 0, note });
  if (captions.length === 0) return untouched("");
  const facts = `${captions.map((c) => c.text).join(" ")} ${ctx.pages.join(" ")} ${ctx.site}`;
  const out: Caption[] = [...captions];
  let rewritten = 0;
  let failed = 0;
  let firstError = "";

  for (let from = 0; from < captions.length; from += BATCH) {
    signal?.throwIfAborted();
    const slice = captions.slice(from, from + BATCH);
    const before = out.slice(Math.max(0, from - 3), from).map((c) => c.text);
    let lines: unknown[] | null = null;
    for (let attempt = 0; attempt < 2 && !lines; attempt++) {
      try {
        const reply = await run({ system: SYSTEM, prompt: buildPrompt(slice.map((c) => c.text), ctx, before), ...(ctx.model ? { model: ctx.model } : {}), timeoutMs: 90_000, ...(signal ? { signal } : {}) });
        const parsed = parseLines(reply);
        if (parsed && parsed.length === slice.length) lines = parsed;
      } catch (e) {
        if (signal?.aborted) throw signal.reason ?? e;
        firstError ||= e instanceof Error ? e.message.split("\n")[0]!.slice(0, 120) : "unknown error";
      }
    }
    if (!lines) {
      failed++;
      continue;
    }
    for (const [i, c] of slice.entries()) {
      const next = lines[i];
      if (!acceptLine(c.text, next, facts)) continue;
      const text = next.replace(/\s+/g, " ").trim();
      if (text === c.text) continue;
      out[from + i] = { ...c, text };
      rewritten++;
    }
  }

  const batches = Math.ceil(captions.length / BATCH);
  if (failed === batches) {
    return untouched(firstError ? `The Claude Code script writer was unavailable (${firstError}); the narration keeps its recorded wording.` : "The Claude Code script writer returned an unusable script; the narration keeps its recorded wording.");
  }
  const partial = failed ? ` ${failed} of ${batches} parts kept their recorded wording.` : "";
  return {
    captions: out,
    rewritten,
    note: rewritten ? `Narration script polished by Claude Code (${rewritten} of ${captions.length} lines).${partial}` : partial.trim(),
  };
}

let probe: Promise<boolean> | undefined;
/** Whether the `claude` tool is installed here. Probed once per process. */
export function claudeCodeAvailable(bin = process.env.WALKCAST_CLAUDE_BIN?.trim() || "claude"): Promise<boolean> {
  probe ??= new Promise<boolean>((resolve) => {
    const child = spawn(bin, ["--version"], { windowsHide: true, shell: process.platform === "win32", stdio: "ignore" });
    const timer = setTimeout(() => {
      child.kill();
      resolve(false);
    }, 8000);
    child.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
  return probe;
}

/**
 * Runs one prompt through Claude Code in print mode: no tools, no hooks or settings, no saved
 * session, and a throwaway working directory, so it can read nothing of the person's and leaves
 * nothing behind. The prompt goes in on stdin, not the command line.
 */
export const runClaudeCode: ModelRunner = ({ system, prompt, model, timeoutMs, signal }) =>
  new Promise<string>((resolve, reject) => {
    const bin = process.env.WALKCAST_CLAUDE_BIN?.trim() || "claude";
    const cwd = mkdtempSync(join(tmpdir(), "walkcast-writer-"));
    const cleanup = () => rmSync(cwd, { recursive: true, force: true });
    const args = ["-p", "--output-format", "json", "--no-session-persistence", "--tools", "", "--disable-slash-commands", "--setting-sources", "", "--system-prompt", system];
    if (model) args.push("--model", model);
    // On Windows `claude` is a .cmd shim; spawn needs a shell for it, and the prompt is on stdin.
    // The system prompt has no quotes or shell metacharacters that matter once passed as one arg
    // through the shell, so it is quoted explicitly.
    const winArgs = process.platform === "win32" ? args.map((a) => (/[\s"]/.test(a) || a === "" ? `"${a.replace(/"/g, '\\"')}"` : a)) : args;
    const child = spawn(bin, winArgs, { cwd, windowsHide: true, shell: process.platform === "win32", stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      cleanup();
      fn();
    };
    const onAbort = () => {
      child.kill();
      finish(() => reject(signal?.reason ?? new Error("cancelled")));
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(() => reject(new Error("timed out")));
    }, timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (d: Buffer) => (out += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (err += d.toString("utf8")));
    child.on("error", (e) => finish(() => reject(e)));
    child.on("close", (code) =>
      finish(() => {
        if (code !== 0) return reject(new Error(err.trim() || `claude exited with ${code}`));
        try {
          const parsed = JSON.parse(out) as { result?: unknown; is_error?: boolean };
          if (parsed.is_error || typeof parsed.result !== "string") return reject(new Error(typeof parsed.result === "string" ? parsed.result : "no result"));
          resolve(parsed.result);
        } catch {
          reject(new Error("unreadable output from claude"));
        }
      }),
    );
    child.stdin.on("error", () => undefined);
    child.stdin.end(prompt);
  });
