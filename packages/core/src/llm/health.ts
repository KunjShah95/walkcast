/**
 * How each model provider has been answering: calls, failures and latency over a recent window.
 *
 * A provider going bad used to show up only as runs failing. Every live call through a concrete
 * backend is timed and counted here, per provider, so /api/metrics can say "openrouter: 40% of
 * calls failing, p95 9 s" before the next run starts. Replays and scripted runs never reach a
 * concrete backend, so they are not counted.
 *
 * Kept in memory, per process: on the desktop the worker and the server are one process; a
 * separate worker fleet reports what each of its own processes saw.
 */
import type { AgentRequest, AgentResponse, ModelBackend, StagehandParams, StagehandResult } from "./gateway.ts";

interface Sample {
  at: number;
  ms: number;
  ok: boolean;
  status: number | null;
  error: string | null;
}

/** Samples kept per provider: enough for a stable rate, small enough to forget an old outage. */
const KEEP = 500;
const samples = new Map<string, Sample[]>();

export function recordCall(provider: string, sample: Sample): void {
  const list = samples.get(provider) ?? [];
  list.push(sample);
  if (list.length > KEEP) list.splice(0, list.length - KEEP);
  samples.set(provider, list);
}

export interface ProviderHealth {
  provider: string;
  calls: number;
  failures: number;
  /** failures / calls, 0..1. */
  errorRate: number;
  p50Ms: number | null;
  p95Ms: number | null;
  /** "degraded" past 20% failures, "down" past 80%, with at least 5 calls in the window. */
  state: "ok" | "degraded" | "down" | "idle";
  lastError: { at: string; status: number | null; message: string } | null;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

/** Every provider seen in the last `windowMs`, worst first. */
export function providerHealth(windowMs: number, now = Date.now()): ProviderHealth[] {
  const out: ProviderHealth[] = [];
  for (const [provider, list] of samples) {
    const recent = list.filter((s) => now - s.at <= windowMs);
    if (recent.length === 0) continue;
    const failures = recent.filter((s) => !s.ok);
    const latencies = recent.filter((s) => s.ok).map((s) => s.ms).sort((a, b) => a - b);
    const errorRate = failures.length / recent.length;
    const last = failures.at(-1);
    out.push({
      provider,
      calls: recent.length,
      failures: failures.length,
      errorRate: Math.round(errorRate * 1000) / 1000,
      p50Ms: percentile(latencies, 50),
      p95Ms: percentile(latencies, 95),
      state: recent.length < 5 ? (failures.length === recent.length ? "degraded" : "ok") : errorRate > 0.8 ? "down" : errorRate > 0.2 ? "degraded" : "ok",
      lastError: last ? { at: new Date(last.at).toISOString(), status: last.status, message: last.error ?? "" } : null,
    });
  }
  const rank = { down: 0, degraded: 1, ok: 2, idle: 3 } as const;
  return out.sort((a, b) => rank[a.state] - rank[b.state] || b.errorRate - a.errorRate);
}

/** Forget everything (tests). */
export function resetProviderHealth(): void {
  samples.clear();
}

/** `backend`, with every call it makes counted against `provider`. */
export function measured(backend: ModelBackend, provider: string): ModelBackend {
  const time = async <T>(call: () => Promise<T>): Promise<T> => {
    const started = performance.now();
    try {
      const result = await call();
      recordCall(provider, { at: Date.now(), ms: Math.round(performance.now() - started), ok: true, status: null, error: null });
      return result;
    } catch (e) {
      const status = typeof (e as { status?: unknown }).status === "number" ? (e as { status: number }).status : null;
      const message = (e instanceof Error ? e.message : String(e)).split("\n")[0]!.slice(0, 200);
      recordCall(provider, { at: Date.now(), ms: Math.round(performance.now() - started), ok: false, status, error: message });
      throw e;
    }
  };
  return {
    name: backend.name,
    agent: (request: AgentRequest): Promise<AgentResponse> => time(() => backend.agent(request)),
    stagehand: (params: StagehandParams): Promise<StagehandResult> => time(() => backend.stagehand(params)),
  };
}
