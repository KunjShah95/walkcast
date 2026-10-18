import type { Store } from "../store/types.ts";
import { log } from "./log.ts";

/**
 * The scale-out signal from docs/SCALING.md §7: every `intervalMs` emit `queue.stats` (depth and
 * the oldest queued job's wait) as a log line a metric filter can turn into a CloudWatch metric,
 * and `queue.alarm` at warn level while the oldest job has waited longer than `alarmMs`. The
 * alarm fires on the transition and then at most once per `alarmMs`, so it pages, not floods.
 */
export interface QueueMonitorOptions {
  intervalMs?: number;
  alarmMs?: number;
  onAlarm?: (stats: { depth: number; oldestQueuedMs: number }) => void;
}

export function alarmState(oldestQueuedMs: number, alarmMs: number): "ok" | "alarm" {
  return oldestQueuedMs > alarmMs ? "alarm" : "ok";
}

export function startQueueMonitor(store: Store, o: QueueMonitorOptions = {}): { stop: () => void; check: () => Promise<void> } {
  const intervalMs = o.intervalMs ?? Number(process.env.LAB_QUEUE_STATS_MS ?? 30_000);
  const alarmMs = o.alarmMs ?? queueAlarmMs();
  let lastAlarm = 0;
  let alarming = false;
  const check = async () => {
    try {
      const s = await store.queueStats();
      log.info("queue.stats", { depth: s.depth, oldest_queued_ms: s.oldestQueuedMs });
      const state = alarmState(s.oldestQueuedMs, alarmMs);
      if (state === "alarm" && (!alarming || Date.now() - lastAlarm >= alarmMs)) {
        lastAlarm = Date.now();
        log.warn("queue.alarm", { depth: s.depth, oldest_queued_ms: s.oldestQueuedMs, threshold_ms: alarmMs, hint: "add workers (docs/SCALING.md §4.1)" });
        o.onAlarm?.(s);
      } else if (state === "ok" && alarming) log.info("queue.alarm_cleared", { depth: s.depth });
      alarming = state === "alarm";
    } catch (e) {
      log.warn("queue.stats_failed", { error: String(e) });
    }
  };
  const timer = setInterval(() => { void check(); }, intervalMs);
  timer.unref?.();
  return { stop: () => clearInterval(timer), check };
}

/** LAB_QUEUE_ALARM_MS, default 5 minutes. */
export function queueAlarmMs(): number {
  const n = Number(process.env.LAB_QUEUE_ALARM_MS ?? 5 * 60_000);
  return Number.isFinite(n) && n > 0 ? n : 5 * 60_000;
}
