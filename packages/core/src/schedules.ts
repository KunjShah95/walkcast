import { existsSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { cronMinGapMs, looksLikeCron, parseCron } from "./cron.ts";
import { log } from "./ops/log.ts";
import type { Schedule, Store } from "./store/index.ts";

export type { Schedule };

/**
 * Recurring recordings. Schedules live in the store, and `claimDueSchedules` hands each due one
 * to exactly one instance, so running the scheduler on every web instance is safe: a schedule
 * fires once per interval no matter how many processes are ticking.
 */

/** Build a schedule from user input; throws on an unusable URL. */
export function newSchedule(owner: string | null, input: { url?: unknown; interval?: unknown; intervalMs?: unknown; authorized?: unknown }): Schedule {
  const raw = String(input.url ?? "").trim();
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("invalid url"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("invalid url");
  const intervalMs = input.intervalMs !== undefined ? parseInterval(input.intervalMs) : parseInterval(input.interval);
  return {
    id: randomUUID(),
    owner,
    url: u.toString(),
    interval: typeof input.interval === "string" && input.interval.trim() ? input.interval.trim() : `${intervalMs}ms`,
    intervalMs,
    authorized: input.authorized === true,
    createdAt: new Date().toISOString(),
    lastRunAt: null,
  };
}

export function parseInterval(input: unknown): number {
  if (typeof input === "number" && Number.isFinite(input) && input > 0) {
    return input >= 1000 ? Math.trunc(input) : Math.trunc(input * 1000);
  }
  if (typeof input === "string") {
    const s = input.trim();
    if (!s) return 3600000;
    const m = /^(\d+(?:\.\d+)?)\s*(ms|s|sec|m|min|h|hr|d|day)s?$/i.exec(s);
    if (m) {
      const n = Number(m[1]!);
      const unit = m[2]!.toLowerCase();
      const mult = unit === "ms" ? 1 : unit.startsWith("s") ? 1000 : unit.startsWith("m") ? 60000 : unit.startsWith("h") ? 3600000 : 86400000;
      return Math.max(1000, Math.trunc(n * mult));
    }
    if (s.toLowerCase() === "@minutely") return 60000;
    // Cron fires on the calendar (cron.ts, scheduleDue); its interval is the shortest gap between
    // two firings, which is what the "no faster than every 15 minutes" guard measures. A cron the
    // parser cannot read throws, and the caller answers 400 instead of guessing hourly.
    if (looksLikeCron(s)) return cronMinGapMs(parseCron(s));
    throw new Error(`Can't read the interval "${s}". Use a duration like 30m, 6h or 1d, or five-field cron like 0 9 * * 1.`);
  }
  return 3600000;
}

export interface SchedulerOptions {
  tickMs?: number;
  /** Block private addresses in the scheduled recording (true whenever the server is exposed). */
  blockPrivate?: boolean;
  /** Ceiling on queued+running jobs per owner that a schedule may add to. */
  maxActive?: number;
  /** Called after a scheduled job is enqueued (e.g. to poke an in-process worker). */
  onEnqueued?: () => void;
}

export function startScheduler(store: Store, opts: SchedulerOptions = {}): { stop: () => void } {
  const tickMs = opts.tickMs ?? Number(process.env.LAB_SCHEDULER_INTERVAL_MS ?? 5000);
  const maxActive = opts.maxActive ?? Number(process.env.LAB_SCHEDULE_MAX_ACTIVE ?? 3);
  let stopped = false;
  let running = false;
  const runDue = async () => {
    if (stopped || running) return;
    running = true;
    try {
      // At-most-once per interval: the schedule is stamped before its job is enqueued, so a crash
      // in between skips one run rather than doubling it. Right trade for change detection.
      const due = await store.claimDueSchedules(20);
      for (const sch of due) {
        const job = await store.enqueueLimited(
          { kind: "record", owner: sch.owner, input: { url: sch.url, maxPages: 8, authorized: true, blockPrivate: opts.blockPrivate ?? false, schedule: sch.id } },
          maxActive,
        ).catch((e: unknown) => { log.warn("schedule.enqueue_failed", { schedule: sch.id, error: String(e) }); return null; });
        if (job) {
          log.info("schedule.enqueued", { schedule: sch.id, job: job.id });
          opts.onEnqueued?.();
        } else log.warn("schedule.skipped", { schedule: sch.id, reason: "owner at active-job limit" });
      }
    } catch (e) {
      log.warn("schedule.tick_failed", { error: String(e) });
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => { void runDue(); }, tickMs);
  timer.unref?.();
  void runDue();
  return { stop() { stopped = true; clearInterval(timer); } };
}

/**
 * One-time import of the pre-store `schedules.json` (project root) into the store, owned by
 * `owner` (the local user on desktop). The file is renamed so the import never repeats.
 */
export async function importLegacySchedules(root: string, store: Store, owner: string | null = null): Promise<number> {
  const p = join(root, "schedules.json");
  if (!existsSync(p)) return 0;
  let arr: unknown[] = [];
  try {
    const v = JSON.parse(readFileSync(p, "utf8")) as unknown;
    arr = Array.isArray(v) ? v : Array.isArray((v as { schedules?: unknown[] })?.schedules) ? (v as { schedules: unknown[] }).schedules : [];
  } catch { /* unreadable: rename below so it doesn't block every start */ }
  let n = 0;
  for (const x of arr) {
    const o = (x ?? {}) as Record<string, unknown>;
    try {
      const s = newSchedule(owner, { url: o.url, interval: o.interval ?? o.cron ?? o.every, intervalMs: o.intervalMs, authorized: o.authorized });
      if (typeof o.lastRunAt === "string") s.lastRunAt = o.lastRunAt;
      await store.addSchedule(s);
      n++;
    } catch { /* skip invalid rows */ }
  }
  try { renameSync(p, `${p}.imported`); } catch { /* best effort */ }
  return n;
}
