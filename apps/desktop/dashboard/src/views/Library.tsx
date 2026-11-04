import { useEffect, useMemo, useState } from "react";
import type { Route } from "../App.tsx";
import { RecordBar } from "../components/RecordBar.tsx";
import { Insights } from "../components/Insights.tsx";
import { SharePanel } from "../components/Share.tsx";
import { OUTCOME, Studio, hostOf } from "../components/Studio.tsx";
import { Button, Empty, PageHead, Panel, Stamp, fieldClass } from "../components/ui.tsx";
import { type BatchRenderResult, type Capabilities, type JobStatus, JobCancelled, cancelJob, deleteRecording, guideUrl, isSnapshot, loadCapabilities, startBatchRender, transcriptUrl, watchBatchRender } from "../lib/api.ts";
import { ago, cn, ms } from "../lib/format.ts";
import type { LabIndex, RecordingSummary } from "../lib/types.ts";

/** Every walkthrough, newest first, with the selected one open in the studio. */
export function Library({ index, dir, go, refresh }: { index: LabIndex; dir?: string; go: (r: Route) => void; refresh: () => Promise<LabIndex> }) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [query, setQuery] = useState("");
  const [overrides, setOverrides] = useState<Record<string, RecordingSummary>>({});
  const [transcriptFmt, setTranscriptFmt] = useState<"srt" | "vtt" | "json">("srt");
  const [deleting, setDeleting] = useState(false);
  // The recording whose Delete is waiting for a second click.
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  // Batch render: pick several walkthroughs, re-frame them all for a feed in one job.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickingShape, setPickingShape] = useState(false);
  const [batchJob, setBatchJob] = useState<JobStatus | null>(null);
  const [batchResult, setBatchResult] = useState<BatchRenderResult | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const batchBusy = batchJob !== null && batchJob.status !== "succeeded" && batchJob.status !== "failed" && batchJob.status !== "cancelled";
  useEffect(() => {
    if (!isSnapshot) loadCapabilities().then(setCaps);
  }, []);

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
    setPickingShape(false);
  };

  const startBatch = async (shape: "vertical" | "square") => {
    const ids = [...selected];
    setPickingShape(false);
    setBatchError(null);
    setBatchResult(null);
    try {
      const jobId = await startBatchRender(ids, shape);
      setBatchJob({ id: jobId, status: "queued", progress: null, error: null, result: null });
      const result = await watchBatchRender(jobId, setBatchJob);
      setBatchResult(result);
      setSelectMode(false);
      setSelected(new Set());
    } catch (e) {
      if (e instanceof JobCancelled) {
        setBatchJob(null);
        return;
      }
      setBatchError(e instanceof Error ? e.message : String(e));
    }
  };

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
          <div className="flex items-center gap-2">
            <label className="relative flex-1">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by site or page"
                aria-label="Filter walkthroughs"
                className={cn(fieldClass, "h-9")}
              />
            </label>
            {!isSnapshot && caps?.live && (
              <button
                type="button"
                onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                aria-pressed={selectMode}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-[12.5px]",
                  selectMode ? "border-signal/60 bg-signal-soft text-signal" : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
                )}
              >
                {selectMode ? "Done" : "Select"}
              </button>
            )}
          </div>
          {selectMode && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel-2 px-3 py-2 text-[12.5px]">
              <span className="text-ink-2">{selected.size} selected</span>
              {!pickingShape ? (
                <Button size="sm" tone="primary" className="ml-auto" disabled={selected.size === 0 || batchBusy} onClick={() => setPickingShape(true)}>
                  Render selected
                </Button>
              ) : (
                <span className="ml-auto flex items-center gap-1.5">
                  <span className="text-ink-3">Shape:</span>
                  <button type="button" onClick={() => void startBatch("vertical")} className="inline-flex h-7 items-center rounded-full border border-line px-2.5 text-ink-2 hover:border-line-strong hover:text-ink">
                    9:16
                  </button>
                  <button type="button" onClick={() => void startBatch("square")} className="inline-flex h-7 items-center rounded-full border border-line px-2.5 text-ink-2 hover:border-line-strong hover:text-ink">
                    1:1
                  </button>
                  <button type="button" onClick={() => setPickingShape(false)} className="inline-flex h-7 items-center rounded-full px-2 text-ink-3 hover:text-ink">
                    Cancel
                  </button>
                </span>
              )}
            </div>
          )}
          {(batchJob || batchResult || batchError) && (
            <BatchRenderPanel
              job={batchJob}
              result={batchResult}
              error={batchError}
              recordings={recordings}
              onCancel={() => cancelJob(batchJob!.id).catch((e: unknown) => setBatchError(e instanceof Error ? e.message : String(e)))}
              onDismiss={() => {
                setBatchJob(null);
                setBatchResult(null);
                setBatchError(null);
              }}
            />
          )}
          <ul className="flex gap-2 overflow-x-auto pb-1 2xl:grid 2xl:max-h-[calc(100dvh-12rem)] 2xl:overflow-y-auto 2xl:overflow-x-visible">
            {shown.map((r) => (
              <li key={r.dir} className="w-[260px] shrink-0 2xl:w-auto">
                <LibraryRow
                  recording={r}
                  on={current?.dir === r.dir}
                  onOpen={() => go({ view: "library", dir: r.id })}
                  selectMode={selectMode}
                  checked={selected.has(r.id)}
                  onToggleSelect={() => toggleSelect(r.id)}
                />
              </li>
            ))}
            {shown.length === 0 && <li className="px-2 py-4 text-[13px] text-ink-3">Nothing matches “{query}”.</li>}
          </ul>
        </aside>
        {current && (
          <div className="grid min-w-0 gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="min-w-0 truncate text-[18px] font-semibold">{hostOf(current.url)}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <a href={current.url} target="_blank" rel="noreferrer" className="truncate font-mono text-[12px] text-ink-3 hover:text-ink">
                  {current.url}
                </a>
                <select
                  value={transcriptFmt}
                  onChange={(e) => setTranscriptFmt(e.target.value as "srt" | "vtt" | "json")}
                  aria-label="Transcript format"
                  className="h-8 rounded-full border border-line bg-panel px-2.5 text-[12px] text-ink-2"
                >
                  <option value="srt">SRT</option>
                  <option value="vtt">VTT</option>
                  <option value="json">JSON</option>
                </select>
                <a
                  href={transcriptUrl(current.id, transcriptFmt)}
                  download={`${current.id}-transcript.${transcriptFmt}`}
                  className="inline-flex h-8 items-center gap-1 rounded-full border border-line px-2.5 text-[12px] text-ink-2 hover:border-line-strong hover:text-ink"
                >
                  Transcript
                </a>
                {!isSnapshot && (
                  <a
                    href={guideUrl(current.id)}
                    target="_blank"
                    rel="noreferrer"
                    title="Every page and every click as numbered steps with pictures"
                    className="inline-flex h-8 items-center gap-1 rounded-full border border-line px-2.5 text-[12px] text-ink-2 hover:border-line-strong hover:text-ink"
                  >
                    Step guide
                  </a>
                )}
                {!isSnapshot && caps?.live && (
                  <button
                    type="button"
                    onClick={() => go({ view: "record", url: current.url })}
                    title="Walk this site again and compare it with this walkthrough"
                    className="inline-flex h-8 items-center gap-1 rounded-full border border-line px-2.5 text-[12px] text-ink-2 hover:border-line-strong hover:text-ink"
                  >
                    Walk it again
                  </button>
                )}
                {!isSnapshot && caps?.live && (
                  <button
                    type="button"
                    onClick={() => setSharing((on) => !on)}
                    aria-expanded={sharing}
                    className={cn(
                      "inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-[12px]",
                      sharing ? "border-signal/60 bg-signal-soft text-signal" : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
                    )}
                  >
                    Share
                  </button>
                )}
                {!isSnapshot && caps?.live && confirmDelete !== current.id && (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(current.id)}
                    className="inline-flex h-8 items-center rounded-full border border-line px-2.5 text-[12px] text-ink-2 hover:border-fail/60 hover:text-fail"
                  >
                    Delete
                  </button>
                )}
                {/* Asked on the page, not with window.confirm(): the desktop app's webview doesn't
                    reliably show native dialogs, so Delete could silently never run. */}
                {!isSnapshot && caps?.live && confirmDelete === current.id && (
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-2">
                    Delete its video, audio and captions for good?
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={() => setConfirmDelete(null)}
                      className="inline-flex h-8 items-center rounded-full border border-line px-2.5 hover:text-ink disabled:opacity-50"
                    >
                      Keep
                    </button>
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={async () => {
                        setDeleting(true);
                        setDeleteError(null);
                        try {
                          await deleteRecording(current.id);
                          await refresh();
                          go({ view: "library" });
                        } catch (e) {
                          setDeleteError(e instanceof Error ? e.message : String(e));
                        } finally {
                          setDeleting(false);
                          setConfirmDelete(null);
                        }
                      }}
                      className="inline-flex h-8 items-center rounded-full border border-fail/60 px-2.5 text-fail hover:bg-fail-soft disabled:opacity-50"
                    >
                      {deleting ? "Deleting…" : "Delete"}
                    </button>
                  </span>
                )}
              </div>
            </div>
            {deleteError && <p className="rounded-xl border border-fail/30 bg-fail-soft px-4 py-3 text-[13px] text-fail">{deleteError}</p>}

            {sharing && (
              <SharePanel
                recording={current}
                onChange={(next) => {
                  setOverrides((o) => ({ ...o, [current.dir]: { ...next, dir: current.dir } }));
                  void refresh();
                }}
              />
            )}
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
            <Insights recording={current} others={recordings} />
          </div>
        )}
      </div>
    </div>
  );
}

