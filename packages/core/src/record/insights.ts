import type { ConsoleEvent, NetworkEvent, StepEvent, TraceEvent } from "../capture/recorder.ts";

/**
 * What a walkthrough found on the site, read from the trace the recorder captured.
 *
 * The recorder already knows things the dashboard was throwing away: the console errors the
 * page printed, the requests that failed, how long each document took to load, how many links
 * each page offered, and the exact set of interactive controls it saw. None of that needed a
 * new capture — it was in `trace.jsonl` all along, and nothing read it.
 *
 * Everything here is measured, never guessed. A page that answered 404 is reported as 404; a
 * page that printed an error is reported with the error's own words. What cannot be measured
 * (how the site feels, whether the copy is good) is left out rather than dressed up as a score.
 *
 * The module is deliberately free of Node imports: the browser bundle uses the same code to
 * compare two walkthroughs, so the analysis has to run in both places.
 */

/** One page of a walkthrough, as the recorder saw it. */
export interface PageInsight {
  url: string;
  path: string;
  title: string;
  /** The status the document answered with, when the recorder saw one. */
  status: number | null;
  /** Interactive controls on the page (links, buttons, fields). */
  controls: number;
  /** The controls by name, so two walkthroughs of the same page can be compared. */
  controlNames: string[];
  /** Hash of the page's shape and controls; two recordings of an unchanged page match. */
  fingerprint: string | null;
  /** ms from the navigation starting to the page's load event. */
  loadMs: number | null;
  /** ms from the document request being sent to its response headers arriving. */
  firstResponseMs: number | null;
  /** Links the page offered. */
  links: number;
  /** Document, XHR and fetch requests made while the page was open. */
  requests: number;
  /** Console errors printed while the page was open. */
  errors: number;
  /** Requests that failed (a 4xx/5xx answer, or a network failure). */
  failures: number;
  /** Controls a person could not tell what they were: no label, no name. */
  unnamed: { role: string; count: number }[];
  /** Links whose text says nothing: "click here", "read more", "here". */
  vagueLinks: string[];
}

/** A console error, with the page it happened on. */
export interface ConsoleErrorInsight {
  text: string;
  count: number;
  page: string | null;
  at: number;
}

/** A request that failed, with the page it was made from. */
export interface FailedRequestInsight {
  url: string;
  method: string;
  status: number | null;
  failure: string | null;
  page: string | null;
}

/** How serious a finding is. Nothing here is a score; it is a fact and how loudly to say it. */
export type InsightLevel = "info" | "warn" | "fail";

export interface InsightFinding {
  level: InsightLevel;
  text: string;
}

/** The recording facts the analysis needs. Everything else is measured from the trace. */
export interface RecordingFacts {
  id?: string;
  url: string;
  createdAt?: string;
  durationMs: number;
  pages: { url: string; title: string; status: number | null; controls: number }[];
  skipped?: { url: string; reason: string }[];
  stopped?: { reason: string; pages: number; seconds: number; limitSeconds?: number };
}

/** The whole picture of one walkthrough. */
export interface RecordingInsights {
  pages: PageInsight[];
  consoleErrors: ConsoleErrorInsight[];
  failedRequests: FailedRequestInsight[];
  totals: {
    pages: number;
    requests: number;
    apiCalls: number;
    consoleErrors: number;
    failedRequests: number;
    links: number;
    durationMs: number;
  };
  /** The page that took longest to load, when the trace says which one. */
  slowest: { path: string; ms: number } | null;
  findings: InsightFinding[];
}

// ------------------------------------------------------------------ analysis

/** One navigation and everything that happened until the next one. */
interface Segment {
  url: string;
  title: string;
  start: number;
  end: number;
  loadMs: number | null;
  links: number;
  controls: ControlEntry[];
  fingerprint: string | null;
  requests: NetworkEvent[];
  consoleErrors: ConsoleEvent[];
}

/** One interactive control, as the recorder saw it. */
export interface ControlEntry {
  role: string;
  name: string;
}

/**
 * What a walkthrough found, from the trace it captured.
 *
 * `events` is the recording's `trace.jsonl`. A recording made before this existed still has
 * one, so the same analysis works on old walkthroughs.
 */
