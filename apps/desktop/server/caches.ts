/**
 * Response caches for the two endpoints the dashboard polls hardest: job status and capabilities.
 *
 * Process-wide on purpose, exactly as they were inside server.ts: saving a credential clears the
 * capabilities of every app in the process, and the status cache is keyed by job id, which is
 * unique across apps.
 */

export const STATUS_TTL_MS = Number(process.env.LAB_STATUS_TTL_MS ?? 1500);
const STATUS_CACHE_MAX = 20_000;
export const statusCache = new Map<string, { body: string; etag: string; owner: string | null; at: number }>();

export const CAPABILITIES_TTL_MS = Number(process.env.LAB_CAPABILITIES_TTL_MS ?? process.env.CAPABILITIES_TTL_MS ?? 5000);
export const CAPABILITIES_CACHE_MAX = 100;
export const capabilitiesCache = new Map<string, { payload: unknown; at: number }>();

export function setStatusCache(id: string, body: string, etag: string, owner: string | null) {
  if (statusCache.size >= STATUS_CACHE_MAX) {
    const first = statusCache.keys().next().value;
    if (first) statusCache.delete(first);
  }
  statusCache.set(id, { body, etag, owner, at: Date.now() });
}
