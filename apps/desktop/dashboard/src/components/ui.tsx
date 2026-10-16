import { type ButtonHTMLAttributes, type ReactNode, createContext, useCallback, useContext, useRef, useState } from "react";
import { cn, label } from "../lib/format.ts";

export function Verdict({ verdict, size = "sm" }: { verdict: "pass" | "fail"; size?: "sm" | "lg" }) {
  const pass = verdict === "pass";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        size === "lg" ? "px-3 py-1 text-[13px]" : "px-2 py-0.5 text-[11.5px]",
        pass ? "border-pass/25 bg-pass-soft text-pass" : "border-fail/25 bg-fail-soft text-fail",
      )}
    >
      <span className={cn("rounded-full", size === "lg" ? "size-2" : "size-1.5", pass ? "bg-pass" : "bg-fail")} />
      {pass ? "Pass" : "Fail"}
    </span>
  );
}

const KIND_STYLE: Record<string, string> = {
  symptom: "border-fail/35 text-fail bg-fail-soft",
  cause: "border-line-strong text-ink bg-panel-2",
  incident: "border-dashed border-ink-3/50 text-ink-2",
};

/** A classifier finding. Symptoms are what went wrong, causes why, incidents were recovered from. */
export function FindingChip({ id, kind, onClick }: { id: string; kind: "symptom" | "cause" | "incident"; onClick?: () => void }) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      onClick={onClick}
      title={`${kind}: ${id}`}
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11.5px] leading-tight",
        KIND_STYLE[kind],
        onClick && "cursor-pointer hover:border-signal/60",
      )}
    >
      {label(id)}
    </Tag>
  );
}

export function Panel({ children, className, as: Tag = "section", id }: { children: ReactNode; className?: string; as?: "section" | "div" | "article"; id?: string }) {
  return (
    <Tag id={id} className={cn("relative rounded-2xl border border-line bg-panel shadow-card", className)}>
      {children}
    </Tag>
  );
}

/** Panel title with an optional one-line description under it (never a label above it). */
export function PanelHeader({ eyebrow, title, aside }: { eyebrow?: ReactNode; title: ReactNode; aside?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <h2 className="text-[14.5px] font-semibold leading-tight">{title}</h2>
        {eyebrow && <p className="mt-0.5 text-[12.5px] leading-snug text-ink-3">{eyebrow}</p>}
      </div>
      {aside}
    </header>
  );
}

/** A view's title block: a two-tone heading (claim in ink, consequence in dim), one sentence,
 *  and its actions. Pass `dim` for the second tone and `icon` for a drawn tile in the line. */
export function PageHead({ title, dim, icon, description, actions }: { title: ReactNode; dim?: ReactNode; icon?: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[26px] font-bold leading-[1.12] tracking-[-0.02em] sm:text-[30px]">
          {title}
          {dim && <span className="text-dim"> {dim}</span>}
          {icon}
        </h1>
        {description && <p className="mt-1.5 max-w-[68ch] text-[14px] leading-relaxed text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type ButtonTone = "primary" | "secondary" | "ghost" | "danger" | "record";

/* The record action: ochre, with the record-light dot before the label (added in CSS). */
const TONE: Record<ButtonTone, string> = {
  primary: "bg-solid text-on-solid hover:brightness-95",
  record: "bg-signal text-on-signal hover:bg-signal-strong pill-rec-dot",
  secondary: "bg-panel-2 text-ink hover:bg-panel-3",
  ghost: "border border-line-strong bg-transparent text-ink hover:bg-panel-2",
  danger: "border border-fail/30 text-fail hover:bg-fail-soft",
};

export function Button({ tone = "secondary", size = "md", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "press inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" ? "h-8 px-3.5 text-[12.5px]" : "h-9 px-4 text-[13.5px]",
        TONE[tone],
        className,
      )}
    />
  );
}

export const fieldClass =
  "w-full rounded-lg bg-panel px-3 py-2 text-[13.5px] text-ink outline-none transition-colors placeholder:text-ink-3 focus:outline-none focus:ring-0 " +
  "shadow-[inset_0_0_0_1px_var(--line-strong),0_1px_2px_rgb(27_26_23_/_0.04)] focus:shadow-[inset_0_0_0_2px_var(--signal),0_0_0_5px_var(--signal-soft)]";

/* ------------------------------------------------------------------ exhibits */

/**
 * Exhibits: every piece of evidence (a transcript line, a step, a run, a frame) registers under a
 * short tag; a citation anywhere on the page scrolls to it and lights it up.
 */
const ExhibitContext = createContext<{ cite: (id: string) => void }>({ cite: () => {} });

export function ExhibitProvider({ children }: { children: ReactNode }) {
  const cite = useCallback((id: string) => {
    const el = document.querySelector<HTMLElement>(`[data-exhibit="${CSS.escape(id)}"]`);
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    el.classList.remove("exhibit-lit");
    void el.offsetWidth; // restart the animation on a repeated citation
    el.classList.add("exhibit-lit");
    el.focus?.({ preventScroll: true });
  }, []);
  return <ExhibitContext.Provider value={{ cite }}>{children}</ExhibitContext.Provider>;
}

export function useExhibits() {
  return useContext(ExhibitContext);
}

/** The tag on a piece of evidence: exhibit cream, mono, a half-opacity dot before the label. */
export function ExhibitTag({ n, className }: { n: string | number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[18px] shrink-0 items-center gap-1 rounded-[6px] bg-exhibit px-1.5 font-mono text-[10.5px] font-semibold leading-none text-exhibit-ink",
        className,
      )}
    >
      <span className="size-[5px] rounded-full bg-current opacity-55" aria-hidden />
      EX {n}
    </span>
  );
}

