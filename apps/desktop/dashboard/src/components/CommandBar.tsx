import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Route } from "../App.tsx";
import { cn } from "../lib/format.ts";
import type { LabIndex } from "../lib/types.ts";

/**
 * Everything in the app, in one box, under one keystroke.
 *
 * The index is already in memory, so the search is a filter over what the app knows rather
 * than a request. It reaches the parts people cannot remember: what a walkthrough's
 * narration said, which run had the timeout, which fixture holds a specific failure.
 */
export function CommandBar({ index, go }: { index: LabIndex | null; go: (r: Route) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ⌘K on a Mac, Ctrl+K anywhere else: the same key, so it works in the desktop app too.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((on) => !on);
        return;
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setAt(0);
    const id = setTimeout(() => input.current?.focus(), 20);
    return () => clearTimeout(id);
  }, [open]);

  const results = useMemo(() => (index ? search(index, query) : []), [index, query]);
  useEffect(() => setAt(0), [query]);

  const choose = (r: Result | undefined) => {
    if (!r) return;
    setOpen(false);
    go(r.route);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search everything"
        title="Search everything (Ctrl+K)"
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-2.5 text-[12px] text-ink-3 hover:border-line-strong hover:text-ink"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden rounded border border-line px-1 font-mono text-[10.5px] sm:inline">Ctrl K</kbd>
      </button>
    );
  }

  return (
    // The overlay is portalled to the body: the header it is triggered from is blurred, and a
    // blur makes the header the containing block for anything positioned over it.
    createPortal(
      <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4 pt-[12vh]" onClick={() => setOpen(false)}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          onClick={(e) => e.stopPropagation()}
          className="w-[min(680px,100%)] overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl"
        >
        <input
          ref={input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setAt((n) => Math.min(n + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setAt((n) => Math.max(n - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(results[at]);
            }
          }}
          placeholder="Search walkthroughs, narration, runs, fixtures…"
          aria-label="Search"
          className="h-12 w-full border-b border-line bg-transparent px-4 text-[14px] outline-none placeholder:text-ink-3"
        />
        <div key={results.length ? "results" : "empty"} className="max-h-[52vh] overflow-y-auto p-1.5">
          {/* One or the other, never both: a `&&` conditional leaves a hole in the children
              list, and React's keyed diff can leave the last row behind when the list empties. */}
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-ink-3">{query ? `Nothing matches “${query}”.` : "Type to search."}</p>
          ) : (
            results.map((r, i) => (
              <button
                key={r.id}
                type="button"
                onMouseEnter={() => setAt(i)}
                onClick={() => choose(r)}
                className={cn(
                  "grid w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-2.5 rounded-lg px-3 py-2 text-left",
                  i === at ? "bg-panel-2" : "hover:bg-panel-2",
                )}
              >
                <span className="mt-0.5 font-mono text-[10.5px] uppercase tracking-wider text-ink-3">{r.kind}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] text-ink">{r.title}</span>
                  {r.detail && <span className="block truncate text-[12px] text-ink-3">{r.detail}</span>}
                </span>
              </button>
            ))
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-line px-3 py-1.5 text-[11.5px] text-ink-3">
          <span>↑↓ to move</span>
          <span>↵ to open</span>
          <span>esc to close</span>
        </div>
        </div>
      </div>,
      document.body,
    )
  );
}

interface Result {
  id: string;
  kind: "page" | "walkthrough" | "run" | "fixture";
  title: string;
  detail?: string;
  route: Route;
}

/** The places the app can go. */
const PLACES: { kind: Result["kind"]; title: string; route: Route; words: string }[] = [
  { kind: "page", title: "Dashboard", route: { view: "dashboard" }, words: "overview home" },
  { kind: "page", title: "Record a site", route: { view: "record" }, words: "new walkthrough capture" },
  { kind: "page", title: "Library", route: { view: "library" }, words: "walkthroughs videos" },
  { kind: "page", title: "Runs", route: { view: "runs" }, words: "lab agent" },
  { kind: "page", title: "Failures", route: { view: "failures" }, words: "broken" },
  { kind: "page", title: "Fault replay", route: { view: "simulator" }, words: "scenario simulator" },
  { kind: "page", title: "Fixtures", route: { view: "fixtures" }, words: "regression" },
  { kind: "page", title: "Experiments", route: { view: "experiments" }, words: "grid results" },
  { kind: "page", title: "Schedules", route: { view: "schedules" }, words: "cron change detection" },
  { kind: "page", title: "Settings", route: { view: "settings" }, words: "keys providers account" },
];

/** Everything the app knows, searched the way a person would search for it. */
function search(index: LabIndex, query: string): Result[] {
  const q = query.trim().toLowerCase();
  if (!q) return PLACES.slice(0, 6).map((p) => ({ id: `place:${p.title}`, kind: p.kind, title: p.title, route: p.route }));
  const out: Result[] = [];
  const words = (s: string) => s.toLowerCase();
  for (const place of PLACES) {
    if (words(place.title).includes(q) || place.words.includes(q)) out.push({ id: `place:${place.title}`, kind: place.kind, title: place.title, route: place.route });
  }
  for (const r of index.recordings ?? []) {
    const pages = r.pages.map((p) => p.title).join(" ");
    if (words(r.url).includes(q) || words(pages).includes(q)) {
      out.push({ id: `rec:${r.id}`, kind: "walkthrough", title: r.url, detail: `${r.pages.length} pages · ${new Date(r.createdAt).toLocaleDateString()}`, route: { view: "library", dir: r.id } });
      continue;
    }
    // The narration: the thing nobody remembers the wording of.
    const line = r.captions.find((c) => words(c.text).includes(q));
    if (line) {
      out.push({ id: `rec:${r.id}:${line.start}`, kind: "walkthrough", title: line.text, detail: `${r.url} · narration`, route: { view: "library", dir: r.id } });
    }
  }
  for (const run of index.runs ?? []) {
    const hay = `${run.id} ${run.agent} ${run.fault} ${run.task} ${run.verdict} ${run.causes.join(" ")} ${run.symptoms.join(" ")}`.toLowerCase();
    if (hay.includes(q)) {
      out.push({ id: `run:${run.id}`, kind: "run", title: `${run.agent} · ${run.fault}`, detail: `${run.verdict} · ${run.id}`, route: { view: "run", dir: run.dir } });
    }
  }
  for (const f of index.fixtures ?? []) {
    const hay = `${f.id} ${f.manifest.original.agent.id} ${f.manifest.environment.fault}`.toLowerCase();
    if (hay.includes(q)) out.push({ id: `fix:${f.id}`, kind: "fixture", title: f.id, detail: `${f.manifest.original.agent.id} · ${f.manifest.environment.fault}`, route: { view: "fixtures" } });
  }
  return out.slice(0, 40);
}
