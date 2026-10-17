import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Breadcrumbs } from "./components/Breadcrumbs.tsx";
import { RecordBar } from "./components/RecordBar.tsx";
import { ExhibitProvider, ThemeToggle } from "./components/ui.tsx";
import { I18nProvider } from "./lib/i18n.tsx";
import { DotGrid } from "./components/aceternity.tsx";
import { type Me, isSnapshot, loadIndex, loadMe } from "./lib/api.ts";
import { AnalyticsTracker } from "./lib/analytics.tsx";
import { ago, cn } from "./lib/format.ts";
import type { LabIndex } from "./lib/types.ts";
import { Experiments } from "./views/Experiments.tsx";
import { Fixtures } from "./views/Fixtures.tsx";
import { Dashboard } from "./views/Dashboard.tsx";
import { RunView } from "./views/RunView.tsx";
import { Runs } from "./views/Runs.tsx";
import { Compare } from "./views/Compare.tsx";
import { Simulator } from "./views/Simulator.tsx";
import { Record } from "./views/Record.tsx";
import { Library } from "./views/Library.tsx";
import { Settings } from "./views/Settings.tsx";
import { Schedules } from "./views/Schedules.tsx";
import { Mobile } from "./views/Mobile.tsx";

export type Route =
  | { view: "dashboard" }
  | { view: "simulator" }
  | { view: "record"; url?: string }
  | { view: "library"; dir?: string }
  | { view: "settings" }
  | { view: "schedules" }
  | { view: "runs" }
  | { view: "fixtures" }
  | { view: "experiments" }
  | { view: "run"; dir: string }
  | { view: "compare"; base: string; cand: string }
  | { view: "mobile" };

