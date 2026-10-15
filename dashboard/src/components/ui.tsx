import { Check, Copy, Moon, Sun } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { cn, label } from "../lib/format.ts";

export function Verdict({ verdict, size = "sm" }: { verdict: "pass" | "fail"; size?: "sm" | "lg" }) {
  const pass = verdict === "pass";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-mono font-medium uppercase tracking-wider",
        size === "lg" ? "px-3 py-1 text-xs" : "px-2 py-0.5 text-[10.5px]",
        pass ? "bg-pass-soft text-pass" : "bg-fail-soft text-fail",
      )}
    >
      <span className={cn("rounded-full", size === "lg" ? "size-2" : "size-1.5", pass ? "bg-pass" : "bg-fail")} />
      {pass ? "Pass" : "Fail"}
    </span>
  );
}

const KIND_STYLE: Record<string, string> = {
  symptom: "border-fail/40 text-fail",
  cause: "border-ink/25 text-ink",
  incident: "border-dashed border-ink-3/60 text-ink-2",
};

/** A classifier finding. Symptoms are what went wrong, causes why, incidents were recovered from. */
export function FindingChip({ id, kind, onClick }: { id: string; kind: "symptom" | "cause" | "incident"; onClick?: () => void }) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      onClick={onClick}
      title={`${kind}: ${id}`}
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md border bg-panel px-1.5 py-0.5 text-[11.5px] leading-tight",
        KIND_STYLE[kind],
        onClick && "hover:bg-panel-2 cursor-pointer",
      )}
    >
      {label(id)}
    </Tag>
  );
}

export function Panel({ children, className, as: Tag = "section" }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" }) {
  return <Tag className={cn("rounded-xl border border-line bg-panel shadow-card", className)}>{children}</Tag>;
}

export function PanelHeader({ eyebrow, title, aside }: { eyebrow?: string; title: ReactNode; aside?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-2 border-b border-line px-4 py-3">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2 className="font-display text-[17px] font-semibold leading-tight tracking-tight">{title}</h2>
      </div>
      {aside}
    </header>
  );
}

/** Card with a soft light that follows the cursor (Aceternity's spotlight, toned down). */
export function SpotlightCard({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      onMouseMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (r) setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
      }}
      onMouseLeave={() => setPos(null)}
      className={cn(
        "group relative w-full overflow-hidden rounded-xl border border-line bg-panel text-left shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-signal/50 hover:shadow-hover",
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: pos ? 1 : 0,
          background: pos ? `radial-gradient(260px circle at ${pos.x}px ${pos.y}px, var(--signal-soft), transparent 70%)` : undefined,
        }}
      />
      <span className="relative block">{children}</span>
    </button>
  );
}

export function CopyButton({ text, label: buttonLabel = "Copy" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "select">("idle");
  const ref = useRef<HTMLElement | null>(null);
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-2">
      <code
        ref={(el) => {
          ref.current = el;
        }}
        className="min-w-0 truncate rounded-md bg-panel-2 px-2 py-1 font-mono text-[11.5px] text-ink-2"
      >
        {text}
      </code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setState("copied");
          } catch {
            const range = document.createRange();
            if (ref.current) {
              range.selectNodeContents(ref.current);
              window.getSelection()?.removeAllRanges();
              window.getSelection()?.addRange(range);
            }
            setState("select");
          }
          setTimeout(() => setState("idle"), 1600);
        }}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-ink-2 hover:border-signal hover:text-signal"
      >
        {state === "copied" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {state === "copied" ? "Copied" : state === "select" ? "Selected" : buttonLabel}
      </button>
    </span>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(() => document.documentElement.getAttribute("data-theme"));
  const dark = theme === "dark" || (theme === null && window.matchMedia("(prefers-color-scheme: dark)").matches);
  return (
    <button
      type="button"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => {
        const next = dark ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        try {
          localStorage.setItem("lab-theme", next);
        } catch {
          /* storage unavailable */
        }
        setTheme(next);
      }}
      className="inline-flex size-8 items-center justify-center rounded-lg border border-line text-ink-2 hover:border-signal hover:text-signal"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-panel/60 px-5 py-8 text-center">
      <div className="font-display text-base font-semibold">{title}</div>
      {children && <div className="mx-auto mt-1 max-w-[60ch] text-ink-2">{children}</div>}
    </div>
  );
}
