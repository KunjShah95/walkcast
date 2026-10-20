import { useEffect, useMemo, useState } from "react";
import {
  diffRecordings,
  hostOf,
  summaryMarkdown,
  type RecordingDiff,
  type RecordingInsights,
} from "../../../../../packages/core/src/record/insights.ts";
import { loadInsights } from "../lib/api.ts";
import { cn, ms } from "../lib/format.ts";
import type { RecordingSummary } from "../lib/types.ts";
import { Button, Empty, Panel, PanelHeader, Stamp } from "./ui.tsx";

/**
 * What the recorder saw, and what changed since the last time it saw it.
 *
 * A walkthrough was a video and nothing else: you could watch it, but the console errors the
 * page printed, the requests that failed and the pages that got slower were all captured and
 * then thrown away. This panel reads them back, and lines two walkthroughs of the same site
 * up against each other, which is the question a scheduled recording exists to answer.
 */
export function Insights({ recording, others }: { recording: RecordingSummary; others: RecordingSummary[] }) {
  const [insights, setInsights] = useState<RecordingInsights | null>(recording.insights ?? null);
  const [loading, setLoading] = useState(!recording.insights);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setInsights(recording.insights ?? null);
    setLoading(!recording.insights);
    if (recording.insights) return;
    void loadInsights(recording.id).then((found) => {
      if (!alive) return;
      setInsights(found);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [recording.id, recording.insights]);

  const markdown = useMemo(() => (insights ? summaryMarkdown(recording, insights) : ""), [recording, insights]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setNote("Copied. Paste it into a ticket or a chat.");
    } catch {
      setNote("The clipboard is not available here — the text is in the box below.");
    }
    setTimeout(() => setNote(null), 4000);
  };

  return (
    <div className="grid gap-4">
      <Panel>
        <PanelHeader
          eyebrow={insights ? `${insights.totals.pages} pages · ${insights.totals.requests} requests · ${insights.totals.consoleErrors} console errors` : "Reading the trace"}
          title="What the recorder found"
          aside={
            markdown ? (
              <Button tone="secondary" size="sm" onClick={copy}>
                Copy as notes
              </Button>
            ) : undefined
          }
        />
        {loading ? (
          <p className="px-4 py-3 text-[13px] text-ink-3">Reading what the recorder captured…</p>
        ) : !insights ? (
          <div className="px-4 py-3">
            <Empty title="No trace to read" tone="muted">
              This walkthrough was made before the recorder started keeping what it saw, and its trace is not on this server.
            </Empty>
          </div>
        ) : (
          <div className="grid gap-4 px-4 py-3">
            <ul className="grid gap-1.5">
              {insights.findings.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] leading-snug">
                  <span
                    className={cn(
                      "mt-[6px] size-1.5 shrink-0 rounded-full",
                      f.level === "fail" ? "bg-fail" : f.level === "warn" ? "bg-warn" : "bg-ink-3",
                    )}
                    aria-hidden
                  />
                  <span className={cn(f.level === "fail" ? "text-fail" : f.level === "warn" ? "text-warn" : "text-ink-2")}>{f.text}</span>
                </li>
              ))}
            </ul>

            {insights.pages.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
                  <thead>
                    <tr className="border-b border-line text-left text-ink-3">
                      <th className="py-1.5 pr-3 font-medium">Page</th>
                      <th className="py-1.5 pr-3 font-medium">Status</th>
                      <th className="py-1.5 pr-3 font-medium">Load</th>
                      <th className="py-1.5 pr-3 font-medium">Controls</th>
                      <th className="py-1.5 pr-3 font-medium">Links</th>
                      <th className="py-1.5 font-medium">Requests</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insights.pages.map((p) => (
                      <tr key={p.path} className="border-b border-line/60 last:border-0">
                        <td className="py-1.5 pr-3">
                          <span className="block truncate font-mono text-[12px] text-ink-2">{p.path}</span>
                          {p.title && <span className="block truncate text-[11.5px] text-ink-3">{p.title}</span>}
                        </td>
                        <td className={cn("py-1.5 pr-3 font-mono text-[11.5px]", (p.status ?? 0) >= 400 ? "text-fail" : "text-ink-3")}>
                          {p.status ?? "—"}
                        </td>
                        <td className="py-1.5 pr-3 font-mono text-[11.5px] text-ink-3">{p.loadMs !== null ? ms(p.loadMs) : "—"}</td>
                        <td className="py-1.5 pr-3 font-mono text-[11.5px] text-ink-3">
                          {p.controls}
                          {p.errors > 0 && <span className="ml-1 text-fail">{p.errors} err</span>}
                          {p.failures > 0 && <span className="ml-1 text-fail">{p.failures} failed</span>}
                          {p.unnamed.length > 0 && <span className="ml-1 text-warn">{p.unnamed.reduce((n, u) => n + u.count, 0)} unnamed</span>}
                        </td>
                        <td className="py-1.5 pr-3 font-mono text-[11.5px] text-ink-3">{p.links || "—"}</td>
                        <td className="py-1.5 font-mono text-[11.5px] text-ink-3">{p.requests || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {insights.consoleErrors.length > 0 && (
              <details className="rounded-xl border border-line px-3 py-2">
                <summary className="cursor-pointer select-none text-[12.5px] text-ink-2">
                  {insights.totals.consoleErrors} console error{insights.totals.consoleErrors === 1 ? "" : "s"}
                </summary>
                <ul className="mt-2 grid gap-1">
                  {insights.consoleErrors.map((e, i) => (
                    <li key={i} className="text-[12px] text-ink-3">
                      <span className="font-mono text-fail">{e.count}×</span> <span className="font-mono">{e.text}</span>
                      {e.page && <span className="ml-1 text-ink-3">on {e.page}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {insights.failedRequests.length > 0 && (
              <details className="rounded-xl border border-line px-3 py-2">
                <summary className="cursor-pointer select-none text-[12.5px] text-ink-2">
                  {insights.failedRequests.length} failed request{insights.failedRequests.length === 1 ? "" : "s"}
                </summary>
                <ul className="mt-2 grid gap-1">
                  {insights.failedRequests.map((f, i) => (
                    <li key={i} className="truncate font-mono text-[11.5px] text-ink-3">
                      {f.method} {f.url} → {f.status ?? f.failure ?? "failed"}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {note && <p className="text-[12.5px] text-ink-3">{note}</p>}
            {markdown && (
              <details className="rounded-xl border border-line px-3 py-2">
                <summary className="cursor-pointer select-none text-[12.5px] text-ink-2">The notes as text</summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11.5px] text-ink-3">{markdown}</pre>
              </details>
            )}
          </div>
        )}
      </Panel>

      <Changes recording={recording} others={others} />
    </div>
  );
}

/**
 * What changed between this walkthrough and an earlier one of the same site.
 *
 * Two walkthroughs of the same site are comparable; two of different sites are not, and are
 * not compared here rather than compared into nonsense. The earlier one is chosen by the
 * person, because "compared with the last one" and "compared with the one before the
 * redesign" are different questions.
 */
function Changes({ recording, others }: { recording: RecordingSummary; others: RecordingSummary[] }) {
  const candidates = useMemo(
    () =>
      others
        .filter((r) => r.id !== recording.id && hostOf(r.url) === hostOf(recording.url) && Date.parse(r.createdAt) < Date.parse(recording.createdAt))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [others, recording.id, recording.url, recording.createdAt],
  );
  const [selected, setSelected] = useState<string>("");
  const [before, setBefore] = useState<RecordingInsights | null>(null);
  const [after, setAfter] = useState<RecordingInsights | null>(recording.insights ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAfter(recording.insights ?? null);
  }, [recording.id, recording.insights]);

  useEffect(() => {
    let alive = true;
    if (!selected) {
      setBefore(null);
      setError(null);
      return;
    }
    const other = candidates.find((c) => c.id === selected);
    setLoading(true);
    setError(null);
    void (async () => {
      const found = other?.insights ?? (await loadInsights(selected));
      if (!alive) return;
      setBefore(found);
      setLoading(false);
      if (!found) setError("That walkthrough has no trace to read.");
    })();
    return () => {
      alive = false;
    };
  }, [selected, candidates]);

  if (candidates.length === 0) return null;

  const other = candidates.find((c) => c.id === selected);
  const diff: RecordingDiff | null =
    before && after && other
      ? diffRecordings({ id: other.id, url: other.url, createdAt: other.createdAt, insights: before }, { id: recording.id, url: recording.url, createdAt: recording.createdAt, insights: after })
      : null;

  return (
    <Panel>
      <PanelHeader
        eyebrow="Compare with an earlier walkthrough of the same site"
        title="What changed"
        aside={
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            aria-label="Compare with"
            className="h-8 rounded-full border border-line bg-panel px-2.5 text-[12.5px] text-ink-2"
          >
            <option value="">Choose a walkthrough…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {new Date(c.createdAt).toLocaleString()} — {c.pages.length} pages
              </option>
            ))}
          </select>
        }
      />
      <div className="grid gap-3 px-4 py-3">
        {loading && <p className="text-[13px] text-ink-3">Reading the earlier trace…</p>}
        {error && <p className="text-[13px] text-fail">{error}</p>}
        {diff && (
          <>
            <ul className="grid gap-1.5">
              {diff.summary.map((line, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] leading-snug text-ink-2">
                  <span className="mt-[6px] size-1.5 shrink-0 rounded-full bg-signal" aria-hidden />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            {diff.pages.controls.length > 0 && (
              <details className="rounded-xl border border-line px-3 py-2">
                <summary className="cursor-pointer select-none text-[12.5px] text-ink-2">Controls that came and went</summary>
                <ul className="mt-2 grid gap-2">
                  {diff.pages.controls.map((c) => (
                    <li key={c.path} className="text-[12px]">
                      <span className="font-mono text-ink-2">{c.path}</span>
                      {c.added.length > 0 && <div className="text-pass">+ {c.added.join(", ")}</div>}
                      {c.removed.length > 0 && <div className="text-fail">− {c.removed.join(", ")}</div>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Stamp tone={diff.changed === 0 ? "pass" : "warn"}>{diff.changed === 0 ? "Nothing changed" : `${diff.changed} change${diff.changed === 1 ? "" : "s"}`}</Stamp>
              <span className="text-[12px] text-ink-3">
                {diff.totals.pages.from} → {diff.totals.pages.to} pages · {ms(diff.totals.durationMs.from)} → {ms(diff.totals.durationMs.to)}
              </span>
            </div>
          </>
        )}
        {!selected && <p className="text-[13px] text-ink-3">Pick an earlier walkthrough of {hostOf(recording.url)} to see what the site looks like now against how it looked then.</p>}
      </div>
    </Panel>
  );
}
