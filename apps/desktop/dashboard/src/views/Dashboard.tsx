import { useEffect, useState } from "react";
import type { Route } from "../App.tsx";
import { RecordBar } from "../components/RecordBar.tsx";
import { Spotlight, DotGrid, TextGenerate } from "../components/aceternity.tsx";
import { Studio, hostOf } from "../components/Studio.tsx";
import { Cite, Empty, ExhibitTag, FindingChip, Panel, PanelHeader, Stamp, Verdict } from "../components/ui.tsx";
import { type Capabilities, type Me, fileUrl, isSnapshot, loadCapabilities, loadRun } from "../lib/api.ts";
import { TASKS } from "../lib/agents.ts";
import { FAULT_LABEL, ago, cn, faultLabel, label, ms } from "../lib/format.ts";
import type { LabIndex, RunDetail, RunSummary, StepEvent } from "../lib/types.ts";

/**
 * Both jobs side by side: the newest walkthrough (narration lines as exhibits) and the newest
 * failure (its cause citing the steps it rests on). One link in the bar above starts the next.
 */
export function Dashboard({ index, me, go }: { index: LabIndex; me: Me | null; go: (r: Route) => void }) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  useEffect(() => {
    if (!isSnapshot) loadCapabilities().then(setCaps);
  }, []);
  const recordings = index.recordings ?? [];
  const runs = index.runs;
  const latestRec = recordings[0];
  const latestFail = runs.find((r) => r.verdict === "fail");
  const first = me?.user?.name?.split(" ")[0];

  return (
    <div className="grid gap-6 [&>*]:min-w-0">
      <section className="relative grid gap-4 overflow-hidden border-b border-line pb-6">
        <DotGrid />
        <Spotlight />
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
          <TextGenerate text={first ? `${first}, what should we walk next?` : "What should we walk next?"} className="text-[28px] font-semibold leading-[1.05] tracking-tight sm:text-[40px]" />
          <Facts index={index} caps={caps} />
        </div>
        {isSnapshot ? (
          <p className="text-[13px] text-ink-3">This is a read-only snapshot.</p>
        ) : (
          <div className="max-w-3xl">
            <RecordBar onRecord={(url) => go({ view: "record", url })} />
          </div>
        )}
        <p className="max-w-[72ch] text-[14px] text-ink-2">
          Paste a link and a real browser walks it, narrating only what it did. Lab runs below show where your agents broke, with the steps that prove it.
        </p>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-12">
        <section className="grid min-w-0 gap-3 xl:col-span-7">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[16px] font-semibold">Latest walkthrough</h2>
            {latestRec && (
              <button type="button" onClick={() => go({ view: "library", dir: latestRec.id })} className="inline-flex items-center gap-1 text-[13px] text-ink-2 hover:text-ink">
                {hostOf(latestRec.url)} · open in the studio
              </button>
            )}
          </div>
          {latestRec ? (
            <Studio recording={latestRec} caps={caps} compact />
          ) : (
            <Empty title="Your first walkthrough lands here" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" /></svg>} tone="signal">
              Paste a link in the bar above. You get the video, a transcript and captions.
            </Empty>
          )}
        </section>

        <section className="grid min-w-0 gap-3 xl:col-span-5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[16px] font-semibold">Latest failure</h2>
            {latestFail && (
              <button type="button" onClick={() => go({ view: "run", dir: latestFail.dir })} className="inline-flex items-center gap-1 text-[13px] text-ink-2 hover:text-ink">
                open the full run
              </button>
            )}
          </div>
          {latestFail ? (
            <FailureCase run={latestFail} go={go} />
          ) : runs.length ? (
            <Empty title="No failing runs" tone="pass" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>}>
              Every recorded agent run passed its application checks.
            </Empty>
          ) : (
            <Empty
              title="No lab runs yet"
              tone="signal"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" /><path d="M4 4v4.5h4.5" /></svg>}
              action={
                <button type="button" onClick={() => go({ view: "simulator" })} className="rounded-full bg-solid px-4 py-2 text-[13px] font-medium text-on-solid hover:brightness-95">
                  Replay a fault
                </button>
              }
            >
              Run an agent against an injected fault and the cause shows up here, with the steps that prove it.
            </Empty>
          )}
        </section>
      </div>

      {runs.length > 0 && (
        <div className="grid items-start gap-5 xl:grid-cols-12">
          <Panel className="min-w-0 xl:col-span-7">
            <PanelHeader title="Agent × fault" eyebrow="Latest verdict for each agent against each fault." aside={<Legend />} />
            <TaskMatrix runs={runs} go={go} />
          </Panel>
          <div className="grid min-w-0 gap-5 xl:col-span-5">
            <Panel>
              <PanelHeader title="Said vs. recorded" eyebrow="What the agent reported against what the app's records show." />
              <SaidVsRecorded runs={runs} />
            </Panel>
            <Panel>
              <PanelHeader title="Causes" eyebrow={`Across ${runs.filter((r) => r.verdict === "fail").length} failing runs.`} />
              <CauseBars runs={runs.filter((r) => r.verdict === "fail")} />
            </Panel>
          </div>
        </div>
      )}

      <Activity index={index} go={go} />
    </div>
  );
}

