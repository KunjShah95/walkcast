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

test("every route is its own prerendered, canonical, crawlable page", { timeout: 180_000 }, async () => {
  const { ROUTES } = await import("../apps/web/src/content.ts");
  const { INDEXNOW_KEY } = await import("../apps/web/src/seo.ts");
  execFileSync(process.execPath, ["--import", "tsx", "apps/web/build.ts"], { cwd: REPO, env: { ...process.env, SITE_URL: SITE }, stdio: "pipe" });
  const read = (f: string) => readFileSync(join(OUT, f), "utf8");
  const sitemap = read("sitemap.xml");
  const llms = read("llms.txt");
  const titles = new Set<string>();
  for (const r of ROUTES) {
    const loc = r.path === "/" ? `${SITE}/` : `${SITE}${r.path}`;
    const html = read(r.path === "/" ? "index.html" : `${r.path.slice(1)}/index.html`);
    assert.match(html, /<div id="root"><header/, `${r.path} is prerendered`);
    assert.ok(html.includes(`<link rel="canonical" href="${loc}">`), `${r.path} has its own canonical`);
    const title = /<title>(.*?)<\/title>/.exec(html)![1]!;
    assert.ok(!titles.has(title), `${r.path} has a unique title`);
    titles.add(title);
    assert.ok(r.description.length <= 160, `${r.path} description fits a snippet (${r.description.length})`);
    assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, `${r.path} has one h1`);
    const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)![1]!) as { "@graph": { "@type": string }[] };
    assert.ok(ld["@graph"].some((n) => n["@type"] === "BreadcrumbList"), `${r.path} has breadcrumbs`);
    assert.ok(sitemap.includes(`<loc>${loc}</loc>`), `${r.path} is in the sitemap`);
    assert.ok(llms.includes(loc), `${r.path} is linked from llms.txt`);
  }
  assert.equal(read(`${INDEXNOW_KEY}.txt`), INDEXNOW_KEY);
});
