import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Store } from "./store/index.ts";

export interface Schedule {
  id: string;
  url: string;
  interval: string;
  intervalMs: number;
  authorized: boolean;
  createdAt: string;
  lastRunAt: string | null;
}

function labDir(root: string): string {
  const d = join(root, ".lab");
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  return d;
}

export function schedulesPath(root: string): string {
  // Prefer the explicitly named file at the project root.
  return join(root, "schedules.json");
}

function readRaw(root: string): unknown {
  const p = schedulesPath(root);
  if (!existsSync(p)) return [];
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return []; }
}

export function loadSchedules(root: string): Schedule[] {
  const v = readRaw(root);
  let arr: unknown[] = [];
  if (Array.isArray(v)) arr = v;
  else if (v && typeof v === "object" && Array.isArray((v as any).schedules)) arr = (v as any).schedules;
  const out: Schedule[] = [];
  for (const x of arr) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const url = typeof o.url === "string" ? o.url : "";
    if (!url) continue;
    const intervalMs = typeof o.intervalMs === "number" && Number.isFinite(o.intervalMs) && o.intervalMs > 0 ? Math.trunc(o.intervalMs) : parseInterval(o.interval ?? o.cron ?? o.every);
    out.push({
      id: typeof o.id === "string" ? o.id : randomUUID(),
      url,
      interval: typeof o.interval === "string" ? o.interval : (typeof o.cron === "string" ? o.cron : `${intervalMs}ms`),
      intervalMs,
      authorized: o.authorized === true,
      createdAt: typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString(),
      lastRunAt: typeof o.lastRunAt === "string" ? o.lastRunAt : null,
    });
  }
  return out;
}

export function saveSchedules(root: string, schedules: Schedule[]): void {
  writeFileSync(schedulesPath(root), JSON.stringify(schedules, null, 2), { mode: 0o600 });
}

export function addSchedule(root: string, input: { url: string; interval?: unknown; intervalMs?: unknown; authorized?: boolean }): Schedule {
  const url = String(input.url ?? "").trim();
  let u: URL;
  try { u = new URL(url); } catch { throw new Error("invalid url"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("invalid url");
  const intervalMs = input.intervalMs !== undefined ? parseInterval(input.intervalMs) : parseInterval(input.interval);
  const sched: Schedule = {
    id: randomUUID(),
    url: u.toString(),
    interval: typeof input.interval === "string" ? input.interval : `${intervalMs}ms`,
    intervalMs,
    authorized: input.authorized === true,
    createdAt: new Date().toISOString(),
    lastRunAt: null,
  };
  const list = loadSchedules(root);
  list.push(sched);
  saveSchedules(root, list);
  return sched;
}

export function removeSchedule(root: string, id: string): Schedule[] {
  const list = loadSchedules(root).filter((s) => s.id !== id);
  saveSchedules(root, list);
  return list;
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
    // cron-ish: */N units
    const parts = s.split(/\s+/);
    if (parts.length >= 5) {
      const minute = parts[0]!;
      const mm = /^\*\/(\d+)$/.exec(minute);
      if (mm) return Math.max(60000, Number(mm[1]) * 60000);
      if (minute === "*") return 60000;
      // hourly/day shortcuts via standard cron not fully parsed; default 1h
      return 3600000;
    }
    const lower = s.toLowerCase();
    if (lower === "@hourly") return 3600000;
    if (lower === "@daily") return 86400000;
    if (lower === "@weekly") return 7 * 86400000;
    if (lower === "@minutely") return 60000;
  }
  return 3600000;
}

export function startScheduler(root: string, store: Store, opts: { tickMs?: number } = {}): { stop: () => void } {
  const tickMs = opts.tickMs ?? Number(process.env.LAB_SCHEDULER_INTERVAL_MS ?? 5000);
  let stopped = false;
  const runDue = async () => {
    if (stopped) return;
    const schedules = loadSchedules(root);
    const now = Date.now();
    let changed = false;
    for (const sch of schedules) {
      if (!sch.authorized) continue;
      const last = sch.lastRunAt ? Date.parse(sch.lastRunAt) : 0;
      if (Number.isFinite(last) && now - last < sch.intervalMs) continue;
      try {
        await store.enqueueLimited({ kind: "record", owner: null, input: { url: sch.url, maxPages: 8, authorized: true, blockPrivate: false }, secret: null }, 100);
        sch.lastRunAt = new Date().toISOString();
        changed = true;
      } catch {
        // ignore
      }
    }
    if (changed) saveSchedules(root, schedules);
  };
  const timer = setInterval(() => { void runDue(); }, tickMs);
  timer.unref?.();
  void runDue();
  return { stop() { stopped = true; clearInterval(timer); } };
}
