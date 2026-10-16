import { formatInterval } from "../../../../../packages/core/src/lab/stats.ts";
import { Empty, Panel, PanelHeader } from "../components/ui.tsx";
import { faultLabel, cn, label, ms } from "../lib/format.ts";
import type { ExperimentSummary, LabIndex } from "../lib/types.ts";

/** The summary as stored (and served): `falseSuccess` is absent in experiments run before it existed. */
type Summary = ExperimentSummary["summary"];

export function Experiments({ index }: { index: LabIndex }) {
  if (index.experiments.length === 0) {
    return <Empty title="No experiments yet">npm run lab -- experiment --seeds 5 --trials 3</Empty>;
  }
  return (
    <div className="grid gap-8">
      {index.experiments.map((e) => (
        <Experiment key={e.id} id={e.id} s={e.summary} />
      ))}
    </div>
  );
}

/** ` · 95% CI 87–100%`, or nothing when there are no trials to put an interval on. */
function ci(k: number, n: number): string {
  const text = formatInterval(k, n);
  return text ? ` · ${text}` : "";
}

function Experiment({ id, s }: { id: string; s: Summary }) {
  const reproducedAll = s.reproduction.filter((r) => r.reproduced === r.trials).length;
  const agents = [s.meta.baseline, ...s.meta.candidates];
  const fixtures = [...new Set(s.regression.map((r) => r.fixture))];
  const faulty = s.detection.filter((d) => d.fault !== "none");
  const attributed = faulty.reduce((n, d) => n + d.correctlyAttributed, 0);
  const failing = faulty.reduce((n, d) => n + d.failing, 0);
  const fp = s.falsePositives;
  const cleanFlagged = fp.baselineCleanRunsFailed + fp.candidateCleanRunsFailed;
  const cleanRuns = fp.baselineCleanRuns + fp.candidateCleanRuns;
  const fs = s.falseSuccess;
  const reproduced = s.rates.reproductionTrials;

  return (
    <section className="grid gap-4">
      <div>
        <div className="eyebrow">{new Date(s.meta.startedAt).toLocaleString()} · {s.meta.seeds} seeds/fault · {s.meta.trials} trials/replay</div>
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight">{id}</h1>
        <p className="mt-2 max-w-[80ch] rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-[13px]">{s.meta.caveat}</p>
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
        <Metric k="Reproduced" v={`${reproducedAll}/${s.reproduction.length}`} note={`fixtures, every one of ${s.meta.trials} trials${ci(reproduced.k, reproduced.n)}`} good={reproducedAll === s.reproduction.length} />
        <Metric k="Cost" v={`${s.cost.modelCalls}`} note={`model calls · median run ${ms(s.cost.medianRunMs)}`} />
      </dl>

      <div className="grid items-start gap-4 lg:grid-cols-5">
        <Panel className="min-w-0 lg:col-span-2">
          <PanelHeader eyebrow={`Baseline ${s.meta.baseline}`} title="Detection by fault" />
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
                {s.detection.map((d) => (
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
                      const r = s.regression.find((x) => x.fixture === f && x.agent === a);
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
              {s.rates.passByAgent.map((r) => (
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
