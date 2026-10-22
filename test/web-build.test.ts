import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

/**
 * The landing page build: what search engines and answer engines read has to be in the files,
 * not produced by JavaScript at runtime.
 */
const REPO = resolve(import.meta.dirname, "..");
const SITE = "https://walkcast.example";

// Every build writes to its own folder. Test files run in parallel, and Vite empties the output
// directory before it writes: a shared dist/web made one test read another test's half-built site.
const dirs: string[] = [];
const build = (): string => {
  const out = mkdtempSync(join(tmpdir(), "walkcast-web-"));
  dirs.push(out);
  execFileSync(process.execPath, ["--import", "tsx", "apps/web/build.ts"], {
    cwd: REPO,
    env: { ...process.env, SITE_URL: SITE, WEB_OUT: out },
    stdio: "pipe",
  });
  return out;
};
const read = (out: string, f: string) => readFileSync(join(out, f), "utf8");
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

test("web:build prerenders the page and writes the crawler files", { timeout: 180_000 }, () => {
  const out = build();

  const html = read(out, "index.html");
  assert.match(html, /<div id="root"><header/, "the page is prerendered, not an empty root");
  assert.match(html, /Paste a/);
  assert.match(html, new RegExp(`<link rel="canonical" href="${SITE}/">`));
  assert.ok(!html.includes("<!--seo-->"), "the SEO slot was filled");

  const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)![1]!) as { "@graph": { "@type": string; mainEntity?: unknown[] }[] };
  const types = ld["@graph"].map((n) => n["@type"]);
  for (const t of ["Organization", "WebSite", "SoftwareApplication", "VideoObject", "HowTo", "FAQPage"]) assert.ok(types.includes(t), `JSON-LD has ${t}`);
  const faq = ld["@graph"].find((n) => n["@type"] === "FAQPage")!.mainEntity as { name: string }[];
  for (const q of faq) assert.ok(html.includes(q.name.replace(/'/g, "&#x27;")) || html.includes(q.name), `FAQ "${q.name}" is visible on the page`);

  const robots = read(out, "robots.txt");
  assert.match(robots, /User-agent: GPTBot/);
  assert.match(robots, /User-agent: ClaudeBot/);
  assert.ok(!/Disallow: \/\s*$/m.test(robots), "nothing is disallowed site-wide");
  assert.match(robots, new RegExp(`Sitemap: ${SITE}/sitemap.xml`));

  const sitemap = read(out, "sitemap.xml");
  assert.match(sitemap, new RegExp(`<loc>${SITE}/</loc>`));
  assert.match(sitemap, /<video:content_loc>/);
  assert.ok(!sitemap.includes("localhost"));

  assert.match(read(out, "llms.txt"), /^# Walkcast\n\n> /);
  assert.match(read(out, "llms-full.txt"), /### Is my password stored\?/);
  assert.match(read(out, "404.html"), /noindex/);
});

test("every route is its own prerendered, canonical, crawlable page", { timeout: 180_000 }, async () => {
  const { ROUTES } = await import("../apps/web/src/content.ts");
  const { INDEXNOW_KEY } = await import("../apps/web/src/seo.ts");
  const out = build();
  const sitemap = read(out, "sitemap.xml");
  const llms = read(out, "llms.txt");
  const titles = new Set<string>();
  for (const r of ROUTES) {
    const loc = r.path === "/" ? `${SITE}/` : `${SITE}${r.path}`;
    const html = read(out, r.path === "/" ? "index.html" : `${r.path.slice(1)}/index.html`);
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
  assert.equal(read(out, `${INDEXNOW_KEY}.txt`), INDEXNOW_KEY);
});

test("titles and descriptions fit the snippets they are shown in", async () => {
  const { ROUTES } = await import("../apps/web/src/content.ts");
  const seen = new Set<string>();
  for (const r of ROUTES) {
    assert.ok(r.title.length <= 60, `${r.path} title fits a search result (${r.title.length})`);
    assert.ok(r.description.length <= 160, `${r.path} description fits a snippet (${r.description.length})`);
    assert.ok(!seen.has(r.title), `${r.path} title is unique`);
    seen.add(r.title);
    assert.ok(!r.description.includes(r.path), `${r.path} description does not read like a slug`);
  }
});

test("the machine-readable files an agent needs are published and linked", { timeout: 180_000 }, async () => {
  const { ROUTES } = await import("../apps/web/src/content.ts");
  const out = build();

  // An agent comparing tools cannot read a price out of a rendered page.
  const pricing = read(out, "pricing.md");
  assert.match(pricing, /^# Pricing . Walkcast/m);
  assert.match(pricing, /Price: \$0/, "pricing.md states the price in a parsable form");
  assert.match(pricing, /Seats: unlimited/);
  assert.match(pricing, /No paid tier|no paid tier/i);

  const robots = read(out, "robots.txt");
  assert.match(robots, new RegExp(`Sitemap: ${SITE}/sitemap-agents\\.xml`), "the agent sitemap is advertised");
  const agents = read(out, "sitemap-agents.xml");
  assert.match(agents, new RegExp(`<loc>${SITE}/pricing\\.md</loc>`));

  const llms = read(out, "llms.txt");
  assert.match(llms, /pricing\.md/, "llms.txt points at the plain-text price");
  for (const r of ROUTES) {
    const loc = r.path === "/" ? `${SITE}/` : `${SITE}${r.path}`;
    assert.ok(llms.includes(loc), `${r.path} is linked from llms.txt`);
  }
});

test("answer engines are told where the answer is", { timeout: 180_000 }, async () => {
  const { ROUTES, ANSWER_PAGES } = await import("../apps/web/src/content.ts");
  const out = build();

  for (const path of ANSWER_PAGES) {
    const r = ROUTES.find((x) => x.path === path)!;
    const html = read(out, r.path === "/" ? "index.html" : `${r.path.slice(1)}/index.html`);
    const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)![1]!) as {
      "@graph": { "@type": string; speakable?: { cssSelector?: string[] } }[];
    };
    const page = ld["@graph"].find((n) => n["@type"] !== "BreadcrumbList" && n.speakable);
    assert.ok(page?.speakable?.cssSelector?.length, `${path} marks its answer as speakable`);
    assert.ok(html.includes("<p class=\"answer\">"), `${path} actually has the answer paragraph it points at`);
  }
});

test("the comparison pages are structured for citation", { timeout: 180_000 }, async () => {
  const { COMPARES, COMPARE_FAQ } = await import("../apps/web/src/content.ts");
  const out = build();

  for (const c of COMPARES) {
    const html = read(out, `${c.path.slice(1)}/index.html`);
    const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)![1]!) as {
      "@graph": { "@type": string; name?: string; url?: string }[];
    };
    const types = ld["@graph"].map((n) => n["@type"]);
    assert.ok(types.includes("Article"), `${c.path} is an Article`);
    assert.ok(types.includes("FAQPage"), `${c.path} has a FAQPage`);
    assert.ok(types.includes("SoftwareApplication"), `${c.path} names the product`);
    // The competitor is named as an entity, so an engine can relate the two.
    assert.ok(
      ld["@graph"].some((n) => n["@type"] === "SoftwareApplication" && n.url?.startsWith("http") && !n.url.startsWith(SITE)),
      `${c.path} names the competitor as its own entity`,
    );
    // A fair comparison says what the other tool is good at, and dates its prices.
    assert.match(html, new RegExp(c.them.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${c.path} names ${c.them}`);
    assert.match(html, /Where .* is better/, `${c.path} says where the other tool wins`);
    assert.match(html, /Facts, with sources/, `${c.path} cites its sources`);
    for (const [q] of COMPARE_FAQ[c.path] ?? []) {
      assert.ok(html.includes(q), `${c.path} shows the question "${q}"`);
    }
  }
});

test("the guides index lists every guide as a structured list", { timeout: 180_000 }, async () => {
  const { GUIDES } = await import("../apps/web/src/content.ts");
  const out = build();
  const html = read(out, join("guides", "index.html"));
  const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)![1]!) as {
    "@graph": { "@type": string; mainEntity?: { itemListElement?: { name: string; url: string }[] } }[];
  };
  const page = ld["@graph"].find((n) => n["@type"] === "CollectionPage")!;
  assert.ok(page.mainEntity?.itemListElement?.length, "the guides index carries an ItemList");
  for (const g of GUIDES) {
    assert.ok(html.includes(`href="${g.path}"`), `the index links ${g.path}`);
    assert.ok(
      page.mainEntity!.itemListElement!.some((i) => i.url === `${SITE}${g.path}`),
      `the ItemList names ${g.path}`,
    );
  }
});
