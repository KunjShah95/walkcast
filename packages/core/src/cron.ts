/**
 * Five-field cron (minute hour day-of-month month day-of-week), in the server's local time.
 *
 * Schedules used to read only the minute field and treat every other expression as "hourly", so
 * `0 9 * * 1` (Mondays at nine) ran 24 times a day. This reads all five fields and answers the
 * one question a scheduler asks: when does it fire next.
 *
 * Supported per field: `*`, numbers, `a-b` ranges, `,` lists and `/n` steps (on `*` or a range).
 * Day of week is 0-7 (0 and 7 are Sunday). As in classic cron, when both day fields are
 * restricted a day matches if either does.
 */

export interface Cron {
  minutes: Set<number>;
  hours: Set<number>;
  days: Set<number>;
  months: Set<number>;
  weekdays: Set<number>;
  /** Whether each day field was restricted (not `*`), for the either-day rule. */
  daysRestricted: boolean;
  weekdaysRestricted: boolean;
}

const MACROS: Record<string, string> = {
  "@hourly": "0 * * * *",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@weekly": "0 0 * * 0",
  "@monthly": "0 0 1 * *",
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
};

function field(raw: string, min: number, max: number, name: string): Set<number> {
  const out = new Set<number>();
  for (const part of raw.split(",")) {
    const m = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part);
    if (!m) throw new Error(`cron: can't read the ${name} field "${raw}"`);
    const step = m[4] ? Number(m[4]) : 1;
    const lo = m[1] === "*" ? min : Number(m[2]);
    const hi = m[1] === "*" ? max : m[3] !== undefined ? Number(m[3]) : m[4] ? max : lo;
    if (step < 1 || lo < min || hi > max || lo > hi) throw new Error(`cron: the ${name} field "${raw}" is out of range (${min}-${max})`);
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

/** Whether `expr` looks like cron (five fields or an @macro), as opposed to "60m". */
export function looksLikeCron(expr: string): boolean {
  const s = expr.trim().toLowerCase();
  return s in MACROS || s.split(/\s+/).length === 5;
}

export function parseCron(expr: string): Cron {
  const s = expr.trim().toLowerCase();
  const parts = (MACROS[s] ?? s).split(/\s+/);
  if (parts.length !== 5) throw new Error(`cron: "${expr}" needs five fields (minute hour day month weekday)`);
  const [mi, ho, dom, mo, dow] = parts as [string, string, string, string, string];
  const weekdays = field(dow, 0, 7, "weekday");
  if (weekdays.has(7)) weekdays.add(0);
  return {
    minutes: field(mi, 0, 59, "minute"),
    hours: field(ho, 0, 23, "hour"),
    days: field(dom, 1, 31, "day"),
    months: field(mo, 1, 12, "month"),
    weekdays,
    daysRestricted: dom !== "*",
    weekdaysRestricted: dow !== "*",
  };
}

function dayMatches(c: Cron, d: Date): boolean {
  const dom = c.days.has(d.getDate());
  const dow = c.weekdays.has(d.getDay());
  if (c.daysRestricted && c.weekdaysRestricted) return dom || dow;
  if (c.daysRestricted) return dom;
  if (c.weekdaysRestricted) return dow;
  return true;
}

/** The first minute strictly after `after` that `c` fires on, or null within five years. */
export function nextCronTime(c: Cron, after: Date): Date | null {
  const t = new Date(after.getTime());
  t.setSeconds(0, 0);
  t.setMinutes(t.getMinutes() + 1);
  const limit = after.getTime() + 5 * 366 * 86_400_000;
  while (t.getTime() <= limit) {
    if (!c.months.has(t.getMonth() + 1)) {
      t.setMonth(t.getMonth() + 1, 1);
      t.setHours(0, 0, 0, 0);
      continue;
    }
    if (!dayMatches(c, t)) {
      t.setDate(t.getDate() + 1);
      t.setHours(0, 0, 0, 0);
      continue;
    }
    if (!c.hours.has(t.getHours())) {
      t.setHours(t.getHours() + 1, 0, 0, 0);
      continue;
    }
    if (!c.minutes.has(t.getMinutes())) {
      t.setMinutes(t.getMinutes() + 1, 0, 0);
      continue;
    }
    return t;
  }
  return null;
}

/** The shortest gap between two firings over the next few, for "no faster than every N" checks. */
export function cronMinGapMs(c: Cron, from = new Date()): number {
  let prev = nextCronTime(c, from);
  let gap = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 8 && prev; i++) {
    const next = nextCronTime(c, prev);
    if (!next) break;
    gap = Math.min(gap, next.getTime() - prev.getTime());
    prev = next;
  }
  return Number.isFinite(gap) ? gap : 365 * 86_400_000;
}

/**
 * Whether a schedule written as `expr` is due at `now`, given when it last ran (or was made).
 * Due when its next firing after that moment has come.
 */
export function cronDue(expr: string, since: Date, now: Date): boolean {
  const next = nextCronTime(parseCron(expr), since);
  return next !== null && next.getTime() <= now.getTime();
}

/**
 * Whether a schedule is due at `now`. Cron schedules fire at their next time after the last run
 * (or, before the first run, after they were made); interval schedules run at once, then every
 * interval.
 */
export function scheduleDue(s: { interval: string; intervalMs: number; lastRunAt: string | null; createdAt: string }, now = new Date()): boolean {
  if (looksLikeCron(s.interval)) {
    try {
      return cronDue(s.interval, new Date(s.lastRunAt ?? s.createdAt), now);
    } catch {
      return false; // unreadable cron is refused when it is made; an old row must not fire hourly
    }
  }
  return !s.lastRunAt || now.getTime() - Date.parse(s.lastRunAt) >= s.intervalMs;
}
