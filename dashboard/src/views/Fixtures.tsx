import type { Route } from "../App.tsx";
import { CopyButton, Empty, FindingChip, Panel } from "../components/ui.tsx";
import { FAULT_LABEL } from "../lib/format.ts";
import type { LabIndex } from "../lib/types.ts";

export function Fixtures({ index, go }: { index: LabIndex; go: (r: Route) => void }) {
  if (index.fixtures.length === 0) {
    return <Empty title="No fixtures yet">A failed run writes one automatically: npm run lab -- run --fault gateway-timeout --agent v0</Empty>;
  }
  const groups = new Map<string, typeof index.fixtures>();
  for (const f of index.fixtures) groups.set(f.source, [...(groups.get(f.source) ?? []), f]);

  return (
    <div className="grid gap-6">
      <div>
        <div className="eyebrow">{index.fixtures.length} regression fixtures</div>
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight">Fixtures</h1>
        <p className="mt-1 max-w-[70ch] text-ink-2">
          A fixture rebuilds a failed run's application, seed data, fault and timings. Replaying it with the same agent re-runs the recorded model calls; any
          other agent or model is judged against the application's records.
        </p>
      </div>
      {[...groups.entries()].map(([source, fixtures]) => (
        <section key={source} className="grid gap-3">
          <h2 className="eyebrow">{source === "fixtures" ? "Committed suite (CI gate)" : source.replace("experiment:", "Experiment ")}</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {fixtures.map((f) => {
              const m = f.manifest;
              const run = index.runs.find((r) => r.id === m.original.runId);
              return (
                <Panel as="article" key={f.dir} className="flex min-w-0 flex-col">
                  <div className="grid gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="eyebrow truncate">{f.id}</div>
                        <h3 className="font-display text-[17px] font-semibold leading-tight">{FAULT_LABEL[m.environment.fault] ?? m.environment.fault}</h3>
                      </div>
                      <span className="shrink-0 rounded-md bg-panel-2 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-2">
                        {m.expectation === "honest-failure" ? "must report failure" : "must succeed"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {m.original.symptoms.map((s) => (
                        <FindingChip key={s} id={s} kind="symptom" />
                      ))}
                      {m.original.causes.map((c) => (
                        <FindingChip key={c} id={c} kind="cause" />
                      ))}
                    </div>
                    <dl className="tabular grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[11.5px]">
                      <dt className="text-ink-3">failed with</dt>
                      <dd>{m.original.agent.id}</dd>
                      <dt className="text-ink-3">model</dt>
                      <dd>{m.original.model ? `${m.original.model.mode} · ${m.original.model.calls} recorded calls` : "none (scripted)"}</dd>
                      <dt className="text-ink-3">seed</dt>
                      <dd>
                        {m.environment.seed} · owners +{m.environment.timings.ownersRefreshMs} ms · submit +{m.environment.timings.submitDelayMs} ms
                      </dd>
                      <dt className="text-ink-3">env</dt>
                      <dd className="truncate">
                        app {m.environment.appVersion} · pw {m.environment.playwrightVersion}
                      </dd>
                    </dl>
                  </div>
                  <div className="mt-auto grid gap-2 border-t border-line p-3">
                    <CopyButton text={`npm run lab -- replay ${f.dir} --agent ${m.original.agent.id} --trials 3`} />
                    {run && (
                      <button type="button" onClick={() => go({ view: "run", dir: run.dir })} className="w-fit text-[12.5px] text-signal hover:underline">
                        Open the original recording
                      </button>
                    )}
                  </div>
                </Panel>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
