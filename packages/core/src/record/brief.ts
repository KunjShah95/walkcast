import { scrubText } from "../capture/secrets.ts";

/**
 * What a page says about itself, read off the page.
 *
 * The plain narration says what the browser did ("Opening the pricing page"). A presenter says
 * what is on the screen: the headline, the line under it, the button it wants you to press,
 * the sections further down and the prices it shows. Every word of that comes from the page,
 * quoted, so the narration stays a record of what was there and never a claim about it.
 */
export interface Brief {
  h1?: string;
  tagline?: string;
  cta?: string;
  sections: string[];
  prices: string[];
  /** What a form on the page asks for, in the order the fields appear: "Email", "Password". */
  fields?: string[];
  /** The other controls an app screen offers, when it has no prose to read out instead. */
  actions?: string[];
}

/** Runs inside the page. Must be self-contained. */
export function briefInPage(): Brief {
  const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
  // innerText, not textContent: a <br> inside a heading is a line break, not glue between words.
  const said = (el: Element | null | undefined) => clean((el as HTMLElement | null)?.innerText ?? el?.textContent);
  const shown = (el: Element) => {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none" && !el.closest("[data-walkcast]");
  };
  const h1El = Array.from(document.querySelectorAll("h1")).find(shown) ?? null;
  const h1 = said(h1El).slice(0, 120);
  // The line under the headline: the first paragraph after it with something to say, else the
  // page's own description.
  let tagline = "";
  if (h1El) {
    const after = Array.from(document.querySelectorAll("p, h2")).filter(
      (p) => shown(p) && h1El.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
    tagline = said(after.find((p) => said(p).split(" ").length >= 5));
  }
  if (!tagline) tagline = clean(document.querySelector('meta[name="description"]')?.getAttribute("content"));
  // The button the page leads with: the first prominent control after the headline.
  let cta = "";
  let ctaEl: Element | null = null;
  const controls = Array.from(document.querySelectorAll("a[href], button")).filter(shown);
  const lead = h1El ? controls.filter((c) => h1El.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) : controls;
  for (const c of lead.slice(0, 6)) {
    const text = said(c);
    const st = getComputedStyle(c);
    const filled = st.backgroundColor !== "rgba(0, 0, 0, 0)" && st.backgroundColor !== "transparent";
    if (text && text.length <= 40 && (c.tagName === "BUTTON" || filled)) {
      cta = text;
      ctaEl = c;
      break;
    }
  }
  // An app screen has no sections to tour, so the controls it offers are what there is to say
  // about it. Their own words, quoted, in the order the page puts them.
  const actions = controls
    .filter((c) => c !== ctaEl)
    .map((c) => said(c))
    .filter((t) => t && t.length <= 28)
    .filter((t, i, all) => all.indexOf(t) === i)
    .slice(0, 4);
  // What a form asks for, never what was typed into it: a recording must not narrate a value.
  const fields = Array.from(document.querySelectorAll("input, textarea, select"))
    .filter((el) => shown(el) && !(el as HTMLInputElement).disabled && (el as HTMLInputElement).type !== "hidden")
    .map((el) => {
      const input = el as HTMLInputElement;
      const label =
        input.labels?.[0]?.innerText ?? el.getAttribute("aria-label") ?? el.getAttribute("placeholder") ?? input.name ?? "";
      return clean(label).slice(0, 32);
    })
    .filter(Boolean)
    .filter((t, i, all) => all.indexOf(t) === i)
    .slice(0, 4);
  const sections = Array.from(document.querySelectorAll("h2"))
    .filter(shown)
    // A heading's first sentence: "Record once. The video and captions are one run." is "Record once".
    .map((h) => said(h).replace(/^(.{4,}?)[.!?](\s.*)?$/, "$1"))
    .filter((t) => t && t.length <= 48 && t !== h1)
    .filter((t, i, all) => all.indexOf(t) === i)
    .slice(0, 5);
  const text = clean(document.body?.innerText).slice(0, 20000);
  const prices = Array.from(new Set(text.match(/(?:[$€£₹]\s?\d[\d,]*(?:\.\d{2})?)(?:\s?\/\s?(?:mo|month|yr|year|user))?/g) ?? [])).slice(0, 4);
  return { h1, tagline, cta, sections, prices, fields, actions };
}

/** Text from the site is spoken aloud: keep it short, and never let a credential through. */
function safe(s: string | undefined, max: number): string {
  const t = scrubText(s ?? "").replace(/\s+/g, " ").trim();
  if (!t || /\{\{secret:/.test(t)) return "";
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), Math.floor(max * 0.6)))}…`;
}

/** The first sentence of a tagline, at most about 25 words. */
function firstSentence(s: string): string {
  const one = s.match(/^[^.!?]{8,}[.!?]/)?.[0] ?? s;
  const words = one.split(" ");
  const short = words.length > 25 ? `${words.slice(0, 25).join(" ")}…` : one;
  return /[.!?…]$/.test(short) ? short : `${short}.`;
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

// Several ways to say the same evidence. A walkthrough of seven pages that opens every one with
// "It opens with ... The main button says ..." reads as a mail-merge, not a tour; rotating the
// phrasing by page index (never by chance, so a recording narrates the same way every time it is
// made again) keeps every word still read off the page, just not in the identical shape twice in
// a row.
const OPENER_WITH_TAGLINE = [
  (h1: string, tagline: string) => `It opens with “${h1}”. ${tagline}`,
  (h1: string, tagline: string) => `The headline here reads “${h1}”. ${tagline}`,
  (h1: string, tagline: string) => `This page leads with “${h1}”. ${tagline}`,
  (h1: string, tagline: string) => `Here, it says “${h1}”. ${tagline}`,
];
const OPENER_PLAIN = [(h1: string) => `The headline reads “${h1}”.`, (h1: string) => `It opens with “${h1}”.`];
const CTA_LINE = [
  (cta: string) => `The main button says “${cta}”.`,
  (cta: string) => `It wants you to hit “${cta}”.`,
  (cta: string) => `The button here reads “${cta}”.`,
  (cta: string) => `You’re nudged toward “${cta}”.`,
];
const SECTIONS_LEAD = [
  (s: string) => `Further down: ${s}.`,
  (s: string) => `Scroll further and you’ll find ${s}.`,
  (s: string) => `Below that: ${s}.`,
  (s: string) => `Keep going and there’s ${s}.`,
];

/** The line spoken as a page opens: its headline, the line under it, and its main button. */
export function briefLine(b: Brief, variant = 0): string | null {
  const h1 = safe(b.h1, 110);
  const tagline = safe(b.tagline, 220);
  const cta = safe(b.cta, 40);
  const parts: string[] = [];
  if (h1) {
    const title = h1.replace(/[.!]$/, "");
    parts.push(tagline && tagline !== h1 ? OPENER_WITH_TAGLINE[Math.abs(variant) % OPENER_WITH_TAGLINE.length]!(title, firstSentence(tagline)) : OPENER_PLAIN[Math.abs(variant) % OPENER_PLAIN.length]!(title));
  } else if (tagline) parts.push(firstSentence(tagline));
  if (cta && cta !== h1) parts.push(CTA_LINE[Math.abs(variant) % CTA_LINE.length]!(cta));
  return parts.length ? parts.join(" ") : null;
}

/** The line spoken while the page scrolls: what is further down, and the prices it shows. */
export function tourLine(b: Brief, variant = 0): string | null {
  // Four sections and three prices: a line that lists everything is a line nobody hears the end of.
  const sections = b.sections.map((s) => safe(s, 48)).filter(Boolean).slice(0, 4);
  const prices = b.prices.map((p) => safe(p, 24)).filter(Boolean).slice(0, 3);
  const parts: string[] = [];
  if (sections.length) parts.push(SECTIONS_LEAD[Math.abs(variant) % SECTIONS_LEAD.length]!(list(sections.map((s) => s.replace(/[.:!]$/, "")))));
  if (prices.length) parts.push(`Prices on the page include ${list(prices)}.`);
  return parts.length ? parts.join(" ") : null;
}

/**
 * The line spoken when the page asks for something: what the form wants, never what was typed.
 *
 * A page that asks for input is the one a walkthrough most often stops on, and "the headline
 * reads..." says nothing about it. The field labels do, and they are the page's own words.
 */
const FORM_LEAD = [(f: string) => `It has a form asking for ${f}.`, (f: string) => `The form here wants ${f}.`, (f: string) => `To continue, it asks for ${f}.`];

export function formLine(b: Brief, variant = 0): string | null {
  const fields = (b.fields ?? []).map((f) => safe(f, 32)).filter(Boolean).slice(0, 4);
  if (!fields.length) return null;
  return FORM_LEAD[Math.abs(variant) % FORM_LEAD.length]!(fields.length === 1 ? fields[0]! : list(fields));
}

/**
 * The line spoken on an app screen, which has controls instead of sections: what you can do here.
 *
 * It only speaks when the page has no sections and no prices to speak of, so a marketing page
 * keeps its headline-and-offer line and a dashboard gets one of its own.
 */
const ACTIONS_LEAD = [(a: string) => `On this screen: ${a}.`, (a: string) => `Here you can: ${a}.`, (a: string) => `This screen offers ${a}.`];

export function actionsLine(b: Brief, variant = 0): string | null {
  if (b.sections.length || b.prices.length) return null;
  const actions = (b.actions ?? []).map((a) => safe(a, 28)).filter(Boolean).slice(0, 4);
  if (actions.length < 2) return null;
  return ACTIONS_LEAD[Math.abs(variant) % ACTIONS_LEAD.length]!(list(actions));
}
