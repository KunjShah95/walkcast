import { useEffect, useState } from "react";
import { ThemeToggle } from "./components/ui.tsx";
import { isSnapshot, loadIndex, loadMe } from "./lib/api.ts";
import { ago, cn } from "./lib/format.ts";
import type { LabIndex } from "./lib/types.ts";
import { Experiments } from "./views/Experiments.tsx";
import { Fixtures } from "./views/Fixtures.tsx";
import { Overview } from "./views/Overview.tsx";
import { RunView } from "./views/RunView.tsx";
import { Runs } from "./views/Runs.tsx";
import { Compare } from "./views/Compare.tsx";
import { Simulator } from "./views/Simulator.tsx";
import { Record } from "./views/Record.tsx";

export type Route =
  | { view: "overview" }
  | { view: "simulator" }
  | { view: "record"; url?: string }
  | { view: "runs" }
  | { view: "fixtures" }
  | { view: "experiments" }
  | { view: "run"; dir: string }
  | { view: "compare"; base: string; cand: string };

function parse(hash: string): Route {
  const h = hash.replace(/^#\/?/, "");
  if (h.startsWith("run/")) return { view: "run", dir: decodeURIComponent(h.slice(4)) };
  if (h.startsWith("compare/")) {
    const [base = "", cand = ""] = h.slice(8).split("|").map(decodeURIComponent);
    return { view: "compare", base, cand };
  }
  if (h.startsWith("record?")) return { view: "record", url: new URLSearchParams(h.slice(7)).get("url") ?? "" };
  if (h === "runs" || h === "fixtures" || h === "experiments" || h === "simulator" || h === "record") return { view: h };
  return { view: "overview" };
}

function toHash(route: Route): string {
  if (route.view === "run") return `#run/${encodeURIComponent(route.dir)}`;
  if (route.view === "compare") return `#compare/${encodeURIComponent(route.base)}|${encodeURIComponent(route.cand)}`;
  return route.view === "overview" ? "#" : `#${route.view}`;
}

const NAV: { view: Route["view"]; label: string }[] = [
  { view: "overview", label: "Overview" },
  { view: "simulator", label: "Simulator" },
  { view: "record", label: "Record" },
  { view: "runs", label: "Runs" },
  { view: "fixtures", label: "Fixtures" },
  { view: "experiments", label: "Experiments" },
];

export function App() {
  const [route, setRoute] = useState<Route>(() => parse(location.hash));
  const [index, setIndex] = useState<LabIndex | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadIndex().then(setIndex, (e: Error) => setError(e.message));
    const onHash = () => setRoute(parse(location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (next: Route) => {
    const hash = toHash(next);
    if (location.hash !== hash) history.pushState(null, "", hash || location.pathname);
    setRoute(next);
    window.scrollTo({ top: 0 });
  };

  const active = route.view === "run" || route.view === "compare" ? "runs" : route.view;
  const refresh = async () => {
    const next = await loadIndex();
    setIndex(next);
    return next;
  };

  return (
    <div className="min-h-full">
      <header
        className="sticky z-30 border-b border-line bg-paper/85 backdrop-blur"
        style={{ top: "env(safe-area-inset-top, 0px)" }}
      >
        <div
          className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-6 gap-y-2 py-3"
          style={{ paddingLeft: "max(16px, env(safe-area-inset-left, 0px))", paddingRight: "max(16px, env(safe-area-inset-right, 0px))" }}
        >
          <button type="button" onClick={() => go({ view: "overview" })} className="flex items-center gap-2.5">
            <Mark />
            <span className="font-display text-[19px] font-semibold tracking-tight">Walkcast</span>
          </button>
          <nav className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto" aria-label="Sections">
            {NAV.map((n) => (
              <button
                key={n.view}
                type="button"
                onClick={() => go({ view: n.view } as Route)}
                aria-current={active === n.view ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-[13px] transition-colors",
                  active === n.view ? "bg-ink text-paper" : "text-ink-2 hover:bg-panel-2 hover:text-ink",
                )}
              >
                {n.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Account />
            {index && (
              <span className="hidden font-mono text-[11px] text-ink-3 md:inline">
                {isSnapshot ? "snapshot" : "live"} · indexed {ago(Date.parse(index.generatedAt))}
              </span>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main
        className="mx-auto max-w-[1240px] pb-16 pt-6"
        style={{ paddingLeft: "max(16px, env(safe-area-inset-left, 0px))", paddingRight: "max(16px, env(safe-area-inset-right, 0px))" }}
      >
        {error && <p className="rounded-lg border border-fail/40 bg-fail-soft px-4 py-3 text-fail">{error} Start the server with npm run lab -- ui.</p>}
        {!index && !error && <p className="font-mono text-ink-3">Reading runs…</p>}
        {index && route.view === "overview" && <Overview index={index} go={go} />}
        {index && route.view === "runs" && <Runs index={index} go={go} />}
        {index && route.view === "fixtures" && <Fixtures index={index} go={go} />}
        {index && route.view === "experiments" && <Experiments index={index} />}
        {index && route.view === "run" && <RunView dir={route.dir} index={index} go={go} />}
        {index && route.view === "simulator" && <Simulator index={index} go={go} refresh={refresh} />}
        {index && route.view === "record" && <Record index={index} refresh={refresh} initialUrl={route.url} />}
        {index && route.view === "compare" && <Compare base={route.base} cand={route.cand} index={index} go={go} />}
      </main>
    </div>
  );
}

/** Signed-in account (live server only). */
function Account() {
  const [me, setMe] = useState<{ user: { email: string } | null } | null>(null);
  useEffect(() => {
    if (!isSnapshot) loadMe().then(setMe);
  }, []);
  if (!me) return null;
  return me.user ? (
    <span className="flex items-center gap-2 text-[12.5px] text-ink-2">
      <span className="hidden max-w-[16ch] truncate sm:inline">{me.user.email}</span>
      <a href="/auth/logout" className="rounded-md border border-line px-2 py-1 hover:bg-panel-2">Sign out</a>
    </span>
  ) : (
    <a href={`/login?next=${encodeURIComponent("/app" + location.hash)}`} className="rounded-md bg-ink px-2.5 py-1 text-[12.5px] text-paper">
      Sign in
    </a>
  );
}

/** The mark: a recorder trace with one highlighted fault. */
function Mark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
      <rect x="0.5" y="0.5" width="25" height="25" rx="6" fill="var(--ink)" />
      <path d="M4 15h4l2-6 3 10 2-7 2 3h5" fill="none" stroke="var(--paper)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="15" cy="12" r="2.4" fill="var(--highlight)" stroke="var(--ink)" strokeWidth="0.8" />
    </svg>
  );
}
