import { type ReactNode, useState } from "react";
import type { Route } from "../App.tsx";

/** The one label every Lab empty state uses for the bundled scenarios. */
export const SIMULATOR_LABEL = "Explore Fault replay";

/** Real commands from `npm run lab -- --help` and docs/PLUGINS.md. */
const SNIPPET = `# 1. Register your agent as a plugin (see docs/PLUGINS.md):
#    .lab/plugins/my-agent.ts default-exports
#    definePlugin({ name: "my-agent", agents: [{ id: "my-agent", run }] })
# 2. Run it against a fault; a failure is saved as a fixture
npm run lab -- run --fault wrong-owner-from-stale-list --agent my-agent
# 3. Replay the saved fixtures: pass^k for each agent
npm run lab -- compare runs/_fixtures --agents v1,my-agent --trials 3`;

/**
 * A Lab page with nothing in it yet. The way in is your own agent, run from the command line;
 * the bundled scenarios are there to look at first, as the secondary action.
 */
export function ConnectAgentEmpty({ title, icon, children, go, extra }: { title: string; icon: ReactNode; children: ReactNode; go: (r: Route) => void; extra?: ReactNode }) {
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SNIPPET.split("\n").filter((l) => !l.startsWith("#")).join("\n"));
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
    setTimeout(() => setCopied("idle"), 1800);
  };
  return (
    <div className="grid justify-items-center gap-3 px-5 py-9 text-center">
      <span className="tile t-signal">{icon}</span>
      <h1 className="text-[15px] font-semibold text-ink">{title}</h1>
      <div className="max-w-[60ch] text-[13.5px] leading-relaxed text-ink-2">{children}</div>
      <div className="grid w-full max-w-[680px] gap-2 text-left">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold text-ink">Connect your agent</h2>
          <button
            type="button"
            onClick={() => void copy()}
            aria-live="polite"
            className="press inline-flex h-8 items-center rounded-full bg-solid px-3.5 text-[12.5px] font-medium text-on-solid hover:brightness-95"
          >
            {copied === "copied" ? "Copied" : copied === "failed" ? "Select the text to copy" : "Copy commands"}
          </button>
        </div>
        <pre className="overflow-x-auto rounded-[10px] bg-panel-2 px-3.5 py-3 font-mono text-[12px] leading-relaxed text-ink-2">
          <code>{SNIPPET}</code>
        </pre>
        <p className="text-[12.5px] text-ink-2">Runs, fixtures and experiments made from the command line in this folder show up here.</p>
      </div>
      {extra}
      <button
        type="button"
        onClick={() => go({ view: "simulator" })}
        className="press mt-1 inline-flex h-9 items-center rounded-full bg-panel-2 px-4 text-[13px] font-medium text-ink transition-colors hover:bg-panel-3"
      >
        {SIMULATOR_LABEL}
      </button>
    </div>
  );
}