function LibraryRow({
  recording: r,
  on,
  onOpen,
  selectMode,
  checked,
  onToggleSelect,
}: {
  recording: RecordingSummary;
  on: boolean;
  onOpen: () => void;
  selectMode?: boolean;
  checked?: boolean;
  onToggleSelect?: () => void;
}) {
  const outcome = OUTCOME[r.signIn.outcome] ?? { text: r.signIn.outcome, tone: "muted" as const };
  return (
    <button
      type="button"
      onClick={selectMode ? onToggleSelect : onOpen}
      aria-current={on ? "true" : undefined}
      aria-pressed={selectMode ? checked : undefined}
      className={cn(
        "grid w-full gap-1.5 rounded-xl border p-3 text-left transition-colors",
        selectMode ? (checked ? "border-signal/50 bg-signal-soft" : "border-line bg-panel hover:border-line-strong") : on ? "border-signal/50 bg-signal-soft" : "border-line bg-panel hover:border-line-strong",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          {selectMode && (
            <span
              aria-hidden
              className={cn(
                "grid size-4 shrink-0 place-items-center rounded border",
                checked ? "border-signal bg-signal text-white" : "border-line-strong",
              )}
            >
              {checked && (
                <svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 6.2 4.6 9 10 2.5" />
                </svg>
              )}
            </span>
          )}
          <span className="truncate text-[13.5px] font-medium">{hostOf(r.url)}</span>
        </span>
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

/** "rendering 3/10" -> { done: 3, total: 10 }. Null while the server hasn't said a count yet. */
function parseBatchProgress(progress: string | null | undefined): { done: number; total: number } | null {
  const m = /(\d+)\s*\/\s*(\d+)/.exec(progress ?? "");
  return m ? { done: Number(m[1]), total: Number(m[2]) } : null;
}

/** Progress (and, once it lands, the per-recording result) of a batch-render job. */
function BatchRenderPanel({
  job,
  result,
  error,
  recordings,
  onCancel,
  onDismiss,
}: {
  job: JobStatus | null;
  result: BatchRenderResult | null;
  error: string | null;
  recordings: RecordingSummary[];
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const nameOf = (id: string) => {
    const r = recordings.find((x) => x.id === id);
    return r ? hostOf(r.url) : id;
  };
  const progress = job ? parseBatchProgress(job.progress) : null;
  const running = job && (job.status === "queued" || job.status === "running");
  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
        <h3 className="text-[13px] font-semibold">Batch render</h3>
        {!running && (
          <button type="button" onClick={onDismiss} className="text-[12px] text-ink-3 hover:text-ink">
            Dismiss
          </button>
        )}
      </div>
      <div className="grid gap-2.5 px-3.5 py-3">
        {error && <p className="rounded-lg border border-fail/30 bg-fail-soft px-3 py-2 text-[12.5px] text-fail">{error}</p>}
        {!error && job && !result && (
          <div className="grid gap-2">
            <p className="text-[12.5px] text-ink-2">{job.status === "queued" ? "Queued…" : progress ? `Rendering ${progress.done}/${progress.total}` : "Rendering…"}</p>
            {progress && (
              <div className="h-1.5 overflow-hidden rounded-full bg-panel-3">
                <div className="h-full rounded-full bg-signal transition-[width]" style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} />
              </div>
            )}
            {running && (
              <button
                type="button"
                onClick={onCancel}
                className="justify-self-start rounded-full border border-line px-2.5 py-1 text-[12px] text-ink-2 hover:border-fail/60 hover:text-fail"
              >
                Cancel
              </button>
            )}
          </div>
        )}
        {!error && result && (
          <div className="grid gap-2">
            <p className="text-[12.5px] text-ink-2">
              {result.succeeded} of {result.total} rendered{result.failed > 0 ? `, ${result.failed} failed` : ""}
            </p>
            <ul className="grid gap-1.5">
              {result.items.map((it) => (
                <li key={it.recordingId} className="flex items-center justify-between gap-2 text-[12.5px]">
                  <span className="min-w-0 truncate">{nameOf(it.recordingId)}</span>
                  {it.status === "ok" ? <Stamp tone="pass">Ok</Stamp> : <span title={it.error}><Stamp tone="fail">Failed</Stamp></span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
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
