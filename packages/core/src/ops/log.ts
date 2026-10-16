/**
 * One JSON object per line on stdout/stderr: what CloudWatch Logs (and most log pipelines) parse
 * without configuration. LAB_LOG=pretty prints a short human line instead (local use); LAB_LOG=off
 * silences it (tests).
 */
type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function emit(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const mode = process.env.LAB_LOG ?? "json";
  if (mode === "off" || order[level] < order[(process.env.LAB_LOG_LEVEL as Level) ?? "info"]) return;
  const out = level === "error" || level === "warn" ? process.stderr : process.stdout;
  if (mode === "pretty") {
    const extra = Object.entries(fields).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(" ");
    out.write(`${level.toUpperCase().padEnd(5)} ${event} ${extra}\n`);
    return;
  }
  out.write(`${JSON.stringify({ t: new Date().toISOString(), level, event, ...fields })}\n`);
}

export const log = {
  debug: (event: string, fields?: Record<string, unknown>) => emit("debug", event, fields),
  info: (event: string, fields?: Record<string, unknown>) => emit("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => emit("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => emit("error", event, fields),
};
