import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * "Is there a newer Walkcast?" for deployments that don't self-update (a server, a source
 * checkout). The desktop app installs updates itself through the Tauri updater; this answers the
 * same question from GitHub's latest release so the dashboard can show it everywhere.
 */
export const RELEASES_API = "https://api.github.com/repos/KunjShah95/walkcast/releases/latest";

export interface UpdateCheck {
  current: string;
  latest: string | null;
  available: boolean;
  url: string | null;
  notes: string | null;
  publishedAt: string | null;
  error: string | null;
}

/** The running version: the repo or staged-sidecar package.json, three levels above this file's package root. */
export function currentVersion(): string {
  try {
    const pkg = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "package.json");
    return (JSON.parse(readFileSync(pkg, "utf8")) as { version?: string }).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** Numeric semver compare on major.minor.patch; a pre-release suffix sorts before the release. */
export function newerThan(a: string, b: string): boolean {
  return compareVersions(a, b) > 0;
}

/**
 * semver precedence, including pre-release identifiers.
 *
 * A pre-release sorts before its release. Identifiers are compared one by one: numeric ones
 * numerically (so `beta.10` is newer than `beta.9`), numeric before alphanumeric, and the rest
 * lexically. Build metadata (`+sha`) is ignored, as semver says it should be.
 */
function compareVersions(a: string, b: string): number {
  const x = parseVersion(a);
  const y = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  if (x.pre === y.pre) return 0;
  if (x.pre === null) return 1; // a release is newer than any pre-release of it
  if (y.pre === null) return -1;
  return comparePrerelease(x.pre, y.pre);
}

function parseVersion(v: string): { nums: number[]; pre: string | null } {
  const clean = v.trim().replace(/^v/i, "").split("+")[0] ?? "";
  const dash = clean.indexOf("-");
  const core = dash === -1 ? clean : clean.slice(0, dash);
  return { nums: core.split(".").map((n) => Number.parseInt(n, 10) || 0), pre: dash === -1 ? null : clean.slice(dash + 1) };
}

function comparePrerelease(a: string, b: string): number {
  const x = a.split(".");
  const y = b.split(".");
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const left = x[i];
    const right = y[i];
    if (left === undefined) return -1; // fewer identifiers sorts first
    if (right === undefined) return 1;
    const nx = /^\d+$/.test(left) ? Number(left) : null;
    const ny = /^\d+$/.test(right) ? Number(right) : null;
    if (nx !== null && ny !== null) {
      if (nx !== ny) return nx < ny ? -1 : 1;
    } else if (nx !== null) {
      return -1; // numeric identifiers sort before alphanumeric ones
    } else if (ny !== null) {
      return 1;
    } else if (left !== right) {
      return left < right ? -1 : 1;
    }
  }
  return 0;
}

let cache: { at: number; value: UpdateCheck } | null = null;

/** Latest-release check, cached for `ttlMs` (default 1 h) to stay far below GitHub's rate limit. */
export async function checkForUpdate(opts: { ttlMs?: number; fetch?: typeof fetch; current?: string } = {}): Promise<UpdateCheck> {
  const ttl = opts.ttlMs ?? 3_600_000;
  const current = opts.current ?? currentVersion();
  if (cache && Date.now() - cache.at < ttl && cache.value.current === current) return cache.value;
  let value: UpdateCheck;
  try {
    const res = await (opts.fetch ?? fetch)(RELEASES_API, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "walkcast-update-check" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const body = (await res.json()) as { tag_name?: string; html_url?: string; body?: string; published_at?: string };
    const latest = (body.tag_name ?? "").replace(/^v/, "") || null;
    value = {
      current,
      latest,
      available: Boolean(latest && newerThan(latest, current)),
      url: body.html_url ?? null,
      notes: body.body ?? null,
      publishedAt: body.published_at ?? null,
      error: null,
    };
  } catch (e) {
    value = { current, latest: null, available: false, url: null, notes: null, publishedAt: null, error: e instanceof Error ? e.message : String(e) };
  }
  // Failures are cached briefly only, so a transient outage doesn't hide an update for an hour.
  cache = { at: value.error ? Date.now() - ttl + 60_000 : Date.now(), value };
  return value;
}
