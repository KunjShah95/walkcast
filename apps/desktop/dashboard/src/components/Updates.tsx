import { useEffect, useState } from "react";
import { Button, Panel, PanelHeader } from "./ui.tsx";
import { isSnapshot } from "../lib/api.ts";

/**
 * Settings → Updates. Inside the desktop app, the Tauri updater does the work: check the signed
 * release feed, download, verify, install, restart (commands in src-tauri/src/lib.rs). Anywhere
 * else (a server, a source checkout) the dashboard can only say a newer release exists and link
 * to it: /api/update compares the running version with GitHub's latest release.
 */

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

function desktopInvoke(): Invoke | null {
  const w = window as unknown as {
    __TAURI__?: { core?: { invoke?: Invoke } };
    __TAURI_INTERNALS__?: { invoke?: Invoke };
  };
  return w.__TAURI__?.core?.invoke ?? w.__TAURI_INTERNALS__?.invoke ?? null;
}

interface Status {
  current: string;
  available: boolean;
  version: string | null;
  notes: string | null;
  url: string | null;
  error: string | null;
}

async function check(invoke: Invoke | null): Promise<Status> {
  if (invoke) {
    const s = await invoke<{ current: string; available: boolean; version?: string | null; notes?: string | null; error?: string | null }>("check_update");
    return { current: s.current, available: s.available, version: s.version ?? null, notes: s.notes ?? null, url: null, error: s.error ?? null };
  }
  const r = await fetch("/api/update");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const s = (await r.json()) as { current: string; latest: string | null; available: boolean; url: string | null; notes: string | null; error: string | null };
  return { current: s.current, available: s.available, version: s.latest, notes: s.notes, url: s.url, error: s.error };
}

export function Updates() {
  const invoke = desktopInvoke();
  const [status, setStatus] = useState<Status | null>(null);
  const [phase, setPhase] = useState<"idle" | "checking" | "installing">("idle");
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setPhase("checking");
    setError(null);
    try {
      setStatus(await check(invoke));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPhase("idle");
    }
  };

  useEffect(() => {
    if (!isSnapshot) void run();
    // Check once when Settings opens; the button re-checks.
  }, []);

  const install = async () => {
    if (!invoke) return;
    setPhase("installing");
    setError(null);
    try {
      // On success the app restarts into the new version, so this normally never returns.
      await invoke("install_update");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    }
  };

  if (isSnapshot) return null;
  const busy = phase !== "idle";
  // A failed check is not an up-to-date app: say which one it is.
  const failed = Boolean(error || status?.error);
  const title = status?.available
    ? `Walkcast ${status.version} is available`
    : failed
      ? "Couldn't check for updates"
      : status
        ? "Walkcast is up to date"
        : busy
          ? "Checking for updates…"
          : "Updates";
  return (
    <Panel id="updates">
      <PanelHeader
        eyebrow="Updates"
        title={title}
        aside={status ? <span className="font-mono text-[11.5px] text-ink-3">installed v{status.current}</span> : null}
      />
      <div className="grid gap-3 px-4 py-4">
        {status?.error && <p className="text-[12.5px] text-ink-3">Couldn't check for updates: {status.error}</p>}
        {error && <p className="text-[12.5px] text-fail">{error}</p>}
        {status?.available && status.notes && (
          <details className="rounded-lg border border-line px-3 py-2 text-[12.5px] text-ink-2">
            <summary className="cursor-pointer text-ink">What's new</summary>
            <pre className="mt-2 whitespace-pre-wrap font-sans">{status.notes}</pre>
          </details>
        )}
        <p className="text-[12.5px] text-ink-3">
          {invoke
            ? "Updates are downloaded from GitHub, checked against Walkcast's signing key, installed, and the app restarts. Your recordings and settings stay where they are."
            : "This copy runs as a server or from source, so it can't update itself. Install the new release on the machine that runs it (for a server: deploy the new image, then run walkcast db migrate)."}
        </p>
        <div className="flex flex-wrap gap-2">
          {status?.available && invoke && (
            <Button tone="primary" onClick={install} disabled={busy}>
              {phase === "installing" ? "Downloading and installing…" : `Update to ${status.version}`}
            </Button>
          )}
          {status?.available && !invoke && status.url && (
            <a href={status.url} target="_blank" rel="noreferrer" className="rounded-full border border-line-strong px-4 py-2 text-[13.5px] hover:bg-panel-2">
              View release {status.version}
            </a>
          )}
          <Button onClick={run} disabled={busy}>
            {phase === "checking" ? "Checking…" : "Check for updates"}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
