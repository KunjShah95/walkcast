import { useState } from "react";
import type { Route } from "../App.tsx";
import { Empty, PageHead, Panel } from "../components/ui.tsx";
import { startRun } from "../lib/api.ts";
import { faultLabel, ago, ms } from "../lib/format.ts";
import type { LabIndex } from "../lib/types.ts";

export function Mobile({ index, go, refresh }: { index: LabIndex; go: (r: Route) => void; refresh: () => Promise<LabIndex> }) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDir, setLastDir] = useState<string | null>(null);

  const triggerRun = async () => {
    setRunning(true);
    setError(null);
    try {
      const dir = await startRun({ agent: "v0", fault: "stale-owners", seed: 1 });
      setLastDir(dir);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const recordings = index.recordings ?? [];

  return (
    <div className="grid gap-4">
      <PageHead title="Mobile" dim="companion." description="Recordings and runs on a small screen." />
      <Panel className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[14px] font-semibold">Trigger a run</div>
            <div className="text-[12px] text-ink-3">Runs agent v0 on stale-owners, seed 1.</div>
          </div>
          <button
            type="button"
            onClick={triggerRun}
            disabled={running}
            className="rounded-full bg-solid px-4 py-2 text-[13px] font-medium text-on-solid disabled:opacity-60"
          >
            {running ? "Running…" : "Run"}
          </button>
        </div>
        {error && <div className="mt-2 text-[12.5px] text-fail">{error}</div>}
        {lastDir && <div className="mt-2 font-mono text-[11.5px] text-ink-3">Last run: {lastDir}</div>}
      </Panel>

      <div>
        <h2 className="text-[16px] font-semibold">Recordings</h2>
        {recordings.length === 0 ? (
          <Empty title="No recordings" tone="muted">Record a walkthrough to see it here.</Empty>
        ) : (
          <ul className="mt-2 grid gap-2">
            {recordings.map((r) => (
              <li key={r.dir}>
                <button
                  type="button"
                  onClick={() => go({ view: "library", dir: r.id })}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-panel px-3 py-2 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-medium">{r.url}</span>
                    <span className="block font-mono text-[11px] text-ink-3">{ago(Date.parse(r.createdAt))} · {ms(r.durationMs)}</span>
                  </span>
                  <span className="shrink-0 text-[12px] text-ink-2">Open</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="text-[16px] font-semibold">Recent runs</h2>
        {(index.runs ?? []).length === 0 ? (
          <Empty title="No runs" tone="muted">Trigger a run above.</Empty>
        ) : (
          <ul className="mt-2 grid gap-2">
            {(index.runs ?? []).slice(0, 10).map((r) => (
              <li key={r.dir}>
                <button
                  type="button"
                  onClick={() => go({ view: "run", dir: r.dir })}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-panel px-3 py-2 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-medium">{r.agent} · {faultLabel(r.fault)}</span>
                    <span className="block font-mono text-[11px] text-ink-3">{r.verdict} · {ms(r.durationMs)}</span>
                  </span>
                  <span className="shrink-0 text-[12px] text-ink-2">View</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
