import { Bot, Brain, Compass, Database, DoorClosed, Flag, Globe, LayoutPanelTop, Server, ShieldCheck, Sparkles, X, Zap } from "lucide-react";
import type { ComponentType } from "react";
import { FAULT_INFO, FAULT_NODE } from "../lib/agents.ts";
import { cn } from "../lib/format.ts";

export type NodeStatus = "idle" | "active" | "warn" | "fail" | "pass";

interface NodeDef {
  id: string;
  x: number;
  y: number;
  title: string;
  icon: ComponentType<{ className?: string }>;
}

/** The agent pipeline: decision side on the left, the application under test on the right. */
const NODES: NodeDef[] = [
  { id: "task", x: 80, y: 220, title: "Task", icon: Flag },
  { id: "model", x: 250, y: 80, title: "Model", icon: Brain },
  { id: "agent", x: 250, y: 220, title: "Agent loop", icon: Bot },
  { id: "stagehand", x: 425, y: 220, title: "Stagehand act()", icon: Sparkles },
  { id: "browser", x: 600, y: 220, title: "Browser", icon: Compass },
  { id: "page", x: 775, y: 220, title: "Page", icon: LayoutPanelTop },
  { id: "gateway", x: 775, y: 370, title: "Gateway", icon: Globe },
  { id: "auth", x: 600, y: 370, title: "Session", icon: DoorClosed },
  { id: "api", x: 425, y: 370, title: "Leads API", icon: Server },
  { id: "db", x: 250, y: 370, title: "Database", icon: Database },
  { id: "oracle", x: 80, y: 370, title: "Oracle", icon: ShieldCheck },
];

const W = 130;
const H = 52;
const pos = Object.fromEntries(NODES.map((n) => [n.id, n]));

/** Edge geometry, keyed "from>to". Reverse directions reuse the same path backwards. */
function edgePath(from: string, to: string): string | null {
  const a = pos[from];
  const b = pos[to];
  if (!a || !b) return null;
  if (from === "agent" && to === "oracle") return `M ${a.x - 30} ${a.y + H / 2} C ${a.x - 30} ${a.y + 80}, ${b.x} ${b.y - 80}, ${b.x} ${b.y - H / 2}`;
  if (from === "agent" && to === "browser") return `M ${a.x + W / 2} ${a.y + 10} C ${a.x + 120} ${a.y + 60}, ${b.x - 120} ${b.y + 60}, ${b.x - W / 2} ${b.y + 10}`;
  const horizontal = a.y === b.y;
  const sx = horizontal ? a.x + Math.sign(b.x - a.x) * (W / 2) : a.x;
  const sy = horizontal ? a.y : a.y + Math.sign(b.y - a.y) * (H / 2);
  const ex = horizontal ? b.x - Math.sign(b.x - a.x) * (W / 2) : b.x;
  const ey = horizontal ? b.y : b.y - Math.sign(b.y - a.y) * (H / 2);
  return `M ${sx} ${sy} L ${ex} ${ey}`;
}

function pathFor(edge: string): string | null {
  const [from, to] = edge.split(">");
  return edgePath(from!, to!) ?? (edgePath(to!, from!) ? reversePath(to!, from!) : null);
}

function reversePath(from: string, to: string): string | null {
  // Straight edges reverse trivially; curved ones are only drawn one way.
  const d = edgePath(from, to);
  if (!d || !d.includes(" L ")) return d;
  const [, sx, sy, ex, ey] = d.match(/M ([\d.-]+) ([\d.-]+) L ([\d.-]+) ([\d.-]+)/) ?? [];
  return `M ${ex} ${ey} L ${sx} ${sy}`;
}

const DRAWN = [
  "task>agent",
  "agent>model",
  "agent>stagehand",
  "stagehand>browser",
  "stagehand>model",
  "agent>browser",
  "browser>page",
  "page>gateway",
  "gateway>auth",
  "auth>api",
  "api>db",
  "agent>oracle",
  "db>oracle",
];

export interface Packet {
  id: number;
  edge: string;
  tone: "info" | "warn" | "fail" | "pass";
}

