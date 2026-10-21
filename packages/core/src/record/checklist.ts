import type { RecordingInsights } from "./insights.ts";

/**
 * What to fix, said as a list.
 *
 * Each walkthrough says what it found on the site. A person who records the same site every
 * week does not want that list every time: they want the things that are still wrong, and
 * whether anything new broke since last time. That is what this is — the findings of every
 * walkthrough of a site, gathered up, counted, and sorted by what is worth doing first.
 *
 * The items are the evidence, not a score. Nothing here is invented: an item exists because a
 * walkthrough saw it, and the walkthrough it came from is named.
 */

/** One thing to fix. */
export interface ChecklistItem {
  /** A stable key, so the same problem is one item however many times it was seen. */
  id: string;
  level: "fail" | "warn" | "info";
  title: string;
  /** Where it was seen: the pages, and the walkthroughs. */
  pages: string[];
  /** How many walkthroughs saw it. */
  seen: number;
  /** How many times it happened, across the walkthroughs. */
  count: number;
  /** It was not there in the walkthrough before the latest one. */
  isNew: boolean;
}

/** The kinds of finding a checklist is made of. */
const ORDER: Record<ChecklistItem["level"], number> = { fail: 0, warn: 1, info: 2 };

/**
 * The list, from every walkthrough of a site.
 *
 * `insights` is oldest first: the last one is the most recent, and "new" means "not in the
 * one before it".
 */
export function checklist(insights: RecordingInsights[]): ChecklistItem[] {
  const items = new Map<string, ChecklistItem>();
  const previous = new Set<string>();
  const latest = new Set<string>();
  insights.forEach((one, index) => {
    const isLatest = index === insights.length - 1;
    for (const finding of findingsOf(one)) {
      const existing = items.get(finding.id);
      if (existing) {
        existing.count += finding.count;
        existing.seen += 1;
        existing.pages = [...new Set([...existing.pages, ...finding.pages])];
        if (finding.level === "fail" || (finding.level === "warn" && existing.level === "info")) existing.level = finding.level;
      } else {
        items.set(finding.id, { ...finding, seen: 1, isNew: false });
      }
      (isLatest ? latest : previous).add(finding.id);
    }
  });
  const out = [...items.values()].map((item) => ({ ...item, isNew: latest.has(item.id) && !previous.has(item.id) }));
  out.sort((a, b) => ORDER[a.level] - ORDER[b.level] || b.count - a.count || a.title.localeCompare(b.title));
  return out;
}

/** The findings of one walkthrough, in the shape the checklist gathers them into. */
function findingsOf(insights: RecordingInsights): { id: string; level: ChecklistItem["level"]; title: string; pages: string[]; count: number }[] {
  const out: { id: string; level: ChecklistItem["level"]; title: string; pages: string[]; count: number }[] = [];
  for (const error of insights.consoleErrors) {
    out.push({
      id: `console:${normalise(error.text)}`,
      level: "fail",
      title: `Console error: ${truncate(error.text)}`,
      pages: error.page ? [error.page] : [],
      count: error.count,
    });
  }
  for (const failure of insights.failedRequests) {
    out.push({
      id: `request:${failure.method}:${normalise(failure.url)}`,
      level: "fail",
      title: `Failed request: ${failure.method} ${failure.url}${failure.status ? ` → ${failure.status}` : ""}`,
      pages: failure.page ? [failure.page] : [],
      count: 1,
    });
  }
  for (const page of insights.pages) {
    if (page.status !== null && page.status >= 400) {
      out.push({ id: `status:${page.path}`, level: "fail", title: `${page.path} answers ${page.status}`, pages: [page.path], count: 1 });
    }
    if (!page.title.trim()) {
      out.push({ id: `title:${page.path}`, level: "warn", title: `${page.path} has no title`, pages: [page.path], count: 1 });
    }
    for (const group of page.unnamed) {
      const what = group.role === "textbox" ? "form field" : group.role === "link" ? "link" : group.role === "button" ? "button" : group.role;
      out.push({
        id: `unnamed:${group.role}`,
        level: "warn",
        title: `${group.count} ${what}${group.count === 1 ? "" : "s"} with no name on ${page.path}`,
        pages: [page.path],
        count: group.count,
      });
    }
    if (page.vagueLinks.length > 0) {
      out.push({
        id: `vague:${page.path}`,
        level: "info",
        title: `${page.vagueLinks.length} link${page.vagueLinks.length === 1 ? "" : "s"} on ${page.path} say nothing on their own`,
        pages: [page.path],
        count: page.vagueLinks.length,
      });
    }
  }
  return out;
}

/** Two walkthroughs of the same error are the same error, however the numbers differ. */
function normalise(text: string): string {
  return text
    .replace(/\d+/g, "#")
    .replace(/https?:\/\/\S+/g, "url")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function truncate(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** The list as a note someone can paste into a ticket. */
export function checklistMarkdown(items: ChecklistItem[], site: string, walkthroughs = 0): string {
  const lines = [`# ${site} — what to fix`, ""];
  if (items.length === 0) {
    lines.push("Nothing to fix: the recorder found no console errors, no failed requests and no broken pages.");
    return lines.join("\n");
  }
  for (const item of items) {
    const where = item.pages.length ? ` (${[...new Set(item.pages)].slice(0, 4).join(", ")})` : "";
    const fresh = item.isNew ? " — new since the last walkthrough" : "";
    lines.push(`- [ ] **${item.title}**${where}${fresh}`);
  }
  lines.push("");
  lines.push(`From ${walkthroughs} walkthrough${walkthroughs === 1 ? "" : "s"} of ${site}.`);
  return lines.join("\n");
}
