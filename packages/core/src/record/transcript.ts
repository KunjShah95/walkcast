/**
 * The walkthrough as text.
 *
 * A recorded visit is a video, but a video is a poor thing to paste into a ticket, a README or
 * a chat. This module turns the same recording into the forms people actually want: captions
 * as SRT or VTT, and one Markdown document that carries the whole visit — the pages it opened,
 * the narration it spoke, the notes its owner pinned to it, and what the recorder found while
 * it walked.
 *
 * Nothing here guesses: every line comes from the recording's own summary, its trace or the
 * notes its owner wrote.
 */

export interface TranscriptCaption {
  /** Seconds from the start of the video. */
  start: number;
  end: number;
  text: string;
}

export interface TranscriptNote {
  /** Seconds from the start of the video. */
  at: number;
  text: string;
}

/** `m:ss`, the way a person reads a time in a video. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** `h:mm:ss` for the caption formats, which are written for machines. */
function stamp(seconds: number, msSeparator: "," | "."): string {
  const totalMs = Math.round(seconds * 1000);
  const h = Math.floor(totalMs / 3600000);
  const m = Math.floor((totalMs % 3600000) / 60000);
  const sec = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}${msSeparator}${String(ms).padStart(3, "0")}`;
}

/** SubRip: the format every video tool and every player accepts. */
export function toSrt(captions: TranscriptCaption[]): string {
  return captions.map((c, i) => `${i + 1}\n${stamp(c.start, ",")} --> ${stamp(c.end, ",")}\n${c.text}\n`).join("\n");
}

/** WebVTT: the same captions for the web, with the header a browser expects. */
export function toVtt(captions: TranscriptCaption[]): string {
  return "WEBVTT\n\n" + captions.map((c) => `${stamp(c.start, ".")} --> ${stamp(c.end, ".")}\n${c.text}\n`).join("\n");
}

/**
 * Chapters: the recorder opens each page with an "Opening …" line, so those lines are the
 * chapters. A walkthrough with no narration has one chapter: the site itself.
 */
export function chaptersOf(captions: TranscriptCaption[], fallback = "Walkthrough"): { start: number; title: string }[] {
  const chapters = captions.flatMap((c) => (/^Opening\b/.test(c.text) ? [{ start: c.start, title: c.text.replace(/^Opening\s+/, "").replace(/\.$/, "") }] : []));
  if (chapters.length) return chapters;
  return captions.length ? [{ start: 0, title: fallback }] : [];
}

/**
 * The whole visit as one Markdown document.
 *
 * It is meant to be pasted somewhere that is not this app, so it is plain Markdown with no
 * clever formatting: a heading, the facts, the pages, the narration with its times, the
 * owner's notes with theirs, and — when the trace was readable — what the recorder found.
 */
export function transcriptMarkdown(o: {
  url: string;
  createdAt?: string;
  durationMs?: number;
  pages?: { url: string; title?: string; status?: number | null }[];
  captions: TranscriptCaption[];
  notes?: TranscriptNote[];
  /** The findings from the trace, as the insights module words them. */
  findings?: { level?: string; text: string }[];
}): string {
  const lines: string[] = [];
  let host = o.url;
  try {
    host = new URL(o.url).host;
  } catch {
    /* an address that will not parse is printed as it came in */
  }
  lines.push(`# Walkthrough — ${host}`);
  lines.push("");
  lines.push(`- URL: ${o.url}`);
  if (o.createdAt) lines.push(`- Recorded: ${o.createdAt}`);
  if (o.durationMs !== undefined) lines.push(`- Length: ${clock(o.durationMs / 1000)}`);
  if (o.pages?.length) lines.push(`- Pages: ${o.pages.length}`);
  lines.push("");

  const chapters = chaptersOf(o.captions, host);
  if (chapters.length) {
    lines.push("## Chapters");
    for (const c of chapters) lines.push(`- ${clock(c.start)} — ${c.title}`);
    lines.push("");
  }

  if (o.pages?.length) {
    lines.push("## Pages");
    for (const p of o.pages) lines.push(`- ${p.title ? `${p.title} — ` : ""}${p.url}${p.status ? ` (${p.status})` : ""}`);
    lines.push("");
  }

  lines.push("## Transcript");
  if (o.captions.length) {
    for (const c of o.captions) lines.push(`**${clock(c.start)}** — ${c.text}`);
  } else {
    lines.push("_This walkthrough has no narration._");
  }
  lines.push("");

  if (o.notes?.length) {
    lines.push("## Notes");
    for (const n of o.notes) lines.push(`- **${clock(n.at)}** — ${n.text}`);
    lines.push("");
  }

  if (o.findings?.length) {
    lines.push("## What the recorder found");
    for (const f of o.findings) lines.push(`- ${f.text}`);
    lines.push("");
  }

  return lines.join("\n");
}
