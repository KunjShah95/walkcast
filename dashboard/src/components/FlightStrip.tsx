import { ms } from "../lib/format.ts";
import type { ModelCallEvent, NetworkEvent, StepEvent, TraceEvent } from "../lib/types.ts";

export function toolFamily(tool: string): "navigate" | "observe" | "act" | "wait" | "read" {
  if (/goto|navigate/.test(tool)) return "navigate";
  if (/observe/.test(tool)) return "observe";
  if (/wait|settle|quiet/i.test(tool)) return "wait";
  if (/fetch|readValue/.test(tool)) return "read";
  return "act";
}

export const FAMILY_COLOR: Record<ReturnType<typeof toolFamily>, string> = {
  navigate: "var(--signal)",
  observe: "var(--ink-3)",
  act: "var(--ink)",
  wait: "var(--warn)",
  read: "var(--ink-2)",
};

/**
 * The whole run at a glance, drawn to one time scale: tool steps on the top lane, model calls
 * in the middle, network on the bottom. Evidence steps are marked with the highlighter.
 */
export function FlightStrip({ events, evidence, onJump }: { events: TraceEvent[]; evidence: Set<number>; onJump: (stepId: number) => void }) {
  const steps = events.filter((e): e is StepEvent => e.type === "step");
  const models = events.filter((e): e is ModelCallEvent => e.type === "model");
  const requests = events.filter((e): e is NetworkEvent => e.type === "request");
  const end = Math.max(1, ...steps.map((s) => s.endedAt), ...models.map((m) => m.at), ...requests.map((r) => r.respondedAt ?? r.at));
  const W = 1000;
  const x = (t: number) => (t / end) * W;
  const ticks = niceTicks(end);

  return (
    <figure className="min-w-0">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} 92`} className="block w-full min-w-[560px]" role="img" aria-label="Run timeline overview">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={6} y2={74} stroke="var(--line)" strokeWidth={1} />
              <text x={Math.min(x(t) + 3, W - 40)} y={88} fontSize={10} fill="var(--ink-3)" fontFamily="var(--font-mono)">
                {ms(t)}
              </text>
            </g>
          ))}
          <text x={2} y={14} fontSize={9} fill="var(--ink-3)" fontFamily="var(--font-mono)">
            STEPS
          </text>
          {steps.map((s) => {
            const w = Math.max(3, x(s.endedAt) - x(s.startedAt));
            const isEvidence = evidence.has(s.stepId);
            return (
              <g key={s.stepId} className="cursor-pointer" onClick={() => onJump(s.stepId)}>
                <title>{`#${s.stepId} ${s.tool} · ${ms(s.endedAt - s.startedAt)}${s.error ? ` · ${s.error}` : ""}`}</title>
                {isEvidence && <rect x={x(s.startedAt) - 2} y={16} width={w + 4} height={22} rx={3} fill="var(--highlight)" />}
                <rect x={x(s.startedAt)} y={19} width={w} height={16} rx={2} fill={s.error ? "var(--fail)" : FAMILY_COLOR[toolFamily(s.tool)]} opacity={0.9} />
              </g>
            );
          })}
          <text x={2} y={51} fontSize={9} fill="var(--ink-3)" fontFamily="var(--font-mono)">
            MODEL
          </text>
          {models.map((m, i) => (
            <circle key={i} cx={x(m.at)} cy={50} r={3.5} fill={(m.input as { channel?: string })?.channel === "stagehand" ? "var(--ink-3)" : "var(--signal)"}>
              <title>{`${(m.input as { channel?: string })?.channel ?? "model"} call · ${m.latencyMs} ms`}</title>
            </circle>
          ))}
          <text x={2} y={68} fontSize={9} fill="var(--ink-3)" fontFamily="var(--font-mono)">
            NET
          </text>
          {requests.map((r, i) => {
            const bad = (r.status ?? 0) >= 400 || r.failure !== undefined;
            const write = r.method !== "GET";
            return (
              <g key={i} className="cursor-pointer" onClick={() => onJump(r.stepId)}>
                <title>{`${r.method} ${pathOnly(r.url)} → ${r.status ?? r.failure ?? "pending"}`}</title>
                <rect
                  x={x(r.at)}
                  y={write ? 58 : 62}
                  width={Math.max(2, x(r.respondedAt ?? r.at) - x(r.at))}
                  height={write ? 12 : 6}
                  rx={1}
                  fill={bad ? "var(--fail)" : write ? "var(--ink)" : "var(--ink-3)"}
                />
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10.5px] text-ink-3">
        {(Object.keys(FAMILY_COLOR) as (keyof typeof FAMILY_COLOR)[]).map((f) => (
          <span key={f} className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-sm" style={{ background: FAMILY_COLOR[f] }} />
            {f}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-fail" />
          error / 4xx–5xx
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-highlight" />
          evidence
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-2 rounded-full bg-signal" /> agent decision
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-2 rounded-full bg-ink-3" /> Stagehand resolution
        </span>
        <span>tall net bars are writes</span>
      </figcaption>
    </figure>
  );
}

function niceTicks(end: number): number[] {
  const steps = [100, 250, 500, 1000, 2000, 5000, 10000, 20000, 30000, 60000];
  const step = steps.find((s) => end / s <= 6) ?? 60000;
  const out: number[] = [];
  for (let t = 0; t <= end; t += step) out.push(t);
  return out;
}

export function pathOnly(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
