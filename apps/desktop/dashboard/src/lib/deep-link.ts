/**
 * `walkcast://` links. Two kinds arrive here:
 *  - `walkcast://record?url=<encoded>` opens Record with that address filled in (never starts it).
 *  - `walkcast://auth/callback?state=…&code=…`, below.
 *
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

/**
 * A web address someone wants to record: only http(s), with a host, and nothing else. Anything
 * else (javascript:, file:, a bare word) is not a URL we will put in front of the recorder.
 */
export function recordableUrl(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text || text.length > 2048) return null;
  try {
    const u = new URL(text);
    if ((u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** `walkcast://record?url=<encoded>` -> the page to record, or null if it is not that link. */
export function parseRecordLink(url: string): string | null {
  if (!url.startsWith("walkcast://")) return null;
  try {
    const parsed = new URL(url);
    // A custom scheme puts "record" in the host on some platforms and in the path on others.
    const target = (parsed.host || parsed.pathname.replace(/^\/+/, "")).replace(/\/+$/, "");
    if (target !== "record") return null;
    return recordableUrl(new URLSearchParams(parsed.search).get("url"));
  } catch {
    return null;
  }
}

/**
 * Open the Record view with this address filled in. It never starts a recording: the person
 * still confirms they are authorized to test the site and presses Record themselves.
 */
export function openRecordFor(url: string) {
  const safe = recordableUrl(url);
  if (!safe) return;
  location.hash = `#record?url=${encodeURIComponent(safe)}`;
}

/**
 * Dropping a link (from a browser's address bar or a page) anywhere on the window that doesn't
 * take drops itself opens Record with it. Files and drops onto text fields are left alone.
 * Returns a disposer.
 */
export function watchUrlDrops(): () => void {
  const isText = (e: DragEvent) => {
    const types = Array.from(e.dataTransfer?.types ?? []);
    return !types.includes("Files") && (types.includes("text/uri-list") || types.includes("text/plain"));
  };
  const editable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || t.closest("input, textarea, [contenteditable='true']") !== null);
  const onOver = (e: DragEvent) => {
    if (e.defaultPrevented || !isText(e) || editable(e.target)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "link";
  };
  const onDrop = (e: DragEvent) => {
    if (e.defaultPrevented || !isText(e) || editable(e.target)) return;
    const list = e.dataTransfer?.getData("text/uri-list") ?? "";
    // text/uri-list may hold several lines and # comments; the first real line is the link.
    const first = list.split(/\r?\n/).find((l) => l.trim() && !l.startsWith("#"));
    const url = recordableUrl(first) ?? recordableUrl(e.dataTransfer?.getData("text/plain"));
    if (!url) return;
    e.preventDefault();
    openRecordFor(url);
  };
  window.addEventListener("dragover", onOver);
  window.addEventListener("drop", onDrop);
  return () => {
    window.removeEventListener("dragover", onOver);
    window.removeEventListener("drop", onDrop);
  };
}

async function complete(url: string): Promise<boolean> {
  const record = parseRecordLink(url);
  if (record) {
    openRecordFor(record);
    return true;
  }
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