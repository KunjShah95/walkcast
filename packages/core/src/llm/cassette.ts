import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Recorded-LLM cassettes: record every model call of a browser-agent run, then replay the run
 * with the recorded responses, in order, with zero model calls and zero sampling variance.
 *
 * Self-contained on purpose (no Walkcast imports): this is the piece proposed upstream to
 * Stagehand as the "dynamic fixture tier" (browserbase/stagehand#2841, docs/UPSTREAM-STAGEHAND.md).
 * Secret handling is injected through `redact`/`restore`, so a host can keep secrets out of the
 * file and restore them only in memory.
 *
 * Two things make replay work against a *live* page rather than a frozen one:
 * - request hashing ignores session-local noise (ports, element ids, thinking signatures), so a
 *   changed prompt is reported as drift instead of silently mismatching;
 * - Stagehand element ids ("0-17") are session-local, so ids in a recorded response are remapped
 *   to the ids the same accessibility-tree lines have in the replayed prompt.
 */

export interface CassetteEntry<C extends string = string> {
  channel: C;
  seq: number;
  requestHash: string;
  request: unknown;
  response: unknown;
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface CassetteHooks {
  /** Applied before hashing and before writing: replace secrets with placeholders. */
  redact?: (value: unknown) => unknown;
  /** Applied to recorded values on replay: put the secrets back, in memory only. */
  restore?: (value: unknown) => unknown;
  /** Extra text normalisation for hashing (after the built-in `normalizeText`). */
  normalize?: (text: string) => string;
}

export class ReplayExhaustedError extends Error {
  constructor(readonly channel: string, readonly seq: number) {
    super(`Replay cassette has no recorded ${channel} call #${seq}; the run diverged from the recording.`);
  }
}

/** Hands out recorded responses per channel, in order, flagging requests that drifted. */
export class CassettePlayer<C extends string = string> {
  private readonly byChannel = new Map<C, CassetteEntry<C>[]>();
  private readonly seq = new Map<C, number>();

  constructor(entries: CassetteEntry<C>[], private readonly hooks: CassetteHooks = {}) {
    for (const e of entries) this.byChannel.set(e.channel, [...(this.byChannel.get(e.channel) ?? []), e]);
  }

  /**
   * The next recorded response on `channel` for `request`. Stagehand-style element ids in the
   * response are remapped onto the new prompt when `remapIds` is set. Throws ReplayExhaustedError
   * when the run asks for more calls than were recorded.
   */
  next(channel: C, request: unknown, opts: { remapIds?: boolean } = {}): { entry: CassetteEntry<C>; seq: number; drift: boolean; requestHash: string; response: unknown } {
    const seq = this.seq.get(channel) ?? 0;
    this.seq.set(channel, seq + 1);
    const requestHash = hashRequest(channel, request, this.hooks);
    const entry = this.byChannel.get(channel)?.[seq];
    if (!entry) throw new ReplayExhaustedError(channel, seq);
    const restore = this.hooks.restore ?? ((v: unknown) => v);
    const recorded = restore(entry.response);
    const response = opts.remapIds ? remapElementIds(restore(entry.request), request, recorded) : recorded;
    return { entry, seq, drift: entry.requestHash !== requestHash, requestHash, response };
  }
}

/** Collects entries during a live run and writes them as JSONL. */
export class CassetteRecorder<C extends string = string> {
  readonly entries: CassetteEntry<C>[] = [];
  private readonly seq = new Map<C, number>();

  constructor(private readonly hooks: CassetteHooks = {}) {}

  /** Reserve the next sequence number on a channel (call before awaiting the live response). */
  nextSeq(channel: C): number {
    const n = this.seq.get(channel) ?? 0;
    this.seq.set(channel, n + 1);
    return n;
  }

  add(entry: Omit<CassetteEntry<C>, "requestHash"> & { requestHash?: string }): CassetteEntry<C> {
    const full = { ...entry, requestHash: entry.requestHash ?? hashRequest(entry.channel, entry.request, this.hooks) } as CassetteEntry<C>;
    this.entries.push(full);
    return full;
  }

  write(path: string): void {
    writeCassette(path, this.entries, this.hooks);
  }
}

export function writeCassette(path: string, entries: CassetteEntry[], hooks: CassetteHooks = {}): void {
  const redact = hooks.redact ?? ((v: unknown) => v);
  writeFileSync(path, entries.map((e) => JSON.stringify(redact(e))).join("\n") + "\n");
}

export function readCassette<C extends string = string>(path: string): CassetteEntry<C>[] {
  if (!existsSync(path)) throw new Error(`No cassette at ${path}`);
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CassetteEntry<C>);
}

// ------------------------------------------------------------------ normalisation

/** Session-local values that legitimately differ between runs and must not count as drift. */
export function normalizeText(text: string): string {
  return text
    .replace(/https?:\/\/127\.0\.0\.1:\d+/g, "<app>")
    .replace(/\[\d+-\d+\]/g, "[id]")
    .replace(/\b0-\d+\b/g, "<id>");
}

export function hashRequest(channel: string, request: unknown, hooks: CassetteHooks = {}): string {
  const redact = hooks.redact ?? ((v: unknown) => v);
  let text = normalizeText(JSON.stringify(stripVolatile(redact(request))));
  if (hooks.normalize) text = hooks.normalize(text);
  return createHash("sha256").update(channel + text).digest("hex").slice(0, 16);
}

/** Thinking blocks carry opaque signatures that change every call; ignore them for drift. */
export function stripVolatile(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripVolatile);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.type === "thinking" || record.type === "redacted_thinking") return { type: record.type };
    return Object.fromEntries(Object.entries(record).filter(([k]) => k !== "id" && k !== "tool_use_id").map(([k, v]) => [k, stripVolatile(v)]));
  }
  return value;
}

/**
 * Stagehand addresses elements by backend node id ("0-17"), which is session-local. Map each id in
 * the recorded response to the accessibility-tree line it referred to in the recorded prompt, then
 * to the id that the same line has in the replayed prompt.
 */
export function remapElementIds(recordedRequest: unknown, newRequest: unknown, response: unknown): unknown {
  const before = treeIndex(promptText(recordedRequest));
  const after = treeLookup(promptText(newRequest));
  const remap = (id: string): string => {
    const key = before.get(id);
    return (key && after.get(key)) ?? id;
  };
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, k === "elementId" && typeof v === "string" ? remap(v) : walk(v)]),
      );
    }
    return value;
  };
  return walk(response);
}

/** The text of a chat-style request's messages (`{ messages: [{ content }] }`). */
export function promptText(request: unknown): string {
  const messages = (request as { messages?: { content: unknown }[] } | undefined)?.messages ?? [];
  return messages
    .flatMap((m) => (Array.isArray(m.content) ? m.content : [m.content]))
    .map((c) => (c && typeof c === "object" && (c as { type?: unknown }).type === "text" ? String((c as { text?: unknown }).text ?? "") : ""))
    .join("\n");
}

/** id -> "label#occurrence" for every "[0-17] role: name" line. */
function treeIndex(text: string): Map<string, string> {
  const map = new Map<string, string>();
  const seen = new Map<string, number>();
  for (const match of text.matchAll(/\[(\d+-\d+)\]\s*([^\n]*)/g)) {
    const label = match[2]!.trim();
    const n = seen.get(label) ?? 0;
    seen.set(label, n + 1);
    map.set(match[1]!, `${label}#${n}`);
  }
  return map;
}

function treeLookup(text: string): Map<string, string> {
  const inverse = new Map<string, string>();
  for (const [id, key] of treeIndex(text)) inverse.set(key, id);
  return inverse;
}
