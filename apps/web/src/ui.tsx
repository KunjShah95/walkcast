import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Download, EyeOff, Film, Captions, FileText, Globe, Play, type LucideIcon } from "lucide-react";
import { type ComponentProps, type ComponentType, type ReactNode, useEffect, useState } from "react";
import { LINUX_APPIMAGE_URL, WINDOWS_EXE_URL } from "./site.ts";

export function iconsOf(icons: LucideIcon[]) {
  return icons.map((I) => <I key={I === Check ? "check" : I === Download ? "download" : I === EyeOff ? "eye-off" : I === Film ? "film" : I === Captions ? "captions" : I === FileText ? "file-text" : I === Globe ? "globe" : I === Play ? "play" : null} />);
}

/** The hero: a dark theatre card on a warm paper ground. Single focal, one CTA in the copy, one CTA in the button. */

export function HeroBlock({ className = "" }: { className?: string }) {
  return (
    <section className={`hero-block ${className ?? ""}`} aria-label="Walkcast hero">
      <div className="hero-block-media">
        <div className="hero-block-stage">
          <div className="hero-block-card">
            <div className="hero-block-bar">
              <span className="hero-block-lights" aria-hidden="true"><i /><i /><i /></span>
              <span className="hero-block-url mono">agentic-crm-henna.vercel.app</span>
              <span className="hero-block-live">REC</span>
            </div>
            <div className="hero-block-screen">
              <div className="hero-block-poster" />
              <div className="hero-block-cap">A real browser signs in, walks the pages and narrates what it did.</div>
              <button className="hero-block-play" aria-label="Play the recording"><Play size={14} /></button>
            </div>
            <div className="hero-block-side">
              <div className="hero-block-side-head">
                <span className="hero-block-title">Visit log</span>
                <span className="mono">click to seek</span>
              </div>
              <ol className="hero-block-cues">
                <li><button aria-current="true"><time>0:11</time><span>A real browser signs in, walks the pages and narrates what it did.</span></button></li>
                <li><button aria-current="false"><time>0:23</time><span>It signs in and walks the site, page by page.</span></button></li>
                <li><button aria-current="false"><time>0:35</time><span>One continuous visit, no timeline to work in.</span></button></li>
                <li><button aria-current="false"><time>0:47</time><span>H.264 with captions, a transcript, the page list.</span></button></li>
              </ol>
            </div>
            <div className="hero-block-foot">
              <span className="chip"><Film size={13} /> walkthrough.mp4</span>
              <span className="chip"><Captions size={13} /> captions.vtt</span>
              <span className="chip"><FileText size={13} /> transcript.txt</span>
              <span className="chip"><Globe size={13} /> 6 pages <b>200 OK</b></span>
            </div>
          </div>
          <span className="hero-block-tab">A real recording · unedited</span>
        </div>
      </div>
      <div className="hero-block-copy">
        <div className="hero-block-ctas">
          <a className="hero-block-download" href="/#demo"><Download size={15} /> Watch a real recording</a>
          <a className="hero-block-cta" href="/download"><Download size={15} /> Download for Windows &amp; Linux</a>
        </div>
        <ul className="hero-block-trust" aria-label="What it costs and includes">
          <li><Check size={14} strokeWidth={2.8} /> Free, MIT licensed</li>
          <li><Check size={14} strokeWidth={2.8} /> No account needed</li>
          <li><Check size={14} strokeWidth={2.8} /> No watermark on the video</li>
          <li><Check size={14} strokeWidth={2.8} /> Every seat included</li>
        </ul>
      </div>
    </section>
  );
}


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

/** The two places Walkcast installs, and the file each one lands as. */
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
 * after hydration a Linux visitor gets their own installer instead of a Windows .exe.
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

/** A small review card: an initials avatar, a one-line quote, the author and the link to the post. */

