import { useEffect, useMemo, useState } from "react";
import type { Route } from "../App.tsx";
import { RecordBar } from "../components/RecordBar.tsx";
import { OUTCOME, Studio, hostOf } from "../components/Studio.tsx";
import { Empty, PageHead, Stamp, fieldClass } from "../components/ui.tsx";
import { type Capabilities, isSnapshot, loadCapabilities } from "../lib/api.ts";
import { ago, cn, ms } from "../lib/format.ts";
import type { LabIndex, RecordingSummary } from "../lib/types.ts";

/** Every walkthrough, newest first, with the selected one open in the studio. */
export function Library({ index, dir, go, refresh }: { index: LabIndex; dir?: string; go: (r: Route) => void; refresh: () => Promise<LabIndex> }) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [query, setQuery] = useState("");
  const [overrides, setOverrides] = useState<Record<string, RecordingSummary>>({});
  useEffect(() => {
    if (!isSnapshot) loadCapabilities().then(setCaps);
  }, []);

  const recordings = useMemo(() => (index.recordings ?? []).map((r) => overrides[r.dir] ?? r), [index.recordings, overrides]);
  const shown = recordings.filter((r) => !query || `${r.url} ${r.pages.map((p) => p.title).join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  const current = recordings.find((r) => r.dir === dir || r.id === dir) ?? recordings[0];

  if (recordings.length === 0) {
    return (
      <div className="grid gap-6">
        <PageHead title="Your" dim="walkthroughs." description="Every narration line is tagged as an exhibit and seeks the video." />
        <Empty
          title="No walkthroughs yet"
          tone="signal"
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" /></svg>}
          action={!isSnapshot && <div className="w-[min(560px,80vw)]"><RecordBar onRecord={(url) => go({ view: "record", url })} /></div>}
        >
          Paste a link to a site you own or may test. Walkcast walks it and gives you a narrated video.
        </Empty>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <PageHead
        title="Your"
        dim="walkthroughs."
        description={`${recordings.length} walkthrough${recordings.length === 1 ? "" : "s"}. Every narration line is tagged as an exhibit and seeks the video.`}
      />
      <div className="grid items-start gap-5 2xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="grid gap-2 2xl:sticky 2xl:top-20">
          <label className="relative">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by site or page"
              aria-label="Filter walkthroughs"
              className={cn(fieldClass, "h-9")}
            />
          </label>
          <ul className="flex gap-2 overflow-x-auto pb-1 2xl:grid 2xl:max-h-[calc(100dvh-12rem)] 2xl:overflow-y-auto 2xl:overflow-x-visible">
            {shown.map((r) => (
              <li key={r.dir} className="w-[260px] shrink-0 2xl:w-auto">
                <LibraryRow recording={r} on={current?.dir === r.dir} onOpen={() => go({ view: "library", dir: r.id })} />
              </li>
            ))}
            {shown.length === 0 && <li className="px-2 py-4 text-[13px] text-ink-3">Nothing matches “{query}”.</li>}
          </ul>
        </aside>
        {current && (
          <div className="grid min-w-0 gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="min-w-0 truncate text-[18px] font-semibold">{hostOf(current.url)}</h2>
              <a href={current.url} target="_blank" rel="noreferrer" className="truncate font-mono text-[12px] text-ink-3 hover:text-ink">
                {current.url}
              </a>
            </div>
            <Studio
              key={current.dir}
              recording={current}
              caps={caps}
              onChange={(next) => {
                setOverrides((o) => ({ ...o, [current.dir]: { ...next, dir: current.dir } }));
                void refresh();
              }}
            />
            <Pages recording={current} />
          </div>
        )}
      </div>
    </div>
  );
}

function LibraryRow({ recording: r, on, onOpen }: { recording: RecordingSummary; on: boolean; onOpen: () => void }) {
  const outcome = OUTCOME[r.signIn.outcome] ?? { text: r.signIn.outcome, tone: "muted" as const };
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={on ? "true" : undefined}
      className={cn(
        "grid w-full gap-1.5 rounded-xl border p-3 text-left transition-colors",
        on ? "border-signal/50 bg-signal-soft" : "border-line bg-panel hover:border-line-strong",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-[13.5px] font-medium">{hostOf(r.url)}</span>
        <span className="shrink-0 font-mono text-[11px] text-ink-3">{ago(Date.parse(r.createdAt))}</span>
      </span>
      <span className="flex items-center gap-2">
        {outcome.tone !== "pass" && outcome.tone !== "muted" ? <Stamp tone="fail">{outcome.text}</Stamp> : <span className="text-[12px] text-ink-3">{outcome.text}</span>}
        <span className="ml-auto font-mono text-[11px] text-ink-3">
          {r.pages.length}p · {ms(r.durationMs)}
        </span>
      </span>
    </button>
  );
}

function Pages({ recording: r }: { recording: RecordingSummary }) {
  return (
    <section className="rounded-2xl border border-line bg-panel">
      <header className="flex items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <h3 className="text-[14.5px] font-semibold">Pages visited</h3>
        <span className="text-[12.5px] text-ink-3">{r.skipped.length ? `${r.skipped.length} skipped on purpose` : "none skipped"}</span>
      </header>
      <ul className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0">
        {r.pages.map((p, i) => {
          const bad = (p.status ?? 200) >= 400;
          let path = p.url;
          try {
            path = new URL(p.url).pathname;
          } catch {
            /* keep the raw url */
          }
          return (
            <li key={i} className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-2 px-4 py-2.5 sm:border-b sm:border-line">
              <span className={cn("font-mono text-[12px]", bad ? "text-fail" : "text-ink-3")}>{p.status ?? "—"}</span>
              <span className="min-w-0">
                <span className="block truncate text-[13px]">{p.title || "(untitled)"}</span>
                <span className="block truncate font-mono text-[11.5px] text-ink-3">
                  {path} · {p.controls} controls
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {r.skipped.length > 0 && (
        <details className="border-t border-line px-4 py-2.5 text-[12.5px] text-ink-2">
          <summary className="cursor-pointer select-none">Why links were skipped</summary>
          <ul className="mt-2 grid gap-1">
            {r.skipped.map((s, i) => (
              <li key={i} className="truncate font-mono text-[11.5px]">
                {s.url} · {s.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
