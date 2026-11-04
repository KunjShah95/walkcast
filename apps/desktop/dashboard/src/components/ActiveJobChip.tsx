import { useState } from "react";
import type { Route } from "../App.tsx";
import { cancelJob } from "../lib/api.ts";
import { type ActiveJob, jobKindLabel, useActiveJob } from "../lib/active-job.ts";
import { cn } from "../lib/format.ts";

/** Where "Open" goes for each kind of job. */
function routeFor(job: ActiveJob): Route {
  if (job.kind === "record") return { view: "record" };
  if (job.kind === "batch-render") return { view: "library" };
  const dir = typeof job.result?.dir === "string" ? job.result.dir : null;
  return dir ? { view: "run", dir } : { view: "runs" };
}

function statusText(job: ActiveJob): string {
  if (job.status === "queued") {
    const ahead = job.queue?.ahead;
    return ahead ? `Queued · ${ahead} ahead` : "Queued";
  }
  return job.progress?.trim() || "Running";
}

const ctl =
  "inline-flex h-7 shrink-0 items-center rounded-full px-2.5 text-[12px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal";

/**
 * The one job this account has in flight, wherever you are in the app. It renders nothing when
 * nothing is running: the header never claims a liveness it hasn't seen.
 */
export function ActiveJobChip({ go, className }: { go: (r: Route) => void; className?: string }) {
  const { job, refresh } = useActiveJob();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!job) return null;
  const kind = jobKindLabel(job.kind);
  const status = statusText(job);

  return (
    <div role="group" aria-label={`${kind} in progress`} className={cn("flex min-w-0 max-w-[min(440px,48vw)] items-center gap-1.5 rounded-full border border-line-strong bg-panel py-0.5 pl-3 pr-0.5", className)}>
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", job.kind === "record" ? "rec-light bg-rec" : "bg-signal")} />
      <span className="shrink-0 text-[12.5px] font-semibold text-ink">{kind}</span>
      {/* Progress is announced politely as it changes; the label above it is not repeated. */}
      <span aria-live="polite" className="min-w-0 truncate text-[12.5px] text-ink-2" title={error ?? status}>
        {error ?? status}
      </span>
      {confirming ? (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await cancelJob(job.id);
                setConfirming(false);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
                refresh();
              }
            }}
            className={cn(ctl, "text-fail hover:bg-fail-soft disabled:opacity-50")}
          >
            {busy ? "Stopping…" : `Stop ${kind.toLowerCase()}`}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className={cn(ctl, "text-ink-2 hover:bg-panel-2 hover:text-ink")}>
            Keep
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={() => go(routeFor(job))} className={cn(ctl, "text-ink hover:bg-panel-2")}>
            Open
          </button>
          <button type="button" onClick={() => setConfirming(true)} className={cn(ctl, "text-ink-2 hover:bg-panel-2 hover:text-fail")}>
            Cancel
          </button>
        </>
      )}
    </div>
  );
}