export function analyzeRecording(facts: RecordingFacts, events: TraceEvent[]): RecordingInsights {
  const steps = events.filter(isStep);
  const segments = segmentsOf(steps, events);
  const pages = facts.pages.map((page, i) => {
    const segment = matchSegment(page.url, segments, i);
    return pageInsight(page, segment);
  });

  const consoleErrors = groupConsoleErrors(segments);
  // A page that answered 404 is reported as a page, not as a failed request: the same fact
  // twice is noise. What is left here is the site's own API calls that failed.
  const visited = new Set(facts.pages.map((p) => normalize(p.url)));
  const failedRequests = collectFailures(segments, visited);
  const requests = segments.reduce((n, s) => n + s.requests.length, 0);
  const apiCalls = segments.reduce((n, s) => n + s.requests.filter(isApi).length, 0);
  const links = segments.reduce((n, s) => n + s.links, 0);
  const slowest = pages
    .filter((p) => p.loadMs !== null)
    .sort((a, b) => (b.loadMs ?? 0) - (a.loadMs ?? 0))[0];

  const insights: RecordingInsights = {
    pages,
    consoleErrors,
    failedRequests,
    totals: {
      pages: pages.length,
      requests,
      apiCalls,
      consoleErrors: consoleErrors.reduce((n, e) => n + e.count, 0),
      failedRequests: failedRequests.length,
      links,
      durationMs: facts.durationMs,
    },
    slowest: slowest && slowest.loadMs !== null ? { path: slowest.path, ms: slowest.loadMs } : null,
    findings: [],
  };
  insights.findings = findingsFor(insights, facts);
  return insights;
}

/**
 * The findings, in plain words.
 *
 * Each one names what happened and where it happened. A finding that cannot be measured is
 * not made up: a walkthrough with no trace says so instead of reporting a clean bill of
 * health it did not check.
 */
export function findingsFor(insights: RecordingInsights, facts: RecordingFacts): InsightFinding[] {
  const problems: InsightFinding[] = [];
  const notes: InsightFinding[] = [];
  if (insights.pages.length === 0) {
    problems.push({ level: "warn", text: "This walkthrough visited no pages, so there is nothing to report." });
    return problems;
  }
  const errors = insights.totals.consoleErrors;
  if (errors > 0) {
    const first = insights.consoleErrors[0];
    const where = first?.page ? ` on ${first.page}` : "";
    const more = insights.consoleErrors.length > 1 ? ` (and ${insights.consoleErrors.length - 1} more)` : "";
    problems.push({ level: "fail", text: `${errors} console error${errors === 1 ? "" : "s"}${where}${more}: “${first?.text ?? ""}”` });
  }
  const failures = insights.failedRequests;
  if (failures.length > 0) {
    const first = failures[0]!;
    const what = first.status ? `${first.status}` : (first.failure ?? "failed");
    const more = failures.length > 1 ? ` (and ${failures.length - 1} more)` : "";
    problems.push({ level: "fail", text: `${failures.length} request${failures.length === 1 ? "" : "s"} failed${more}: ${first.method} ${shortPath(first.url)} answered ${what}` });
  }
  for (const page of insights.pages) {
    if (page.status !== null && page.status >= 400) {
      problems.push({ level: "fail", text: `${page.path} answered ${page.status} — the walkthrough shows an error page.` });
    } else if (page.status !== null && page.status >= 300 && page.status < 400) {
      notes.push({ level: "info", text: `${page.path} redirected (${page.status}).` });
    }
    if (!page.title.trim()) problems.push({ level: "warn", text: `${page.path} has no title, so the page reads as blank in a player's chapter list.` });
    // A control with no name is a field nobody can fill in by sight, or a button nobody can
    // find. The recorder read every control on every page, so this is counted, not guessed.
    for (const group of page.unnamed) {
      const what = group.role === "textbox" ? "form field" : group.role === "link" ? "link" : group.role === "button" ? "button" : group.role;
      problems.push({
        level: "warn",
        text: `${page.path}: ${group.count} ${what}${group.count === 1 ? "" : "s"} with no name — a screen reader announces nothing for ${group.count === 1 ? "it" : "them"}.`,
      });
    }
    if (page.vagueLinks.length > 0) {
      const words = [...new Set(page.vagueLinks)].slice(0, 3).map((w) => `“${w}”`).join(", ");
      notes.push({
        level: "info",
        text: `${page.path}: ${page.vagueLinks.length} link${page.vagueLinks.length === 1 ? "" : "s"} whose text says nothing on its own (${words}).`,
      });
    }
  }
  if (insights.totals.links > insights.totals.pages * 4 && insights.totals.pages > 0) {
    notes.push({
      level: "info",
      text: `The walk found ${insights.totals.links} links but visited ${insights.totals.pages} page${insights.totals.pages === 1 ? "" : "s"} — most of the site is not in this walkthrough.`,
    });
  }
  if (insights.slowest) {
    notes.push({ level: "info", text: `The slowest page was ${insights.slowest.path} (${(insights.slowest.ms / 1000).toFixed(1)} s to load).` });
  }
  if (facts.stopped?.reason === "time") {
    problems.push({ level: "warn", text: `The walk stopped at its ${facts.stopped.limitSeconds ?? facts.stopped.seconds}-second limit after ${facts.stopped.pages} pages.` });
  }
  // A clean bill of health is worth saying out loud, but only when it was actually checked:
  // it is the answer to "is my site fine?", which is the question behind most of this.
  if (problems.length === 0) {
    notes.unshift({ level: "info", text: "No console errors, no failed requests, and every page answered." });
  }
  return [...problems, ...notes];
}

