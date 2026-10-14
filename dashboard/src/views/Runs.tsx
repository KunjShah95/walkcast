import { useMemo, useState } from "react";
import type { Route } from "../App.tsx";
import { Empty, FindingChip, Panel, Verdict } from "../components/ui.tsx";
import { FAULT_LABEL, ago, cn, ms } from "../lib/format.ts";
import type { LabIndex } from "../lib/types.ts";

type VerdictFilter = "all" | "fail" | "pass" | "false-success";

export function Runs({ index, go }: { index: LabIndex; go: (r: Route) => void }) {
  const [verdict, setVerdict] = useState<VerdictFilter>("all");
  const [agent, setAgent] = useState("all");
  const [fault, setFault] = useState("all");
  const agents = useMemo(() => [...new Set(index.runs.map((r) => r.agent))].sort(), [index]);
  const faults = useMemo(() => [...new Set(index.runs.map((r) => r.fault))], [index]);

  const runs = index.runs.filter(
    (r) =>
      (verdict === "all" || (verdict === "false-success" ? r.symptoms.includes("false-success") : r.verdict === verdict)) &&
      (agent === "all" || r.agent === agent) &&
      (fault === "all" || r.fault === fault),
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">{index.runs.length} recorded</div>
          <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight">Runs</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <Select id="agent-filter" label="Agent" value={agent} onChange={setAgent} options={agents} />
          <Select id="fault-filter" label="Fault" value={fault} onChange={setFault} options={faults} format={(f) => FAULT_LABEL[f] ?? f} />
        </div>
      </div>

      {runs.length === 0 ? (
        <Empty title="No runs match these filters" />
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
                  onClick={() => go({ view: "run", dir: r.dir })}
                  className="grid w-full grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 px-4 py-3 text-left hover:bg-panel-2 md:grid-cols-[5.5rem_4.5rem_minmax(0,11rem)_minmax(0,1fr)_minmax(0,14rem)_6rem]"
                >
                  <span>
                    <Verdict verdict={r.verdict} />
                  </span>
                  <span className="font-mono text-[12.5px] font-medium">{r.agent}</span>
                  <span className="col-span-2 truncate text-[13px] md:col-span-1">
                    {FAULT_LABEL[r.fault] ?? r.fault} <span className="font-mono text-[11px] text-ink-3">s{r.seed}</span>
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
    <div role="radiogroup" className="inline-flex rounded-lg border border-line bg-panel p-0.5">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn("rounded-md px-2.5 py-1 text-[12.5px]", value === v ? "bg-ink text-paper" : "text-ink-2 hover:text-ink")}
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
    <label htmlFor={id} className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-1 text-[12.5px]">
      <span className="text-ink-3">{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="bg-transparent text-ink outline-none">
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
