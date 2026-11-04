import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { type Capabilities, buildSilentCopy, canRevealFiles, exportShape, guideUrl, isSnapshot, mediaUrl, revealRecordingFile, transcriptUrl } from "../../lib/api.ts";
import { cn } from "../../lib/format.ts";
import type { RecordingSummary } from "../../lib/types.ts";

type Item =
  | { kind: "link"; key: string; label: string; hint?: string; href: string; download?: string; newTab?: boolean }
  | { kind: "action"; key: string; label: string; hint?: string; run: () => Promise<{ file: string; label: string } | null>; disabled?: string };

type Group = { name: string; items: Item[] };

/** What just finished building, so the person can take it straight away. */
type Made = { label: string; file: string };

/**
 * Every way to take a walkthrough out of Walkcast, in one menu grouped by what you get: video,
 * text, audio. Files that already exist are downloads; the feed shapes and the no-voice copy are
 * built on first ask, and once built they are offered as a download (and, in the desktop app,
 * "Show in folder").
 */
export function ExportMenu({ recording: r, caps, onChange }: { recording: RecordingSummary; caps?: Capabilities | null; onChange?: (next: RecordingSummary) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<Made | null>(null);
  const [revealable, setRevealable] = useState(() => canRevealFiles());
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const live = !isSnapshot && Boolean(caps?.live);

  // A different walkthrough: forget what was built for the last one.
  useEffect(() => {
    setMade(null);
    setError(null);
  }, [r.id]);

  const media = (file: string | null | undefined) => (file ? mediaUrl(r.dir, file) : undefined);
  const video: Item[] = [];
  const mp4 = media(r.media.mp4);
  if (mp4) video.push({ kind: "link", key: "mp4", label: "MP4", hint: "The walkthrough as recorded", href: mp4, download: `${r.id}-${r.media.mp4}` });
  for (const [shape, ratio] of [
    ["vertical", "9:16"],
    ["square", "1:1"],
  ] as const) {
    const file = r.media.exports?.[shape];
    const href = media(file);
    if (file && href) video.push({ kind: "link", key: shape, label: `${ratio} for a feed`, hint: "Captions burned in", href, download: `${r.id}-${file}` });
    else if (live)
      video.push({
        kind: "action",
        key: shape,
        label: `Make ${ratio} for a feed`,
        hint: "Re-framed, captions burned in",
        disabled: r.media.mp4 ? undefined : "Needs the MP4",
        run: async () => {
          const next = await exportShape(r.id, shape);
          onChange?.(next);
          const out = next.media.exports?.[shape];
          return out ? { file: out, label: ratio } : null;
        },
      });
  }
  if (r.media.voice !== "none") {
    const href = media(r.media.silent);
    if (r.media.silent && href) video.push({ kind: "link", key: "silent", label: "No voice", hint: "Narration stripped, captions kept", href, download: `${r.id}-${r.media.silent}` });
    else if (live)
      video.push({
        kind: "action",
        key: "silent",
        label: "Make a no-voice copy",
        hint: "Narration stripped, captions kept",
        disabled: r.media.mp4 ? undefined : "Needs the MP4",
        run: async () => {
          const next = await buildSilentCopy(r.id);
          onChange?.(next);
          return next.media.silent ? { file: next.media.silent, label: "No-voice copy" } : null;
        },
      });
  }

  const text: Item[] = [];
  if (!isSnapshot) {
    text.push({ kind: "link", key: "md", label: "Markdown document", hint: "Pages, narration, notes and findings", href: transcriptUrl(r.id, "md"), download: `${r.id}.md` });
    text.push({ kind: "link", key: "srt", label: "Transcript (SRT)", href: transcriptUrl(r.id, "srt"), download: `${r.id}-transcript.srt` });
  }
  const vtt = media(r.media.captions);
  if (vtt) text.push({ kind: "link", key: "vtt", label: "Captions (VTT)", href: vtt, download: `${r.id}-${r.media.captions}` });
  if (!isSnapshot) {
    text.push({ kind: "link", key: "json", label: "Transcript (JSON)", href: transcriptUrl(r.id, "json"), download: `${r.id}-transcript.json` });
    text.push({ kind: "link", key: "guide", label: "Step guide", hint: "Every page and click as numbered steps, opens in a tab", href: guideUrl(r.id), newTab: true });
  }

  const audio: Item[] = [];
  const narration = media(r.media.audio);
  if (narration) audio.push({ kind: "link", key: "audio", label: "Narration audio", href: narration, download: `${r.id}-${r.media.audio}` });

  const groups: Group[] = [
    { name: "Video", items: video },
    { name: "Text", items: text },
    { name: "Audio", items: audio },
  ].filter((g) => g.items.length > 0);

  const items = () => [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])];

  // Opening moves focus to the first item; Escape and choosing hand it back to the button.
  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const away = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      all[(at + step + all.length) % all.length]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      (e.key === "Home" ? all[0] : all[all.length - 1])?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      close(false);
    }
  };

  const runAction = async (item: Extract<Item, { kind: "action" }>) => {
    close();
    setBusy(item.key);
    setError(null);
    setMade(null);
    try {
      const out = await item.run();
      if (out) setMade(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const reveal = async (file?: string) => {
    setError(null);
    try {
      if (!(await revealRecordingFile(r.id, file))) setRevealable(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (groups.length === 0) return null;
  const busyLabel = busy ? [...video].find((i) => i.key === busy)?.label.replace(/^Make /, "Making ") : null;

  return (
    <div className="relative inline-flex flex-col items-end gap-1.5">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="press inline-flex h-8 items-center gap-1.5 rounded-full bg-panel-2 px-3.5 text-[12.5px] font-medium text-ink transition-colors hover:bg-panel-3"
      >
        {busy ? `${busyLabel ?? "Working"}…` : "Export"}
        <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={cn("transition-transform", open && "rotate-180")}>
          <path d="m3 4.5 3 3 3-3" />
        </svg>
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label="Export this walkthrough"
          onKeyDown={onMenuKey}
          className="absolute right-0 top-9 z-30 grid w-[min(300px,calc(100vw-32px))] gap-1 rounded-[14px] bg-panel p-1.5 shadow-[inset_0_0_0_1px_var(--line-strong)]"
        >
          {groups.map((g) => (
            <MenuGroup key={g.name} name={g.name}>
              {g.items.map((it) => {
                const item: Item = it.kind === "action" && !it.disabled && busy ? { ...it, disabled: "Another export is still running" } : it;
                return item.kind === "link" ? (
                  <a
                    key={item.key}
                    role="menuitem"
                    tabIndex={-1}
                    href={item.href}
                    {...(item.newTab ? { target: "_blank", rel: "noreferrer" } : { download: item.download })}
                    onClick={() => close()}
                    className={ITEM}
                  >
                    <ItemText label={item.label} hint={item.hint} />
                  </a>
                ) : (
                  <button
                    key={item.key}
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    aria-disabled={item.disabled ? true : undefined}
                    onClick={() => !item.disabled && void runAction(item)}
                    className={cn(ITEM, item.disabled && "cursor-not-allowed opacity-50")}
                  >
                    <ItemText label={item.label} hint={item.disabled ?? item.hint} />
                  </button>
                );
              })}
            </MenuGroup>
          ))}
        </div>
      )}
      <div aria-live="polite" className="text-right text-[12px]">
        {made && (
          <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-ink-2">
            {made.label} is ready.
            <a href={mediaUrl(r.dir, made.file)} download={`${r.id}-${made.file}`} className="font-medium text-ink underline underline-offset-2">
              Download
            </a>
            {revealable && (
              <button type="button" onClick={() => void reveal(made.file)} className="font-medium text-ink underline underline-offset-2">
                Show in folder
              </button>
            )}
          </span>
        )}
        {error && <span className="text-fail">{error}</span>}
      </div>
    </div>
  );
}

const ITEM = "flex w-full items-start rounded-lg px-2.5 py-1.5 text-left text-[13px] text-ink outline-none hover:bg-panel-2 focus-visible:bg-panel-2 focus-visible:shadow-[inset_0_0_0_2px_var(--signal)]";

function MenuGroup({ name, children }: { name: string; children: ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="grid gap-0.5 border-t border-line pt-1 first:border-t-0 first:pt-0">
      <span id={id} className="px-2.5 pb-0.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
        {name}
      </span>
      {children}
    </div>
  );
}

function ItemText({ label, hint }: { label: string; hint?: string }) {
  return (
    <span className="grid gap-0.5">
      <span className="font-medium">{label}</span>
      {hint && <span className="text-[11.5px] text-ink-3">{hint}</span>}
    </span>
  );
}