function parse(hash: string): Route {
  const h = hash.replace(/^#\/?/, "");
  if (h.startsWith("run/")) return { view: "run", dir: decodeURIComponent(h.slice(4)) };
  if (h.startsWith("compare/")) {
    const [base = "", cand = ""] = h.slice(8).split("|").map(decodeURIComponent);
    return { view: "compare", base, cand };
  }
  if (h.startsWith("library/")) return { view: "library", dir: decodeURIComponent(h.slice(8)) };
  if (h.startsWith("record?")) return { view: "record", url: new URLSearchParams(h.slice(7)).get("url") ?? "" };
  if (h === "overview") return { view: "dashboard" };
  if (h === "mobile") return { view: "mobile" };
  if (h === "runs" || h === "fixtures" || h === "experiments" || h === "simulator" || h === "record" || h === "library" || h === "settings" || h === "schedules" || h === "dashboard")
    return { view: h };
  return { view: "dashboard" };
}

function toHash(route: Route): string {
  if (route.view === "run") return `#run/${encodeURIComponent(route.dir)}`;
  if (route.view === "compare") return `#compare/${encodeURIComponent(route.base)}|${encodeURIComponent(route.cand)}`;
  if (route.view === "library" && route.dir) return `#library/${encodeURIComponent(route.dir)}`;
  if (route.view === "record" && route.url) return `#record?url=${encodeURIComponent(route.url)}`;
  return route.view === "dashboard" ? "" : `#${route.view}`;
}

type NavItem = { view: Route["view"]; label: string; count?: (i: LabIndex) => number };
const WORKSPACES: { name: string; items: NavItem[] }[] = [
  {
    name: "Walkthroughs",
    items: [
      { view: "dashboard", label: "Dashboard" },
      { view: "record", label: "Record" },
      { view: "library", label: "Library", count: (i) => i.recordings?.length ?? 0 },
    ],
  },
  {
    name: "Lab",
    items: [
      { view: "runs", label: "Runs", count: (i) => i.runs.length },
      { view: "fixtures", label: "Fixtures", count: (i) => i.fixtures.length },
      { view: "experiments", label: "Experiments", count: (i) => i.experiments.length },
      { view: "simulator", label: "Fault replay" },
    ],
  },
];

const TITLES: Record<Route["view"], string> = {
  dashboard: "Dashboard",
  record: "Record",
  library: "Library",
  settings: "Settings",
  schedules: "Schedules",
  runs: "Runs",
  run: "Run",
  compare: "Compare",
  simulator: "Fault replay",
  fixtures: "Fixtures",
  experiments: "Experiments",
  mobile: "Mobile",
};

export function App() {
  const [route, setRoute] = useState<Route>(() => parse(location.hash));
  const [index, setIndex] = useState<LabIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    loadIndex().then(setIndex, (e: Error) => setError(e.message));
    if (!isSnapshot) loadMe().then(setMe);
    const onHash = () => {
      setRoute(parse(location.hash));
      setDrawer(false);
      try {
        const v = sessionStorage.getItem(`walkcast:scroll:${location.hash || "#dashboard"}`);
        if (v) window.scrollTo({ top: Number(v), behavior: "auto" });
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onHash);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("popstate", onHash);
    };
  }, []);

  const go = (next: Route) => {
    try {
      sessionStorage.setItem(`walkcast:scroll:${location.hash || "#dashboard"}`, String(window.scrollY));
    } catch {
      /* ignore */
    }
    const hash = toHash(next);
    if (location.hash !== hash) history.pushState(null, "", hash || location.pathname + location.search);
    setRoute(next);
    setDrawer(false);
    const saved = ((): number | null => {
      try {
        const v = sessionStorage.getItem(`walkcast:scroll:${hash || "#dashboard"}`);
        return v ? Number(v) : null;
      } catch {
        return null;
      }
    })();
    window.scrollTo({ top: saved ?? 0, behavior: "auto" });
  };

  const reduced = useReducedMotion();
  const routeKey = `${route.view}:${"dir" in route ? route.dir : ""}:${"base" in route ? route.base : ""}:${"cand" in route ? route.cand : ""}`;
  const active = route.view === "run" || route.view === "compare" ? "runs" : route.view;
  const refresh = async () => {
    const next = await loadIndex();
    setIndex(next);
    return next;
  };

  const sidebar = <Sidebar active={active} index={index} me={me} go={go} onClose={() => setDrawer(false)} closable={drawer} />;

  return (
    <I18nProvider>
    <ExhibitProvider>
      <div className="relative min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
        <DotGrid className="opacity-40" />
        <div className="hidden lg:block">
          <div className="sticky top-0 h-dvh">{sidebar}</div>
        </div>

        <AnimatePresence>
          {drawer && (
            <>
              <motion.button
                type="button"
                aria-label="Close menu"
                className="fixed inset-0 z-40 bg-black/60 lg:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setDrawer(false)}
              />
              <motion.div
                className="fixed inset-y-0 left-0 z-50 w-[272px] lg:hidden"
                initial={reduced ? false : { x: -280 }}
                animate={{ x: 0 }}
                exit={reduced ? undefined : { x: -280 }}
                transition={{ type: "spring", stiffness: 420, damping: 40 }}
              >
                {sidebar}
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur-md" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
            <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
              <button
                type="button"
                className="-ml-1 inline-flex h-9 items-center justify-center rounded-full border border-line px-3 text-ink-2 hover:bg-panel-2 lg:hidden"
                onClick={() => setDrawer(true)}
                aria-label="Open menu"
              >
                <span className="text-[13px] font-medium">Menu</span>
              </button>
              <div className="min-w-0 flex-1">
                <Breadcrumbs route={route} go={go} />
              </div>
              {route.view !== "dashboard" && route.view !== "record" && !isSnapshot && (
                <div className="hidden w-[min(420px,40vw)] md:block">
                  <RecordBar compact onRecord={(url) => go({ view: "record", url })} />
                </div>
              )}
              {index && (
                <span className="hidden font-mono text-[11px] text-ink-3 xl:inline" title="When the data on this page was read">
                  {isSnapshot ? "snapshot" : "live"} · {ago(Date.parse(index.generatedAt))}
                </span>
              )}
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1320px] px-4 pb-20 pt-6 sm:px-6 sm:pt-8">
            <span className="sr-only" aria-live="polite">
              {TITLES[route.view]}
            </span>
            <div key={routeKey}>
                {error && <LoadError error={error} />}
                {!index && !error && <Loading />}
                {index && route.view === "dashboard" && <Dashboard index={index} me={me} go={go} />}
                {index && route.view === "runs" && <Runs index={index} go={go} />}
                {index && route.view === "fixtures" && <Fixtures index={index} go={go} />}
                {index && route.view === "experiments" && <Experiments index={index} />}
                {index && route.view === "run" && <RunView dir={route.dir} index={index} go={go} />}
                {index && route.view === "simulator" && <Simulator index={index} go={go} refresh={refresh} />}
                {index && route.view === "record" && <Record index={index} refresh={refresh} initialUrl={route.url} go={go} />}
                {index && route.view === "library" && <Library index={index} dir={route.dir} go={go} refresh={refresh} />}
                {route.view === "settings" && <Settings me={me} />}
                {route.view === "schedules" && <Schedules />}
                {index && route.view === "compare" && <Compare base={route.base} cand={route.cand} index={index} go={go} />}
                {index && route.view === "mobile" && <Mobile index={index} go={go} refresh={refresh} />}
            </div>
          </main>
        </div>
      </div>
      <AnalyticsTracker route={route.view} path={location.pathname + location.hash} />
    </ExhibitProvider>
    </I18nProvider>
  );
}

