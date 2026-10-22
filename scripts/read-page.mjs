/**
 * Print the visible copy of a built page in reading order, so the copy can be read as a page
 * rather than as a diff.
 *
 *   node scripts/read-page.mjs [path]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const which = process.argv[2] ?? "";
const file = join(ROOT, "dist", "web", which === "" ? "index.html" : `${which.replace(/^\/|\/$/g, "")}/index.html`);

const html = readFileSync(file, "utf8");

// The body only: head, scripts and styles are not copy.
const body = html.slice(html.indexOf("<body"), html.indexOf("</body>"));
const cleaned = body
  .replace(/<svg[\s\S]*?<\/svg>/g, "")
  .replace(/<script[\s\S]*?<\/script>/g, "")
  .replace(/<style[\s\S]*?<\/style>/g, "");

const out = [];
const re = /<(h1|h2|h3|h4|p|li|td|dd|dt|b|button|span)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g;
for (const m of cleaned.matchAll(re)) {
  const t = m[2]
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (t) out.push(`${m[1].toUpperCase().padEnd(6)} ${t}`);
}

// De-duplicate the repeated block a marquee renders twice.
const seen = new Set();
const lines = out.filter((l) => {
  const k = l.replace(/^\w+\s+/, "");
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

console.log(lines.join("\n"));
