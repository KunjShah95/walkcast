import { useEffect, useState } from "react";
import { Panel, PanelHeader } from "../components/ui.tsx";
import { cn } from "../lib/format.ts";
import { ALL_TELLS, auditPrompt, GROUPS, score, verdict, type Tell } from "../lib/vibecode.ts";

const KEY = "walkcast:audit:v1";

function load(): number[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as number[]).filter((n) => ALL_TELLS.some((t) => t.n === n));
  } catch {
    return [];
  }
}

/**
 * The vibecode checklist. Ticked items are the tells that are actually biting,
 * so the score counts down and the copy button hands a model the exact list.
 */
export function Audit() {
  const [found, setFound] = useState<number[]>(() => (typeof localStorage !== "undefined" ? load() : []));
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(found));
    } catch {
      /* storage unavailable */
    }
  }, [found]);

  const toggle = (n: number) => setFound((f) => (f.includes(n) ? f.filter((x) => x !== n) : [...f, n].sort((a, b) => a - b)));
  const s = score(found);
  const v = verdict(s);

  return (
    <div className="grid gap-6">
      <header className="grid gap-3">
        <div className="eyebrow">30 tells · self-audit</div>
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight">
          Reasons your site looks vibecoded
        </h1>
        <p className="max-w-[72ch] text-ink-2">
          Tick everything your site does today. Ticked items count against the score; the copy button hands a coding
          model the list plus the fixes, so the rewrite has a spec instead of a vibe.
        </p>
      </header>

      <Panel>
        <PanelHeader
          eyebrow={found.length ? `${found.length} of ${ALL_TELLS.length} apply` : "nothing ticked yet"}
          title={
            <span className="flex items-baseline gap-3">
              <span className={cn("tabular font-display text-[28px] font-semibold", v === "clean" ? "text-pass" : v === "close" ? "text-warn" : "text-fail")}>
                {s}
              </span>
              <span className="text-[13px] font-normal text-ink-2">
                {v === "clean" ? "reads as designed" : v === "close" ? "close" : "reads as generated"}
              </span>
            </span>
          }
          aside={<Tally found={found} />}
        />
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <Meter value={s} />
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFound([])}
              disabled={found.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12.5px] text-ink-2 transition-colors hover:bg-panel-2 hover:text-ink disabled:opacity-40"
            >
              Reset
            </button>
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="grid gap-6 lg:col-span-3">
          {GROUPS.map((g) => (
            <Panel key={g.id}>
              <PanelHeader eyebrow={`${g.tells.filter((t) => found.includes(t.n)).length}/${g.tells.length}`} title={g.label} />
              <p className="px-4 pt-3 text-[12.5px] text-ink-2">{g.blurb}</p>
              <ul className="grid">
                {g.tells.map((t) => (
                  <Row key={t.n} tell={t} on={found.includes(t.n)} onToggle={() => toggle(t.n)} />
                ))}
              </ul>
            </Panel>
          ))}
        </div>

        <div className="lg:col-span-2">
          <Panel className="lg:sticky lg:top-20">
            <PanelHeader eyebrow="paste into claude / chatgpt" title="The rewrite prompt" />
            <div className="grid gap-3 p-4">
              <pre id="audit-prompt" className="max-h-[46vh] overflow-auto whitespace-pre-wrap rounded-lg bg-panel-2 p-3 font-mono text-[11.5px] leading-relaxed text-ink-2">
                {auditPrompt(found)}
              </pre>
              <CopyPrompt found={found} />
              <p className="text-[12px] text-ink-3">
                Includes every item — checked ones first, then the ones you said are already handled so the model leaves
                them alone.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Row({ tell, on, onToggle }: { tell: Tell; on: boolean; onToggle: () => void }) {
  return (
    <li className="border-t border-line">
      <label className="flex cursor-pointer items-start gap-3 px-4 py-2.5 transition-colors hover:bg-panel-2">
        <input type="checkbox" checked={on} onChange={onToggle} className="sr-only" />
        <span
          aria-hidden
          className={cn(
            "mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
            on ? "border-signal bg-signal text-paper" : "border-line bg-panel",
          )}
        >
          {on && <span className="text-[11px] font-bold">✓</span>}
        </span>
        <span className="min-w-0">
          <span className="flex items-baseline gap-2">
            <span className="font-mono text-[11.5px] text-ink-3">{tell.n}.</span>
            <span className={cn("text-[13.5px]", on ? "text-ink line-through decoration-ink-3/50" : "text-ink")}>{tell.title}</span>
          </span>
          <span className="mt-0.5 block text-[12px] text-ink-2">{tell.fix}</span>
        </span>
      </label>
    </li>
  );
}

function Meter({ value }: { value: number }) {
  return (
    <div className="min-w-[160px] flex-1">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-2">
        <div
          className={cn("h-full rounded-full transition-[width] duration-300", value >= 85 ? "bg-pass" : value >= 55 ? "bg-warn" : "bg-fail")}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

/** Worst-first: the order the rewrite should work through them. */
function Tally({ found }: { found: number[] }) {
  const worst = ALL_TELLS.filter((t) => found.includes(t.n)).slice(0, 3);
  if (!worst.length) return <span className="text-[12px] text-ink-3">nothing to fix</span>;
  return (
    <span className="font-mono text-[11.5px] text-ink-3">
      worst: {worst.map((t) => t.n).join(", ")}
      {found.length > 3 ? ` +${found.length - 3}` : ""}
    </span>
  );
}

function CopyPrompt({ found }: { found: number[] }) {
  const [state, setState] = useState<"idle" | "copied" | "select">("idle");
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(auditPrompt(found));
          setState("copied");
        } catch {
          setState("select");
          const pre = document.getElementById("audit-prompt");
          if (pre) {
            const range = document.createRange();
            range.selectNodeContents(pre);
            window.getSelection()?.removeAllRanges();
            window.getSelection()?.addRange(range);
          }
        }
        setTimeout(() => setState("idle"), 1800);
      }}
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-3 py-2 text-[13px] font-medium text-paper transition-opacity hover:opacity-90"
    >
      {state === "copied" ? "Copied" : state === "select" ? "Selected — press Ctrl+C" : "Copy prompt"}
    </button>
  );
}