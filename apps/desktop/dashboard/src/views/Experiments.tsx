import { formatInterval } from "../../../../../packages/core/src/lab/stats.ts";
import type { Route } from "../App.tsx";
import { useEffect, useRef, useState } from "react";
import { Button, Panel, PanelHeader } from "../components/ui.tsx";
import { type Capabilities, type JobStatus, JobCancelled, SignInRequired, isSnapshot, loadCapabilities, startExperimentOn, waitForJob } from "../lib/api.ts";
import { refreshActiveJob, useActiveJob } from "../lib/active-job.ts";
import { ActiveJobNotice } from "./ActiveJobNotice.tsx";
import { ConnectAgentEmpty } from "./ConnectAgent.tsx";
import { faultLabel, cn, label, ms } from "../lib/format.ts";
import type { ExperimentSummary, LabIndex } from "../lib/types.ts";

/** The summary as stored (and served): `falseSuccess` is absent in experiments run before it existed. */
type Summary = ExperimentSummary["summary"];

export function Experiments({ index, go, refresh }: { index: LabIndex; go: (r: Route) => void; refresh?: () => Promise<LabIndex> }) {
  const experimentsAll = index.experiments ?? [];
  const runner = !isSnapshot && <RunExperiment go={go} onDone={() => void refresh?.()} />;
  if (experimentsAll.length === 0) {
    return (
      <ConnectAgentEmpty
        title="No agent comparison yet"
        go={go}
        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h6M10 3v6L4.6 18.4A1.7 1.7 0 0 0 6.1 21h11.8a1.7 1.7 0 0 0 1.5-2.6L14 9V3" /><path d="M7.2 15h9.6" /></svg>}
        extra={runner ? <Panel className="w-full max-w-[680px] p-4 text-left">{runner}</Panel> : undefined}
      >
        This page compares agent versions against the same failures, repeatedly, so a difference in reliability is a measurement rather than an
        opinion. Run one here with the built-in scripted agents, or from the command line with your own.
      </ConnectAgentEmpty>
    );
  }
  return (
    <div className="grid gap-8">
      {runner && <Panel className="p-4">{runner}</Panel>}
      {experimentsAll.map((e) => (
        <Experiment key={e.id} id={e.id} s={e.summary} />
      ))}
    </div>
  );
}

const TASKS = [
  ["create-lead", "Create a lead"],
  ["reassign-lead", "Reassign a lead"],
  ["lookup-owner", "Look up an owner"],
] as const;

/**
 * Start an experiment from the app: a baseline agent on every fault, each failure frozen as a
 * fixture and replayed with the candidate agents. From the app the server takes scripted agents
 * only (no model spend by accident), up to 4 candidates, 1-3 seeds and 1-3 trials;
 * `npm run lab -- experiment` covers model-backed and plugin agents.
 */
