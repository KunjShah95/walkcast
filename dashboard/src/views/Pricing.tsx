import { PricingSection, type Plan } from "@/components/ui/pricing";
import { cn } from "@/lib/utils";

/**
 * Demo of the `components/ui/pricing` block. Static sample data — swap PLANS for real
 * billing data (a pricing/plan query) before using this as a real pricing page.
 */
export function Pricing() {
  return (
    <div className="grid gap-6">
      <section>
        <h1 className="font-display text-xl font-semibold tracking-tight">Pricing</h1>
        <p className="text-ink-2">
          Sample render of the shadcn pricing block, themed with this app&rsquo;s tokens.
        </p>
      </section>
      <PricingSection plans={PLANS} heading="Plans that Scale with You" description="Whether you're just starting out or growing fast, our flexible pricing has you covered — with no hidden costs." className={cn("rounded-xl border border-line bg-panel shadow-card")} />
    </div>
  );
}

const PLANS: Plan[] = [
  {
    name: "Basic",
    info: "For most individuals",
    price: { monthly: 7, yearly: Math.round(7 * 12 * (1 - 0.12)) },
    features: [
      { text: "Up to 3 Blog posts" },
      { text: "Up to 3 Transcriptions" },
      { text: "Up to 3 posts stored" },
      { text: "Markdown support", tooltip: "Export content in Markdown format" },
      { text: "Community support", tooltip: "Get answers to your questions on Discord" },
      { text: "AI powered suggestions", tooltip: "Get up to 100 AI powered suggestions" },
    ],
    btn: { text: "Start your free trial", href: "#" },
  },
  {
    highlighted: true,
    name: "Pro",
    info: "For small businesses",
    price: { monthly: 17.99, yearly: Math.round(17.99 * 12 * (1 - 0.12)) },
    features: [
      { text: "Up to 500 blog posts" },
      { text: "Up to 500 transcriptions" },
      { text: "Up to 500 posts stored" },
      { text: "Unlimited Markdown support", tooltip: "Export content in Markdown format" },
      { text: "SEO optimization tools" },
      { text: "Priority support", tooltip: "Get 24/7 chat support" },
      { text: "AI powered suggestions", tooltip: "Get up to 500 AI powered suggestions" },
    ],
    btn: { text: "Get started", href: "#" },
  },
  {
    name: "Business",
    info: "For large organizations",
    price: { monthly: 69.99, yearly: Math.round(49.99 * 12 * (1 - 0.12)) },
    features: [
      { text: "Unlimited blog posts" },
      { text: "Unlimited transcriptions" },
      { text: "Unlimited posts stored" },
      { text: "Unlimited Markdown support" },
      { text: "SEO optimization tools", tooltip: "Advanced SEO optimization tools" },
      { text: "Priority support", tooltip: "Get 24/7 chat support" },
      { text: "AI powered suggestions", tooltip: "Get up to 500 AI powered suggestions" },
    ],
    btn: { text: "Contact team", href: "#" },
  },
];
