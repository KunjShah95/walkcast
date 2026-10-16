import { cn } from "../lib/format.ts";
import type { Route } from "../App.tsx";

type Crumb = { label: string; route?: Route; current?: boolean };

function crumbsFor(route: Route): Crumb[] {
  const base: Crumb = { label: "Overview", route: { view: "overview" } };
  switch (route.view) {
    case "overview":
      return [{ label: "Overview", current: true }];
    case "simulator":
      return [base, { label: "Fault replay", current: true }];
    case "record":
      return [base, { label: "Record", current: true }];
    case "runs":
      return [base, { label: "Runs", current: true }];
    case "fixtures":
      return [base, { label: "Fixtures", current: true }];
    case "experiments":
      return [base, { label: "Experiments", current: true }];
    case "audit":
      return [base, { label: "Vibecode audit", current: true }];
    case "run": {
      const name = (route.dir.split("/").pop() ?? route.dir).replace(/^run-?/i, "");
      return [base, { label: "Runs", route: { view: "runs" } }, { label: name || "run", current: true }];
    }
    case "compare":
      return [
        base,
        { label: "Runs", route: { view: "runs" } },
        { label: "Compare", current: true },
      ];
    default:
      return [base];
  }
}

export function Breadcrumbs({ route, go }: { route: Route; go: (r: Route) => void }) {
  const items = crumbsFor(route);
  if (items.length <= 1) return null;
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 font-mono text-[11.5px] text-ink-3">
      {items.map((c, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden className="text-ink-3/60">›</span>}
          {c.current || !c.route ? (
            <span className={cn("text-ink-2", c.current && "text-ink")} aria-current={c.current ? "page" : undefined}>
              {c.label}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => go(c.route!)}
              className="rounded-md px-1 py-0.5 text-ink-2 hover:bg-panel-2 hover:text-ink focus-visible:text-ink"
            >
              {c.label}
            </button>
          )}
        </span>
      ))}
    </nav>
  );
}
