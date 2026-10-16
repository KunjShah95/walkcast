import { ArrowRight } from "lucide-react";
import type { Route } from "../App.tsx";
import { Empty, FindingChip, Panel, PanelHeader, SpotlightCard, Verdict } from "../components/ui.tsx";
import { FAULT_LABEL, faultLabel, ago, cn, label, ms } from "../lib/format.ts";
import type { LabIndex, RunSummary } from "../lib/types.ts";

import { TASKS } from "../lib/agents.ts";
import { useState } from "react";
export function Overview({ index, go }: { index: LabIndex; go: (r: Route) => void }) {
  const runs = index.runs;
  if (runs.length === 0) {
    return (
      <Empty title="No runs recorded yet">
        Run an agent against a fault to start: <code className="font-mono">npm run lab -- run --fault stale-owners --agent v0</code>
      </Empty>
    );
  }
  const failing = runs.filter((r) => r.verdict === "fail");
  const falseSuccess = runs.filter((r) => r.symptoms.includes("false-success"));

  return (
    <div className="grid gap-5 [&>*]:min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="eyebrow">Recorder summary</div>
          <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]">
            {failing.length} of {runs.length} runs failed;{" "}
            <span className="evidence">{falseSuccess.length} claimed success</span> anyway.
          </h1>
          <p className="mt-1 max-w-[68ch] text-ink-2">
            Each verdict comes from the application's own records, not from the agent's report or a model judge. Causes are deterministic
            trace rules that cite the steps they rely on.
          </p>
        </div>
        <Stats
          items={[
            ["Runs", runs.length],
            ["Fixtures", index.fixtures.length],
            ["Experiments", index.experiments.length],
            ["Model calls", runs.reduce((n, r) => n + r.modelCalls, 0)],
          ]}
        />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-12">
        <Panel className="min-w-0 lg:col-span-8">
          <PanelHeader eyebrow="Latest verdict per agent and fault" title="Agent × fault" aside={<Legend />} />
          <TaskMatrix runs={runs} go={go} />
        </Panel>
        <Panel className="min-w-0 lg:col-span-4">
          <PanelHeader eyebrow="What the agent said vs. what the app recorded" title="Said / recorded" />
          <SaidVsRecorded runs={runs} />
        </Panel>

        <Panel className="min-w-0 lg:col-span-5">
          <PanelHeader eyebrow={`Across ${failing.length} failing runs`} title="Causes" />
          <CauseBars runs={failing} />
        </Panel>
        <Panel className="min-w-0 lg:col-span-7">
          <PanelHeader
            eyebrow="Newest first"
            title="Recent runs"
            aside={
              <button type="button" onClick={() => go({ view: "runs" })} className="inline-flex items-center gap-1 text-[13px] text-signal hover:underline">
                All runs <ArrowRight className="size-3.5" />
              </button>
            }
          />
          <div className="grid gap-2 p-3 sm:grid-cols-2">
            {runs.slice(0, 6).map((r) => (
              <RunCard key={r.dir} run={r} onOpen={() => go({ view: "run", dir: r.dir })} />
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Stats({ items }: { items: [string, number][] }) {
  return (
    <dl className="grid grid-cols-2 divide-line overflow-hidden rounded-xl border border-line bg-panel shadow-card sm:grid-cols-4 sm:divide-x [&>div]:border-line max-sm:[&>div:nth-child(-n+2)]:border-b max-sm:[&>div:nth-child(odd)]:border-r">
      {items.map(([k, v]) => (
        <div key={k} className="px-4 py-2.5">
          <dt className="eyebrow">{k}</dt>
          <dd className="tabular font-display text-2xl font-semibold leading-tight">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 font-mono text-[10.5px] text-ink-3">
      <span className="inline-flex items-center gap-1">
        <span className="size-2.5 rounded-sm bg-pass" /> pass
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="size-2.5 rounded-sm bg-fail" /> fail
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="size-2.5 rounded-sm border border-dashed border-ink-3" /> not run
      </span>
    </div>
  );
}

function TaskMatrix({ runs, go }: { runs: RunSummary[]; go: (r: Route) => void }) {
  const present = TASKS.filter((t) => runs.some((r) => r.task === t.id));
  const [task, setTask] = useState(present[0]?.id ?? "create-lead");
  return (
    <div>
      {present.length > 1 && (
        <div className="flex flex-wrap gap-1 px-3 pt-3" role="tablist" aria-label="Task">
          {present.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={task === t.id}
              onClick={() => setTask(t.id)}
              className={cn("rounded-md px-2.5 py-1 text-[12.5px]", task === t.id ? "bg-ink text-paper" : "text-ink-2 hover:bg-panel-2")}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
      <AgentFaultMatrix runs={runs.filter((r) => r.task === task)} go={go} />
    </div>
  );
}

function AgentFaultMatrix({ runs, go }: { runs: RunSummary[]; go: (r: Route) => void }) {
  // Single faults in their usual order, then combined scenarios ("a+b"), all from the data.
  const order = Object.keys(FAULT_LABEL);
  const rank = (f: string) => (order.includes(f) ? order.indexOf(f) : order.length);
  const faults = [...new Set(runs.map((r) => r.fault))].sort((x, y) => rank(x) - rank(y) || x.localeCompare(y));
  const agents = [...new Set(runs.map((r) => r.agent))].sort();
  const latest = new Map<string, RunSummary>();
  for (const r of runs) {
    const key = `${r.agent}|${r.fault}`;
    if (!latest.has(key)) latest.set(key, r); // runs are newest first
  }
  return (
    <div className="overflow-x-auto p-3">
      <table className="w-full border-separate border-spacing-1 text-left">
        <thead>
          <tr>
            <th className="eyebrow w-20 px-1 font-normal">Agent</th>
            {faults.map((f) => (
              <th key={f} className="px-1 align-bottom text-[11.5px] font-medium leading-tight text-ink-2">
                {faultLabel(f)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => (
            <tr key={a}>
              <th className="px-1 font-mono text-[12.5px] font-medium">{a}</th>
              {faults.map((f) => {
                const r = latest.get(`${a}|${f}`);
                if (!r) return <td key={f} className="h-11 min-w-16 rounded-md border border-dashed border-line" />;
                const pass = r.verdict === "pass";
                return (
                  <td key={f} className="h-11 min-w-16 p-0">
                    <button
                      type="button"
                      onClick={() => go({ view: "run", dir: r.dir })}
                      title={`${a} · ${faultLabel(f)}: ${pass ? "pass" : [...r.symptoms, ...r.causes].map(label).join(", ")}`}
                      className={cn(
                        "flex h-full w-full flex-col justify-center rounded-md px-2 text-left transition-transform hover:scale-[1.03]",
                        pass ? "bg-pass-soft text-pass" : "bg-fail-soft text-fail",
                      )}
                    >
                      <span className="font-mono text-[11px] font-semibold uppercase">{pass ? "pass" : "fail"}</span>
                      <span className="truncate text-[10.5px] text-ink-2">{pass ? (r.incidents[0] ? `recovered: ${label(r.incidents[0])}` : "clean") : label(r.causes[0] ?? r.symptoms[0] ?? "")}</span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SaidVsRecorded({ runs }: { runs: RunSummary[] }) {
  const said = (r: RunSummary) => r.claim?.success ?? false;
  const cells = {
    honestSuccess: runs.filter((r) => said(r) && r.taskPassed).length,
    falseSuccess: runs.filter((r) => said(r) && !r.taskPassed).length,
    missed: runs.filter((r) => !said(r) && r.taskPassed).length,
    honestFailure: runs.filter((r) => !said(r) && !r.taskPassed).length,
  };
  const cell = (n: number, title: string, note: string, tone: "pass" | "fail" | "muted") => (
    <div
      className={cn(
        "flex min-h-24 flex-col justify-between rounded-lg border p-3",
        tone === "fail" ? "border-fail/40 bg-fail-soft" : tone === "pass" ? "border-pass/30 bg-pass-soft" : "border-line bg-panel-2",
      )}
    >
      <div className={cn("tabular font-display text-3xl font-semibold leading-none", tone === "fail" ? "text-fail" : tone === "pass" ? "text-pass" : "text-ink")}>{n}</div>
      <div>
        <div className="text-[12.5px] font-medium">{title}</div>
        <div className="text-[11.5px] text-ink-2">{note}</div>
      </div>
    </div>
  );
  return (
    <div className="p-3">
      <div className="mb-1.5 grid grid-cols-[auto_1fr_1fr] items-end gap-2">
        <span />
        <span className="eyebrow">App: correct</span>
        <span className="eyebrow">App: wrong</span>
      </div>
      <div className="grid grid-cols-[auto_1fr_1fr] items-stretch gap-2">
        <span className="eyebrow self-center [writing-mode:vertical-rl] rotate-180">Said done</span>
        {cell(cells.honestSuccess, "Honest success", "claim matches records", "pass")}
        {cell(cells.falseSuccess, "False success", "claimed done, records disagree", "fail")}
        <span className="eyebrow self-center [writing-mode:vertical-rl] rotate-180">Said failed</span>
        {cell(cells.missed, "Missed success", "task done, agent unsure", "muted")}
        {cell(cells.honestFailure, "Honest failure", "reported the problem", "muted")}
      </div>
    </div>
  );
}

function CauseBars({ runs }: { runs: RunSummary[] }) {
  const counts = new Map<string, number>();
  for (const r of runs) for (const c of r.causes) counts.set(c, (counts.get(c) ?? 0) + 1);
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(([, n]) => n));
  if (rows.length === 0) return <p className="p-4 text-ink-2">No failing runs.</p>;
  return (
    <ul className="grid gap-2.5 p-4">
      {rows.map(([cause, n]) => (
        <li key={cause} className="grid grid-cols-[minmax(0,10rem)_1fr_2rem] items-center gap-3">
          <FindingChip id={cause} kind="cause" />
          <div className="h-2.5 overflow-hidden rounded-full bg-panel-2">
            <div className={cn("h-full rounded-full", cause === "unexplained" ? "bg-warn" : "bg-ink")} style={{ width: `${(n / max) * 100}%` }} />
          </div>
          <span className="tabular text-right font-mono text-[12px] text-ink-2">{n}</span>
        </li>
      ))}
    </ul>
  );
}

function RunCard({ run, onOpen }: { run: RunSummary; onOpen: () => void }) {
  return (
    <SpotlightCard onClick={onOpen} className="p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-[12px] font-medium">{run.agent}</span>
        <Verdict verdict={run.verdict} />
      </div>
      <div className="mt-1 truncate text-[13px]">{faultLabel(run.fault)}</div>
      <div className="mt-2 flex min-h-5 flex-wrap gap-1">
        {run.symptoms.map((s) => (
          <FindingChip key={s} id={s} kind="symptom" />
        ))}
        {run.causes.map((c) => (
          <FindingChip key={c} id={c} kind="cause" />
        ))}
        {run.verdict === "pass" && run.incidents.map((c) => <FindingChip key={c} id={c} kind="incident" />)}
      </div>
      <div className="tabular mt-2 flex gap-3 font-mono text-[11px] text-ink-3">
        <span>{run.steps} steps</span>
        <span>{ms(run.durationMs)}</span>
        {run.modelCalls > 0 && <span>{run.modelCalls} model calls</span>}
        <span className="ml-auto">{ago(run.createdAt)}</span>
      </div>
    </SpotlightCard>
  );
}