/** A citation of an exhibit: click to spotlight it. */
export function Cite({ id, n, children }: { id: string; n: string | number; children?: ReactNode }) {
  const { cite } = useExhibits();
  return (
    <button
      type="button"
      onClick={() => cite(id)}
      className="group inline-flex items-center gap-1 rounded-md border border-signal/30 bg-exhibit-soft py-0.5 pl-0.5 pr-1.5 align-middle text-[11.5px] text-highlight-ink transition-colors hover:border-signal"
      title="Show this evidence"
    >
      <ExhibitTag n={n} />
      {children}
    </button>
  );
}

/** A clickable summary card. Hover only darkens the rule; nothing lifts or glows. */
export function SpotlightCard({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("w-full rounded-lg border border-line bg-panel text-left transition-colors hover:border-line-strong hover:bg-panel-2", className)}>
      {children}
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
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line-strong px-2 py-1 text-xs text-ink-2 hover:border-signal hover:text-ink"
      >
        {state === "copied" ? "Copied" : state === "select" ? "Selected" : buttonLabel}
      </button>
    </span>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<string>(() => document.documentElement.getAttribute("data-theme") ?? "light");
  const dark = theme === "dark";
  return (
    <button
      type="button"
      aria-label={dark ? "Switch to the light theme" : "Switch to the dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
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
      className={cn("inline-flex h-8 items-center justify-center rounded-lg px-2 text-ink-3 transition-colors hover:bg-panel-2 hover:text-ink", className)}
    >
      <span className="text-[12px] font-medium">{dark ? "Day" : "Night"}</span>
    </button>
  );
}

/**
 * Empty state: a drawn tile, one sentence and the single next thing to do. No dashed box — the
 * tile carries the meaning, the sentence tells you why it is empty, the pill is the way out.
 */
export function Empty({ title, icon, tone = "ink", children, action }: { title: string; icon?: ReactNode; tone?: "ink" | "signal" | "rec" | "pass" | "exhibit" | "muted"; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-2.5 px-5 py-9 text-center">
      {icon && <span className={`tile t-${tone}`}>{icon}</span>}
      <div className="text-[15px] font-semibold text-ink">{title}</div>
      {children && <div className="max-w-[56ch] text-[13.5px] leading-relaxed text-ink-2">{children}</div>}
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  );
}

/** A stamped state on a row that stays listed (failed, cancelled, kept). */
export function Stamp({ tone, children }: { tone: "fail" | "pass" | "warn" | "muted"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex -rotate-2 items-center rounded border-[1.5px] px-1.5 py-px font-mono text-[10px] font-bold uppercase tracking-[0.12em]",
        tone === "fail" && "border-fail/70 text-fail",
        tone === "pass" && "border-pass/70 text-pass",
        tone === "warn" && "border-warn/70 text-warn",
        tone === "muted" && "border-ink-3/60 text-ink-3",
      )}
    >
      {children}
    </span>
  );
}

/** The two marks the product needs: play and pause, drawn to the type's stroke. */
export function PlayMark({ paused }: { paused?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="shrink-0">
      {paused ? (
        <g fill="currentColor">
          <rect x="2" y="1.5" width="2.6" height="9" rx="0.6" />
          <rect x="7.4" y="1.5" width="2.6" height="9" rx="0.6" />
        </g>
      ) : (
        <path d="M3 1.6v8.8L10.4 6z" fill="currentColor" />
      )}
    </svg>
  );
}
