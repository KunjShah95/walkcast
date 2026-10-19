import { motion, useReducedMotion } from "motion/react";
import { Download, type LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { WINDOWS_EXE_URL } from "./site.ts";

export type Tone = "ink" | "ochre" | "rec" | "yellow" | "blue" | "violet" | "pink" | "green" | "orange";

/** A coloured icon tile set into a headline. It pops in when it scrolls into view. Decorative. */
export function Tile({ icon: Icon, tone, tilt = 0, fill = false }: { icon: LucideIcon; tone: Tone; tilt?: number; fill?: boolean }) {
  const still = useReducedMotion();
  return (
    <motion.span
      className={`tile t-${tone}`}
      aria-hidden="true"
      initial={still ? false : { scale: 0.4, rotate: tilt - 18, opacity: 0 }}
      whileInView={{ scale: 1, rotate: tilt, opacity: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ type: "spring", stiffness: 380, damping: 18, delay: 0.15 }}
      whileHover={{ rotate: tilt + (tilt >= 0 ? 8 : -8), scale: 1.08 }}
    >
      <Icon strokeWidth={2.4} fill={fill ? "currentColor" : "none"} />
    </motion.span>
  );
}

/** Fades content up once as it enters the viewport. */
export function Reveal({ children, delay = 0, className, as = "div" }: { children: ReactNode; delay?: number; className?: string; as?: "div" | "li" | "p" }) {
  const still = useReducedMotion();
  const C = motion[as];
  return (
    <C
      className={className}
      initial={still ? false : { opacity: 0, y: 22, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, ease: [0.2, 0.7, 0.2, 1], delay }}
    >
      {children}
    </C>
  );
}

/** A section mark: a mono number, then the section's name. */
export function Eyebrow({ n, children }: { n: number; children: ReactNode }) {
  return (
    <p className="eyebrow">
      <span className="eyebrow-n">{String(n).padStart(2, "0")}</span>
      {children}
    </p>
  );
}

export function DownloadButton({ big = false, label = "Download for Windows", className = "" }: { big?: boolean; label?: string; className?: string }) {
  return (
    <motion.a className={`pill rec ${big ? "big" : ""} ${className}`} href={WINDOWS_EXE_URL} whileTap={{ scale: 0.96 }}>
      {label}
      <Download size={big ? 17 : 15} strokeWidth={2.2} />
    </motion.a>
  );
}

export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
      <rect x=".5" y=".5" width="25" height="25" rx="7" fill="#1d5e58" />
      <path d="M5.6 20.4c2.4-.6 4.6-2.6 6.1-5.6" fill="none" stroke="#f6d776" strokeWidth="1.9" strokeLinecap="round" strokeDasharray=".1 3" />
      <path d="M11.6 6.4 20 10.1l-3.8 1.4-1.4 3.8z" fill="#fbf8f3" stroke="#fbf8f3" strokeWidth=".8" strokeLinejoin="round" />
      <circle cx="20" cy="19.6" r="2.5" fill="#c0321c" stroke="#fbf8f3" strokeWidth="1.2" />
    </svg>
  );
}

export function GithubIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65S8.93 17.38 9 18v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

export function WindowsIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden="true" {...props}>
      <path d="M3 5.5 10.5 4.4v7.1H3zM11.5 4.3 21 3v8.5h-9.5zM3 12.5h7.5v7.1L3 18.5zM11.5 12.5H21V21l-9.5-1.3z" />
    </svg>
  );
}

export function AppleIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden="true" {...props}>
      <path d="M17.5 13.2c0 3.3 2.9 4.4 2.9 4.4s-2 5.7-4.6 5.7c-1.2 0-2.1-.8-3.5-.8-1.4 0-2.6.8-3.5.8-2.5 0-5.7-5.5-5.7-10 0-4.6 3-7 5.8-7 1.5 0 2.8.9 3.6.9.8 0 2.3-1 4-1 1.6 0 3.1.7 4 1.9-3.5 2-2.9 5.9 1 6.1zM14.5 4.1c.7-.9 1.2-2.1 1.1-3.3-1.1.1-2.4.7-3.2 1.6-.7.8-1.3 2-1.1 3.2 1.2.1 2.4-.6 3.2-1.5z" />
    </svg>
  );
}

export function LinuxIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 2c-1.1 0-2 .9-2 2 0 .7.4 1.4 1 1.7v1.4c-2.4.4-4.3 2.2-4.8 4.6l-.2.1c-1.4 0-2.5 1.1-2.5 2.5s1.1 2.5 2.5 2.5h.3c.4 1.2 1.2 2.2 2.2 3v1.2c0 .6.4 1 1 1h6c.6 0 1-.4 1-1v-1.2c1-.8 1.8-1.8 2.2-3h.3c1.4 0 2.5-1.1 2.5-2.5s-1.1-2.5-2.5-2.5l-.2-.1c-.5-2.4-2.4-4.2-4.8-4.6V5.7c.6-.3 1-1 1-1.7 0-1.1-.9-2-2-2zm-2 12c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zm4 0c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1z" />
    </svg>
  );
}

/** The traffic-light title bar shared by every app mock. */
export function WindowBar({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="win-bar">
      <span className="lights" aria-hidden="true"><i /><i /><i /></span>
      <span className="win-title">{title}</span>
      {children}
    </div>
  );
}
