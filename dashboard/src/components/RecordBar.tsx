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
          "flex items-center border bg-panel transition-colors",
          compact ? "h-9 rounded-lg border-line pl-2.5 pr-1" : "h-14 rounded-lg border-line-strong pl-4 pr-2",
          focused && !compact && "border-ink",
          focused && compact && "border-signal/60",
          invalid && "border-fail/60",
        )}
      >
        <span aria-hidden className={cn("shrink-0 font-mono text-ink-3", compact ? "text-[11.5px]" : "text-[13px]")}>https://</span>
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
          className={cn("w-0 min-w-0 flex-1 bg-transparent font-mono outline-none placeholder:font-sans", compact ? "px-2 text-[12.5px]" : "px-3 text-[15px]")}
        />
        <button
          type="submit"
          className={cn(
            "press inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-signal-strong font-semibold text-white transition-colors hover:bg-signal",
            compact ? "h-7 px-2.5 text-[12px]" : "h-10 px-4 text-[14px]",
          )}
        >
          <span className="relative flex size-2">
            <span className="absolute inset-0 rounded-full bg-rec" />
          </span>
          Record
        </button>
      </div>
      {invalid && !compact && <p className="mt-2 text-[12.5px] text-fail">That doesn't look like a web address. Try something like app.example.com.</p>}
    </form>
  );
}
