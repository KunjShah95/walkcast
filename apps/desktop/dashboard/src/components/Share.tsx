import { useMemo, useState } from "react";
import { type ShareLink, createShare, revokeShare } from "../lib/api.ts";
import { cn } from "../lib/format.ts";
import type { RecordingSummary } from "../lib/types.ts";
import { Button } from "./ui.tsx";

/**
 * A link that plays the walkthrough for whoever has it.
 *
 * This is the thing a walkthrough is for: a founder sends the link to a customer, a marketer
 * drops it in a deck, an engineer puts it in a ticket. The person on the other side needs
 * nothing — no account, no sign-in, no app — and the link stops working on the day it names,
 * or the moment its owner says so.
 */
export function SharePanel({ recording, onChange }: { recording: RecordingSummary; onChange?: (r: RecordingSummary) => void }) {
  const [days, setDays] = useState(7);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [silent, setSilent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const links = useMemo(
    () => (recording.shares ?? []).filter((s) => Date.parse(s.expiresAt) > Date.now()),
    [recording.shares],
  );

  const remember = (shares: ShareLink[]) => onChange?.({ ...recording, shares });

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const made = await createShare(recording.id, days, includeNotes, silent);
      remember(made.shares);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (token: string) => {
    setBusy(true);
    setError(null);
    try {
      remember(await revokeShare(recording.id, token));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("The clipboard is not available here. Select the link and copy it by hand.");
    }
  };

  /**
   * The same walkthrough as a player to drop into somebody else's site: one line of HTML,
   * no account, nothing of Walkcast's shell in the way.
   */
  const embedCode = (url: string) =>
    `<iframe src="${url}${url.includes("?") ? "&" : "?"}embed=1" title="${recording.url.replace(/"/g, "&quot;")}" width="960" height="600" style="border:0;border-radius:10px" allowfullscreen loading="lazy"></iframe>`;

  return (
    <section className="rounded-2xl border border-line bg-panel">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <h3 className="text-[14.5px] font-semibold">Share this walkthrough</h3>
          <p className="text-[12.5px] text-ink-3">Anyone with the link can watch, read the transcript and open the step-by-step guide. No account, no sign-in. The link stops working on the day it names.</p>
        </div>
        <div className="flex items-center gap-1.5">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label="How long the link works"
            className="h-8 rounded-lg border border-line bg-panel px-2 text-[12.5px] text-ink-2"
          >
            <option value={1}>1 day</option>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
          </select>
          <Button tone="primary" size="sm" disabled={busy} onClick={create}>
            {busy ? "Working…" : "Create a link"}
          </Button>
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5 text-[12.5px] text-ink-2">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={includeNotes} onChange={(e) => setIncludeNotes(e.target.checked)} className="size-3.5 accent-signal" />
          Include my notes on the page
        </label>
        <span className="text-[11.5px] text-ink-3">Your notes stay private until a link carries them.</span>
      </div>
      {recording.media.voice !== "none" && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5 text-[12.5px] text-ink-2">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={silent} onChange={(e) => setSilent(e.target.checked)} className="size-3.5 accent-signal" />
            Share without narration
          </label>
          <span className="text-[11.5px] text-ink-3">The link plays the walkthrough with no voice, captions still on.</span>
        </div>
      )}
      {error && <p className="border-b border-line px-4 py-2.5 text-[12.5px] text-fail">{error}</p>}
      {links.length === 0 ? (
        <p className="px-4 py-3 text-[12.5px] text-ink-3">No links yet. The walkthrough stays private until you make one.</p>
      ) : (
        <ul className="divide-y divide-line">
          {links.map((link) => {
            const url = `${location.origin}/share/${encodeURIComponent(recording.id)}/${link.token}`;
            return (
              <li key={link.token} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-2">{url}</code>
                <span className="shrink-0 font-mono text-[11.5px] text-ink-3">until {link.expiresAt.slice(0, 10)}</span>
                {link.includeNotes && <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-3">notes</span>}
                {link.silent && <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-3">no voice</span>}
                <button
                  type="button"
                  onClick={() => copy(url)}
                  className="inline-flex h-7 items-center rounded-full border border-line px-2.5 text-[12px] text-ink-2 hover:border-line-strong hover:text-ink"
                >
                  {copied === url ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={() => copy(embedCode(url))}
                  title="Copy the HTML that embeds this walkthrough in your own site"
                  className="inline-flex h-7 items-center rounded-full border border-line px-2.5 text-[12px] text-ink-2 hover:border-line-strong hover:text-ink"
                >
                  {copied === embedCode(url) ? "Copied" : "Embed"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => revoke(link.token)}
                  className={cn("inline-flex h-7 items-center rounded-full border px-2.5 text-[12px] hover:text-fail", "border-fail/40 text-fail disabled:opacity-50")}
                >
                  Stop
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