/** Three real numbers under the bar; nothing invented. */
function Facts({ index, caps }: { index: LabIndex; caps: Capabilities | null }) {
  const runs = index.runs;
  const failing = runs.filter((r) => r.verdict === "fail").length;
  const falseSuccess = runs.filter((r) => r.symptoms.includes("false-success")).length;
  const items: [string, string][] = [
    [String(index.recordings?.length ?? 0), "walkthroughs"],
    [runs.length ? `${failing}/${runs.length}` : "0", "runs failed"],
    [String(falseSuccess), "claimed success anyway"],
  ];
  if (caps?.limits && caps.usage) items.push([`${caps.usage.recordingsToday}/${caps.limits.recordingsPerDay}`, "recordings today"]);
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-1">
      {items.map(([v, k]) => (
        <div key={k} className="flex items-baseline gap-1.5">
          <dt className="sr-only">{k}</dt>
          <dd className="font-mono text-[15px] font-medium text-ink">{v}</dd>
          <span className="text-[12.5px] text-ink-3">{k}</span>
        </div>
      ))}
    </dl>
  );
}

/** The newest failure as a case: the finding, its cited steps as exhibits, and what the agent claimed. */
function FailureCase({ run, go }: { run: RunSummary; go: (r: Route) => void }) {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadRun(run.dir).then(setDetail, (e: Error) => setError(e.message));
  }, [run.dir]);

  const findings = detail?.result.diagnosis.findings.filter((f) => f.kind !== "incident") ?? [];
  const cited = [...new Set(findings.flatMap((f) => f.evidenceSteps))].sort((a, b) => a - b);
  const steps = new Map((detail?.events ?? []).filter((e): e is StepEvent => e.type === "step").map((s) => [s.stepId, s]));

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <span className="font-mono text-[12.5px] font-medium">{run.agent}</span>
        <span className="text-ink-3">on</span>
        <span className="min-w-0 truncate text-[13px]">{faultLabel(run.fault)}</span>
        <span className="ml-auto">
          <Verdict verdict="fail" />
        </span>
      </div>
      {error && <p className="px-4 py-4 text-[13px] text-fail">{error}</p>}
      {!detail && !error && <div className="grid gap-2 p-4" aria-busy="true"><div className="skeleton h-5 w-40" /><div className="skeleton h-4 w-full" /><div className="skeleton h-4 w-4/5" /><div className="skeleton h-10 w-full" /></div>}
      {detail && (
        <>
          <ul className="divide-y divide-line">
            {findings.slice(0, 3).map((f, i) => (
              <li key={i} className="grid gap-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <FindingChip id={f.label} kind={f.kind} />
                  <span className="text-[11.5px] text-ink-3">{f.confidence}</span>
                </div>
                <p className="text-[13.5px] leading-relaxed">
                  {f.explanation}{" "}
                  {f.evidenceSteps.map((s) => (
                    <span key={s} className="mr-1 inline-block">
                      <Cite id={`${run.id}:step:${s}`} n={s}>
                        step
                      </Cite>
                    </span>
                  ))}
                </p>
              </li>
            ))}
          </ul>
          {cited.length > 0 && (
            <div className="border-t border-line bg-panel-2/60 p-3">
              <div className="px-1 pb-2 text-[12px] text-ink-3">Evidence</div>
              <ol className="grid gap-1.5">
                {cited.map((id) => {
                  const s = steps.get(id);
                  const shot = s?.screenshot ? fileUrl(run.dir, s.screenshot) : undefined;
                  const what = s ? String((s.args as Record<string, unknown>).instruction ?? (s.args as Record<string, unknown>).name ?? (s.args as Record<string, unknown>).selector ?? "") : "";
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        tabIndex={-1}
                        data-exhibit={`${run.id}:step:${id}`}
                        onClick={() => go({ view: "run", dir: run.dir })}
                        className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-line bg-panel px-2.5 py-2 text-left hover:border-line-strong"
                      >
                        <ExhibitTag n={id} />
                        <span className="min-w-0">
                          <span className="block truncate text-[12.5px]">
                            <span className="font-mono text-ink-2">{s?.tool ?? "step"}</span> {what && `“${what}”`}
                          </span>
                          {s?.error && <span className="block truncate text-[11.5px] text-fail">{s.error.replace(/^page\.\w+: /, "")}</span>}
                          {!s?.error && s?.after?.url && <span className="block truncate font-mono text-[11px] text-ink-3">{s.after.url}</span>}
                        </span>
                        {shot ? (
                          <img src={shot} alt={`Screenshot after step ${id}`} className="h-9 w-14 rounded border border-line object-cover object-top" loading="lazy" />
                        ) : (
                          <span className="text-[11px] text-ink-3">no shot</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
          {run.claim && (
            <div className="grid gap-1 border-t border-line px-4 py-3 text-[13px]">
              <span className="text-[12px] text-ink-3">The agent reported</span>
              <span className="flex items-start gap-2">
                <Stamp tone={run.claimHonest ? "pass" : "fail"}>{run.claimHonest ? "Matches records" : "Contradicted"}</Stamp>
                <span className="text-ink-2">“{run.claim.summary}”</span>
              </span>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

/** Walkthroughs and runs on one list, newest first, in fixed columns that never reflow. */
function Activity({ index, go }: { index: LabIndex; go: (r: Route) => void }) {
  type Row = { at: number; key: string; kind: "Walkthrough" | "Lab run"; title: string; detail: string; state: "pass" | "fail" | "muted"; stateText: string; open: () => void };
  const rows: Row[] = [
    ...(index.recordings ?? []).map((r) => ({
      at: Date.parse(r.createdAt),
      key: r.dir,
      kind: "Walkthrough" as const,
      title: hostOf(r.url),
      detail: `${r.pages.length} pages · ${ms(r.durationMs)}`,
      state: (["rejected", "captcha", "mfa-required", "no-form"].includes(r.signIn.outcome) ? "fail" : "muted") as Row["state"],
      stateText: r.signIn.outcome === "signed-in" ? "Signed in" : r.signIn.outcome === "not-attempted" ? "Public" : "Sign-in stopped",
      open: () => go({ view: "library", dir: r.id }),
    })),
    ...index.runs.map((r) => ({
      at: r.createdAt,
      key: r.dir,
      kind: "Lab run" as const,
      title: `${r.agent} · ${faultLabel(r.fault)}`,
      detail: r.verdict === "fail" ? label(r.causes[0] ?? r.symptoms[0] ?? "failed") : `${r.steps} steps · ${ms(r.durationMs)}`,
      state: r.verdict,
      stateText: r.verdict === "pass" ? "Pass" : "Fail",
      open: () => go({ view: "run", dir: r.dir }),
    })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 10);
  if (rows.length === 0) return null;
  return (
    <Panel>
      <PanelHeader title="Activity" eyebrow="Walkthroughs and lab runs, newest first." />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead>
            <tr className="text-[12px] text-ink-3">
              <th className="w-28 px-4 py-2 font-medium">When</th>
              <th className="w-32 px-2 py-2 font-medium">Kind</th>
              <th className="px-2 py-2 font-medium">What</th>
              <th className="px-2 py-2 font-medium">Detail</th>
              <th className="w-36 px-4 py-2 text-right font-medium">State</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line border-t border-line">
            {rows.map((r) => (
              <tr key={r.key} className="transition-colors hover:bg-panel-2">
                <td className="px-4 py-2.5 font-mono text-[12px] text-ink-3">{ago(r.at)}</td>
                <td className="px-2 py-2.5 text-ink-2">{r.kind}</td>
                <td className="max-w-0 truncate px-2 py-2.5">
                  <button type="button" onClick={r.open} className="truncate text-left hover:underline">
                    {r.title}
                  </button>
                </td>
                <td className="max-w-0 truncate px-2 py-2.5 text-ink-2">{r.detail}</td>
                <td className="px-4 py-2.5 text-right">
                  {r.state === "fail" ? <Stamp tone="fail">{r.stateText}</Stamp> : r.state === "pass" ? <span className="text-[12.5px] text-pass">{r.stateText}</span> : <span className="text-[12.5px] text-ink-3">{r.stateText}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[11.5px] text-ink-3">
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
              className={cn("h-8 rounded-full px-3 text-[12.5px] transition-colors", task === t.id ? "bg-solid font-medium text-on-solid" : "text-ink-3 hover:text-ink")}
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
  const order = Object.keys(FAULT_LABEL);
  const rank = (f: string) => (order.includes(f) ? order.indexOf(f) : order.length);
  const faults = [...new Set(runs.map((r) => r.fault))].sort((x, y) => rank(x) - rank(y) || x.localeCompare(y));
  const agents = [...new Set(runs.map((r) => r.agent))].sort();
  const latest = new Map<string, RunSummary>();
  for (const r of runs) {
    const key = `${r.agent}|${r.fault}`;
    if (!latest.has(key)) latest.set(key, r);
  }
  return (
    <div className="overflow-x-auto p-3">
      <table className="w-full border-separate border-spacing-1 text-left">
        <thead>
          <tr>
            <th className="w-20 px-1 text-[12px] font-medium text-ink-3">Agent</th>
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
                if (!r) return <td key={f} className="h-12 min-w-20 rounded-lg border border-dashed border-line" />;
                const pass = r.verdict === "pass";
                return (
                  <td key={f} className="h-12 min-w-20 p-0">
                    <button
                      type="button"
                      onClick={() => go({ view: "run", dir: r.dir })}
                      title={`${a} · ${faultLabel(f)}: ${pass ? "pass" : [...r.symptoms, ...r.causes].map(label).join(", ")}`}
                      className={cn(
                        "flex h-full w-full flex-col justify-center rounded-lg border px-2 text-left transition-colors",
                        pass ? "border-pass/20 bg-pass-soft hover:border-pass/50" : "border-fail/25 bg-fail-soft hover:border-fail/60",
                      )}
                    >
                      <span className={cn("text-[11.5px] font-semibold", pass ? "text-pass" : "text-fail")}>{pass ? "Pass" : "Fail"}</span>
                      <span className="truncate text-[11px] text-ink-2">{pass ? (r.incidents[0] ? `recovered: ${label(r.incidents[0])}` : "clean") : label(r.causes[0] ?? r.symptoms[0] ?? "")}</span>
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
  const cell = (n: number, title: string, tone: "pass" | "fail" | "muted") => (
    <div className={cn("flex min-h-20 flex-col justify-between rounded-xl border p-3", tone === "fail" ? "border-fail/35 bg-fail-soft" : tone === "pass" ? "border-pass/25 bg-pass-soft" : "border-line bg-panel-2")}>
      <div className={cn("font-mono text-[26px] font-medium leading-none", tone === "fail" ? "text-fail" : tone === "pass" ? "text-pass" : "text-ink")}>{n}</div>
      <div className="text-[12.5px] text-ink-2">{title}</div>
    </div>
  );
  return (
    <div className="grid grid-cols-[auto_1fr_1fr] items-stretch gap-2 p-3">
      <span />
      <span className="text-[11.5px] text-ink-3">App: correct</span>
      <span className="text-[11.5px] text-ink-3">App: wrong</span>
      <span className="rotate-180 self-center text-[11.5px] text-ink-3 [writing-mode:vertical-rl]">Said done</span>
      {cell(cells.honestSuccess, "Honest success", "pass")}
      {cell(cells.falseSuccess, "False success", "fail")}
      <span className="rotate-180 self-center text-[11.5px] text-ink-3 [writing-mode:vertical-rl]">Said failed</span>
      {cell(cells.missed, "Missed success", "muted")}
      {cell(cells.honestFailure, "Honest failure", "muted")}
    </div>
  );
}

function CauseBars({ runs }: { runs: RunSummary[] }) {
  const counts = new Map<string, number>();
  for (const r of runs) for (const c of r.causes) counts.set(c, (counts.get(c) ?? 0) + 1);
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(([, n]) => n));
  if (rows.length === 0) return <p className="p-4 text-[13px] text-ink-2">No failing runs.</p>;
  return (
    <ul className="grid gap-2.5 p-4">
      {rows.map(([cause, n]) => (
        <li key={cause} className="grid grid-cols-[minmax(0,10rem)_1fr_2rem] items-center gap-3">
          <FindingChip id={cause} kind="cause" />
          <div className="h-2 overflow-hidden rounded-full bg-panel-3">
            <div className={cn("h-full rounded-full", cause === "unexplained" ? "bg-warn" : "bg-signal")} style={{ width: `${(n / max) * 100}%` }} />
          </div>
          <span className="text-right font-mono text-[12px] text-ink-2">{n}</span>
        </li>
      ))}
    </ul>
  );
}