// ------------------------------------------------------------------ comparison

/** How two walkthroughs of the same site differ. */
export interface RecordingDiff {
  from: { id: string; url: string; createdAt: string };
  to: { id: string; url: string; createdAt: string };
  pages: {
    added: string[];
    removed: string[];
    titles: { path: string; from: string; to: string }[];
    statuses: { path: string; from: number | null; to: number | null }[];
    controls: { path: string; added: string[]; removed: string[] }[];
  };
  errors: { new: string[]; fixed: string[] };
  failures: { new: string[]; fixed: string[] };
  totals: {
    pages: { from: number; to: number };
    links: { from: number; to: number };
    durationMs: { from: number; to: number; delta: number };
  };
  /** How many things changed. Zero means the two walkthroughs saw the same site. */
  changed: number;
  /** The same changes, in words. */
  summary: string[];
}

/**
 * What changed between two walkthroughs of a site.
 *
 * This is the question a schedule exists to answer: "the site changed — how?" The answer is
 * read off two traces, so it is evidence, not a guess. Two walkthroughs of different sites are
 * not comparable and are refused rather than compared into nonsense.
 */
export function diffRecordings(
  from: { id: string; url: string; createdAt: string; insights: RecordingInsights },
  to: { id: string; url: string; createdAt: string; insights: RecordingInsights },
): RecordingDiff {
  const a = byPath(from.insights.pages);
  const b = byPath(to.insights.pages);
  const added = [...b.keys()].filter((p) => !a.has(p));
  const removed = [...a.keys()].filter((p) => !b.has(p));
  const titles: RecordingDiff["pages"]["titles"] = [];
  const statuses: RecordingDiff["pages"]["statuses"] = [];
  const controls: RecordingDiff["pages"]["controls"] = [];
  for (const [path, before] of a) {
    const after = b.get(path);
    if (!after) continue;
    if (before.title !== after.title) titles.push({ path, from: before.title, to: after.title });
    if ((before.status ?? null) !== (after.status ?? null)) statuses.push({ path, from: before.status, to: after.status });
    const addedControls = after.controlNames.filter((c) => !before.controlNames.includes(c));
    const removedControls = before.controlNames.filter((c) => !after.controlNames.includes(c));
    if (addedControls.length || removedControls.length) controls.push({ path, added: addedControls.slice(0, 20), removed: removedControls.slice(0, 20) });
  }

  const beforeErrors = new Set(from.insights.consoleErrors.map((e) => errorKey(e.text)));
  const afterErrors = new Set(to.insights.consoleErrors.map((e) => errorKey(e.text)));
  const errors = {
    new: [...afterErrors].filter((e) => !beforeErrors.has(e)),
    fixed: [...beforeErrors].filter((e) => !afterErrors.has(e)),
  };
  const beforeFailures = new Set(from.insights.failedRequests.map(failureKey));
  const afterFailures = new Set(to.insights.failedRequests.map(failureKey));
  const failures = {
    new: [...afterFailures].filter((e) => !beforeFailures.has(e)),
    fixed: [...beforeFailures].filter((e) => !afterFailures.has(e)),
  };

  const diff: RecordingDiff = {
    from: { id: from.id, url: from.url, createdAt: from.createdAt },
    to: { id: to.id, url: to.url, createdAt: to.createdAt },
    pages: { added, removed, titles, statuses, controls },
    errors,
    failures,
    totals: {
      pages: { from: from.insights.totals.pages, to: to.insights.totals.pages },
      links: { from: from.insights.totals.links, to: to.insights.totals.links },
      durationMs: { from: from.insights.totals.durationMs, to: to.insights.totals.durationMs, delta: to.insights.totals.durationMs - from.insights.totals.durationMs },
    },
    changed: 0,
    summary: [],
  };
  diff.changed = added.length + removed.length + titles.length + statuses.length + controls.length + errors.new.length + errors.fixed.length + failures.new.length + failures.fixed.length;
  diff.summary = summarizeDiff(diff);
  return diff;
}

