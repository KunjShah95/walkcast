import { useEffect, useState } from "react";
import type { Route } from "../App.tsx";
import { type Capabilities, type ReplayResult, SignInRequired, isSnapshot, loadCapabilities, startReplay } from "../lib/api.ts";
import { ms } from "../lib/format.ts";
import { Button, CopyButton } from "./ui.tsx";

/**
 * Replay a regression fixture from the app: pick an agent and a trial count, and get the pass^k
 * verdict with a link to every trial. It used to be a `npm run lab -- replay` line to copy, which
 * an installed desktop app has no terminal or npm for.
 */
export function ReplayFixture({ dir, agent, go, onDone }: { dir: string; agent: string; go: (r: Route) => void; onDone?: () => void }) {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [choice, setChoice] = useState(agent);
  const [trials, setTrials] = useState(3);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReplayResult | null>(null);
  useEffect(() => {
    if (!isSnapshot) void loadCapabilities().then(setCaps);
  }, []);
  // The agent that failed may be one this computer can't run (an AI agent without Chrome or Edge).
  useEffect(() => {
    if (caps?.stagehand === false && caps.agents?.find((a) => a.id === agent)?.kind === "stagehand") setChoice("v1");
  }, [caps, agent]);

  const command = `npm run lab -- replay ${dir} --agent ${choice} --trials ${trials}`;
  if (isSnapshot || (caps && !caps.live)) return <CopyButton text={command} />;

  // Model-driven agents need Chrome or Edge; offer only what can run here.
  const agents = (caps?.agents ?? []).filter((a) => a.kind !== "stagehand" || caps?.stagehand);
  const replay = async () => {
    setBusy("Starting…");
    setError(null);
    setResult(null);
    try {
      setResult(await startReplay({ fixture: dir, agent: choice, trials }, (s) => setBusy(s.progress ?? (s.status === "queued" ? "Waiting for the worker…" : "Replaying…"))));
      onDone?.();
    } catch (e) {
      setError(e instanceof SignInRequired ? "Sign in again to replay." : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <label className="flex items-center gap-1.5 text-ink-3">
          Agent
          <select value={choice} onChange={(e) => setChoice(e.target.value)} disabled={Boolean(busy)} className="h-8 rounded-lg border border-line bg-panel px-2 text-ink">
            {!agents.some((a) => a.id === choice) && <option value={choice}>{choice}</option>}
            {agents.map((a) => (
              <option key={a.id} value={a.id} title={a.description}>
                {a.id}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-ink-3">
          Trials
          <select value={trials} onChange={(e) => setTrials(Number(e.target.value))} disabled={Boolean(busy)} className="h-8 rounded-lg border border-line bg-panel px-2 text-ink">
            {[1, 3, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" tone="primary" onClick={() => void replay()} disabled={Boolean(busy) || !caps}>
          {busy ? "Replaying…" : "Replay"}
        </Button>
      </div>
      {busy && <p className="text-[12px] text-ink-3">{busy}</p>}
      {error && <p className="text-[12.5px] text-fail">{error}</p>}
      {result && (
        <div className="grid gap-1.5 rounded-lg bg-panel-2 p-2.5 text-[12.5px]">
          <p className={result.passAll ? "font-medium text-pass" : "font-medium text-fail"}>
            {result.agent}: {result.passes}/{result.trials.length} passed
            {result.passAll ? ` · holds (pass^${result.trials.length})` : ` · original failure reproduced in ${result.reproduced}`}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {result.trials.map((t, i) => (
              <li key={t.runDir}>
                <button type="button" onClick={() => go({ view: "run", dir: t.runDir })} className="rounded-md border border-line px-2 py-0.5 font-mono text-[11px] hover:bg-panel-3">
                  #{i + 1} {t.verdict} · {ms(t.durationMs)}
                </button>
              </li>
            ))}
          </ul>
          {result.environmentDrift.length > 0 && <p className="text-[11.5px] text-ink-3">Changed since the fixture was saved: {result.environmentDrift.join("; ")}</p>}
        </div>
      )}
    </div>
  );
}
