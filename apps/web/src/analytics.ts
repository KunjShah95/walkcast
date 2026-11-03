import { track } from "@vercel/analytics";

/** Website-only events. Keep properties coarse; never send passwords, URLs, or form contents. */
export function trackSiteEvent(name: string, properties: Record<string, string | number | boolean> = {}) {
  try {
    track(name, properties);
  } catch {
    // Analytics must never interrupt a download or playback action.
  }
}
