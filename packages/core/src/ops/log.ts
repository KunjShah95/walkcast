/**
 * One JSON object per line on stdout/stderr: what CloudWatch Logs (and most log pipelines) parse
 * without configuration. LAB_LOG=pretty prints a short human line instead (local use); LAB_LOG=off
 * silences it (tests).
 *
 * The last RECENT_MAX lines at or above the log level are also kept in memory (whatever LAB_LOG
 * says), so a diagnostics bundle can carry them: the desktop app's own log file is the shell's,
 * not something this process can find.
 */
type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const RECENT_MAX = 500;
const recent: string[] = [];

function emit(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  if (order[level] < order[(process.env.LAB_LOG_LEVEL as Level) ?? "info"]) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...fields });
  recent.push(line);
  if (recent.length > RECENT_MAX) recent.splice(0, recent.length - RECENT_MAX);
  const mode = process.env.LAB_LOG ?? "json";
  if (mode === "off") return;
  const out = level === "error" || level === "warn" ? process.stderr : process.stdout;
  if (mode === "pretty") {
    const extra = Object.entries(fields).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(" ");
    out.write(`${level.toUpperCase().padEnd(5)} ${event} ${extra}\n`);
    return;
  }
  out.write(`${line}\n`);
}

/** The most recent log lines (JSON, oldest first), at most `n`. */
export function recentLogLines(n = RECENT_MAX): string[] {
  return recent.slice(-n);
}

export const log = {
  debug: (event: string, fields?: Record<string, unknown>) => emit("debug", event, fields),
  info: (event: string, fields?: Record<string, unknown>) => emit("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => emit("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => emit("error", event, fields),
};
