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
  // One Sitemap: line only. A second sitemap of .md/.txt URLs is not a search sitemap, and every
  // entry in it reads as "URL not allowed" in the console's Sitemaps report.
  assert.ok(!robots.includes("sitemap-agents.xml"), "robots.txt does not advertise the agent sitemap");
  assert.equal((robots.match(/^Sitemap:/gm) ?? []).length, 1, "robots.txt declares exactly one sitemap");
  const agents = read(out, "sitemap-agents.xml");
  assert.match(agents, new RegExp(`<loc>${SITE}/pricing\\.md</loc>`));

  const llms = read(out, "llms.txt");
  assert.match(llms, /pricing\.md/, "llms.txt points at the plain-text price");
  assert.match(llms, /sitemap-agents\.xml/, "llms.txt is where the agent sitemap is advertised instead");
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
    assert.match(html, /<p class="answer"[\s>]/, `${path} actually has the answer paragraph it points at`);
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

test("no page promises a platform the releases do not ship", { timeout: 180_000 }, async () => {
  const { ROUTES } = await import("../apps/web/src/content.ts");
  const out = build();

  // macOS was dropped from the release matrix (7b5f962): no .dmg is built, no browser is found for
  // the Lab. The comparison pages still name macOS on purpose — Screen Studio is a Mac tool — so
  // these patterns describe Walkcast's own support, which is the claim that went stale.
  const claims = [/Mac and Linux/i, /macOS and Linux/i, /Apple Silicon/i, /\.dmg\b/];
  const pages: [string, string][] = ROUTES.map((r) => [
    r.path,
    r.path === "/" ? "index.html" : `${r.path.slice(1)}/index.html`,
  ]);
  const files: [string, string][] = [
    ...pages,
    ["llms.txt", "llms.txt"],
    ["llms-full.txt", "llms-full.txt"],
    ["pricing.md", "pricing.md"],
  ];
  for (const [label, file] of files) {
    const body = read(out, file);
    for (const claim of claims) assert.ok(!claim.test(body), `${label} does not claim macOS support (${claim})`);
  }

  // And the pages must name the ones that do ship.
  const download = read(out, "download/index.html");
  assert.match(download, /Windows installer/);
  assert.match(download, /Linux AppImage/);
  for (const path of ["/", "/download", "/faq"]) {
    const file = path === "/" ? "index.html" : `${path.slice(1)}/index.html`;
    const html = read(out, file);
    assert.match(html, /Windows/, `${path} names Windows`);
    assert.match(html, /Linux/, `${path} names Linux`);
  }
});

test("the built HTML has no invalid nesting that breaks hydration", { timeout: 180_000 }, async () => {
  const { ROUTES } = await import("../apps/web/src/content.ts");
  const out = build();
  const invalid = [
    // A heading inside dt is not permitted content; the browser closes the dt early and React
    // cannot hydrate, so the whole tree regenerates on the client. This broke hydration on 12
    // of 14 pages until it was caught with a browser-driven check.
    { name: "<dt> directly inside a heading parent", pattern: /<dt>(?:(?!<\/dt>).)*?<h[123]/s },
    { name: "<ul> directly inside <p>", pattern: /<p\b[^>]*>(?:(?!<\/p>).)*?<ul\b/s },
    { name: "<table> directly inside <p>", pattern: /<p\b[^>]*>(?:(?!<\/p>).)*?<table\b/s },
    { name: "<a> directly inside <a>", pattern: /<a\b[^>]*>(?:(?!<\/a>).)*?<a\b/s },
  ];
  for (const r of ROUTES) {
    const file = r.path === "/" ? "index.html" : `${r.path.slice(1)}/index.html`;
    const html = read(out, file);
    for (const rule of invalid) {
      assert.ok(!rule.pattern.test(html), `${r.path} has ${rule.name}`);
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

test("the sitemap is a file a crawler cannot reject", { timeout: 180_000 }, async () => {
  const { ROUTES } = await import("../apps/web/src/content.ts");
  const out = build();
  const xml = read(out, "sitemap.xml");

  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n'), "the XML declaration is the first thing in the file");
  assert.ok(/<\/urlset>\s*$/.test(xml), "the document closes with </urlset>");
  assert.equal((xml.match(/<url>/g) ?? []).length, (xml.match(/<\/url>/g) ?? []).length, "every <url> is closed");

  const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]!);
  assert.equal(locs.length, ROUTES.length, "one <loc> per route");
  assert.equal(new Set(locs).size, locs.length, "no duplicate URLs");
  const host = new URL(SITE).host;
  for (const loc of locs) {
    const u = new URL(loc);
    assert.equal(u.protocol, "https:", `${loc} is https`);
    assert.equal(u.host, host, `${loc} is on the canonical host`);
    assert.equal(u.search + u.hash, "", `${loc} carries no query or fragment`);
  }

  // A future <lastmod> is the one sitemap value an engine acts on, so it can never ship.
  const dates = [...xml.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)].map((m) => m[1]!);
  assert.equal(dates.length, locs.length, "every URL has a <lastmod>");
  for (const d of dates) {
    assert.ok(!Number.isNaN(Date.parse(d)), `${d} is a date`);
    assert.ok(Date.parse(d) <= Date.now() + 86_400_000, `${d} is not in the future`);
  }

  // A video entry missing one required field makes Google drop the whole <url>, not just the video.
  for (const f of ["thumbnail_loc", "title", "description", "content_loc", "duration", "publication_date"]) {
    assert.match(xml, new RegExp(`<video:${f}>`), `the video entry has <video:${f}>`);
  }
  const seconds = Number(/<video:duration>(\d+)</.exec(xml)![1]);
  assert.ok(seconds >= 1 && seconds <= 28_800, `video duration ${seconds}s is inside Google's 1–28800s range`);

  // The XML sitemap is for pages. The plain-text files get their own file, linked from llms.txt.
  assert.ok(!xml.includes("llms.txt"), "the page sitemap does not list plain-text files");
});
