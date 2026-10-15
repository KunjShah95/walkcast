import { useEffect, useState } from "react";
import { ThemeToggle } from "./components/ui.tsx";
import { isSnapshot, loadIndex, loadMe } from "./lib/api.ts";
import { ago, cn } from "./lib/format.ts";
import type { LabIndex } from "./lib/types.ts";
import { Experiments } from "./views/Experiments.tsx";
import { RecordLightHalo } from "./components/RecordLightHalo.tsx";
import { FilmGrain } from "./components/FilmGrain.tsx";
import { Fixtures } from "./views/Fixtures.tsx";
import { Overview } from "./views/Overview.tsx";
import { RunView } from "./views/RunView.tsx";
import { Runs } from "./views/Runs.tsx";
import { Compare } from "./views/Compare.tsx";
import { Simulator } from "./views/Simulator.tsx";
import { Pricing } from "./views/Pricing.tsx";
import { Record } from "./views/Record.tsx";

export type Route =
  | { view: "overview" }
  | { view: "simulator" }
  | { view: "record"; url?: string }
  | { view: "runs" }
  | { view: "fixtures" }
  | { view: "experiments" }
  | { view: "run"; dir: string }
  | { view: "compare"; base: string; cand: string }
  | { view: "pricing" };

function parse(hash: string): Route {
  const h = hash.replace(/^#\/?/, "");
  if (h.startsWith("run/")) return { view: "run", dir: decodeURIComponent(h.slice(4)) };
  if (h.startsWith("compare/")) {
    const [base = "", cand = ""] = h.slice(8).split("|").map(decodeURIComponent);
    return { view: "compare", base, cand };
  }
  if (h.startsWith("record?")) return { view: "record", url: new URLSearchParams(h.slice(7)).get("url") ?? "" };
  if (h === "runs" || h === "fixtures" || h === "experiments" || h === "simulator" || h === "record" || h === "pricing") return { view: h };
  return { view: "overview" };
}

function toHash(route: Route): string {
  if (route.view === "run") return `#run/${encodeURIComponent(route.dir)}`;
  if (route.view === "compare") return `#compare/${encodeURIComponent(route.base)}|${encodeURIComponent(route.cand)}`;
  return route.view === "overview" ? "" : `#${route.view}`;
}

const NAV: { view: Route["view"]; label: string }[] = [
  { view: "overview", label: "Overview" },
  { view: "simulator", label: "Fault replay" },
  { view: "record", label: "Record" },
  { view: "runs", label: "Runs" },
  { view: "fixtures", label: "Fixtures" },
  { view: "experiments", label: "Experiments" },
  { view: "pricing", label: "Pricing" },
];

export function App() {
  const [route, setRoute] = useState<Route>(() => parse(location.hash));
  const [index, setIndex] = useState<LabIndex | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [animations, setAnimations] = useState(() => (typeof localStorage !== "undefined" && localStorage.getItem("walkcast:animations") === "1"));
  useEffect(() => {
    try { localStorage.setItem("walkcast:animations", animations ? "1" : "0"); } catch { /* ignore storage failures */ }
  }, [animations]);

  useEffect(() => {
    loadIndex().then(setIndex, (e: Error) => setError(e.message));
    const onHash = () => setRoute(parse(location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (next: Route) => {
    const hash = toHash(next);
    // location.hash is "" on the overview, so this doesn't stack duplicate entries.
    if (location.hash !== hash) history.pushState(null, "", hash || location.pathname + location.search);
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
          <button type="button" onClick={() => go({ view: "overview" })} className="relative flex items-center gap-2.5">
              {animations && <RecordLightHalo />}
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
            <button title="Toggle animated effects (halo, film grain)" aria-pressed={animations} onClick={() => setAnimations((v) => !v)}
        className={cn("rounded-md border px-2.5 py-1 text-[12px] transition-colors",
          animations ? "border-signal bg-signal-soft text-signal" : "border-line text-ink-3 hover:text-ink hover:bg-panel-2")}>
        {animations ? "Animations on" : "Animations off"}
      </button>
          </div>
        </div>
      </header>

      <main
        className="mx-auto max-w-[1240px] pb-16 pt-6"
        style={{ paddingLeft: "max(16px, env(safe-area-inset-left, 0px))", paddingRight: "max(16px, env(safe-area-inset-right, 0px))" }}
      >
        {error && (
          <p className="rounded-lg border border-fail/40 bg-fail-soft px-4 py-3 text-fail">
            {error}{" "}
            {/401/.test(error) ? (
              <a className="font-medium underline" href={`/login?next=${encodeURIComponent("/app" + location.hash)}`}>
                Sign in to see the dashboard.
              </a>
            ) : (
              <>Start it with npm run ui.</>
            )}
          </p>
        )}
        {!index && !error && <p className="font-mono text-ink-3">Reading runs…</p>}
        {index && route.view === "overview" && <Overview index={index} go={go} />}
        {index && route.view === "runs" && <Runs index={index} go={go} />}
        {index && route.view === "fixtures" && <Fixtures index={index} go={go} />}
        {index && route.view === "experiments" && <Experiments index={index} />}
        {index && route.view === "run" && <RunView dir={route.dir} index={index} go={go} />}
        {index && route.view === "simulator" && <Simulator index={index} go={go} refresh={refresh} />}
        {index && route.view === "record" && <Record index={index} refresh={refresh} initialUrl={route.url} />}
        {index && route.view === "compare" && <Compare base={route.base} cand={route.cand} index={index} go={go} />}
        {route.view === "pricing" && <Pricing />}
      </main>

{animations && <FilmGrain />}
    </div>
  );
}

/** Signed-in account (live server only). */
function Account() {
  const [me, setMe] = useState<{ user: { email: string } | null; authRequired: boolean } | null>(null);
  useEffect(() => {
    if (!isSnapshot) loadMe().then(setMe);
  }, []);
  if (!me || (!me.user && !me.authRequired)) return null; // accounts off (local use): nothing to show
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

/** The mark: a play button with a record light. */
function Mark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
      <rect x="0.5" y="0.5" width="25" height="25" rx="7" fill="var(--ink)" />
      <path d="M10 8.2v9.6l7.6-4.8z" fill="var(--paper)" />
      <circle cx="20.2" cy="5.8" r="2.7" fill="var(--rec)" stroke="var(--ink)" strokeWidth="1" />
    </svg>
  );
}