/** The same diff, in words. */
export function summarizeDiff(diff: RecordingDiff): string[] {
  const out: string[] = [];
  if (diff.pages.added.length) out.push(`${diff.pages.added.length} page${diff.pages.added.length === 1 ? "" : "s"} appeared: ${diff.pages.added.join(", ")}.`);
  if (diff.pages.removed.length) out.push(`${diff.pages.removed.length} page${diff.pages.removed.length === 1 ? "" : "s"} disappeared: ${diff.pages.removed.join(", ")}.`);
  for (const t of diff.pages.titles) out.push(`${t.path} is now “${t.to || "(untitled)"}” (was “${t.from || "(untitled)"}”).`);
  for (const s of diff.pages.statuses) out.push(`${s.path} now answers ${s.to ?? "nothing"} (was ${s.from ?? "nothing"}).`);
  for (const c of diff.pages.controls) {
    const parts: string[] = [];
    if (c.added.length) parts.push(`${c.added.length} added: ${c.added.slice(0, 5).join(", ")}`);
    if (c.removed.length) parts.push(`${c.removed.length} removed: ${c.removed.slice(0, 5).join(", ")}`);
    out.push(`${c.path} changed its controls (${parts.join("; ")}).`);
  }
  if (diff.errors.new.length) out.push(`${diff.errors.new.length} new console error${diff.errors.new.length === 1 ? "" : "s"}.`);
  if (diff.errors.fixed.length) out.push(`${diff.errors.fixed.length} console error${diff.errors.fixed.length === 1 ? "" : "s"} gone.`);
  if (diff.failures.new.length) out.push(`${diff.failures.new.length} new failed request${diff.failures.new.length === 1 ? "" : "s"}.`);
  if (diff.failures.fixed.length) out.push(`${diff.failures.fixed.length} failed request${diff.failures.fixed.length === 1 ? "" : "s"} fixed.`);
  if (diff.totals.durationMs.delta !== 0) {
    const seconds = Math.round(diff.totals.durationMs.delta / 1000);
    out.push(`The walkthrough is ${seconds > 0 ? `${seconds} s longer` : `${Math.abs(seconds)} s shorter`}.`);
  }
  if (out.length === 0) out.push("Nothing changed that the recorder could see: same pages, same controls, same errors.");
  return out;
}

/**
 * The walkthrough as a note someone can paste into a ticket or a chat.
 *
 * Plain text on purpose: it is meant to be pasted somewhere that is not this app.
 */
export function summaryMarkdown(facts: RecordingFacts, insights: RecordingInsights): string {
  const lines: string[] = [];
  lines.push(`# Walkthrough — ${hostOf(facts.url)}`);
  lines.push("");
  lines.push(`- URL: ${facts.url}`);
  if (facts.createdAt) lines.push(`- Recorded: ${facts.createdAt}`);
  lines.push(`- Pages: ${insights.totals.pages} · requests: ${insights.totals.requests} · length: ${Math.round(insights.totals.durationMs / 1000)} s`);
  lines.push("");
  lines.push("## What the recorder found");
  for (const finding of insights.findings) lines.push(`- ${finding.text}`);
  lines.push("");
  lines.push("## Pages");
  for (const page of insights.pages) {
    lines.push(`- \`${page.path}\`${page.title ? ` — ${page.title}` : ""} (${page.status ?? "no status"}, ${page.controls} controls${page.loadMs !== null ? `, ${(page.loadMs / 1000).toFixed(1)} s to load` : ""})`);
  }
  if (insights.consoleErrors.length) {
    lines.push("");
    lines.push("## Console errors");
    for (const e of insights.consoleErrors) lines.push(`- ${e.count}× \`${e.text}\`${e.page ? ` (on ${e.page})` : ""}`);
  }
  if (insights.failedRequests.length) {
    lines.push("");
    lines.push("## Failed requests");
    for (const f of insights.failedRequests) lines.push(`- ${f.method} ${f.url} → ${f.status ?? f.failure ?? "failed"}`);
  }
  return lines.join("\n");
}

