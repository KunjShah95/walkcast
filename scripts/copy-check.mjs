/**
 * The copywriting skill's self-check, run against the built site.
 * Reads dist/web, pulls the visible copy out of every prerendered page, and applies the checks
 * from .agents/skills/copywriting/references/ai-tells.md#the-self-check.
 *
 *   node scripts/copy-check.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const DIST = join(ROOT, "dist", "web");

/** Strip tags and decode the handful of entities the build emits. */
const text = (html) =>
  html
    .replace(/<svg[\s\S]*?<\/svg>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Every heading and copy block on the page, one entry per block. Table cells, list items and
 * buttons are separate blocks so a row of cells is never read as one sentence.
 */
function blocks(html) {
  // Code samples are quoted source, not copy. Scripts and styles are not copy at all.
  const stripped = html
    .replace(/<pre[\s\S]*?<\/pre>/g, "")
    .replace(/<code[\s\S]*?<\/code>/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "");
  const out = [];
  // The tag name must be followed by whitespace or `>`, so `<path>` is never read as `<p>`.
  const re =
    /<(h1|h2|h3|h4)(?:\s[^>]*)?>([\s\S]*?)<\/\1>|<p(?:\s[^>]*)?>([\s\S]*?)<\/p>|<li(?:\s[^>]*)?>([\s\S]*?)<\/li>|<td(?:\s[^>]*)?>([\s\S]*?)<\/td>|<button(?:\s[^>]*)?>([\s\S]*?)<\/button>/g;
  for (const m of stripped.matchAll(re)) {
    const raw = m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6];
    if (!raw) continue;
    const t = text(raw);
    if (t) out.push({ tag: m[1] ?? "p", text: t });
  }
  return out;
}

const htmlFiles = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (e.endsWith(".html")) htmlFiles.push(p);
  }
})(DIST);

const findings = [];
const CONTRAST = /\b(it'?s not|this isn'?t|not just|not because|not only|the question isn'?t)\b/i;
const NEG_LIST = /\b(no|none|nothing|never|without)\b[^.;?!]{0,40},[^.;?!]{0,40}\b(no|none|nothing|never|without)\b/i;
const COLON_REVEAL = /\b(the result|the best part|the catch|here'?s the secret|one word)\b\s*[?:]/i;
const PUFFERY =
  /\b(seamless|robust|powerful|unlock|unleash|streamline|effortless|game-chang|cutting-edge|revolutioniz|transformative|game-changing|delve|tapestry|testament|realm|myriad|plethora|meticulous|intricate|utilize|leverage|supercharge|all-in-one|seamlessly|in today'?s fast-paced|whether you'?re|say goodbye to|take it to the next level|effortlessly)\b/i;
const HYPE_PUNCT = /!/;
/** A heading that ends in a question is fine when the reader would ask it. */
const QUESTION = /\?$/;

for (const file of htmlFiles) {
  const rel = file.slice(DIST.length + 1);
  const html = readFileSync(file, "utf8");
  for (const b of blocks(html)) {
    const s = b.text;
    const where = `${rel} <${b.tag}> "${s.slice(0, 90)}"`;

    if (CONTRAST.test(s)) findings.push(["contrast reveal", where]);
    if (NEG_LIST.test(s)) findings.push(["negation list", where]);
    if (COLON_REVEAL.test(s)) findings.push(["colon reveal", where]);
    if (PUFFERY.test(s)) findings.push(["puffery", where]);
    if (HYPE_PUNCT.test(s)) findings.push(["hype punctuation", where]);
    if (b.tag !== "p" && s.includes("\u2014")) findings.push(["em dash in short copy", where]);

    // Sentences over 20 words with more than two commas: possible trailing pile-on.
    for (const sent of s.split(/(?<=[.!?])\s+/)) {
      const words = sent.split(/\s+/).filter(Boolean).length;
      const commas = (sent.match(/,/g) ?? []).length;
      if (words > 20 && commas > 2) {
        findings.push([`long sentence (${words}w, ${commas} commas)`, `${rel}: "${sent.trim().slice(0, 110)}"`]);
      }
    }

    // A heading that asks a question: fine for the reader's own doubt, worth a look otherwise.
    const bare = s.replace(/^\d+\s*/, "");
    if (QUESTION.test(bare) && !/^(what|who|which|why|how|can|does|do|is|are|will|has|have|could|would|should)\b/i.test(bare)) {
      findings.push(["question heading (review)", where]);
    }
  }
}

const byKind = new Map();
for (const [kind, where] of findings) {
  if (!byKind.has(kind)) byKind.set(kind, []);
  byKind.get(kind).push(where);
}

if (!findings.length) {
  console.log("copy-check: clean. No banned patterns found.");
} else {
  for (const [kind, wheres] of byKind) {
    console.log(`\n${kind} (${wheres.length})`);
    for (const w of wheres) console.log(`  ${w}`);
  }
}
console.log(`\nchecked ${htmlFiles.length} built pages`);
