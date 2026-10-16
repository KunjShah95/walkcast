import { useEffect, useState } from "react";
import { isSnapshot } from "../lib/api.ts";

/** Mirrors packages/core/src/record/browser-install.ts. */
interface Setup {
  state: "unmanaged" | "ready" | "installing" | "failed";
  item: string | null;
  percent: number | null;
  totalMb: number | null;
  error: string | null;
}

/**
 * First run of the desktop app: the recording browser downloads in the background. This shows
 * the progress, a retry if it fails, and a short "ready" once it lands, then gets out of the way.
 * On a server that already has its browser (state "unmanaged" or "ready" from the start) it
 * renders nothing.
 */
export function BrowserSetup() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [sawInstall, setSawInstall] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (isSnapshot) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const res = await fetch("/api/browser");
        if (!res.ok) return; // an older server without the endpoint: nothing to show
        const next = (await res.json()) as Setup;
        if (stopped) return;
        setSetup(next);
        if (next.state === "installing") {
          setSawInstall(true);
          timer = setTimeout(poll, 1000);
        }
      } catch {
        if (!stopped) timer = setTimeout(poll, 3000);
      }
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [retrying]);

  // "Ready" stays up for a moment after a download finishes, then goes.
  useEffect(() => {
    if (setup?.state !== "ready" || !sawInstall) return;
    const t = setTimeout(() => setDismissed(true), 4000);
    return () => clearTimeout(t);
  }, [setup?.state, sawInstall]);

  if (!setup || dismissed) return null;
  if (setup.state === "unmanaged" || (setup.state === "ready" && !sawInstall)) return null;

  const retry = async () => {
    setDismissed(false);
    await fetch("/api/browser/install", { method: "POST" }).catch(() => undefined);
    setRetrying((r) => !r);
  };

  const percent = setup.percent ?? 0;
  // The installer fetches a few files in turn; name the current one so the bar restarting makes sense.
  const size = setup.totalMb ? `${setup.totalMb < 1 ? setup.totalMb.toFixed(1) : Math.round(setup.totalMb)} MB` : null;
  const current = setup.item ? `${setup.item}${size ? ` · ${size}` : ""}` : "Starting the download";

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 w-[min(360px,calc(100vw-32px))] rounded-xl border border-line bg-panel p-4 shadow-[0_12px_40px_-12px_rgba(0,0,0,.25)]"
    >
      {setup.state === "installing" && (
        <>
          <p className="text-[13.5px] font-medium text-ink">Setting up the recording browser</p>
          <p className="mt-1 text-[12.5px] text-ink-2">
            A one-time download of about 250 MB. You can look around meanwhile; recording starts working when it finishes.
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-panel-3" aria-hidden>
            <div className="h-full rounded-full bg-signal transition-[width] duration-500" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-1.5 flex justify-between gap-3 font-mono text-[11.5px] text-ink-3">
            <span className="truncate">{current}</span>
            <span>{percent}%</span>
          </p>
        </>
      )}
      {setup.state === "failed" && (
        <>
          <p className="text-[13.5px] font-medium text-fail">The recording browser didn't install</p>
          <p className="mt-1 break-words text-[12.5px] text-ink-2">{setup.error ?? "The download stopped."} Check the connection and try again.</p>
          <button
            type="button"
            onClick={retry}
            className="mt-3 rounded-full bg-solid px-3 py-1.5 text-[12.5px] font-medium text-on-solid hover:brightness-95"
          >
            Try again
          </button>
        </>
      )}
      {setup.state === "ready" && (
        <p className="text-[13.5px] font-medium text-pass">The recording browser is ready.</p>
      )}
    </div>
  );
}
