import { useEffect, useState } from "react";
import type { Route } from "../App.tsx";
import { Empty, Panel, Stamp } from "../components/ui.tsx";
import { ago, cn, faultLabel, ms } from "../lib/format.ts";
import type { FailureReport, RunFailure } from "../../../../../packages/core/src/record/failure.ts";

/**
 * Lab → Failures: every recording that failed (or was refused before it started) and every agent
 * run that crashed or couldn't start. For recordings:, with what went wrong in plain words, the
 * stage it reached, the pages it got through, and the last thing on screen. The Record page only
 * shows failures for the current session; this is where they stay.
 */
export function Failures({ go }: { go: (r: Route) => void }) {
  const [failures, setFailures] = useState<FailureReport[] | null>(null);
  const [runs, setRuns] = useState<RunFailure[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    fetch("/api/failures")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Could not load failed recordings (${res.status}).`);
        const body = (await res.json()) as { failures: FailureReport[]; runs?: RunFailure[] };
        if (!stopped) {
          setFailures(body.failures);
          setRuns(body.runs ?? []);
          setOpen((o) => o ?? body.failures[0]?.jobId ?? null);
        }
      })
      .catch((e: unknown) => !stopped && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      stopped = true;
    };
  }, []);

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em] sm:text-[30px]">
          What <span className="text-dim">failed.</span>
        </h1>
        <p className="mt-1.5 text-[14px] text-ink-2">Why each recording or agent run failed, how far it got, and what was on screen when it stopped.</p>
      </div>

      {error && <Panel className="p-4 text-[13.5px] text-fail">{error}</Panel>}
      {!error && failures === null && <Panel className="p-4 text-[13.5px] text-ink-3">Loading…</Panel>}
      {failures?.length === 0 && runs.length === 0 && (
        <Panel>
          <Empty title="Nothing has failed" tone="pass">
            When a recording or an agent run fails, it shows up here with the reason.
          </Empty>
        </Panel>
      )}
      {failures && failures.length > 0 && runs.length > 0 && <h2 className="mt-2 text-[15px] font-semibold">Recordings</h2>}
      {failures && failures.length > 0 && (
        <div className="grid gap-3">
          {failures.map((f) => (
            <FailureCard key={f.jobId} f={f} open={open === f.jobId} toggle={() => setOpen(open === f.jobId ? null : f.jobId)} retry={() => go({ view: "record", url: f.url === "Sample site" ? "" : f.url })} />
          ))}
        </div>
      )}
      {runs.length > 0 && (
        <>
          <h2 className="mt-2 text-[15px] font-semibold">Agent runs</h2>
          <div className="grid gap-3">
            {runs.map((r) => (
              <RunFailureCard key={r.jobId} r={r} open={open === r.jobId} toggle={() => setOpen(open === r.jobId ? null : r.jobId)} replay={() => go({ view: "simulator" })} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FailureCard({ f, open, toggle, retry }: { f: FailureReport; open: boolean; toggle: () => void; retry: () => void }) {
  const file = (name: string | null) => (name ? `/api/failures/${f.jobId}/${name}` : null);
  const screenshot = file(f.files.screenshot);
  const video = file(f.files.video);
  return (
    <Panel className="overflow-hidden">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full min-w-0 items-start justify-between gap-3 p-4 text-left hover:bg-panel-2">
        <span className="min-w-0">
          <span className="block truncate font-mono text-[13px] text-ink">{f.url || "Unknown site"}</span>
          <span className="mt-1 block text-[14px] font-medium text-ink">{f.title}</span>
          <span className="mt-0.5 block text-[12.5px] text-ink-3">
            {ago(Date.parse(f.failedAt))}
            {f.stage ? ` · stopped at “${f.stage}”` : ""}
            {f.pages.length ? ` · ${f.pages.length} page${f.pages.length === 1 ? "" : "s"} reached` : ""}
          </span>
        </span>
        <Stamp tone={f.refused ? "warn" : "fail"}>{f.refused ? "Refused" : "Failed"}</Stamp>
      </button>
      {open && (
        <div className="grid gap-4 border-t border-line p-4">
          <div className="grid gap-1.5">
            {f.refused && <p className="text-[12.5px] text-ink-3">Turned away before it started, so nothing was recorded.</p>}
            <p className="text-[13.5px] text-ink-2">{f.hint}</p>
            <pre className="whitespace-pre-wrap break-words rounded-lg bg-panel-2 p-3 font-mono text-[12px] text-ink-2">{f.error}</pre>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-4">
            <Fact label="Reason" value={f.category} />
            <Fact label="Attempts" value={String(f.attempts)} />
            <Fact label="Ran for" value={f.durationMs != null ? ms(f.durationMs) : "—"} />
            <Fact label="Sign-in" value={f.signIn?.attempted ? f.signIn.outcome : "not used"} />
          </dl>
          {(screenshot || video) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {screenshot && (
                <figure className="grid gap-1.5">
                  <a href={screenshot} target="_blank" rel="noreferrer">
                    <img src={screenshot} alt="The page on screen when the recording failed" className="w-full rounded-lg border border-line" loading="lazy" />
                  </a>
                  <figcaption className="text-[12px] text-ink-3">On screen when it failed</figcaption>
                </figure>
              )}
              {video && (
                <figure className="grid gap-1.5">
                  <video src={video} controls preload="metadata" className="w-full rounded-lg border border-line bg-black" />
                  <figcaption className="text-[12px] text-ink-3">What it recorded before failing</figcaption>
                </figure>
              )}
            </div>
          )}
          {f.pages.length > 0 && (
            <div className="grid gap-1">
              <p className="text-[12.5px] font-medium text-ink">Pages reached</p>
              <ol className="grid gap-0.5 font-mono text-[12px] text-ink-2">
                {f.pages.map((p, i) => (
                  <li key={`${p.url}-${i}`} className="flex min-w-0 gap-2">
                    <span className="text-ink-3">{i + 1}.</span>
                    <span className="truncate">{p.title || p.url}</span>
                    {p.status != null && <span className={cn("ml-auto shrink-0", p.status >= 400 ? "text-fail" : "text-ink-3")}>{p.status}</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {f.url !== "Sample site" && f.url && (
            <div>
              <button type="button" onClick={retry} className="rounded-full bg-solid px-3 py-1.5 text-[12.5px] font-medium text-on-solid hover:brightness-95">
                Record again
              </button>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-3">{label}</dt>
      <dd className="truncate text-ink">{value}</dd>
    </div>
  );
}

function RunFailureCard({ r, open, toggle, replay }: { r: RunFailure; open: boolean; toggle: () => void; replay: () => void }) {
  return (
    <Panel className="overflow-hidden">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full min-w-0 items-start justify-between gap-3 p-4 text-left hover:bg-panel-2">
        <span className="min-w-0">
          <span className="block truncate font-mono text-[13px] text-ink">
            {r.agent} · {faultLabel(r.fault)} · seed {r.seed}
          </span>
          <span className="mt-1 block text-[14px] font-medium text-ink">{r.title}</span>
          <span className="mt-0.5 block text-[12.5px] text-ink-3">
            {ago(Date.parse(r.failedAt))} · task {r.task}
            {r.modelMode ? ` · ${r.modelMode} model` : ""}
          </span>
        </span>
        <Stamp tone="fail">Failed</Stamp>
      </button>
      {open && (
        <div className="grid gap-4 border-t border-line p-4">
          <div className="grid gap-1.5">
            <p className="text-[13.5px] text-ink-2">{r.hint}</p>
            <pre className="whitespace-pre-wrap break-words rounded-lg bg-panel-2 p-3 font-mono text-[12px] text-ink-2">{r.error}</pre>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-4">
            <Fact label="Reason" value={r.category} />
            <Fact label="Attempts" value={String(r.attempts)} />
            <Fact label="Agent" value={r.agent} />
            <Fact label="Fault" value={faultLabel(r.fault)} />
          </dl>
          <div>
            <button type="button" onClick={replay} className="rounded-full bg-solid px-3 py-1.5 text-[12.5px] font-medium text-on-solid hover:brightness-95">
              Open fault replay
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}