export function ReviewCard({ name, handle, quote, avatar }: { name: string; handle: string; quote: string; avatar?: string }) {
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("");
  return (
    <figure className="review-card">
      <blockquote cite={`https://example.com/${handle}`}><q>{quote}</q></blockquote>
      <figcaption className="review-card-foot">
        {avatar ? <img className="review-card-av" src={avatar} alt="" /> : <span className="review-card-av" aria-hidden="true">{initials}</span>}
        <span className="review-card-name"><b>{name}</b> <span className="mono">@{handle}</span></span>
        <a className="review-card-link" href={`https://example.com/${handle}`}>Read on X</a>
      </figcaption>
    </figure>
  );
}

/** One step of an install flow: a numbered chip, a short title and a 15px description. */

export function InstallStep({ number, title, text, icon: Icon }: { number: number; title: string; text: string; icon: LucideIcon }) {
  return (
    <div className="install-step">
      <span className="install-step-number">{String(number).padStart(2, "0")}</span>
      <span className="install-step-icon"><Icon size={15} /></span>
      <div className="install-step-copy">
        <b className="install-step-title">{title}</b>
        <small className="install-step-text">{text}</small>
      </div>
    </div>
  );
}

/** A head with one clear focal, a supporting picture of the product, and one large CTA. */

export function HeroSection({ headline, subhead, picture, cta, children, eyebrow, className = "" }: {
  headline: string;
  subhead: string;
  eyebrow?: string;
  picture?: ReactNode;
  cta?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`hero-section ${className ?? ""}`}>
      <div className="hero-section-copy">
        {eyebrow && <span className="hero-section-eyebrow">{eyebrow}</span>}
        <h1 className="hero-section-headline">{headline}</h1>
        <p className="hero-section-subhead">{subhead}</p>
        {children}
        {cta && <a className="hero-section-cta">{cta}</a>}
      </div>
      {picture}
    </section>
  );
}

/** A counter beaten out in the sheet metal of the card: the headline number, then the label below. */

export function Beaten({ children, className = "", value }: { children: ReactNode; className?: string; value: string }) {
  return (
    <div className={`beaten ${className ?? ""}`}>
      <div className="beaten-inner">
        <span className="beaten-value mono">{value}</span>
        <span className="beaten-label">{children}</span>
      </div>
    </div>
  );
}

/** One row of a feature list: a small icon chip, an 18px headline, a muted 15px description. */

export function FeatureRow({ icon: Icon, title, text, className = "" }: { icon: LucideIcon; title: string; text: string; className?: string }) {
  return (
    <div className={`feature-row ${className ?? ""}`}>
      <span className="feature-row-icon"><Icon size={15} /></span>
      <div className="feature-row-copy">
        <b className="feature-row-title">{title}</b>
        <small className="feature-row-text">{text}</small>
      </div>
    </div>
  );
}

/** One product card: punch-out relief at the top, a halo wrap-around, full width, and one large CTA. */

export function ProductCard({ title, eyebrow, children, className = "", href, cta }: {
  title: string;
  eyebrow: string;
  children: ReactNode;
  className?: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div className={`product-card ${className ?? ""}`}>
      <div className="product-card-top">
        <span className="product-card-relief"><i /><i /><i /><i /><i /></span>
        <span className="product-card-halo" aria-hidden="true"><i /><i /><i /><i /><i /></span>
        <span className="product-card-eyebrow">{eyebrow}</span>
        <h3 className="product-card-title">{title}</h3>
      </div>
      <div className="product-card-body">
        {children}
      </div>
      {href && cta && (
        <a className="product-card-cta" href={href}>
          {cta}
        </a>
      )}
    </div>
  );
}

/** A small circle that turns from placeholding blue to a warm signal on reveal, for turntable-style number cards. */

export function Turntable({ children, className = "", value }: { children: ReactNode; className?: string; value: string }) {
  const still = useReducedMotion();
  return (
    <div className={`turntable ${className ?? ""}`}>
      <div className="turntable-ring">
        <div className={`turntable-disk ${still ? "" : "turntable-rotate"}`}>
          <div className="turntable-inner">
            <span className="turntable-value mono">{value}</span>
            <span className="turntable-label">{children}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Three numbered milestones: all children are in view at once, one at the top of the card. */

export function Milestones({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`milestones ${className ?? ""}`}>
      <div className="milestones-track">
        {iconsOf(children as LucideIcon[])}
      </div>
      {children}
    </div>
  );
}
