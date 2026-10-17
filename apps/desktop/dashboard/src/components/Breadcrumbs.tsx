import { cn } from "../lib/format.ts";
import type { Route } from "../App.tsx";

type Crumb = { label: string; route?: Route; current?: boolean };

const WALK: Crumb = { label: "Walkthroughs", route: { view: "dashboard" } };
const LAB: Crumb = { label: "Lab", route: { view: "runs" } };

function crumbsFor(route: Route): Crumb[] {
  switch (route.view) {
    case "dashboard":
      return [{ label: "Dashboard", current: true }];
    case "record":
      return [WALK, { label: "Record", current: true }];
    case "library":
      return route.dir
        ? [WALK, { label: "Library", route: { view: "library" } }, { label: route.dir.split("/").pop() ?? route.dir, current: true }]
        : [WALK, { label: "Library", current: true }];
    case "settings":
      return [{ label: "Settings", current: true }];
    case "simulator":
      return [LAB, { label: "Fault replay", current: true }];
    case "runs":
      return [LAB, { label: "Runs", current: true }];
    case "fixtures":
      return [LAB, { label: "Fixtures", current: true }];
    case "experiments":
      return [LAB, { label: "Experiments", current: true }];
    case "run": {
      const name = (route.dir.split("/").pop() ?? route.dir).replace(/^run-?/i, "");
      return [LAB, { label: "Runs", route: { view: "runs" } }, { label: name || "run", current: true }];
    }
    case "compare":
      return [LAB, { label: "Runs", route: { view: "runs" } }, { label: "Compare", current: true }];
    default:
      return [];
  }
}

/** Where you are, in the top bar. */
export function Breadcrumbs({ route, go }: { route: Route; go: (r: Route) => void }) {
  const items = crumbsFor(route);
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-[13px] text-ink-3">
      {items.map((c, i) => (
        <span key={i} className={cn("flex min-w-0 items-center gap-1", !c.current && "max-sm:hidden")}>
          {i > 0 && <span aria-hidden className="text-line-strong max-sm:hidden">/</span>}
          {c.current || !c.route ? (
            <span className={cn("truncate", c.current ? "font-medium text-ink" : "text-ink-2")} aria-current={c.current ? "page" : undefined}>
              {c.label}
            </span>
          ) : (
            <button type="button" onClick={() => go(c.route!)} className="truncate rounded-md px-1 py-0.5 text-ink-3 hover:bg-panel-2 hover:text-ink">
              {c.label}
            </button>
          )}
        </span>
      ))}
    </nav>
  );
}