function Sidebar({
  active,
  index,
  me,
  go,
  onClose,
  closable,
}: {
  active: Route["view"];
  index: LabIndex | null;
  me: Me | null;
  go: (r: Route) => void;
  onClose: () => void;
  closable: boolean;
}) {
  return (
    <nav aria-label="Workspaces" className="flex h-full flex-col border-r border-line bg-panel-2" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="flex h-14 items-center justify-between gap-2 px-4">
        <button type="button" onClick={() => go({ view: "dashboard" })} className="flex items-center gap-2.5 rounded-lg">
          <Mark />
          <span className="text-[16px] font-semibold tracking-tight">Walkcast</span>
        </button>
        {closable && (
          <button type="button" onClick={onClose} aria-label="Close menu" className="inline-flex h-8 items-center justify-center rounded-full px-2.5 text-ink-3 hover:bg-panel-2 lg:hidden">
            <span className="text-[12.5px]">Close</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {WORKSPACES.map((ws) => (
          <div key={ws.name} className="mt-4 first:mt-2">
            <div className="px-2.5 pb-1.5 text-[11.5px] font-medium text-ink-3">{ws.name}</div>
            <ul className="grid gap-0.5">
              {ws.items.map((n) => {
                const on = active === n.view;
                const count = index && n.count ? n.count(index) : null;
                return (
                  <li key={n.view}>
                    <button
                      type="button"
                      onClick={() => go({ view: n.view } as Route)}
                      aria-current={on ? "page" : undefined}
                      className={cn(
                        "relative flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors",
                        on ? "bg-panel text-ink shadow-[inset_0_0_0_1px_var(--line)]" : "text-ink-2 hover:bg-panel-3/60 hover:text-ink",
                      )}
                    >
                      {on && <span className="absolute inset-y-2 left-0 w-0.5 bg-signal" aria-hidden />}
                      <span className="truncate">{n.label}</span>
                      {count !== null && count > 0 && <span className="ml-auto font-mono text-[11px] text-ink-3">{count}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-line p-3">
        <button
          type="button"
          onClick={() => go({ view: "settings" })}
          aria-current={active === "settings" ? "page" : undefined}
          className={cn(
            "flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors",
            active === "settings" ? "bg-panel text-ink shadow-[inset_0_0_0_1px_var(--line)]" : "text-ink-2 hover:bg-panel-3/60 hover:text-ink",
          )}
        >
          Settings
        </button>
        <div className="mt-2 flex min-w-0 items-center gap-2 px-1">
          <div className="min-w-0 flex-1">
            <Account me={me} />
          </div>
          <ThemeToggle className="shrink-0" />
        </div>
      </div>
    </nav>
  );
}

function Account({ me }: { me: Me | null }) {
  if (isSnapshot) return <span className="text-[12.5px] text-ink-3">Snapshot</span>;
  if (me?.user) {
    const name = me.user.name || me.user.email;
    return (
      <span className="flex min-w-0 items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-signal-soft text-[12px] font-semibold text-signal">{name.slice(0, 1).toUpperCase()}</span>
        <span className="min-w-0 truncate text-[12.5px] text-ink-2" title={me.user.email}>
          {name}
        </span>
        <a href="/auth/logout" title="Sign out" aria-label="Sign out" className="inline-flex h-7 shrink-0 items-center justify-center rounded-md px-1.5 text-ink-3 hover:bg-panel-2 hover:text-ink">
          <span className="text-[12px]">Sign out</span>
        </a>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-[12.5px]">
      <a href={`/login?next=${authNext()}`} className="whitespace-nowrap rounded-full px-2.5 py-1 text-ink-2 hover:bg-panel-3/60 hover:text-ink">
        Sign in
      </a>
      <a href={`/signup?next=${authNext()}`} className="whitespace-nowrap rounded-full bg-solid px-2.5 py-1 font-medium text-on-solid hover:brightness-95">
        Create account
      </a>
    </span>
  );
}

function LoadError({ error }: { error: string }) {
  const signedOut = /401/.test(error);
  return (
    <div className="mx-auto mt-10 grid max-w-md justify-items-center gap-3 text-center">
      <h1 className="text-[22px] font-semibold">{signedOut ? "Sign in to open your workspace" : "The workspace didn't load"}</h1>
      <p className="text-[14px] text-ink-2">{signedOut ? "Your walkthroughs and lab runs are tied to your account." : error}</p>
      {signedOut ? (
        <div className="flex gap-2">
          <a href={`/login?next=${authNext()}`} className="rounded-full bg-solid px-4 py-2 text-[13.5px] font-medium text-on-solid hover:brightness-95">
            Sign in
          </a>
          <a href={`/signup?next=${authNext()}`} className="rounded-full border border-line-strong px-4 py-2 text-[13.5px] hover:bg-panel-2">
            Create account
          </a>
        </div>
      ) : (
        <button type="button" onClick={() => location.reload()} className="rounded-full border border-line-strong px-4 py-2 text-[13.5px] hover:bg-panel-2">
          Try again
        </button>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading">
      <div className="h-9 w-72 skeleton" />
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="h-72 skeleton lg:col-span-7" />
        <div className="h-72 skeleton lg:col-span-5" />
      </div>
    </div>
  );
}

/** Where to send someone who signs in or registers: back to this dashboard view. */
function authNext(): string {
  return encodeURIComponent(`/app${location.hash}`);
}

/** The mark: a play button with a record light. */
function Mark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
      <rect x="0.5" y="0.5" width="25" height="25" rx="7.5" fill="var(--signal-strong)" />
      <path d="M10.2 8.4v9.2l7.2-4.6z" fill="#fff" />
      <circle cx="20.4" cy="5.6" r="2.6" fill="var(--rec)" stroke="var(--panel)" strokeWidth="1.2" />
    </svg>
  );
}
