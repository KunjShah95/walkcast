import { motion, useScroll, useSpring } from "motion/react";
import { ArrowLeft, ArrowRight, Bot, Compass, Download, Eye, Flag, Hourglass, MousePointerClick, ScanText, Sparkles, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "../App.tsx";
import { FAMILY_COLOR, FlightStrip, pathOnly, toolFamily } from "../components/FlightStrip.tsx";
import { CopyButton, FindingChip, Panel, PanelHeader, Verdict } from "../components/ui.tsx";
import { fileUrl, loadRun } from "../lib/api.ts";
import { FAULT_LABEL, cn, ms, pathOf } from "../lib/format.ts";
import type { ClaimEvent, ConsoleEvent, Finding, LabIndex, ModelCallEvent, NetworkEvent, RunDetail, StepEvent } from "../lib/types.ts";

type Node =
  | { kind: "step"; at: number; step: StepEvent }
  | { kind: "model"; at: number; call: ModelCallEvent }
  | { kind: "claim"; at: number; claim: ClaimEvent };

export function RunView({ dir, index, go }: { dir: string; index: LabIndex; go: (r: Route) => void }) {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<number | null>(null);

  useEffect(() => {
    setDetail(null);
    setError(null);
    loadRun(dir).then(setDetail, (e: Error) => setError(e.message));
  }, [dir]);

  const jump = (stepId: number) => {
    document.getElementById(`step-${stepId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(stepId);
    setTimeout(() => setFlash(null), 1600);
  };

  if (error) return <p className="rounded-lg border border-fail/40 bg-fail-soft px-4 py-3 text-fail">{error}</p>;
  if (!detail) return <p className="font-mono text-ink-3">Loading recording…</p>;

  const { summary: run, result, events } = detail;
  const findings = result.diagnosis.findings;
  const evidence = new Map<number, Finding[]>();
  for (const f of findings) for (const s of f.evidenceSteps) evidence.set(s, [...(evidence.get(s) ?? []), f]);
  const fixture = index.fixtures.find((f) => f.manifest.original.runId === run.id);
  const position = index.runs.findIndex((r) => r.dir === dir);
  const prev = index.runs[position + 1];
  const next = index.runs[position - 1];

  return (
    <div className="grid min-w-0 gap-5 [&>*]:min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => go({ view: "runs" })} className="inline-flex items-center gap-1 text-[13px] text-ink-2 hover:text-signal">
          <ArrowLeft className="size-3.5" /> Runs
        </button>
        <div className="flex gap-2">
          {prev && (
            <button type="button" onClick={() => go({ view: "run", dir: prev.dir })} className="rounded-lg border border-line px-2.5 py-1 text-[12.5px] text-ink-2 hover:border-signal hover:text-signal">
              Older
            </button>
          )}
          {next && (
            <button type="button" onClick={() => go({ view: "run", dir: next.dir })} className="rounded-lg border border-line px-2.5 py-1 text-[12.5px] text-ink-2 hover:border-signal hover:text-signal">
              Newer
            </button>
          )}
        </div>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="eyebrow break-all">{run.id}</div>
          <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight sm:text-[32px]">
            {run.agent} on “{FAULT_LABEL[run.fault] ?? run.fault}”
          </h1>
          <p className="mt-1 max-w-[72ch] text-ink-2">{result.agentSpec?.description}</p>
          <dl className="tabular mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[12px] text-ink-2">
            <Meta k="seed" v={run.seed} />
            <Meta k="duration" v={ms(run.durationMs)} />
            <Meta k="steps" v={run.steps} />
            {result.model && <Meta k="model" v={`${result.model.mode} · ${result.model.calls} calls`} />}
            {result.model?.selection && <Meta k="via" v={result.model.selection.agent} />}
            <Meta k="browser" v={result.browserVersion ?? "–"} />
          </dl>
        </div>
        <Verdict verdict={run.verdict} size="lg" />
      </header>

      <SaidRecorded detail={detail} />

      {findings.length > 0 && (
        <Panel>
          <PanelHeader eyebrow="Deterministic rules · each cites its steps" title={run.verdict === "pass" ? "Recovered incidents" : "Diagnosis"} />
          <ul className="grid gap-px bg-line">
            {findings.map((f, i) => (
              <li key={i} className="grid gap-2 bg-panel px-4 py-3 sm:grid-cols-[11rem_1fr]">
                <div className="flex flex-wrap items-start gap-1.5">
                  <FindingChip id={f.label} kind={f.kind} />
                  <span className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">{f.confidence}</span>
                </div>
                <div className="min-w-0">
                  <p className="max-w-[80ch] text-[13.5px]">{f.explanation}</p>
                  {f.evidenceSteps.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {f.evidenceSteps.map((s) => (
                        <button key={s} type="button" onClick={() => jump(s)} className="evidence font-mono text-[11.5px] hover:underline">
                          step {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel className="min-w-0 p-4">
        <div className="eyebrow mb-2">Flight strip · whole run on one time scale</div>
        <FlightStrip events={events} evidence={new Set(evidence.keys())} onJump={jump} />
      </Panel>

      <Timeline detail={detail} evidence={evidence} flash={flash} />

      {fixture && (
        <Panel>
          <PanelHeader eyebrow="Regression fixture" title={fixture.id} />
          <div className="grid gap-2 p-4">
            <p className="text-ink-2">Re-run this failure against another agent or model. With the same agent, recorded model calls are replayed at no cost.</p>
            <CopyButton text={`npm run lab -- replay ${fixture.dir} --agent ${run.agent} --trials 3`} />
          </div>
        </Panel>
      )}

      <details className="rounded-xl border border-line bg-panel">
        <summary className="cursor-pointer px-4 py-3 font-display text-[15px] font-semibold">Plain-text report</summary>
        <pre className="max-h-[480px] overflow-auto border-t border-line px-4 py-3 font-mono text-[11.5px] leading-relaxed text-ink-2">{detail.report}</pre>
      </details>
    </div>
  );
}

function Meta({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-ink-3">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

/** The product's core contrast: the agent's report next to the application's own records. */
function SaidRecorded({ detail }: { detail: RunDetail }) {
  const { result } = detail;
  const claim = result.claim;
  const checks = result.oracle.checks.filter((c) => c.name !== "claim-matches-state");
  const ledger = (result.appState?.ledger ?? []) as { method: string; path: string; outcome: string; leadId?: number }[];
  const honest = result.oracle.claimHonest;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel className={cn("min-w-0", !honest && "border-fail/50")}>
        <PanelHeader eyebrow="What the agent reported" title="Agent said" aside={<span className={cn("font-mono text-[11px]", honest ? "text-pass" : "text-fail")}>{honest ? "matches records" : "contradicted by records"}</span>} />
        <div className="grid gap-2 p-4">
          {claim ? (
            <>
              <div className={cn("font-display text-xl font-semibold", claim.success ? "text-ink" : "text-ink-2")}>{claim.success ? "“Done.”" : "“Couldn’t do it.”"}</div>
              <blockquote className={cn("border-l-2 pl-3 text-[14px]", honest ? "border-line text-ink-2" : "border-fail text-ink")}>{claim.summary}</blockquote>
              {claim.leadId !== undefined && <div className="font-mono text-[12px] text-ink-3">reported lead id {claim.leadId}</div>}
            </>
          ) : (
            <p className="text-ink-2">The agent never reported back.</p>
          )}
          {result.agentError && <p className="font-mono text-[12px] text-fail">agent error: {result.agentError}</p>}
        </div>
      </Panel>
      <Panel className="min-w-0">
        <PanelHeader eyebrow="Ground truth from the application" title="App recorded" aside={<span className={cn("font-mono text-[11px]", result.oracle.taskPassed ? "text-pass" : "text-fail")}>{result.oracle.taskPassed ? "outcome correct" : "outcome wrong"}</span>} />
        <div className="grid gap-3 p-4">
          <ul className="grid gap-1.5">
            {checks.map((c) => (
              <li key={c.name} className="grid grid-cols-[1.2rem_minmax(0,9rem)_1fr] items-baseline gap-2 text-[13px]">
                <span className={c.passed ? "text-pass" : "text-fail"}>{c.passed ? "✓" : "✗"}</span>
                <span className="font-mono text-[12px] text-ink-2">{c.name}</span>
                <span className="min-w-0 break-words font-mono text-[12px]">
                  {c.passed ? JSON.stringify(c.actual) : (
                    <>
                      <span className="evidence">{JSON.stringify(c.actual)}</span> <span className="text-ink-3">expected {JSON.stringify(c.expected)}</span>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {ledger.length > 0 && (
            <div>
              <div className="eyebrow mb-1">Write ledger</div>
              <ol className="flex flex-wrap gap-1.5">
                {ledger.map((e, i) => (
                  <li
                    key={i}
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 font-mono text-[11px]",
                      e.outcome === "committed" ? "border-ink/20 text-ink" : "border-dashed border-ink-3/60 text-ink-3",
                    )}
                  >
                    {e.method} {e.path} → {e.outcome}
                    {e.leadId ? ` #${e.leadId}` : ""}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

function Timeline({ detail, evidence, flash }: { detail: RunDetail; evidence: Map<number, Finding[]>; flash: number | null }) {
  const { events, summary } = detail;
  const nodes = useMemo<Node[]>(() => {
    const out: Node[] = [];
    for (const e of events) {
      if (e.type === "step") out.push({ kind: "step", at: e.startedAt, step: e });
      else if (e.type === "model" && (e.input as { channel?: string })?.channel !== "stagehand") out.push({ kind: "model", at: e.at - e.latencyMs, call: e });
      else if (e.type === "claim") out.push({ kind: "claim", at: e.at, claim: e });
    }
    return out.sort((a, b) => a.at - b.at);
  }, [events]);
  const network = useMemo(() => groupBy(events.filter((e): e is NetworkEvent => e.type === "request"), (e) => e.stepId), [events]);
  const consoleEvents = useMemo(() => groupBy(events.filter((e): e is ConsoleEvent => e.type === "console"), (e) => e.stepId), [events]);
  // Stagehand's element resolution happens inside the act() step that asked for it.
  const resolutions = useMemo(
    () => groupBy(events.filter((e): e is ModelCallEvent => e.type === "model" && (e.input as { channel?: string })?.channel === "stagehand"), (e) => e.stepId),
    [events],
  );

  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 40%", "end 60%"] });
  const beam = useSpring(scrollYProgress, { stiffness: 220, damping: 40, mass: 0.4 });

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="eyebrow">{nodes.length} events · tool steps, model decisions and the final report</div>
          <h2 className="font-display text-[22px] font-semibold tracking-tight">Recording</h2>
        </div>
      </div>
      <ol ref={ref} className="relative grid gap-3">
        <span aria-hidden className="absolute bottom-2 left-[15px] top-2 w-px bg-line sm:left-[135px]" />
        <motion.span
          aria-hidden
          className="absolute left-[15px] top-2 w-[2px] origin-top rounded-full sm:left-[134.5px]"
          style={{
            scaleY: beam,
            bottom: 8,
            background: `linear-gradient(to bottom, var(--signal), ${summary.verdict === "fail" ? "var(--fail)" : "var(--pass)"})`,
          }}
        />
        {nodes.map((n, i) => (
          <li key={i} id={n.kind === "step" ? `step-${n.step.stepId}` : undefined} className="relative grid grid-cols-[32px_minmax(0,1fr)] gap-3 sm:grid-cols-[150px_minmax(0,1fr)]">
            <NodeRail node={n} evidence={n.kind === "step" ? evidence.get(n.step.stepId) : undefined} />
            <div className="min-w-0">
              {n.kind === "step" && (
                <StepCard
                  step={n.step}
                  runDir={summary.dir}
                  network={network.get(n.step.stepId) ?? []}
                  console={consoleEvents.get(n.step.stepId) ?? []}
                  resolutions={resolutions.get(n.step.stepId) ?? []}
                  evidence={evidence.get(n.step.stepId)}
                  flash={flash === n.step.stepId}
                />
              )}
              {n.kind === "model" && <ModelCard call={n.call} />}
              {n.kind === "claim" && <ClaimCard claim={n.claim} honest={detail.result.oracle.claimHonest} />}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

const ICON = { navigate: Compass, observe: Eye, act: MousePointerClick, wait: Hourglass, read: Download };

function NodeRail({ node, evidence }: { node: Node; evidence?: Finding[] }) {
  const Icon =
    node.kind === "model"
      ? (node.call.input as { channel?: string })?.channel === "stagehand"
        ? Sparkles
        : Bot
      : node.kind === "claim"
        ? Flag
        : node.step.tool === "readValue"
          ? ScanText
          : ICON[toolFamily(node.step.tool)];
  const color =
    node.kind === "step"
      ? node.step.error
        ? "var(--fail)"
        : FAMILY_COLOR[toolFamily(node.step.tool)]
      : node.kind === "model"
        ? "var(--signal)"
        : "var(--ink)";
  const title = node.kind === "step" ? node.step.tool : node.kind === "model" ? ((node.call.input as { channel?: string })?.channel === "stagehand" ? "stagehand" : "decision") : "report";
  return (
    <div className="relative">
      <div className="sticky top-24 flex items-start gap-3 sm:justify-end">
        <div className="hidden min-w-0 text-right sm:block">
          <div className="truncate font-display text-[14px] font-semibold leading-tight">{title}</div>
          <div className="tabular font-mono text-[10.5px] text-ink-3">
            {node.kind === "step" ? `#${node.step.stepId} · ${ms(node.at)}` : ms(Math.max(0, node.at))}
          </div>
          {evidence && <div className="evidence mt-0.5 inline-block font-mono text-[10px]">evidence</div>}
        </div>
        <span
          className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full border bg-panel"
          style={{ borderColor: color, color, boxShadow: evidence ? "0 0 0 3px var(--highlight)" : undefined }}
        >
          <Icon className="size-4" />
        </span>
      </div>
    </div>
  );
}

function StepCard({
  step,
  runDir,
  network,
  console: consoleEvents,
  resolutions,
  evidence,
  flash,
}: {
  step: StepEvent;
  runDir: string;
  network: NetworkEvent[];
  console: ConsoleEvent[];
  resolutions: ModelCallEvent[];
  evidence?: Finding[];
  flash: boolean;
}) {
  const [zoom, setZoom] = useState(false);
  const urlChanged = step.before?.url !== step.after?.url;
  const domChanged = step.before?.fingerprint !== step.after?.fingerprint;
  const shot = step.screenshot ? fileUrl(runDir, step.screenshot) : undefined;
  const instruction = typeof step.args.instruction === "string" ? step.args.instruction : null;
  const args = Object.entries(step.args).filter(([k]) => k !== "instruction");
  const result = step.result as Record<string, unknown> | undefined;

  return (
    <article
      className={cn(
        "rounded-xl border bg-panel shadow-card transition-shadow",
        step.error ? "border-fail/50" : "border-line",
        evidence && "ring-2 ring-highlight",
        flash && "ring-4 ring-signal",
      )}
    >
      <div className="grid gap-2 p-3.5 [overflow-wrap:anywhere]">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-[12px] font-semibold sm:hidden">
            #{step.stepId} {step.tool}
          </span>
          {instruction ? <q className="text-[14px] font-medium">{instruction}</q> : null}
          {args.length > 0 && (
            <span className="min-w-0 break-all font-mono text-[11.5px] text-ink-2">
              {args.map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join("  ")}
            </span>
          )}
          <span className="tabular ml-auto font-mono text-[11px] text-ink-3">{ms(step.endedAt - step.startedAt)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11.5px]">
          <span className="rounded-md bg-panel-2 px-1.5 py-0.5">{pathOf(step.before?.url)}</span>
          <ArrowRight className={cn("size-3.5", urlChanged ? "text-signal" : "text-ink-3")} />
          <span className={cn("rounded-md px-1.5 py-0.5", urlChanged ? "bg-signal-soft text-signal" : "bg-panel-2")}>{pathOf(step.after?.url)}</span>
          {domChanged && <span className="rounded-md border border-line px-1.5 py-0.5 text-ink-2">page changed</span>}
          {step.after?.fingerprint === "pending" && <span className="rounded-md bg-warn-soft px-1.5 py-0.5 text-warn">navigation pending</span>}
        </div>

        {step.target && (
          <div className={cn("rounded-lg px-2.5 py-1.5 text-[12.5px]", step.target.stale ? "bg-fail-soft" : "bg-panel-2")}>
            Target seen as <b>“{step.target.observedName}”</b> in step {step.target.observedInStep} ({ms(step.target.observationAgeMs)} earlier); at action time it was{" "}
            <b className={step.target.stale ? "evidence" : undefined}>“{step.target.nameAtAction ?? "gone"}”</b>
            {step.target.stale && <span className="ml-1.5 font-mono text-[10.5px] font-semibold uppercase text-fail">stale</span>}
          </div>
        )}

        {result && "success" in result && (
          <div className={cn("text-[12.5px]", result.success === false ? "text-fail" : "text-ink-2")}>
            {result.success === false ? "✗ " : "✓ "}
            {String(result.message ?? "")}
          </div>
        )}
        {result && "elements" in result && <div className="font-mono text-[11.5px] text-ink-3">observed {String(result.elements)} interactive elements · fingerprint {String(result.fingerprint)}</div>}

        {resolutions.map((call, i) => (
          <Resolution key={i} call={call} />
        ))}

        {step.error && <div className="rounded-lg bg-fail-soft px-2.5 py-1.5 font-mono text-[12px] text-fail">{step.error}</div>}

        {network.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {network.map((r, i) => {
              const bad = (r.status ?? 0) >= 400 || r.failure !== undefined;
              return (
                <li
                  key={i}
                  title={r.postData ? JSON.stringify(r.postData) : undefined}
                  className={cn(
                    "rounded-md border px-1.5 py-0.5 font-mono text-[11px]",
                    bad ? "border-fail/50 bg-fail-soft text-fail" : r.method !== "GET" ? "border-ink/30 text-ink" : "border-line text-ink-2",
                  )}
                >
                  {r.method} {pathOnly(r.url)} → {r.status ?? r.failure ?? "…"}
                  {r.respondedAt !== undefined && <span className="text-ink-3"> {ms(r.respondedAt - r.at)}</span>}
                </li>
              );
            })}
          </ul>
        )}
        {network.some((r) => r.postData) && (
          <div className="font-mono text-[11px] text-ink-3">
            sent: {network.filter((r) => r.postData).map((r) => Object.entries(r.postData!).map(([k, v]) => `${k}=${v}`).join(" ")).join(" | ")}
          </div>
        )}
        {consoleEvents.map((c, i) => (
          <div key={i} className="font-mono text-[11.5px] text-warn">
            console {c.level}: {c.text}
          </div>
        ))}

        {evidence && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-dashed border-line pt-2 text-[12px] text-ink-2">
            Evidence for {evidence.map((f) => <FindingChip key={f.label} id={f.label} kind={f.kind} />)}
          </div>
        )}

        {shot && (
          <>
            <button type="button" onClick={() => setZoom(true)} className="w-fit overflow-hidden rounded-lg border border-line" aria-label={`Enlarge screenshot after step ${step.stepId}`}>
              <img src={shot} alt={`Page after step ${step.stepId}`} loading="lazy" className="block h-28 w-auto max-w-full object-cover object-top" />
            </button>
            {zoom && (
              <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-ink/70 p-4" onClick={() => setZoom(false)}>
                <button type="button" className="absolute right-4 top-4 rounded-full bg-panel p-2 text-ink" aria-label="Close" style={{ marginTop: "env(safe-area-inset-top, 0px)" }}>
                  <X className="size-4" />
                </button>
                <img src={shot} alt={`Page after step ${step.stepId}`} className="max-h-[88vh] max-w-full rounded-lg border border-line" />
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}

function ModelCard({ call }: { call: ModelCallEvent }) {
  const input = call.input as { channel?: string; seq?: number; drift?: boolean; summary?: { instruction?: string; format?: string; messages?: number } };
  const output = call.output as {
    stop_reason?: string;
    tool_calls?: { name: string; input: Record<string, unknown> }[];
    text?: string;
    structuredContent?: Record<string, unknown>;
  };
  const stagehand = input.channel === "stagehand";
  return (
    <div className="rounded-xl border border-dashed border-signal/40 bg-signal-soft px-3.5 py-2.5 [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-signal">{stagehand ? `stagehand · ${input.summary?.format ?? ""}` : "agent decides"}</span>
        <span className="font-mono text-[11px] text-ink-3">{call.model}</span>
        {input.drift && <span className="rounded bg-warn-soft px-1 font-mono text-[10.5px] text-warn">prompt drift</span>}
        <span className="tabular ml-auto font-mono text-[11px] text-ink-3">
          {ms(call.latencyMs)}
          {call.inputTokens ? ` · ${call.inputTokens}→${call.outputTokens} tok` : ""}
        </span>
      </div>
      {stagehand ? (
        <div className="mt-1 grid gap-0.5 text-[12.5px]">
          {input.summary?.instruction && <div className="truncate text-ink-2">{input.summary.instruction.replace(/^Find the most relevant element to perform an action on given the following action: /, "")}</div>}
          <code className="break-all font-mono text-[11.5px]">{JSON.stringify(output.structuredContent)}</code>
        </div>
      ) : (
        <div className="mt-1 grid gap-1">
          {output.text && <p className="text-[13px] text-ink-2">{output.text}</p>}
          <div className="flex flex-wrap gap-1.5">
            {(output.tool_calls ?? []).map((t, i) => (
              <span key={i} className="min-w-0 rounded-md border border-signal/40 bg-panel px-1.5 py-0.5 font-mono text-[11.5px]">
                {t.name}({Object.entries(t.input ?? {}).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ")})
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Stagehand resolving the instruction to an element, shown inside the act() step. */
function Resolution({ call }: { call: ModelCallEvent }) {
  const output = call.output as { structuredContent?: { action?: { elementId?: string; description?: string; method?: string; arguments?: string[] } | null; elements?: unknown[] } };
  const action = output.structuredContent?.action;
  const drift = (call.input as { drift?: boolean })?.drift;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg border border-dashed border-signal/40 bg-signal-soft px-2.5 py-1.5 text-[12px]">
      <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-signal">Stagehand resolved</span>
      {action ? (
        <span className="min-w-0">
          {action.method} <b>{action.description}</b>
          {action.arguments?.length ? <span className="font-mono text-ink-2"> ({action.arguments.join(", ")})</span> : null}
          <span className="font-mono text-ink-3"> node {action.elementId}</span>
        </span>
      ) : action === null ? (
        <span className="text-fail">no matching element</span>
      ) : (
        <code className="min-w-0 break-all font-mono text-[11px]">{JSON.stringify(output.structuredContent)}</code>
      )}
      {drift && <span className="rounded bg-warn-soft px-1 font-mono text-[10.5px] text-warn">prompt drift</span>}
      <span className="tabular ml-auto font-mono text-[10.5px] text-ink-3">
        {call.model} · {ms(call.latencyMs)}
      </span>
    </div>
  );
}

function ClaimCard({ claim, honest }: { claim: ClaimEvent; honest: boolean }) {
  return (
    <div className={cn("rounded-xl border-2 px-4 py-3", honest ? "border-line bg-panel" : "border-fail/60 bg-fail-soft")}>
      <div className="eyebrow">Agent's final report</div>
      <div className="font-display text-lg font-semibold">
        {claim.success ? "Reported success" : "Reported failure"}
        {!honest && <span className="ml-2 text-fail">, contradicted by the app</span>}
      </div>
      <p className="text-[13.5px] text-ink-2">{claim.summary}</p>
      {!honest && <div className="mt-1 text-[12px] text-ink-2">The diagnosis above explains why.</div>}
    </div>
  );
}

function groupBy<T>(items: T[], key: (t: T) => number): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
  return map;
}
