import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";

/** Cursor-following radial spotlight. Drop over a hero/container. */
export function Spotlight({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 200, damping: 30 });
  const sy = useSpring(y, { stiffness: 200, damping: 30 });
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      x.set(e.clientX - r.left);
      y.set(e.clientY - r.top);
    };
    el.addEventListener("mousemove", onMove);
    return () => el.removeEventListener("mousemove", onMove);
  }, [x, y]);
  return (
    <motion.div
      ref={ref}
      className={`pointer-events-none absolute inset-0 z-0 ${className}`}
      style={{
        background: useTransform(
          [sx, sy],
          ([cx, cy]) => `radial-gradient(420px circle at ${cx}px ${cy}px, rgba(180,83,9,0.18), transparent 60%)`,
        ),
      }}
    />
  );
}

/** Faint dot grid background with radial mask fade. */
export function DotGrid({ className = "" }: { className?: string }) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 z-0 ${className}`}
      style={{
        backgroundImage: "radial-gradient(rgba(255,255,255,0.09) 1px, transparent 1px)",
        backgroundSize: "22px 22px",
        maskImage: "radial-gradient(ellipse at center, black 40%, transparent 85%)",
        WebkitMaskImage: "radial-gradient(ellipse at center, black 40%, transparent 85%)",
      }}
    />
  );
}

/** Animated moving gradient border wrapper. */
export function MovingBorder({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative rounded-2xl p-[1px] ${className}`}>
      <motion.div
        className="absolute inset-0 rounded-2xl"
        style={{
          background: "conic-gradient(from 0deg, transparent 0deg, #b45309 60deg, #fcd34d 120deg, transparent 180deg, transparent 360deg)",
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
      />
      <div className="relative rounded-2xl bg-panel">{children}</div>
    </div>
  );
}

/** Bento grid container. */
export function Bento({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`grid auto-rows-[minmax(120px,auto)] grid-cols-1 gap-4 md:grid-cols-3 ${className}`}>{children}</div>;
}

/** Bento cell with hover lift. */
export function BentoCell({ children, span = "", className = "" }: { children: React.ReactNode; span?: string; className?: string }) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className={`group relative overflow-hidden rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-line-strong ${span} ${className}`}
    >
      {children}
    </motion.div>
  );
}

/** Text generate reveal: words fade/blur in sequentially. */
export function TextGenerate({ text, className = "" }: { text: string; className?: string }) {
  const words = text.split(" ");
  return (
    <motion.h1 className={className} initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}>
      {words.map((w, i) => (
        <motion.span
          key={i}
          className="inline-block"
          variants={{ hidden: { opacity: 0, filter: "blur(6px)", y: 8 }, visible: { opacity: 1, filter: "blur(0px)", y: 0 } }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          {w}&nbsp;
        </motion.span>
      ))}
    </motion.h1>
  );
}

/** Animated background beams (thin drifting lines). */
export function Beams({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 z-0 overflow-hidden ${className}`}>
      {Array.from({ length: 6 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute h-px w-[40%] bg-gradient-to-r from-transparent via-signal to-transparent opacity-30"
          style={{ top: `${12 + i * 14}%`, left: "-40%" }}
          animate={{ x: ["0vw", "160vw"] }}
          transition={{ duration: 8 + i * 1.5, repeat: Infinity, ease: "linear", delay: i * 1.2 }}
        />
      ))}
    </div>
  );
}