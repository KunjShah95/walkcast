import { useEffect, useMemo, useState } from "react";
import type { Route } from "../App.tsx";
import { FindingChip, Panel, PanelHeader, Verdict } from "../components/ui.tsx";
import { loadRun } from "../lib/api.ts";
import { faultLabel, cn, ms } from "../lib/format.ts";
import type { LabIndex, RunDetail } from "../lib/types.ts";
import { type AlignmentRow, type DiffReport, compareRuns } from "../../../src/lab/diff.ts";

/**
 * Baseline vs candidate: where the action sequences diverge, which actions broke, how each page's
 * controls changed, and the likely replacement for each broken element.
 */
export function Compare({ base, cand, index, go }: { base: string; cand: string; index: LabIndex; go: (r: Route) => void }) {
  const [pair, setPair] = useState<[RunDetail, RunDetail] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false; // a slower, older request must not overwrite a newer pair
    setPair(null);
    setError(null);
    Promise.all([loadRun(base), loadRun(cand)]).then(
      (p) => !cancelled && setPair(p as [RunDetail, RunDetail]),
      (e: Error) => !cancelled && setError(e.message),
    );
    return () => {
      cancelled = true;
    };
  }, [base, cand]);
  const report = useMemo<DiffReport | null>(
    () => (pair ? compareRuns({ result: pair[0].result, events: pair[0].events }, { result: pair[1].result, events: pair[1].events }) : null),
    [pair],
  );
  const runs = index.runs;

  if (error) return <p className="rounded-lg border border-fail/40 bg-fail-soft px-4 py-3 text-fail">{error}</p>;
  if (!report || !pair) return <p className="font-mono text-ink-3">Comparing…</p>;
  const o = report.outcome;

  return (
    <div className="grid gap-5 [&>*]:min-w-0">
      <div>
        <div className="eyebrow">Baseline comparison · change detection</div>
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight">What changed between these runs</h1>
        <p className="mt-1 max-w-[80ch] text-[15px]">{report.summary}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
        <RunPick label="Baseline" detail={pair[0]} other={cand} runs={runs} onPick={(d) => go({ view: "compare", base: d, cand })} />
        <span className="mx-auto hidden text-center font-mono text-ink-3 md:block" aria-hidden>→</span>
        <RunPick label="Candidate" detail={pair[1]} other={base} runs={runs} onPick={(d) => go({ view: "compare", base, cand: d })} />
      </div>

      <Panel>
        <PanelHeader eyebrow="Ground truth and cost" title="Outcome" />
        <div className="overflow-x-auto">
          <table className="tabular w-full text-left text-[13px]">
            <thead>
              <tr className="eyebrow">
                <th className="px-4 py-2 font-normal" />
                <th className="px-3 py-2 font-normal">Baseline</th>
                <th className="px-3 py-2 font-normal">Candidate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <Row k="Verdict" a={<Verdict verdict={o.verdict[0] as "pass" | "fail"} />} b={<Verdict verdict={o.verdict[1] as "pass" | "fail"} />} />
              {o.checks.map((c) => (
                <Row key={c.name} k={c.name} a={<Tick ok={c.baseline} />} b={<Tick ok={c.candidate} note={c.candidate ? undefined : JSON.stringify(c.actual)} />} />
              ))}
              <Row k="Steps" a={o.steps[0]} b={<Delta a={o.steps[0]} b={o.steps[1]} />} />
              <Row k="Duration" a={ms(o.durationMs[0])} b={<Delta a={o.durationMs[0]} b={o.durationMs[1]} format={ms} />} />
              <Row k="Model calls" a={o.modelCalls[0]} b={<Delta a={o.modelCalls[0]} b={o.modelCalls[1]} />} />
            </tbody>
          </table>
        </div>
        {(o.newFindings.length > 0 || o.resolvedFindings.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-4 py-3 text-[12.5px] text-ink-2">
            {o.newFindings.length > 0 && <span>New:</span>}
            {o.newFindings.map((f) => (
              <FindingChip key={f} id={f} kind="cause" />
            ))}
            {o.resolvedFindings.length > 0 && <span className="ml-2">Resolved:</span>}
            {o.resolvedFindings.map((f) => (
              <FindingChip key={f} id={f} kind="incident" />
            ))}
          </div>
        )}
      </Panel>

      {report.broken.length > 0 && (
        <Panel>
          <PanelHeader eyebrow="Worked in the baseline, fails now" title="Broken elements" />
          <ul className="grid gap-px bg-line">
            {report.broken.map((b) => (
              <li key={b.stepId} className="grid gap-2 bg-panel px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="min-w-0">
                  <div className="eyebrow">step {b.stepId}</div>
                  <div className="font-mono text-[13px] [overflow-wrap:anywhere]">{b.target}</div>
                  {b.error && <div className="mt-0.5 font-mono text-[11.5px] text-fail">{b.error}</div>}
                  {b.was && (
                    <div className="mt-1 text-[12.5px] text-ink-2">
                      Was {b.was.role} <b className="text-ink">“{b.was.name}”</b> <code className="font-mono text-[11.5px]">{b.was.selector}</code>
                    </div>
                  )}
                </div>
                <div className="min-w-0 rounded-lg border border-dashed border-signal/40 bg-signal-soft px-3 py-2">
                  <div className="eyebrow text-signal">Likely replacement</div>
                  {b.suggestion ? (
                    <>
                      <div className="text-[13px]">
                        {b.suggestion.control.role} <b>“{b.suggestion.control.name}”</b> <code className="font-mono text-[11.5px]">{b.suggestion.control.selector}</code>
                      </div>
                      <div className="text-[12px] text-ink-2">{b.suggestion.reason}</div>
                    </>
                  ) : (
                    <div className="text-[12.5px] text-ink-2">No confident match on the new page.</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {report.pages.length > 0 && (
        <Panel>
          <PanelHeader eyebrow="Controls on the same page, baseline vs candidate" title="Page changes" />
          <div className="grid gap-3 p-4">
            {report.pages.map((p) => (
              <div key={p.path}>
                <div className="font-mono text-[12.5px] font-semibold">{p.path}</div>
                <ul className="mt-1 grid gap-1 font-mono text-[12px]">
                  {p.renamed.map((x, i) => (
                    <li key={`r${i}`} className="[overflow-wrap:anywhere]">
                      <span className="text-warn">~</span> {x.from.role} “{x.from.name}” {x.from.selector} → <span className="evidence">“{x.to.name}” {x.to.selector}</span>{" "}
                      <span className="text-ink-3">matched by {x.by}</span>
                    </li>
                  ))}
                  {p.removed.map((x, i) => (
                    <li key={`d${i}`} className="text-fail">
                      − {x.role} “{x.name}” {x.selector}
                    </li>
                  ))}
                  {p.added.map((x, i) => (
                    <li key={`a${i}`} className="text-pass">
                      + {x.role} “{x.name}” {x.selector}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel className="min-w-0">
        <PanelHeader
          eyebrow={report.firstDivergence === null ? "Identical action sequences" : `First divergence at candidate step ${report.firstDivergence}`}
          title="Action alignment"
        />
        <ol className="grid gap-1 p-3">
          {report.alignment.map((row, i) => (
            <AlignRow key={i} row={row} />
          ))}
        </ol>
      </Panel>
    </div>
  );
}

function AlignRow({ row }: { row: AlignmentRow }) {
  const tone = { same: "", broke: "bg-fail-soft", fixed: "bg-pass-soft", removed: "bg-panel-2", added: "bg-warn-soft" }[row.op];
  const left = row.op === "added" ? null : row.baseline;
  const right = row.op === "removed" ? null : row.candidate;
  const cell = (a: typeof left) =>
    a ? (
      <span className={cn("min-w-0 font-mono text-[11.5px] [overflow-wrap:anywhere]", !a.ok && "text-fail")}>
        <span className="text-ink-3">#{a.stepId} {a.tool}</span> {a.target}
      </span>
    ) : (
      <span className="font-mono text-[11.5px] text-ink-3">—</span>
    );
  return (
    <li className={cn("grid grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1fr)] items-start gap-2 rounded-md px-2 py-1", tone)}>
      {cell(left)}
      <span className="text-center font-mono text-[10px] uppercase tracking-wider text-ink-3">{row.op}</span>
      {cell(right)}
    </li>
  );
}

function Row({ k, a, b }: { k: string; a: React.ReactNode; b: React.ReactNode }) {
  return (
    <tr>
      <th className="px-4 py-2 font-mono text-[12px] font-normal text-ink-2">{k}</th>
      <td className="px-3 py-2">{a}</td>
      <td className="px-3 py-2">{b}</td>
    </tr>
  );
}

function Tick({ ok, note }: { ok: boolean; note?: string }) {
  return (
    <span className={cn("font-mono text-[12px]", ok ? "text-pass" : "text-fail")}>
      {ok ? "✓" : "✗"} {note}
    </span>
  );
}

function Delta({ a, b, format = String }: { a: number; b: number; format?: (n: number) => string }) {
  const d = b - a;
  return (
    <span className="font-mono text-[12px]">
      {format(b)} <span className={d > 0 ? "text-warn" : d < 0 ? "text-pass" : "text-ink-3"}>({d > 0 ? "+" : d < 0 ? "−" : "±"}{format(Math.abs(d))})</span>
    </span>
  );
}

function RunPick({ label, detail, other, runs, onPick }: { label: string; detail: RunDetail; other: string; runs: LabIndex["runs"]; onPick: (dir: string) => void }) {
  const s = detail.summary;
  const options = runs.filter((r) => r.dir !== other).slice(0, 120);
  const id = `pick-${label.toLowerCase()}`;
  return (
    <Panel className="min-w-0 p-3">
      <label htmlFor={id} className="eyebrow">
        {label}
      </label>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="truncate font-display text-[16px] font-semibold">
          {s.agent} · {faultLabel(s.fault)}
        </span>
        <Verdict verdict={s.verdict} />
      </div>
      <select id={id} value={s.dir} onChange={(e) => onPick(e.target.value)} className="mt-2 w-full rounded-md border border-line bg-panel px-2 py-1 font-mono text-[11.5px] text-ink-2">
        {!options.some((r) => r.dir === s.dir) && <option value={s.dir}>{s.id}</option>}
        {options.map((r) => (
          <option key={r.dir} value={r.dir}>
            {r.agent} · {r.fault} · {r.verdict} · {r.id.slice(-8)}
          </option>
        ))}
      </select>
    </Panel>
  );
}
