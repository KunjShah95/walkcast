import { CheckCircle2, Star } from "lucide-react";
import { motion, type Transition, useReducedMotion } from "motion/react";
import { type ComponentProps, type CSSProperties, useId, useState } from "react";
import { cn } from "../lib/format.ts";

export type Frequency = "monthly" | "yearly";
const FREQUENCIES: Frequency[] = ["monthly", "yearly"];

export interface Plan {
  name: string;
  info: string;
  /** Price per period in USD. A plan with a monthly price of 0 is treated as free. */
  price: Record<Frequency, number>;
  features: { text: string; tooltip?: string }[];
  btn: { text: string; href: string };
  highlighted?: boolean;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Percent saved by paying yearly, or null when there is nothing to compare against. */
function yearlySavings(price: Plan["price"]): number | null {
  if (price.monthly <= 0) return null;
  const pct = Math.round((1 - price.yearly / (price.monthly * 12)) * 100);
  return pct > 0 ? pct : null;
}

type PricingSectionProps = ComponentProps<"div"> & { plans: Plan[]; heading: string; description?: string };

export function PricingSection({ plans, heading, description, className, ...props }: PricingSectionProps) {
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const hasYearly = plans.some((p) => p.price.monthly > 0);
  return (
    <div className={cn("flex w-full flex-col items-center gap-5 p-4", className)} {...props}>
      <div className="mx-auto max-w-xl space-y-2 text-center">
        <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl lg:text-4xl">{heading}</h2>
        {description && <p className="text-sm text-ink-2 md:text-base">{description}</p>}
      </div>
      {hasYearly && <PricingFrequencyToggle frequency={frequency} setFrequency={setFrequency} />}
      <div className="mx-auto grid w-full max-w-4xl grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-4">
        {plans.map((plan) => (
          <PricingCard key={plan.name} plan={plan} frequency={frequency} />
        ))}
      </div>
    </div>
  );
}

type PricingFrequencyToggleProps = ComponentProps<"div"> & { frequency: Frequency; setFrequency: (f: Frequency) => void };

export function PricingFrequencyToggle({ frequency, setFrequency, className, ...props }: PricingFrequencyToggleProps) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label="Billing period" className={cn("mx-auto flex w-fit rounded-full border border-line bg-panel-2 p-1", className)} {...props}>
      {FREQUENCIES.map((freq) => {
        const active = frequency === freq;
        return (
          <button
            key={freq}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setFrequency(freq)}
            className={cn("relative px-4 py-1 text-sm capitalize transition-colors", active ? "text-paper" : "text-ink-2 hover:text-ink")}
          >
            {active && (
              <motion.span layoutId={`frequency-${id}`} transition={{ type: "spring", duration: 0.4 }} className="absolute inset-0 rounded-full bg-ink" />
            )}
            <span className="relative">{freq}</span>
          </button>
        );
      })}
    </div>
  );
}

type PricingCardProps = ComponentProps<"div"> & { plan: Plan; frequency?: Frequency };

export function PricingCard({ plan, frequency = "monthly", className, ...props }: PricingCardProps) {
  const free = plan.price.monthly <= 0;
  const savings = frequency === "yearly" ? yearlySavings(plan.price) : null;
  return (
    <div className={cn("relative flex w-full flex-col rounded-xl border border-line bg-panel shadow-card", className)} {...props}>
      {plan.highlighted && <BorderTrail className="bg-rec" size={90} />}
      <div className={cn("rounded-t-xl border-b border-line p-4", plan.highlighted && "bg-panel-2")}>
        <div className="absolute right-2 top-2 z-10 flex items-center gap-2">
          {plan.highlighted && (
            <p className="flex items-center gap-1 rounded-md border border-line bg-panel px-2 py-0.5 text-xs">
              <Star className="size-3 fill-current" aria-hidden />
              Popular
            </p>
          )}
          {savings !== null && <p className="rounded-md bg-ink px-2 py-0.5 text-xs text-paper">{savings}% off</p>}
        </div>
        <div className="text-lg font-medium">{plan.name}</div>
        <p className="text-sm text-ink-2">{plan.info}</p>
        <h3 className="mt-2 flex items-end gap-1">
          <span className="font-display text-3xl font-semibold tabular-nums">{usd.format(plan.price[frequency])}</span>
          {!free && <span className="text-ink-3">/{frequency === "monthly" ? "month" : "year"}</span>}
        </h3>
      </div>
      <ul className="space-y-4 px-4 py-6 text-sm text-ink-2">
        {plan.features.map((feature) => (
          <li key={feature.text} className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0 text-ink" aria-hidden />
            {feature.tooltip ? <Hint text={feature.text} tip={feature.tooltip} /> : <span>{feature.text}</span>}
          </li>
        ))}
      </ul>
      <div className={cn("mt-auto border-t border-line p-3", plan.highlighted && "bg-panel-2")}>
        <a
          href={plan.btn.href}
          className={cn(
            "inline-flex h-10 w-full items-center justify-center rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal",
            plan.highlighted ? "bg-ink text-paper hover:bg-ink/90" : "border border-line bg-panel hover:bg-panel-2",
          )}
        >
          {plan.btn.text}
        </a>
      </div>
    </div>
  );
}

/** Dashed-underline term with a hover/focus tooltip; CSS only, so it needs no portal or provider. */
function Hint({ text, tip }: { text: string; tip: string }) {
  const id = useId();
  return (
    <span className="group relative">
      <span tabIndex={0} aria-describedby={id} className="cursor-help border-b border-dashed border-ink-3 outline-none focus-visible:border-signal">
        {text}
      </span>
      <span
        role="tooltip"
        id={id}
        className="pointer-events-none absolute bottom-full left-0 z-50 mb-1.5 w-max max-w-56 rounded-md border border-line bg-panel px-3 py-1.5 text-xs text-ink opacity-0 shadow-card transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {tip}
      </span>
    </span>
  );
}

type BorderTrailProps = {
  className?: string;
  size?: number;
  transition?: Transition;
  delay?: number;
  onAnimationComplete?: () => void;
  style?: CSSProperties;
};

/** A small glow that travels the parent's border. Parent must be `relative` with a border radius. */
export function BorderTrail({ className, size = 60, transition, delay, onAnimationComplete, style }: BorderTrailProps) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <div className="pointer-events-none absolute inset-0 rounded-[inherit] border border-transparent [mask-clip:padding-box,border-box] [mask-composite:intersect] [mask-image:linear-gradient(transparent,transparent),linear-gradient(#000,#000)]">
      <motion.div
        className={cn("absolute aspect-square bg-ink-3", className)}
        style={{ width: size, offsetPath: `rect(0 auto auto 0 round ${size}px)`, ...style }}
        animate={{ offsetDistance: ["0%", "100%"] }}
        transition={{ ...(transition ?? { repeat: Infinity, duration: 5, ease: "linear" }), delay }}
        onAnimationComplete={onAnimationComplete}
      />
    </div>
  );
}