export function Pipeline({
  taskLabel,
  agentLabel,
  modelLabel,
  stagehand,
  faults,
  status,
  packets,
  highlight,
  onToggleFault,
}: {
  taskLabel: string;
  agentLabel: string;
  modelLabel: string;
  stagehand: boolean;
  faults: string[];
  status: Record<string, NodeStatus>;
  packets: Packet[];
  highlight: string | null;
  onToggleFault: (fault: string) => void;
}) {
  const subtitle: Record<string, string> = {
    task: taskLabel,
    model: modelLabel,
    agent: agentLabel,
    stagehand: stagehand ? "resolves elements" : "not used",
    browser: "Chrome",
    page: "MiniCRM pages",
    gateway: "edge proxy",
    auth: "cookie session",
    api: "leads endpoints",
    db: "leads + write ledger",
    oracle: "checks the records",
  };
  return (
    <svg viewBox="0 0 860 440" className="block h-auto w-full min-w-[680px]" role="group" aria-label="Agent pipeline: the agent and model on the left, the app under test on the right">
      <defs>
        <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--ink-3)" />
        </marker>
      </defs>
      <text x={20} y={140} className="fill-ink-3 font-mono text-[10px] uppercase tracking-[0.08em]">
        agent side
      </text>
      <text x={700} y={432} className="fill-ink-3 font-mono text-[10px] uppercase tracking-[0.08em]">
        app under test
      </text>
      {DRAWN.map((e) => {
        const d = pathFor(e);
        if (!d) return null;
        const dim = (!stagehand && e.includes("stagehand")) || (stagehand && e === "agent>browser");
        return <path key={e} d={d} fill="none" stroke="var(--line)" strokeWidth={dim ? 1 : 1.6} strokeDasharray={dim || e.includes("oracle") ? "4 4" : undefined} markerEnd={dim ? undefined : "url(#arrow)"} opacity={dim ? 0.5 : 1} />;
      })}
      {packets.map((p) => {
        const d = pathFor(p.edge);
        if (!d) return null;
        return (
          <circle
            key={p.id}
            r={5}
            className="packet"
            fill={p.tone === "fail" ? "var(--fail)" : p.tone === "warn" ? "var(--warn)" : p.tone === "pass" ? "var(--pass)" : "var(--signal)"}
            style={{ offsetPath: `path('${d}')` }}
          />
        );
      })}
      {NODES.map((n) => {
        const Icon = n.icon;
        const st = status[n.id] ?? "idle";
        const dim = n.id === "stagehand" && !stagehand;
        const nodeFaults = faults.filter((f) => FAULT_NODE[f] === n.id);
        const ring = st === "fail" ? "var(--fail)" : st === "warn" ? "var(--warn)" : st === "pass" ? "var(--pass)" : st === "active" ? "var(--signal)" : "var(--line)";
        return (
          <g key={n.id} opacity={dim ? 0.45 : 1}>
            <foreignObject x={n.x - W / 2} y={n.y - H / 2} width={W} height={H}>
              <div
                className={cn(
                  "flex h-full items-center gap-2 rounded-lg border-[1.5px] bg-panel px-2.5 transition-[border-color,box-shadow] duration-200",
                  highlight === n.id && "shadow-[0_0_0_4px_var(--highlight)]",
                )}
                style={{ borderColor: ring, boxShadow: st === "fail" ? "0 0 0 4px var(--fail-soft)" : st === "warn" ? "0 0 0 4px var(--warn-soft)" : undefined }}
              >
                <Icon className="size-4 shrink-0 text-ink-2" />
                <div className="min-w-0 leading-tight">
                  <div className="truncate font-display text-[13px] font-semibold">{n.title}</div>
                  <div className="truncate font-mono text-[9.5px] text-ink-3">{subtitle[n.id]}</div>
                </div>
              </div>
            </foreignObject>
            {nodeFaults.map((f, i) => (
              <foreignObject key={f} x={n.x - W / 2 + 4} y={n.y - H / 2 - 22 - i * 22} width={W + 30} height={20}>
                <button
                  type="button"
                  onClick={() => onToggleFault(f)}
                  title={`Remove fault: ${FAULT_INFO[f]?.what}`}
                  className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-highlight px-2 py-px font-mono text-[9.5px] font-semibold text-highlight-ink"
                >
                  <Zap className="size-2.5 shrink-0" /> {FAULT_INFO[f]?.name ?? f} <X className="size-2.5 shrink-0" />
                </button>
              </foreignObject>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
