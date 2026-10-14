import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function ms(value: number): string {
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(value < 10_000 ? 2 : 1)} s`;
  return `${Math.floor(value / 60_000)}m ${Math.round((value % 60_000) / 1000)}s`;
}

export function ago(epochMs: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - epochMs) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function pathOf(url: string | undefined | null): string {
  if (!url) return "–";
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

export const FAULT_LABEL: Record<string, string> = {
  none: "No fault (control)",
  "stale-owners": "Stale owner list",
  "gateway-timeout": "504 after commit",
  "silent-owner-drop": "Owner silently dropped",
  "session-expiry": "Session expires",
  "ui-drift": "Submit button redesigned",
};

/** Plain-language names for classifier labels. */
export const LABEL: Record<string, string> = {
  "false-success": "Claimed success, wasn't",
  "missed-success": "Succeeded, reported failure",
  "wrong-outcome": "Wrong outcome",
  "duplicate-action": "Duplicate write",
  "stale-observation": "Stale observation",
  "navigation-timeout": "Navigation timeout",
  "unsafe-retry": "Unsafe retry",
  "action-failed": "Failed action ignored",
  "auth-lost": "Session lost",
  "locator-not-found": "Element not found",
  "app-dropped-field": "App dropped a field",
  "app-error": "App error",
  unexplained: "Unexplained",
};

export function label(id: string): string {
  return LABEL[id] ?? id;
}
