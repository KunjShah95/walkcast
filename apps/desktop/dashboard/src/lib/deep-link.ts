/**
 * Browser sign-in returns through the `walkcast://` scheme when the sidecar could not take port
 * 4317, because Supabase's allow-list pins that exact port and a return to any other one is
 * rejected. The OS hands the URL to the running app (or launches it), and this swaps the code for
 * a session over the app's own origin.
 *
 * If the scheme is not registered — an install from before this existed — nothing arrives, and the
 * caller falls back to the loopback flow. Nothing here can break sign-in on its own.
 */

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

function tauri(): { invoke?: Invoke; event?: { listen?: (e: string, h: (e: { payload: unknown }) => void) => Promise<() => void> } } | null {
  const w = window as unknown as {
    __TAURI__?: { core?: { invoke?: Invoke }; event?: { listen?: (e: string, h: (e: { payload: unknown }) => void) => Promise<() => void> } };
  };
  return w.__TAURI__ ?? null;
}

/** `walkcast://auth/callback?state=…&code=…` -> the query pairs, or null if it is not ours. */
function parseDeepLink(url: string): { state: string; code: string } | null {
  if (!url.startsWith("walkcast://")) return null;
  try {
    const parsed = new URL(url);
    // A custom scheme puts the first segment in host, so read from both search and hash.
    const q = new URLSearchParams(parsed.search || parsed.hash.replace(/^#/, "?"));
    const state = q.get("state") ?? "";
    const code = q.get("code") ?? "";
    return state && code ? { state, code } : null;
  } catch {
    return null;
  }
}

async function complete(url: string): Promise<boolean> {
  const pair = parseDeepLink(url);
  if (!pair) return false;
  try {
    const res = await fetch("/auth/desktop/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pair),
    });
    if (!res.ok) return false;
    // The session is set; a full reload is the simplest way to pick it up everywhere.
    location.reload();
    return true;
  } catch {
    return false;
  }
}

/**
 * Handle any pending or future `walkcast://` URL. Returns a disposer. Safe to call outside the
 * desktop app: it resolves immediately when there is no Tauri runtime.
 */
export async function watchDeepLinks(): Promise<() => void> {
  const api = tauri();
  const listen = api?.event?.listen;
  if (!api || !listen) return () => {};

  let unlisten: (() => void) | undefined;
  try {
    // The plugin's own event, carrying a list of URLs. (This listened for "tauri://deep-link",
    // which nothing emits, so a sign-in returning to a running app was never completed.)
    unlisten = await listen("deep-link://new-url", (event) => {
      const urls = Array.isArray(event.payload) ? event.payload : [event.payload];
      for (const url of urls) if (typeof url === "string") void complete(url);
    });
  } catch {
    return () => {};
  }

  // Cold start: the OS launched us with the URL, so no event will fire for it.
  try {
    // The plugin is registered as "deep-link"; "deep_link" named no command and always failed.
    const current = await api.invoke?.<string[] | null>("plugin:deep-link|get_current");
    for (const url of current ?? []) void complete(url);
  } catch {
    /* command unavailable in this build */
  }

  return () => unlisten?.();
}

/** Whether this browser could ever return to Walkcast on a non-standard port. */
export function deepLinkSupported(): boolean {
  return Boolean(tauri());
}