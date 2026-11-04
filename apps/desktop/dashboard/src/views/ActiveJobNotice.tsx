import type { Route } from "../App.tsx";
import { type ActiveJob, jobKindLabel } from "../lib/active-job.ts";

/** Where the person can watch a job of this kind. */
export function activeJobRoute(job: ActiveJob): Route {
  if (job.kind === "record") return { view: "record" };
  if (job.kind === "batch-render") return { view: "library" };
  const op = (job as { input?: { op?: unknown } }).input?.op;
  if (op === "experiment") return { view: "experiments" };
  if (op === "replay") return { view: "fixtures" };
  return { view: "runs" };
}

/**
 * The one-active-job limit, said before the start button is pressed rather than after the server
 * refuses it: what is running, and a way to go and watch it.
 */
export function ActiveJobNotice({ job, go, action, className }: { job: ActiveJob; go: (r: Route) => void; action: string; className?: string }) {
  const what = jobKindLabel(job.kind).toLowerCase();
  const target = activeJobRoute(job);
  return (
    <p role="status" className={`rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[13px] text-warn ${className ?? ""}`}>
      A {what} is already {job.status === "queued" ? "queued" : "running"}, and one job runs at a time per account. You can {action} once it finishes.{" "}
      <button type="button" onClick={() => go(target)} className="font-medium underline underline-offset-2">
        Open the running {what}
      </button>
    </p>
  );
}
