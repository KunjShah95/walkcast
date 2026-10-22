import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Download, type LucideIcon } from "lucide-react";
import { type ComponentProps, type ComponentType, type ReactNode, useEffect, useState } from "react";
import { LINUX_APPIMAGE_URL, WINDOWS_EXE_URL } from "./site.ts";

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

/**
 * Fades content up once as it enters the viewport.
 *
 * The settle is opacity and a short rise only. A blur filter would look like more, but it costs a
 * repaint of the whole block on every frame of the fade, and a blur-to-sharp entrance is the one
 * animation every template ships. 16px of travel over 0.7s reads as a settle instead of a slide.
 */
export function Reveal({ children, delay = 0, className, as = "div" }: { children: ReactNode; delay?: number; className?: string; as?: "div" | "li" | "p" }) {
  const still = useReducedMotion();
  const C = motion[as];
  return (
    <C
      className={className}
      initial={still ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
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

export type Platform = "windows" | "linux";

/** The three places Walkcast installs, and the file each one lands as. */
const PLATFORMS: Record<Platform, { name: string; url: string }> = {
  windows: { name: "Windows", url: WINDOWS_EXE_URL },
  linux: { name: "Linux", url: LINUX_APPIMAGE_URL },
};

const PLATFORM_ICON: Record<Platform, ComponentType<ComponentProps<"svg">>> = {
  windows: WindowsIcon,
  linux: LinuxIcon,
};

/**
 * The visitor's desktop OS. Prerendered pages say Windows (most visitors, and what crawlers see);
 * after hydration a Mac or Linux visitor gets their own installer instead of a Windows .exe.
 */
function usePlatform(): Platform {
  const [p, setP] = useState<Platform>("windows");
  useEffect(() => {
    const ua = `${navigator.userAgent} ${(navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ?? ""}`;
    if (/Android|iPhone|iPad/i.test(ua)) return; // a phone can't install it; keep the default link
    if (/Linux|X11/i.test(ua)) setP("linux");
  }, []);
  return p;
}

/**
 * The download button, and the only one there is: the platform's glyph, the platform's name and
 * the arrow, in the same pill everywhere on the site. It follows the visitor's own machine.
 */
export function DownloadButton({
  big = false,
  label,
  className = "",
}: {
  big?: boolean;
  label?: string;
  className?: string;
}) {
  const platform = usePlatform();
  const meta = PLATFORMS[platform];
  const Icon = PLATFORM_ICON[platform];
  return (
    <motion.a
      className={`pill dl ${big ? "big" : ""} ${className}`}
      href={meta.url}
      onClick={() => announceDownload(meta.url)}
      whileTap={{ scale: 0.97 }}
    >
      <Icon width={big ? 18 : 16} height={big ? 18 : 16} />
      <span>{label ?? `Download for ${meta.name}`}</span>
      <Download size={big ? 17 : 15} strokeWidth={2.2} />
    </motion.a>
  );
}

/**
 * The same button three times, one per platform. Fixed order, so nothing moves when the page
 * hydrates and learns which machine the visitor is on.
 */
export function DownloadButtons({ big = false }: { big?: boolean }) {
  return (
    <div className="os-row" role="group" aria-label="Download Walkcast">
      {(Object.keys(PLATFORMS) as Platform[]).map((key) => {
        const meta = PLATFORMS[key];
        const Icon = PLATFORM_ICON[key];
        return (
          <motion.a
            key={key}
            className={`pill dl ${big ? "big" : ""}`}
            href={meta.url}
            onClick={() => announceDownload(meta.url)}
            whileTap={{ scale: 0.97 }}
          >
            <Icon width={big ? 18 : 16} height={big ? 18 : 16} />
            <span>{meta.name}</span>
            <Download size={big ? 17 : 15} strokeWidth={2.2} />
          </motion.a>
        );
      })}
    </div>
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

/* ------------------------------------------------------------------ download receipt */

const DOWNLOAD_EVENT = "walkcast:download";

/** Tell the page a download started, so the receipt can say which file is on its way. */
function announceDownload(url: string) {
  dispatchEvent(new CustomEvent(DOWNLOAD_EVENT, { detail: decodeURIComponent(url.split("/").pop() ?? "") }));
}

/**
 * A small receipt that slides up after a download click: the file's name, a short fill while the
 * browser picks it up, then where to find it. Without it the click looks like it did nothing,
 * because a download never leaves the page. Mounted once, for every download button.
 */
export function DownloadToast() {
  const still = useReducedMotion();
  const [file, setFile] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let t1: ReturnType<typeof setTimeout>;
    let t2: ReturnType<typeof setTimeout>;
    const on = (e: Event) => {
      clearTimeout(t1);
      clearTimeout(t2);
      setFile((e as CustomEvent<string>).detail);
      setDone(false);
      t1 = setTimeout(() => setDone(true), 1400);
      t2 = setTimeout(() => setFile(null), 5200);
    };
    addEventListener(DOWNLOAD_EVENT, on);
    return () => {
      removeEventListener(DOWNLOAD_EVENT, on);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);
  return (
    <div className="dl-toast-wrap" role="status" aria-live="polite">
      <AnimatePresence>
        {file && (
          <motion.div
            key="toast"
            className="dl-toast"
            initial={still ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={still ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
          >
            <span className={`dl-toast-ic ${done ? "done" : ""}`} aria-hidden="true">
              {done ? <Check size={15} strokeWidth={2.8} /> : <Download size={15} strokeWidth={2.4} />}
            </span>
            <span className="dl-toast-text">
              <b className="mono">{file}</b>
              <small>{done ? "Open it from your Downloads folder." : "Downloading…"}</small>
            </span>
            <span className="dl-toast-bar" aria-hidden="true"><i className={done ? "full" : ""} /></span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