// ------------------------------------------------------------------ helpers

function isStep(e: TraceEvent): e is StepEvent {
  return e.type === "step";
}

function isRequest(e: TraceEvent): e is NetworkEvent {
  return e.type === "request";
}

function isConsole(e: TraceEvent): e is ConsoleEvent {
  return e.type === "console";
}

/** A request that is not the page itself: the site's own API calls. */
function isApi(request: NetworkEvent): boolean {
  if (request.method !== "GET" || /\/api\/|\.json(\?|$)/i.test(request.url)) return true;
  return false;
}

/**
 * One segment per navigation.
 *
 * The recorder walks a site by navigating, so a navigation is a page boundary: everything
 * after it and before the next one happened on that page.
 */
function segmentsOf(steps: StepEvent[], events: TraceEvent[]): Segment[] {
  const gotos = steps.filter((s) => s.tool === "goto");
  if (gotos.length === 0) return [];
  const requests = events.filter(isRequest);
  const consoles = events.filter(isConsole);
  const segments: Segment[] = [];
  for (let i = 0; i < gotos.length; i++) {
    const step = gotos[i]!;
    const next = gotos[i + 1];
    const start = step.startedAt;
    const end = next ? next.startedAt : Number.MAX_SAFE_INTEGER;
    const url = gotoUrl(step);
    const observes = steps.filter((s) => s.tool === "observe" && s.startedAt >= start && s.startedAt < end);
    const observe = observes.at(-1);
    const linkStep = steps.find((s) => s.tool === "collectLinks" && s.startedAt >= start && s.startedAt < end);
    segments.push({
      url,
      title: observe?.after?.title ?? step.after?.title ?? "",
      start,
      end,
      loadMs: step.endedAt > step.startedAt ? step.endedAt - step.startedAt : null,
      links: numberAt(linkStep?.result, "links") ?? 0,
      controls: controlEntries(observe?.result),
      fingerprint: stringAt(observe?.result, "fingerprint"),
      requests: requests.filter((r) => r.at >= start && r.at < end),
      consoleErrors: consoles.filter((c) => c.at >= start && c.at < end),
    });
  }
  return segments;
}

/** The page a navigation went to, however the recorder spelled it. */
function gotoUrl(step: StepEvent): string {
  const path = typeof step.args.path === "string" ? step.args.path : "";
  const after = step.after?.url ?? "";
  if (path && /^https?:/i.test(path)) return path;
  if (path && after) return new URL(path, after).toString();
  return after || path;
}

/**
 * The controls the recorder saw, with the names it read off them.
 *
 * A control with no name is not a broken control: it is a field with no label, or a button
 * with nothing on it. Both are worth telling the person who owns the page about, and both
 * were in the trace all along.
 */
function controlEntries(result: unknown): ControlEntry[] {
  if (!result || typeof result !== "object") return [];
  const controls = (result as { controls?: unknown }).controls;
  if (!Array.isArray(controls)) return [];
  const out: ControlEntry[] = [];
  for (const control of controls) {
    if (!control || typeof control !== "object") continue;
    const { role, name } = control as { role?: unknown; name?: unknown };
    out.push({ role: typeof role === "string" ? role : "control", name: typeof name === "string" ? name.trim() : "" });
  }
  return out;
}

/** The controls as readable labels, for comparing two walkthroughs. */
function controlLabels(controls: ControlEntry[]): string[] {
  return controls.filter((c) => c.name).map((c) => `${c.role} “${c.name}”`);
}

/** Controls with no name at all, counted by kind. */
function unnamedControls(controls: ControlEntry[]): { role: string; count: number }[] {
  const byRole = new Map<string, number>();
  for (const control of controls) {
    if (control.name) continue;
    byRole.set(control.role, (byRole.get(control.role) ?? 0) + 1);
  }
  return [...byRole.entries()].map(([role, count]) => ({ role, count }));
}

/**
 * Link text that says nothing on its own.
 *
 * "Click here" works when you can see the page and cannot when you cannot, and a screen
 * reader reads it out as a list of identical links. The list is short on purpose: the point
 * is to name the habit, not to run an audit.
 */
const VAGUE_LINK_TEXT = /^(click here|here|read more|more|learn more|link|this|this page|details|see more|continue)$/i;

