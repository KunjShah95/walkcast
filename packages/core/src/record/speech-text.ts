/**
 * Caption text, rewritten to be said.
 *
 * A caption is written to be read: "Opening agentic-crm-henna.vercel.app.", "Visited 6 pages (2FA)".
 * A voice reads that as written, and the tells are all in the same few places: a hostname is
 * spelled out letter by letter or run together, a symbol is skipped, an abbreviation is said as
 * a word. This changes only what the voice is handed. The caption on screen, the transcript and
 * the WebVTT keep the original words, so nothing the viewer reads is altered.
 *
 * Deliberately small and deterministic: the same line always becomes the same speech, which the
 * narration clip cache relies on.
 */

import { existsSync, readFileSync } from "node:fs";

/** One "word = how it is said" rule, matched whole-word and case-insensitively. */
export type Pronunciation = [RegExp, string];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Parses "Kokoro = koh-koh-roh; Estate360 = estate three sixty" (separated by ; or new lines).
 * A product name, a person's name or a brand a voice gets wrong is fixed once, here, for every
 * recording: it changes what is spoken and never what is shown.
 */
export function parsePronunciations(source: string): Pronunciation[] {
  const rules: Pronunciation[] = [];
  for (const part of source.split(/[;\n]/)) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const word = part.slice(0, eq).trim();
    const say = part.slice(eq + 1).trim();
    if (!word || !say || word.length > 60 || say.length > 120) continue;
    rules.push([new RegExp(`(?<![\\w-])${escape(word)}(?![\\w-])`, "gi"), say]);
  }
  return rules;
}

let loaded: { key: string; rules: Pronunciation[] } | undefined;
/** The person's dictionary: WALKCAST_PRONUNCIATIONS inline, and/or the file named by WALKCAST_PRONUNCIATIONS_FILE. */
export function loadPronunciations(env: NodeJS.ProcessEnv = process.env): Pronunciation[] {
  const file = env.WALKCAST_PRONUNCIATIONS_FILE?.trim();
  let fromFile = "";
  if (file && existsSync(file)) {
    try {
      fromFile = readFileSync(file, "utf8").slice(0, 20_000);
    } catch {
      /* an unreadable dictionary must not cost a recording its voice */
    }
  }
  const key = `${env.WALKCAST_PRONUNCIATIONS ?? ""}\u0000${fromFile}`;
  if (loaded?.key === key) return loaded.rules;
  loaded = { key, rules: parsePronunciations(`${fromFile}\n${env.WALKCAST_PRONUNCIATIONS ?? ""}`) };
  return loaded.rules;
}

const SPOKEN_WORDS: [RegExp, string][] = [
  [/\be\.g\.,?/gi, "for example,"],
  [/\bi\.e\.,?/gi, "that is,"],
  [/\bvs\.?(?=\s)/gi, "versus"],
  [/\betc\./gi, "and so on"],
  [/\b2FA\b/g, "two-factor"],
  [/\bMFA\b/g, "multi-factor"],
  [/\bCAPTCHA\b/gi, "captcha"],
  [/\bMP4\b/g, "M P four"],
  [/\bWebM\b/g, "web M"],
  [/\bVTT\b/g, "V T T"],
  [/\bURL(s?)\b/g, "U R L$1"],
  [/\bUI\b/g, "U I"],
  [/\bAPI(s?)\b/g, "A P I$1"],
  [/\bSSO\b/g, "S S O"],
  [/\brobots\.txt\b/gi, "robots dot text"],
];

/** "agentic-crm-henna.vercel.app" -> "agentic crm henna dot vercel dot app". */
function hostnameForSpeech(host: string): string {
  return host
    .replace(/^www\./i, "")
    .split(".")
    .map((part) => part.replace(/[-_]+/g, " "))
    .join(" dot ");
}

/** What a voice should be handed for one caption line. */
export function forSpeech(text: string, dictionary: Pronunciation[] = loadPronunciations()): string {
  let out = text.replace(/[{}]/g, "");
  // The person's own words first, so a name they have fixed is never rewritten as a hostname.
  for (const [pattern, say] of dictionary) out = out.replace(pattern, say);

  // Links: say the site, not the scheme and the slashes.
  out = out.replace(/\bhttps?:\/\/([^\s/)]+)(\/[^\s)]*)?/gi, (_m, host: string) => hostnameForSpeech(host));
  // A bare hostname with a real TLD ("acme.app", "docs.acme.co.uk"), but not "e.g." or "3.5".
  out = out.replace(/\b((?:[a-z0-9]+(?:-[a-z0-9]+)*\.)+(?:com|org|net|io|app|dev|ai|co|in|uk|us|me|xyz|tech|cloud|site|page))\b(?!\w)/gi, (_m, host: string) => hostnameForSpeech(host));

  out = out.replace(/\s*&\s*/g, " and ");
  out = out.replace(/(\d)\s*%/g, "$1 percent");
  out = out.replace(/\$(\d[\d,]*(?:\.\d+)?)/g, "$1 dollars");
  out = out.replace(/\s*[→>]\s*/g, ", then ");
  out = out.replace(/\s*[–—]\s*/g, ", ");
  out = out.replace(/\s*\/\s*/g, " or ");
  for (const [pattern, replacement] of SPOKEN_WORDS) out = out.replace(pattern, replacement);

  out = out.replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
  // A line that ends without punctuation lands with a rising, unfinished intonation.
  if (out && !/[.!?…]["”')\]]?$/.test(out)) out += ".";
  return out;
}