function RunExperiment({ go, onDone }: { go: (r: Route) => void; onDone: () => void }) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [baseline, setBaseline] = useState("v0");
  const [candidates, setCandidates] = useState<string[]>(["v1", "v2"]);
  const [seeds, setSeeds] = useState(1);
  const [trials, setTrials] = useState(1);
  const [task, setTask] = useState<(typeof TASKS)[number][0]>("create-lead");
  const { job: activeJob } = useActiveJob();
  const followed = useRef<string | null>(null);

  useEffect(() => {
    void loadCapabilities().then(setCaps);
  }, []);
  const scripted = (caps?.agents ?? []).filter((a) => a.kind === "scripted");
  const ids = scripted.length ? scripted.map((a) => a.id) : ["v0", "v1", "v2"];

  const progressOf = (s: JobStatus) => (s.status === "queued" ? "Waiting for the worker…" : (s.progress ?? "Running…"));
  const settle = async (p: Promise<unknown>) => {
    try {
      await p;
      onDone();
    } catch (e) {
      if (!(e instanceof JobCancelled)) setError(e instanceof SignInRequired ? "Sign in again to run an experiment." : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      void refreshActiveJob();
    }
  };

  // The experiment runs on the server whatever this page does. Coming back to it (or reloading)
  // finds the running experiment again instead of showing an idle form.
  const isExperiment = activeJob?.kind === "run" && (activeJob as { input?: { op?: unknown } }).input?.op === "experiment";
  useEffect(() => {
    if (!activeJob || !isExperiment || busy || followed.current === activeJob.id) return;
    followed.current = activeJob.id;
    setBusy(progressOf(activeJob));
    void settle(waitForJob(activeJob.id, (s) => setBusy(progressOf(s))));
  }, [activeJob?.id, isExperiment]);

  const otherJob = !busy && activeJob && !isExperiment ? activeJob : null;
  const arms = candidates.filter((c) => c !== baseline && ids.includes(c));

  const run = () => {
    setBusy("Starting…");
    setError(null);
    void settle(
      startExperimentOn({ baseline, candidates: arms, seeds, trials, task }, (s) => {
        followed.current = s.id;
        setBusy(progressOf(s));
      }),
    );
  };

  const toggle = (id: string) => setCandidates((c) => (c.includes(id) ? c.filter((x) => x !== id) : arms.length < 4 ? [...c, id] : c));
  const selectCls = "h-8 rounded-full bg-panel-2 px-3 text-[12.5px] text-ink";
  const counts: [string, number, (n: number) => void][] = [
    ["Seeds per fault", seeds, setSeeds],
    ["Trials per replay", trials, setTrials],
  ];

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 text-[12.5px]">
        <label className="grid gap-1 text-ink-2">
          Baseline
          <select value={baseline} onChange={(e) => setBaseline(e.target.value)} disabled={Boolean(busy)} className={cn(selectCls, "font-mono")}>
            {ids.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="grid gap-1">
          <legend className="pb-1 text-ink-2">Compared with (up to 4)</legend>
          <div className="flex flex-wrap gap-1.5">
            {ids
              .filter((id) => id !== baseline)
              .map((id) => (
                <button
                  key={id}
                  type="button"
                  role="checkbox"
                  aria-checked={candidates.includes(id)}
                  disabled={Boolean(busy)}
                  title={scripted.find((a) => a.id === id)?.description}
                  onClick={() => toggle(id)}
                  className={cn("h-8 rounded-full px-3 font-mono text-[12px] transition-colors disabled:opacity-50", candidates.includes(id) ? "bg-solid text-on-solid" : "bg-panel-2 text-ink hover:bg-panel-3")}
                >
                  {id}
                </button>
              ))}
          </div>
        </fieldset>
        <label className="grid gap-1 text-ink-2">
          Task
          <select value={task} onChange={(e) => setTask(e.target.value as typeof task)} disabled={Boolean(busy)} className={selectCls}>
            {TASKS.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {counts.map(([name, value, set]) => (
          <label key={name} className="grid gap-1 text-ink-2">
            {name}
            <select value={value} onChange={(e) => set(Number(e.target.value))} disabled={Boolean(busy)} className={selectCls}>
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ))}
        <Button tone="primary" onClick={run} disabled={Boolean(busy) || arms.length === 0 || Boolean(otherJob)}>
          {busy ? "Running the experiment…" : "Run an experiment"}
        </Button>
      </div>
      <p className="text-[12px] text-ink-3">
        From the app, experiments use the scripted agents only, so they cost nothing and need no key. Model-backed and plugin agents run with{" "}
        <code className="font-mono">npm run lab -- experiment --baseline v0 --candidates v1,my-agent</code>.
      </p>
      {otherJob && <ActiveJobNotice job={otherJob} go={go} action="run an experiment" />}
      {busy && (
        <p className="text-[12px] text-ink-2" aria-live="polite">
          {busy} This takes a few minutes. You can leave this page: it picks the experiment back up when you return.
        </p>
      )}
      {error && <p className="text-[12.5px] text-fail">{error}</p>}
    </div>
  );
}

/** ` · 95% CI 87–100%`, or nothing when there are no trials to put an interval on. */
function ci(k: number, n: number): string {
  const text = formatInterval(k, n);
  return text ? ` · ${text}` : "";
}

function Experiment({ id, s }: { id: string; s: Summary }) {
  const reproduction = s.reproduction ?? [];
  const reproducedAll = reproduction.filter((r) => r.reproduced === r.trials).length;
  const agents = [s.meta?.baseline ?? "baseline", ...(s.meta?.candidates ?? [])];
  const regression = s.regression ?? [];
  const fixtures = [...new Set(regression.map((r) => r.fixture))];
  const detection = s.detection ?? [];
  const faulty = detection.filter((d) => d.fault !== "none");
  const attributed = faulty.reduce((n, d) => n + d.correctlyAttributed, 0);
  const failing = faulty.reduce((n, d) => n + d.failing, 0);
  const fp = s.falsePositives ?? { baselineCleanRunsFailed: 0, candidateCleanRunsFailed: 0, baselineCleanRuns: 0, candidateCleanRuns: 0 };
  const cleanFlagged = fp.baselineCleanRunsFailed + fp.candidateCleanRunsFailed;
  const cleanRuns = fp.baselineCleanRuns + fp.candidateCleanRuns;
  const fs = s.falseSuccess;
  const reproduced = s.rates?.reproductionTrials ?? { k: 0, n: 0 };

  return (
    <section className="grid gap-4">
      <div>
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight">{id}</h1>
        <p className="text-[12.5px] text-ink-3">
          {new Date(s.meta?.startedAt ?? Date.now()).toLocaleString()} · {s.meta?.seeds ?? 0} seeds/fault · {s.meta?.trials ?? 0} trials/replay
        </p>
        <p className="mt-2 max-w-[80ch] rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-[13px]">{s.meta?.caveat ?? "An older summary: it was written before experiments recorded their caveats."}</p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric k="Correct cause" v={`${attributed}/${failing}`} note={`failing baseline runs${ci(attributed, failing)}`} good={attributed === failing} />
        <Metric k="False positives" v={`${cleanFlagged}/${cleanRuns}`} note={`clean runs flagged${ci(cleanFlagged, cleanRuns)}`} good={cleanFlagged === 0} />
        <Metric
          k="False success"
          v={fs ? `${fs.falseSuccesses}/${fs.successClaims}` : "–"}
          note={fs ? `of success claims${ci(fs.falseSuccesses, fs.successClaims)}` : "of success claims · not recorded"}
          good={fs ? fs.falseSuccesses === 0 : undefined}
        />
        <Metric k="Reproduced" v={`${reproducedAll}/${reproduction.length}`} note={`fixtures, every one of ${s.meta?.trials ?? 0} trials${ci(reproduced.k, reproduced.n)}`} good={reproducedAll === reproduction.length} />
        <Metric k="Cost" v={s.cost ? `${s.cost.modelCalls}` : "–"} note={s.cost ? `model calls · median run ${ms(s.cost.medianRunMs)}` : "not recorded in this summary"} />
      </dl>

      <div className="grid items-start gap-4 lg:grid-cols-5">
        <Panel className="min-w-0 lg:col-span-2">
          <PanelHeader eyebrow={`Baseline ${s.meta?.baseline ?? "?"}`} title="Detection by fault" />
          <div className="overflow-x-auto">
            <table className="tabular w-full text-left text-[13px]">
              <thead>
                <tr className="eyebrow">
                  <th className="px-4 py-2 font-normal">Fault</th>
                  <th className="px-2 py-2 font-normal">Failed</th>
                  <th className="px-2 py-2 font-normal">Right cause</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {detection.map((d) => (
                  <tr key={d.fault}>
                    <td className="px-4 py-2">{faultLabel(d.fault)}</td>
                    <td className="px-2 py-2 font-mono">
                      {d.failing}/{d.runs}
                    </td>
                    <td className="px-2 py-2 font-mono">{d.fault === "none" ? "–" : `${d.correctlyAttributed}/${d.failing}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel className="min-w-0 lg:col-span-3">
          <PanelHeader eyebrow="pass^k per fixture: passed every trial?" title="Regression matrix" />
          <div className="overflow-x-auto p-3">
            <table className="w-full border-separate border-spacing-1 text-left">
              <thead>
                <tr>
                  <th className="eyebrow px-1 font-normal">Fixture</th>
                  {agents.map((a) => (
                    <th key={a} className="px-1 font-mono text-[12px] font-medium">
                      {a}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fixtures.map((f) => (
                  <tr key={f}>
                    <td className="max-w-[16rem] truncate px-1 font-mono text-[11.5px] text-ink-2" title={f}>
                      {f}
                    </td>
                    {agents.map((a) => {
                      const r = regression.find((x) => x.fixture === f && x.agent === a);
                      if (!r) return <td key={a} />;
                      return (
                        <td
                          key={a}
                          title={r.passAll ? "passed every trial" : r.causes.map(label).join(", ")}
                          className={cn("h-8 min-w-14 rounded-md px-2 text-center font-mono text-[11.5px] font-medium", r.passAll ? "bg-pass-soft text-pass" : "bg-fail-soft text-fail")}
                        >
                          {r.passes}/{r.trials}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel className="min-w-0">
        <PanelHeader eyebrow="95% Wilson intervals" title="Pass rate by agent" />
        <div className="overflow-x-auto">
          <table className="tabular w-full text-left text-[13px]">
            <thead>
              <tr className="eyebrow">
                <th className="px-4 py-2 font-normal">Agent</th>
                <th className="px-2 py-2 font-normal">Trials passed</th>
                <th className="px-2 py-2 font-normal">Fixtures passing every trial</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(s.rates?.passByAgent ?? []).map((r) => (
                <tr key={r.agent}>
                  <td className="px-4 py-2 font-mono">{r.agent}</td>
                  <td className="px-2 py-2 font-mono">
                    {r.passes}/{r.trials}
                    <span className="text-ink-2">{ci(r.passes, r.trials)}</span>
                  </td>
                  <td className="px-2 py-2 font-mono">
                    {r.fixturesPassed}/{r.fixtures}
                    <span className="text-ink-2">{ci(r.fixturesPassed, r.fixtures)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </section>
  );
}

function Metric({ k, v, note, good }: { k: string; v: string; note: string; good?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3 shadow-card">
      <dt className="eyebrow">{k}</dt>
      <dd className={cn("tabular font-display text-[28px] font-semibold leading-tight", good === true && "text-pass", good === false && "text-fail")}>{v}</dd>
      <dd className="text-[12px] text-ink-2">{note}</dd>
    </div>
  );
}