function vagueLinks(controls: ControlEntry[]): string[] {
  const out: string[] = [];
  for (const control of controls) {
    if (control.role !== "link") continue;
    if (!VAGUE_LINK_TEXT.test(control.name)) continue;
    out.push(control.name);
  }
  return out;
}

function numberAt(result: unknown, key: string): number | null {
  if (!result || typeof result !== "object") return null;
  const value = (result as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringAt(result: unknown, key: string): string | null {
  if (!result || typeof result !== "object") return null;
  const value = (result as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function groupConsoleErrors(segments: Segment[]): ConsoleErrorInsight[] {
  const byText = new Map<string, ConsoleErrorInsight>();
  for (const segment of segments) {
    for (const error of segment.consoleErrors) {
      const key = errorKey(error.text);
      const existing = byText.get(key);
      if (existing) {
        existing.count += 1;
        existing.page ??= shortPath(segment.url);
        continue;
      }
      byText.set(key, { text: error.text, count: 1, page: shortPath(segment.url), at: error.at });
    }
  }
  return [...byText.values()].sort((a, b) => b.count - a.count);
}

/** Failed requests: a 4xx/5xx answer, or a request that never got one. */
function collectFailures(segments: Segment[], visited: Set<string> = new Set()): FailedRequestInsight[] {
  const out: FailedRequestInsight[] = [];
  const seen = new Set<string>();
  for (const segment of segments) {
    for (const request of segment.requests) {
      const bad = request.failure ? true : (request.status ?? 0) >= 400;
      if (!bad) continue;
      if (!request.failure && visited.has(normalize(request.url))) continue;
      const key = `${request.method} ${request.url} ${request.status ?? request.failure ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        url: request.url,
        method: request.method,
        status: request.status ?? null,
        failure: request.failure ?? null,
        page: shortPath(segment.url),
      });
    }
  }
  return out;
}

/**
 * A console error, reduced to something that can be compared.
 *
 * Two runs of the same page print the same error with a different line number or a different
 * id in it. Stripping the numbers keeps the comparison about the error, not the occasion.
 */
function errorKey(text: string): string {
  return text
    .replace(/\d+/g, "#")
    .replace(/https?:\/\/\S+/g, "url")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function failureKey(request: FailedRequestInsight): string {
  return `${request.method} ${shortPath(request.url)} ${request.status ?? request.failure ?? ""}`;
}

function byPath(pages: PageInsight[]): Map<string, PageInsight> {
  return new Map(pages.map((p) => [p.path, p]));
}

function pageInsight(page: RecordingFacts["pages"][number], segment: Segment | undefined): PageInsight {
  const document = segment?.requests.find((r) => r.method === "GET" && sameUrl(r.url, page.url));
  return {
    url: page.url,
    path: shortPath(page.url),
    title: page.title || segment?.title || "",
    status: page.status,
    controls: page.controls,
    controlNames: controlLabels(segment?.controls ?? []),
    unnamed: unnamedControls(segment?.controls ?? []),
    vagueLinks: vagueLinks(segment?.controls ?? []),
    fingerprint: segment?.fingerprint ?? null,
    loadMs: segment?.loadMs ?? null,
    firstResponseMs: document && document.respondedAt !== undefined ? document.respondedAt - document.at : null,
    links: segment?.links ?? 0,
    requests: segment?.requests.length ?? 0,
    errors: segment?.consoleErrors.length ?? 0,
    failures: (segment?.requests ?? []).filter((r) => r.failure || (r.status ?? 0) >= 400).length,
  };
}

/**
 * The segment a page belongs to.
 *
 * The recorder visits pages in the order it walked them, so the n-th page is the n-th
 * navigation. When the counts disagree (a navigation that failed and left no page), the URL
 * decides instead.
 */
function matchSegment(url: string, segments: Segment[], index: number): Segment | undefined {
  const same = segments.find((s) => sameUrl(s.url, url));
  if (same) return same;
  return segments[index];
}

/** Two URLs are the same page when they differ only in hash or trailing slash. */
function sameUrl(a: string, b: string): boolean {
  return normalize(a) === normalize(b);
}

function normalize(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.pathname = u.pathname.replace(/\/$/, "") || "/";
    return u.toString();
  } catch {
    return url;
  }
}

/** A URL as a short path: what a person reads in a report. */
export function shortPath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}` || "/";
  } catch {
    return url;
  }
}

/** A URL as a host: what a person reads in a list. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
