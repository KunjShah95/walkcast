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
  const controls = Array.from(document.querySelectorAll("a[href], button")).filter(shown);
  const lead = h1El ? controls.filter((c) => h1El.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) : controls;
  for (const c of lead.slice(0, 6)) {
    const text = said(c);
    const st = getComputedStyle(c);
    const filled = st.backgroundColor !== "rgba(0, 0, 0, 0)" && st.backgroundColor !== "transparent";
    if (text && text.length <= 40 && (c.tagName === "BUTTON" || filled)) {
      cta = text;
      break;
    }
  }
  const sections = Array.from(document.querySelectorAll("h2"))
    .filter(shown)
    // A heading's first sentence: "Record once. The video and captions are one run." is "Record once".
    .map((h) => said(h).replace(/^(.{4,}?)[.!?](\s.*)?$/, "$1"))
    .filter((t) => t && t.length <= 48 && t !== h1)
    .filter((t, i, all) => all.indexOf(t) === i)
    .slice(0, 5);
  const text = clean(document.body?.innerText).slice(0, 20000);
  const prices = Array.from(new Set(text.match(/(?:[$€£₹]\s?\d[\d,]*(?:\.\d{2})?)(?:\s?\/\s?(?:mo|month|yr|year|user))?/g) ?? [])).slice(0, 4);
  return { h1, tagline, cta, sections, prices };
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

/** The line spoken as a page opens: its headline, the line under it, and its main button. */
export function briefLine(b: Brief): string | null {
  const h1 = safe(b.h1, 110);
  const tagline = safe(b.tagline, 220);
  const cta = safe(b.cta, 40);
  const parts: string[] = [];
  if (h1) parts.push(tagline && tagline !== h1 ? `It opens with “${h1.replace(/[.!]$/, "")}”. ${firstSentence(tagline)}` : `The headline reads “${h1.replace(/[.!]$/, "")}”.`);
  else if (tagline) parts.push(firstSentence(tagline));
  if (cta && cta !== h1) parts.push(`The main button says “${cta}”.`);
  return parts.length ? parts.join(" ") : null;
}

/** The line spoken while the page scrolls: what is further down, and the prices it shows. */
export function tourLine(b: Brief): string | null {
  // Three sections and two prices: a line that lists everything is a line nobody hears the end of.
  const sections = b.sections.map((s) => safe(s, 48)).filter(Boolean).slice(0, 3);
  const prices = b.prices.map((p) => safe(p, 24)).filter(Boolean).slice(0, 2);
  const parts: string[] = [];
  if (sections.length) parts.push(`Further down: ${list(sections.map((s) => s.replace(/[.:!]$/, "")))}.`);
  if (prices.length) parts.push(`Prices on the page include ${list(prices)}.`);
  return parts.length ? parts.join(" ") : null;
}
