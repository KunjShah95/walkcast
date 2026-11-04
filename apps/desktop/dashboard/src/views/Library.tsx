import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "../App.tsx";
import { ExportMenu } from "../components/export/ExportMenu.tsx";
import { RecordBar } from "../components/RecordBar.tsx";
import { Insights } from "../components/Insights.tsx";
import { SharePanel } from "../components/Share.tsx";
import { OUTCOME, Studio, hostOf } from "../components/Studio.tsx";
import { Button, Empty, PageHead, Panel, Stamp, fieldClass } from "../components/ui.tsx";
import {
  type BatchRenderItem,
  type BatchRenderResult,
  type Capabilities,
  type JobStatus,
  JobCancelled,
  canRevealFiles,
  cancelJob,
  deleteRecording,
  isSnapshot,
  loadCapabilities,
  maxBatchRenderItems,
  mediaUrl,
  revealRecordingFile,
  startBatchRender,
  watchBatchRender,
} from "../lib/api.ts";
import { refreshActiveJob, useActiveJob } from "../lib/active-job.ts";
import { ago, cn, ms } from "../lib/format.ts";
import type { LabIndex, RecordingSummary } from "../lib/types.ts";
import { ActiveJobNotice } from "./ActiveJobNotice.tsx";

type Shape = "vertical" | "square";
const RATIO: Record<Shape, string> = { vertical: "9:16", square: "1:1" };

