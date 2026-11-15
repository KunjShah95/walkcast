import { motion, useReducedMotion, useScroll, useSpring, useTransform, type Variants } from "motion/react";
import { type ReactNode, useRef } from "react";

const EASE = [0.2, 0.7, 0.2, 1] as const;

/**
 * Sets an illustration into the page: it rises and settles flat as it reaches the reader, and a
 * soft shadow deepens with it. Transform and opacity only, so scrolling never costs a layout.
 */
export function Showcase({ children, label }: { children: ReactNode; label: string }) {
  const still = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.95", "start 0.45"] });
  const eased = useSpring(scrollYProgress, { stiffness: 140, damping: 26, mass: 0.4 });
  const y = useTransform(eased, [0, 1], [48, 0]);
  const scale = useTransform(eased, [0, 1], [0.955, 1]);
  const rotateX = useTransform(eased, [0, 1], [7, 0]);
  const lift = useTransform(eased, [0, 1], [0.35, 1]);

  return (
    <div ref={ref} className="showcase" role="img" aria-label={label}>
      <motion.div className="showcase-frame" style={still ? undefined : { y, scale, rotateX, opacity: lift }}>
        {children}
      </motion.div>
    </div>
  );
}

const list: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } } };
const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

/** A row of short captions that arrive one after another when scrolled to. */
export function Captions({ items }: { items: { n?: string; title: string; text: string }[] }) {
  const still = useReducedMotion();
  return (
    <motion.ol
      className="captions"
      variants={still ? undefined : list}
      initial={still ? false : "hidden"}
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
    >
      {items.map((c, i) => (
        <motion.li key={c.title} variants={still ? undefined : item} whileHover={still ? undefined : { y: -3 }} transition={{ duration: 0.25 }}>
          <span className="captions-n mono">{c.n ?? String(i + 1).padStart(2, "0")}</span>
          <b>{c.title}</b>
          <small>{c.text}</small>
        </motion.li>
      ))}
    </motion.ol>
  );
}
