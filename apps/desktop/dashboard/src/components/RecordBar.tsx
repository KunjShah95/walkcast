import { useState } from "react";
import { cn } from "../lib/format.ts";

/** Normalize what people paste: "example.com" becomes "https://example.com". */
export function normalizeUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    return u.hostname.includes(".") || u.hostname === "localhost" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * The one-line way in: paste a link, press Record. Compact in the top bar on every view; large
 * on the dashboard.
 */
export function RecordBar({ onRecord, compact, initial = "", autoFocus }: { onRecord: (url: string) => void; compact?: boolean; initial?: string; autoFocus?: boolean }) {
  const [value, setValue] = useState(initial);
  const [focused, setFocused] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const url = normalizeUrl(value);
    if (!url) return setInvalid(true);
    onRecord(url);
  };
  return (
    <form onSubmit={submit} role="search" aria-label="Record a website" className="w-full">
      <div
        className={cn(
          "flex items-center gap-1 rounded-full bg-panel transition-shadow",
          compact ? "h-9 pl-3 pr-1" : "h-14 pl-5 pr-1.5",
          "shadow-[inset_0_0_0_1px_var(--line-strong),0_1px_2px_rgb(27_26_23_/_0.04)]",
          focused && "shadow-[inset_0_0_0_2px_var(--signal),0_0_0_5px_var(--signal-soft)]",
          invalid && "shadow-[inset_0_0_0_2px_var(--fail)]",
        )}
      >
        <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={cn("shrink-0 text-dim", compact ? "size-3.5" : "size-4")}>
          <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" />
          <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
        </svg>
        <input
          type="text"
          inputMode="url"
          size={1}
          autoComplete="url"
          spellCheck={false}
          autoFocus={autoFocus}
          aria-label="Website link"
          aria-invalid={invalid || undefined}
          placeholder={compact ? "paste a link to record" : "app.example.com"}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setInvalid(false);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={cn("w-0 min-w-0 flex-1 bg-transparent font-mono outline-none placeholder:font-sans placeholder:text-ink-3", compact ? "px-2 text-[12.5px]" : "px-3 text-[15px]")}
        />
        <button
          type="submit"
          className={cn(
            "press pill-rec-dot inline-flex shrink-0 items-center gap-2 rounded-full bg-signal font-semibold text-on-signal transition-colors hover:bg-signal-strong",
            compact ? "h-7 px-3 text-[12px]" : "h-10 px-4 text-[14px]",
          )}
        >
          Record
        </button>
      </div>
      {invalid && !compact && <p className="mt-2 text-[12.5px] text-fail">That doesn't look like a web address. Try something like app.example.com.</p>}
    </form>
  );
}