/** Every walkthrough, newest first, with the selected one open in the studio. */
export function Library({ index, dir, go, refresh }: { index: LabIndex; dir?: string; go: (r: Route) => void; refresh: () => Promise<LabIndex> }) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [query, setQuery] = useState("");
  const [overrides, setOverrides] = useState<Record<string, RecordingSummary>>({});
  const [deleting, setDeleting] = useState(false);
  // The recording whose Delete is waiting for a second click.
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  // Batch render: pick several walkthroughs, re-frame them all for a feed in one job.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const lastPicked = useRef<number | null>(null);
  // Choosing the shape is a confirm step, not the start: the summary says what will happen first.
  const [confirming, setConfirming] = useState(false);
  const [shape, setShape] = useState<Shape>("vertical");
  const [batchJob, setBatchJob] = useState<JobStatus | null>(null);
  const [batchShape, setBatchShape] = useState<Shape | null>(null);
  const [batchResult, setBatchResult] = useState<BatchRenderResult | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const batchBusy = batchJob !== null && (batchJob.status === "queued" || batchJob.status === "running");
  const { job: activeJob } = useActiveJob();
  // Somebody else's job (a recording, a lab run) holds the account's one slot.
  const otherJob = activeJob && activeJob.id !== batchJob?.id ? activeJob : null;
  const cap = maxBatchRenderItems(caps);

  useEffect(() => {
    if (!isSnapshot) loadCapabilities().then(setCaps);
  }, []);

  /** Follow a batch job to the end, then reload the library so the new exports show up. */
  const follow = async (jobId: string, ids: string[]) => {
    try {
      const result = await watchBatchRender(jobId, setBatchJob);
      setBatchResult(result);
      setSelectMode(false);
      setSelected([]);
    } catch (e) {
      if (e instanceof JobCancelled) {
        setBatchJob(null);
        return;
      }
      setBatchError(e instanceof Error ? e.message : String(e));
    } finally {
      // A stale local copy of a re-rendered recording would hide its new export (and keep offering "Make 9:16").
      setOverrides((o) => Object.fromEntries(Object.entries(o).filter(([, r]) => !ids.includes(r.id))));
      void refresh().catch(() => undefined);
      void refreshActiveJob();
    }
  };

  // Came back to the page (or reloaded) while a batch was still rendering: pick it back up.
  const reattached = useRef<string | null>(null);
  useEffect(() => {
    if (!activeJob || activeJob.kind !== "batch-render" || batchJob || reattached.current === activeJob.id) return;
    reattached.current = activeJob.id;
    const input = (activeJob as { input?: { recordingIds?: unknown; shape?: unknown } }).input;
    const ids = Array.isArray(input?.recordingIds) ? input.recordingIds.map(String) : [];
    setBatchShape(input?.shape === "square" ? "square" : input?.shape === "vertical" ? "vertical" : null);
    setBatchJob(activeJob);
    setBatchError(null);
    setBatchResult(null);
    void follow(activeJob.id, ids);
  }, [activeJob?.id, activeJob?.kind]);

  const recordings = useMemo(() => (index.recordings ?? []).map((r) => overrides[r.dir] ?? r), [index.recordings, overrides]);
  const shown = recordings.filter((r) => !query || `${r.url} ${r.pages.map((p) => p.title).join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  const current = recordings.find((r) => r.dir === dir || r.id === dir) ?? recordings[0];
  const hiddenSelected = selected.filter((id) => !shown.some((r) => r.id === id)).length;
  const full = selected.length >= cap;

  const pick = (id: string, i: number, range: boolean) => {
    setConfirming(false);
    setSelected((prev) => {
      const on = prev.includes(id);
      if (range && lastPicked.current !== null) {
        const [a, b] = [Math.min(lastPicked.current, i), Math.max(lastPicked.current, i)];
        const next = [...prev];
        for (const r of shown.slice(a, b + 1)) if (!next.includes(r.id) && next.length < cap) next.push(r.id);
        return next;
      }
      if (on) return prev.filter((x) => x !== id);
      return prev.length < cap ? [...prev, id] : prev;
    });
    lastPicked.current = i;
  };

  const selectAllVisible = () => {
    setConfirming(false);
    setSelected((prev) => {
      const next = [...prev];
      for (const r of shown) if (!next.includes(r.id) && next.length < cap) next.push(r.id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected([]);
    setConfirming(false);
    lastPicked.current = null;
  };

  const startBatch = async () => {
    const ids = [...selected];
    setConfirming(false);
    setBatchError(null);
    setBatchResult(null);
    setBatchShape(shape);
    try {
      const jobId = await startBatchRender(ids, shape);
      reattached.current = jobId;
      setBatchJob({ id: jobId, status: "queued", progress: null, error: null, result: null });
      void refreshActiveJob();
      await follow(jobId, ids);
    } catch (e) {
      setBatchError(e instanceof Error ? e.message : String(e));
    }
  };

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

  const live = !isSnapshot && Boolean(caps?.live);
  const n = selected.length;

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
            {live && (
              <button
                type="button"
                onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                aria-pressed={selectMode}
                className={cn(
                  "press inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-[12.5px] font-medium transition-colors",
                  selectMode ? "bg-solid text-on-solid" : "bg-panel-2 text-ink hover:bg-panel-3",
                )}
              >
                {selectMode ? "Done" : "Select to render"}
              </button>
            )}
          </div>
          {selectMode && (
            <div className="grid gap-2 rounded-[14px] bg-panel-2 px-3 py-2.5 text-[12.5px]">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium text-ink" aria-live="polite">
                  {n} of up to {cap} selected
                  {hiddenSelected > 0 && <span className="font-normal text-ink-2"> ({hiddenSelected} hidden by the filter, still included)</span>}
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <button type="button" onClick={selectAllVisible} disabled={full || shown.every((r) => selected.includes(r.id))} className="text-ink-2 underline-offset-2 hover:text-ink hover:underline disabled:opacity-40">
                    Select all shown
                  </button>
                  {n > 0 && (
                    <button type="button" onClick={() => { setSelected([]); setConfirming(false); }} className="text-ink-2 underline-offset-2 hover:text-ink hover:underline">
                      Clear
                    </button>
                  )}
                </span>
              </div>
              <p className="text-[12px] text-ink-2">
                {full ? `That's the most one batch can take (${cap}). Deselect one to pick another.` : "Click to pick, Shift-click to pick a range."}
              </p>
              {otherJob && !batchBusy ? (
                <ActiveJobNotice job={otherJob} go={go} action="start a batch render" className="px-3 py-2 text-[12.5px]" />
              ) : !confirming ? (
                <Button size="sm" tone="primary" className="justify-self-start" disabled={n === 0 || batchBusy} onClick={() => setConfirming(true)}>
                  {batchBusy ? "A batch is rendering…" : `Render ${n || ""} selected…`}
                </Button>
              ) : (
                <div className="grid gap-2 rounded-[10px] bg-panel p-2.5 shadow-[inset_0_0_0_1px_var(--line)]">
                  <div role="radiogroup" aria-label="Shape" className="flex gap-1.5">
                    {(["vertical", "square"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={shape === s}
                        onClick={() => setShape(s)}
                        className={cn("h-8 rounded-full px-3 text-[12.5px] font-medium transition-colors", shape === s ? "bg-solid text-on-solid" : "bg-panel-2 text-ink hover:bg-panel-3")}
                      >
                        {RATIO[s]} {s === "vertical" ? "(stories, reels)" : "(feed posts)"}
                      </button>
                    ))}
                  </div>
                  <p className="text-[12.5px] text-ink-2">
                    Render {n} walkthrough{n === 1 ? "" : "s"} as {RATIO[shape]}, captions burned in when available. One job; you can leave this page while it runs.
                  </p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" tone="primary" onClick={() => void startBatch()}>
                      Start
                    </Button>
                    <Button size="sm" tone="ghost" onClick={() => setConfirming(false)}>
                      Back
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          {(batchJob || batchResult || batchError) && (
            <BatchRenderPanel
              job={batchJob}
              shape={batchShape}
              result={batchResult}
              error={batchError}
              recordings={recordings}
              go={go}
              onCancel={() => batchJob && cancelJob(batchJob.id).catch((e: unknown) => setBatchError(e instanceof Error ? e.message : String(e)))}
              onDismiss={() => {
                setBatchJob(null);
                setBatchResult(null);
                setBatchError(null);
              }}
            />
          )}
          {/* A horizontal strip of cards below 2xl, a column beside the studio above it. Picking
              several needs to see them, so select mode is always a vertical list. */}
          <ul
            aria-label={selectMode ? "Walkthroughs to render" : "Walkthroughs"}
            className={cn(
              "pb-1",
              selectMode ? "grid max-h-[min(60dvh,32rem)] gap-2 overflow-y-auto sm:grid-cols-2 2xl:max-h-[calc(100dvh-12rem)] 2xl:grid-cols-1" : "flex gap-2 overflow-x-auto 2xl:grid 2xl:max-h-[calc(100dvh-12rem)] 2xl:overflow-y-auto 2xl:overflow-x-visible",
            )}
          >
            {shown.map((r, i) => (
              <li key={r.dir} className={cn(!selectMode && "w-[260px] shrink-0 2xl:w-auto")}>
                <LibraryRow
                  recording={r}
                  on={current?.dir === r.dir}
                  onOpen={() => go({ view: "library", dir: r.id })}
                  selectMode={selectMode}
                  checked={selected.includes(r.id)}
                  blocked={full && !selected.includes(r.id)}
                  onToggleSelect={(e) => pick(r.id, i, e.shiftKey)}
                />
              </li>
            ))}
            {shown.length === 0 && <li className="px-2 py-4 text-[13px] text-ink-3">Nothing matches “{query}”.</li>}
          </ul>
        </aside>
        {current && (
          <div className="grid min-w-0 gap-4">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="grid min-w-0 gap-0.5">
                <h2 className="min-w-0 truncate text-[18px] font-semibold">{hostOf(current.url)}</h2>
                <a href={current.url} target="_blank" rel="noreferrer" className="truncate font-mono text-[12px] text-ink-3 hover:text-ink">
                  {current.url}
                </a>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                {live && (
                  <Button size="sm" tone="primary" onClick={() => setSharing((on) => !on)} aria-expanded={sharing}>
                    {sharing ? "Close sharing" : "Share"}
                  </Button>
                )}
                <ExportMenu
                  recording={current}
                  caps={caps}
                  onChange={(next) => {
                    setOverrides((o) => ({ ...o, [current.dir]: { ...next, dir: current.dir } }));
                    void refresh();
                  }}
                />
                {live && (
                  <Button size="sm" tone="secondary" onClick={() => go({ view: "record", url: current.url })} title="Walk this site again and compare it with this walkthrough">
                    Walk it again
                  </Button>
                )}
                {live && confirmDelete !== current.id && (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(current.id)}
                    className="inline-flex h-8 items-center rounded-full px-2.5 text-[12.5px] text-ink-3 transition-colors hover:bg-fail-soft hover:text-fail"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
            {/* Asked on the page, not with window.confirm(): the desktop app's webview doesn't
                reliably show native dialogs, so Delete could silently never run. */}
            {live && confirmDelete === current.id && (
              <div role="alertdialog" aria-label="Delete this walkthrough" className="flex flex-wrap items-center gap-2 rounded-xl border border-fail/30 bg-fail-soft px-4 py-2.5 text-[13px] text-ink">
                <span className="mr-auto">Delete this walkthrough's video, audio and captions for good?</span>
                <Button size="sm" tone="secondary" disabled={deleting} onClick={() => setConfirmDelete(null)} autoFocus>
                  Keep it
                </Button>
                <Button
                  size="sm"
                  tone="danger"
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
                >
                  {deleting ? "Deleting…" : "Delete"}
                </Button>
              </div>
            )}
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
  blocked,
  onToggleSelect,
}: {
  recording: RecordingSummary;
  on: boolean;
  onOpen: () => void;
  selectMode?: boolean;
  checked?: boolean;
  /** The batch is full: this one can't be added until another is removed. */
  blocked?: boolean;
  onToggleSelect?: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  const outcome = OUTCOME[r.signIn.outcome] ?? { text: r.signIn.outcome, tone: "muted" as const };
  return (
    <button
      type="button"
      onClick={selectMode ? (e) => !blocked && onToggleSelect?.(e) : onOpen}
      role={selectMode ? "checkbox" : undefined}
      aria-checked={selectMode ? Boolean(checked) : undefined}
      aria-disabled={selectMode && blocked ? true : undefined}
      aria-current={!selectMode && on ? "true" : undefined}
      title={selectMode && blocked ? "The batch is full. Deselect one to pick this." : undefined}
      className={cn(
        "grid w-full gap-1.5 rounded-xl border p-3 text-left transition-colors",
        selectMode
          ? checked
            ? "border-signal/60 bg-signal-soft"
            : blocked
              ? "cursor-not-allowed border-line bg-panel opacity-55"
              : "border-line bg-panel hover:border-line-strong"
          : on
            ? "border-signal/50 bg-signal-soft"
            : "border-line bg-panel hover:border-line-strong",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          {selectMode && (
            <span aria-hidden className={cn("grid size-4 shrink-0 place-items-center rounded border", checked ? "border-signal bg-signal text-on-signal" : "border-line-strong bg-panel")}>
              {checked && (
                <svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 6.2 4.6 9 10 2.5" />
                </svg>
              )}
            </span>
          )}
          <span className="truncate text-[13.5px] font-medium">{hostOf(r.url)}</span>
          {selectMode && on && <span className="shrink-0 rounded-[6px] bg-panel-2 px-1.5 py-px text-[10.5px] font-medium text-ink-2">open</span>}
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
  shape,
  result,
  error,
  recordings,
  go,
  onCancel,
  onDismiss,
}: {
  job: JobStatus | null;
  shape: Shape | null;
  result: BatchRenderResult | null;
  error: string | null;
  recordings: RecordingSummary[];
  go: (r: Route) => void;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const [revealable, setRevealable] = useState(() => canRevealFiles());
  const [revealError, setRevealError] = useState<string | null>(null);
  const find = (id: string) => recordings.find((x) => x.id === id);
  const progress = job ? parseBatchProgress(job.progress) : null;
  const running = job && (job.status === "queued" || job.status === "running");
  // `rendering 3/10` names the one being worked on, so 2 are done.
  const done = progress ? Math.max(0, progress.done - 1) : 0;
  const status = job?.status === "queued" ? "Queued, waiting for the worker" : progress ? `Rendering ${progress.done} of ${progress.total}` : "Rendering";

  /** The exported file: the one the server named, else the recording's export of that shape. */
  const fileOf = (item: BatchRenderItem, r: RecordingSummary | undefined) => item.file ?? (shape ? r?.media.exports?.[shape] : undefined);

  const reveal = async (id: string, file?: string) => {
    setRevealError(null);
    try {
      if (!(await revealRecordingFile(id, file))) setRevealable(false);
    } catch (e) {
      setRevealError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
        <h3 className="text-[13px] font-semibold">Batch render{shape ? ` · ${RATIO[shape]}` : ""}</h3>
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
            <p className="text-[12.5px] text-ink-2" aria-live="polite">
              {status}…
            </p>
            <div
              role="progressbar"
              aria-label="Batch render progress"
              aria-valuemin={0}
              aria-valuemax={progress?.total ?? 1}
              aria-valuenow={progress ? done : undefined}
              aria-valuetext={progress ? `${done} of ${progress.total} done` : status}
              className="h-1.5 overflow-hidden rounded-full bg-panel-3"
            >
              <div className="h-full rounded-full bg-signal transition-[width]" style={{ width: progress ? `${Math.round((done / Math.max(1, progress.total)) * 100)}%` : "0%" }} />
            </div>
            {running && (
              <button type="button" onClick={onCancel} className="justify-self-start rounded-full px-2.5 py-1 text-[12px] text-ink-2 hover:bg-fail-soft hover:text-fail">
                Cancel the batch
              </button>
            )}
          </div>
        )}
        {!error && result && (
          <div className="grid gap-2">
            <p className="text-[12.5px] text-ink-2" aria-live="polite">
              {result.succeeded} of {result.total} rendered{result.failed > 0 ? `, ${result.failed} failed` : ""}.
            </p>
            <ul className="grid gap-2">
              {(result.items as BatchRenderItem[]).map((it) => {
                const r = find(it.recordingId);
                const file = fileOf(it, r);
                const href = r && file ? mediaUrl(r.dir, file) : undefined;
                return (
                  <li key={it.recordingId} className="grid gap-1 text-[12.5px]">
                    <span className="flex items-center justify-between gap-2">
                      <button type="button" onClick={() => go({ view: "library", dir: it.recordingId })} className="min-w-0 truncate text-left hover:underline">
                        {r ? hostOf(r.url) : it.recordingId}
                      </button>
                      {it.status === "ok" ? <Stamp tone="pass">Done</Stamp> : <Stamp tone="fail">Failed</Stamp>}
                    </span>
                    {it.status === "error" && <span className="text-[12px] text-fail">{it.error ?? "No reason was given."}</span>}
                    {it.status === "ok" && (href || revealable) && (
                      <span className="flex flex-wrap gap-x-3 text-[12px]">
                        {href && (
                          <a href={href} download={`${it.recordingId}-${file}`} className="font-medium text-ink underline underline-offset-2">
                            Download
                          </a>
                        )}
                        {revealable && (
                          <button type="button" onClick={() => void reveal(it.recordingId, file)} className="font-medium text-ink underline underline-offset-2">
                            Show in folder
                          </button>
                        )}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {revealError && <p className="text-[12px] text-fail">{revealError}</p>}
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
