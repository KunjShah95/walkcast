import { useMemo, useState } from "react";
import type { Route } from "../App.tsx";
import { Button, Empty, FindingChip, Panel, Verdict } from "../components/ui.tsx";
import { ConnectAgentEmpty } from "./ConnectAgent.tsx";
import { faultLabel, ago, cn, ms } from "../lib/format.ts";
import type { LabIndex } from "../lib/types.ts";

type VerdictFilter = "all" | "fail" | "pass" | "false-success";

export function Runs({ index, go }: { index: LabIndex; go: (r: Route) => void }) {
  const [verdict, setVerdict] = useState<VerdictFilter>("all");
  const [agent, setAgent] = useState("all");
  const [fault, setFault] = useState("all");
  const [task, setTask] = useState("all");
  // Compare: pick two runs from the list, the older becomes the baseline.
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const runsAll = index.runs ?? [];
  const tasks = useMemo(() => [...new Set(runsAll.map((r) => r.task))], [index]);
  const agents = useMemo(() => [...new Set(runsAll.map((r) => r.agent))].sort(), [index]);
  const faults = useMemo(() => [...new Set(runsAll.map((r) => r.fault))], [index]);

  const runs = runsAll.filter(
    (r) =>
      (verdict === "all" || (verdict === "false-success" ? r.symptoms.includes("false-success") : r.verdict === verdict)) &&
      (agent === "all" || r.agent === agent) &&
      (fault === "all" || r.fault === fault) &&
      (task === "all" || r.task === task),
  );

  const togglePick = (dir: string) => setPicked((p) => (p.includes(dir) ? p.filter((d) => d !== dir) : p.length < 2 ? [...p, dir] : p));
  const compare = () => {
    const [a, b] = picked.map((d) => runsAll.find((r) => r.dir === d)!).sort((x, y) => Date.parse(String(x.createdAt)) - Date.parse(String(y.createdAt)));
    if (a && b) go({ view: "compare", base: a.dir, cand: b.dir });
  };

  if (runsAll.length === 0) {
    return (
      <ConnectAgentEmpty
        title="No agent runs recorded yet"
        go={go}
        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h6M10 3v6L4.6 18.4A1.7 1.7 0 0 0 6.1 21h11.8a1.7 1.7 0 0 0 1.5-2.6L14 9V3" /><path d="M7.2 15h9.6" /></svg>}
      >
        Every agent run lands here, newest first, with the verdict and the evidence behind it. Run your own agent from the command line, or look at the bundled
        scenarios first.
      </ConnectAgentEmpty>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em] sm:text-[30px]">
            Agent <span className="text-dim">runs.</span>
          </h1>
          <p className="mt-1.5 text-[14px] text-ink-2">{index.runs.length} agent runs, each judged by the application's own records.</p>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <Segmented
            value={verdict}
            onChange={setVerdict}
            options={[
              ["all", "All"],
              ["fail", "Failed"],
              ["false-success", "False success"],
              ["pass", "Passed"],
            ]}
          />
          <Select id="task-filter" label="Task" value={task} onChange={setTask} options={tasks} />
          <Select id="agent-filter" label="Agent" value={agent} onChange={setAgent} options={agents} />
          <Select id="fault-filter" label="Fault" value={fault} onChange={setFault} options={faults} format={(f) => faultLabel(f)} />
          {runsAll.length > 1 && (
            <Button
              size="sm"
              tone={picking ? "primary" : "secondary"}
              aria-pressed={picking}
              onClick={() => {
                setPicking((p) => !p);
                setPicked([]);
              }}
            >
              {picking ? "Done" : "Compare two"}
            </Button>
          )}
        </div>
      </div>
      {picking && (
        <div className="flex flex-wrap items-center gap-3 rounded-[14px] bg-panel-2 px-4 py-2.5 text-[13px]" aria-live="polite">
          <span className="text-ink-2">
            {picked.length === 0 ? "Pick two runs to compare. The older one is the baseline." : picked.length === 1 ? "Pick one more run." : "Two runs picked."}
          </span>
          <Button size="sm" tone="primary" className="ml-auto" disabled={picked.length !== 2} onClick={compare}>
            Compare
          </Button>
        </div>
      )}

      {runs.length === 0 ? (
          <Empty title="No runs match these filters" tone="muted" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M9 6.5h11M9 12h11M9 17.5h11" /><circle cx="4.5" cy="6.5" r="1.1" fill="currentColor" /><circle cx="4.5" cy="12" r="1.1" fill="currentColor" /><circle cx="4.5" cy="17.5" r="1.1" fill="currentColor" /></svg>}>
            Clear a filter to see more.
          </Empty>
      ) : (
        <Panel className="overflow-hidden">
          <div className="hidden grid-cols-[5.5rem_4.5rem_minmax(0,11rem)_minmax(0,1fr)_minmax(0,14rem)_6rem] gap-4 border-b border-line px-4 py-2 md:grid">
            {["Verdict", "Agent", "Fault", "Findings", "Agent said", "Duration"].map((h) => (
              <span key={h} className="eyebrow">
                {h}
              </span>
            ))}
          </div>
          <ul className="divide-y divide-line">
            {runs.map((r) => (
              <li key={r.dir}>
                <button
                  type="button"
                  onClick={() => (picking ? togglePick(r.dir) : go({ view: "run", dir: r.dir }))}
                  role={picking ? "checkbox" : undefined}
                  aria-checked={picking ? picked.includes(r.dir) : undefined}
                  aria-disabled={picking && picked.length >= 2 && !picked.includes(r.dir) ? true : undefined}
                  className={cn(
                    "grid w-full grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 px-4 py-3 text-left hover:bg-panel-2 md:grid-cols-[5.5rem_4.5rem_minmax(0,11rem)_minmax(0,1fr)_minmax(0,14rem)_6rem]",
                    picking && picked.includes(r.dir) ? "bg-signal-soft" : "",
                    picking && picked.length >= 2 && !picked.includes(r.dir) ? "opacity-55" : "",
                  )}
                >
                  <span>
                    <Verdict verdict={r.verdict} />
                  </span>
                  <span className="font-mono text-[12.5px] font-medium">{r.agent}</span>
                  <span className="col-span-2 truncate text-[13px] md:col-span-1">
                    {faultLabel(r.fault)} <span className="font-mono text-[11px] text-ink-3">{r.task !== "create-lead" ? `${r.task} · ` : ""}s{r.seed}</span>
                  </span>
                  <span className="col-span-2 flex flex-wrap gap-1 md:col-span-1">
                    {r.symptoms.map((s) => (
                      <FindingChip key={s} id={s} kind="symptom" />
                    ))}
                    {r.causes.map((c) => (
                      <FindingChip key={c} id={c} kind="cause" />
                    ))}
                    {r.verdict === "pass" && r.incidents.map((c) => <FindingChip key={c} id={c} kind="incident" />)}
                  </span>
                  <span className={cn("col-span-2 truncate text-[12.5px] md:col-span-1", r.claimHonest ? "text-ink-2" : "text-fail")}>
                    {r.claim ? `${r.claim.success ? "✓" : "✗"} ${r.claim.summary}` : "no claim"}
                  </span>
                  <span className="tabular col-span-2 font-mono text-[11.5px] text-ink-3 md:col-span-1">
                    {ms(r.durationMs)} · {ago(r.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div role="radiogroup" className="inline-flex rounded-full bg-panel-2 p-0.5">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn("rounded-full px-3 py-1 text-[12.5px] transition-colors", value === v ? "bg-solid font-medium text-on-solid" : "text-ink-2 hover:text-ink")}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function Select({
  id,
  label,
  value,
  onChange,
  options,
  format = (v) => v,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  format?: (v: string) => string;
}) {
  return (
    <label htmlFor={id} className="inline-flex max-w-full min-w-0 items-center gap-2 rounded-full border border-line-strong bg-panel px-3 py-1.5 text-[12.5px] shadow-[inset_0_1px_2px_rgb(27_26_23_/_0.03)]">
      <span className="text-ink-3">{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="min-w-0 max-w-full truncate bg-transparent text-ink outline-none">
        <option value="all">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {format(o)}
          </option>
        ))}
      </select>
    </label>
  );
}
