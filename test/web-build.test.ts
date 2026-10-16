import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

/**
 * The landing page build: what search engines and answer engines read has to be in the files,
 * not produced by JavaScript at runtime.
 */
const REPO = resolve(import.meta.dirname, "..");
const OUT = join(REPO, "dist", "web");
const SITE = "https://walkcast.example";

test("web:build prerenders the page and writes the crawler files", { timeout: 180_000 }, () => {
  execFileSync(process.execPath, ["--import", "tsx", "apps/web/build.ts"], { cwd: REPO, env: { ...process.env, SITE_URL: SITE }, stdio: "pipe" });
  const read = (f: string) => readFileSync(join(OUT, f), "utf8");

  const html = read("index.html");
  assert.match(html, /<div id="root"><header/, "the page is prerendered, not an empty root");
  assert.match(html, /Paste a/);
  assert.match(html, new RegExp(`<link rel="canonical" href="${SITE}/">`));
  assert.ok(!html.includes("<!--seo-->"), "the SEO slot was filled");

  const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)![1]!) as { "@graph": { "@type": string; mainEntity?: unknown[] }[] };
  const types = ld["@graph"].map((n) => n["@type"]);
  for (const t of ["Organization", "WebSite", "SoftwareApplication", "VideoObject", "HowTo", "FAQPage"]) assert.ok(types.includes(t), `JSON-LD has ${t}`);
  const faq = ld["@graph"].find((n) => n["@type"] === "FAQPage")!.mainEntity as { name: string }[];
  for (const q of faq) assert.ok(html.includes(q.name.replace(/'/g, "&#x27;")) || html.includes(q.name), `FAQ "${q.name}" is visible on the page`);

  const robots = read("robots.txt");
  assert.match(robots, /User-agent: GPTBot/);
  assert.match(robots, /User-agent: ClaudeBot/);
  assert.ok(!/Disallow: \/\s*$/m.test(robots), "nothing is disallowed site-wide");
  assert.match(robots, new RegExp(`Sitemap: ${SITE}/sitemap.xml`));

  const sitemap = read("sitemap.xml");
  assert.match(sitemap, new RegExp(`<loc>${SITE}/</loc>`));
  assert.match(sitemap, /<video:content_loc>/);
  assert.ok(!sitemap.includes("localhost"));

  assert.match(read("llms.txt"), /^# Walkcast\n\n> /);
  assert.match(read("llms-full.txt"), /### Is my password stored\?/);
  assert.match(read("404.html"), /noindex/);
});
