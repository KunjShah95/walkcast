import { track } from "@vercel/analytics";

/**
 * Every event the site sends. A closed list, so a typo cannot create a new event and a new event
 * has to be added here, where the "no passwords, URLs or form contents" rule is read.
 */
export type SiteEvent =
  | "demo_anchor_click"
  | "demo_complete"
  | "demo_play"
  | "homepage_section_view"
  | "installer_download_click"
  | "next_step_click"
  | "sponsor_click"
  /** A click on a link to the GitHub repository or the Lab chapter of its README. */
  | "github_click"
  | "desktop_download_options"
  | "download_options_open";

/** Website-only events. Keep properties coarse; never send passwords, URLs, or form contents. */
export function trackSiteEvent(name: SiteEvent, properties: Record<string, string | number | boolean> = {}) {
  try {
    track(name, properties);
  } catch {
    // Analytics must never interrupt a download or playback action.
  }
}

/**
 * Count clicks on links to the project's GitHub page, without touching each link: one delegated
 * listener, sending only which page the click came from. Returns a function that removes it.
 */
export function trackGithubClicks(): () => void {
  const onClick = (e: MouseEvent) => {
    const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!link || link.hostname !== "github.com" || !link.pathname.toLowerCase().startsWith("/kunjshah95/")) return;
    trackSiteEvent("github_click", { from: location.pathname });
  };
  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
}
