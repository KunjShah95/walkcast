/** The 30-tell checklist: reasons a build reads as generated instead of designed. */

export type Tell = { n: number; title: string; fix: string };

export type Group = { id: string; label: string; blurb: string; tells: Tell[] };

export const GROUPS: Group[] = [
  {
    id: "visual",
    label: "Visual defaults",
    blurb: "The palette and depth cues every generator falls into.",
    tells: [
      { n: 1, title: "harsh gradients", fix: "One quiet surface ramp; let borders and spacing do the separating." },
      { n: 2, title: "lucide icons", fix: "Draw the three or four marks you actually need, or use no icons at all." },
      { n: 3, title: "pure white background", fix: "A tinted paper (#faf9f7 or similar) reads as considered; #fff reads as default." },
      { n: 4, title: "rainbow coloring", fix: "One accent, used twice per screen. Everything else is ink on paper." },
      { n: 5, title: "drop shadows", fix: "Depth from borders and occlusion, not blur smears on every surface." },
      { n: 6, title: "3 feature cards in a row", fix: "Let the content dictate the grid: 2, 5, or 1 wide, never an automatic three." },
      { n: 8, title: "liquid glass", fix: "Transparent, blurred panels are a costume. Opaque, aligned panels are design." },
      { n: 9, title: "em dashes", fix: "Vary sentence length. The dash-every-clause voice is the tell." },
      { n: 10, title: "inter/geist/space grotesk", fix: "Pick a face with actual character — a serif, a mono, something with weight range." },
      { n: 13, title: "bento grids", fix: "Dense uniform grids with real hierarchy beat variable-size tiles with empty ones." },
      { n: 7, title: "emojis", fix: "Decorative emoji in headings or buttons is a marker. Use words, or nothing." },
      { n: 16, title: "checkmark bullets", fix: "Drop the checkmarks. If the list item matters, the type carries it." },
      { n: 22, title: "radial orbs", fix: "Remove the blurred color blobs. Texture and rules, not glow." },
      { n: 23, title: "dot grids", fix: "A visible dot background is scaffolding that shipped. Delete it." },
      { n: 24, title: "sparkle icons", fix: "Sparkles mean “AI”. Say what the feature does instead." },
      { n: 25, title: "animated arrows", fix: "A bouncing arrow from one card to the next is a slide template, not a UI." },
      { n: 29, title: "neon colors", fix: "Accent saturation stays under the ink. Nothing glows on a page of text." },
      { n: 30, title: "basic pastel colors", fix: "Pastels on white are the other default. Build a ramp with real steps." },
    ],
  },
  {
    id: "voice",
    label: "Voice and typography",
    blurb: "Copy and type that say nobody wrote this.",
    tells: [
      { n: 11, title: "colored left stripe", fix: "The AI-house signature block. A header and a rule look like a person made them." },
      { n: 15, title: '"it\'s not x, it\'s y"', fix: "That construction is a model artifact. State the thing plainly." },
      { n: 14, title: "terminal window", fix: "A fake shell showing made-up output is decoration. Ship the real thing or none of it." },
    ],
  },
  {
    id: "trust",
    label: "Trust and proof",
    blurb: "Where a real product shows its seams.",
    tells: [
      { n: 12, title: "fake testimonials", fix: "Named customers with links, or nothing. Invented quotes are the fastest way to lose one." },
      { n: 17, title: "3 pricing tiers", fix: "Two tiers and a contact link, or whatever your pricing actually is." },
      { n: 18, title: "no real product demos", fix: "Screenshots and a 20-second capture beat three columns of adjectives." },
      { n: 19, title: "soft corner radius", fix: "Pick a radius and keep it. 16px on everything is as default as sharp corners were." },
      { n: 20, title: "purple and black", fix: "The default dark-mode palette. Give the product a hue of its own." },
      { n: 21, title: "no skeleton loaders", fix: "Show the shape of what is coming. A spinner is an admission you didn't design the state." },
      { n: 26, title: "no TOS", fix: "If you collect an email, link terms and privacy from the signup itself." },
      { n: 27, title: "no privacy policy", fix: "Same. One page, real text, reachable in one click." },
    ],
  },
  {
    id: "interaction",
    label: "Interaction",
    blurb: "Motion that was never designed, only generated.",
    tells: [{ n: 28, title: "hover animations", fix: "Every card lifting on hover is noise. Motion only where it explains a change." }],
  },
];

export const ALL_TELLS: Tell[] = GROUPS.flatMap((g) => g.tells).sort((a, b) => a.n - b.n);

export const TITLES = new Set(ALL_TELLS.map((t) => t.title));

/** The shareable artifact: hand the model the list plus which ones are biting. */
export function auditPrompt(found: number[]): string {
  const hit = ALL_TELLS.filter((t) => found.includes(t.n));
  const clear = ALL_TELLS.filter((t) => !found.includes(t.n));
  const lines = (list: Tell[]) => list.map((t) => `- [ ] ${t.n}. ${t.title} — ${t.fix}`).join("\n");
  return [
    "Our site currently reads as AI-generated / vibecoded. Here is the checklist, with the items that actually apply to us checked.",
    "",
    lines(hit),
    "",
    "Already handled (do not touch):",
    lines(clear),
    "",
    "Rewrite the affected screens so they read as designed by a person: one deliberate palette, real type with weight range, density over tiles, no decorative motion. Keep the existing product behaviour and copy the business depends on. Tell me which files you changed and why.",
  ].join("\n");
}

/** 0–100, where 100 means nothing on the list applies. */
export function score(found: number[]): number {
  if (ALL_TELLS.length === 0) return 100;
  return Math.round(((ALL_TELLS.length - found.length) / ALL_TELLS.length) * 100);
}

export function verdict(s: number): "clean" | "close" | "vibecoded" {
  if (s >= 85) return "clean";
  if (s >= 55) return "close";
  return "vibecoded";
}