import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { compareSlugs } from "../apps/web/src/pages.ts";
import { prerender } from "../apps/web/src/prerender.ts";
import { GUIDES } from "../apps/web/src/guides.ts";

const siteUrl = "https://lab.example";
const out = mkdtempSync(join(tmpdir(), "lab-prerender-"));
after(() => rmSync(out, { recursive: true, force: true }));

const written = prerender({ siteUrl, outDir: out });
const at = (p: string) => readFileSync(join(out, p), "utf8");

/** A static host resolves /guides from guides/index.html, so every route is a directory. */
const routes = [
  "/", "/how", "/lab", "/safety", "/pricing", "/download", "/guides",
  ...GUIDES.map((g) => `/guides/${g.slug}`),
  ...compareSlugs().map((s) => `/compare/${s}`),
];
const routeFile = (route: string) => (route === "/" ? "index.html" : `${route.replace(/^\//, "")}/index.html`);

test("prerender writes every public page, the crawler files and the assets", () => {
  const files = ["robots.txt", "sitemap.xml", "llms.txt", "pricing.md", "404.html", "favicon.svg"];
  for (const route of routes) assert.ok(existsSync(join(out, routeFile(route))), `missing ${route}`);
  for (const f of files) assert.ok(existsSync(join(out, f)), `missing ${f}`);
  assert.equal(written.length, routes.length + files.length + 7, "every page, plus 5 demo/social assets and 2 fonts");
});

test("the export is stamped with the site URL, not localhost", () => {
  for (const page of ["index.html", "sitemap.xml", "llms.txt", "pricing.md"]) {
    const body = at(page);
    assert.ok(!body.includes("localhost"), `${page} leaks a localhost origin`);
  }
  assert.match(at("index.html"), new RegExp(`<link rel="canonical" href="${siteUrl}/">`));
  assert.match(at("sitemap.xml"), new RegExp(`<loc>${siteUrl}/pricing</loc>`));
  // The sitemap must only list pages that were actually written, or it advertises 404s. The site
  // is static only, so there is no server-side route to except.
  for (const loc of at("sitemap.xml").matchAll(/<loc>[^<]+<\/loc>/g)) {
    const path = loc[0].replace(/<\/?loc>/g, "").slice(siteUrl.length);
    const isFile = existsSync(join(out, path));
    const isPage = existsSync(join(out, path, "index.html"));
    assert.ok(path === "/" || isFile || isPage, `sitemap lists ${path}, which was not exported`);
  }
});

test("each exported page carries one h1 and noindex only where it belongs", () => {
  for (const g of GUIDES) {
    const html = at(`guides/${g.slug}/index.html`);
    assert.equal((html.match(/<h1/g) ?? []).length, 1, `${g.slug} h1 count`);
  }
  assert.doesNotMatch(at("index.html"), /noindex/);
  assert.match(at("404.html"), /noindex, follow/);
});

test("no rendered page links to a crawler file", () => {
  // sitemap.xml, llms.txt, robots.txt and pricing.md are served for crawlers, not for visitors.
  // A footer link to them looks like a machine-generated site, and the 404 page advertising them
  // is worse. They stay reachable by URL; they just are not advertised in the UI.
  const pages = [...routes.map(routeFile), "404.html"];
  for (const p of pages) {
    const body = at(p).split("<body")[1] ?? "";
    for (const m of body.matchAll(/href="([^"]*)"/g)) {
      const href = m[1] ?? "";
      assert.ok(!/\/(sitemap\.xml|llms\.txt|robots\.txt|pricing\.md)/.test(href), `${p} links to ${href}`);
    }
  }
});

test("the crawler files are still served and still declared", () => {
  // Removing the links must not remove the files or the discovery hints — that would cost the
  // citations the SEO work was for. Only the visible advertising goes.
  for (const f of ["robots.txt", "sitemap.xml", "llms.txt", "pricing.md"]) {
    assert.match(at(f), new RegExp(siteUrl.replace(/[/.]/g, "\\$&")), `${f} must carry the absolute origin`);
  }
  const home = at("index.html");
  assert.match(home, /<link rel="sitemap"[^>]*href="\/sitemap\.xml">/);
  assert.match(home, /rel="alternate"[^>]*href="[^"]*\/llms\.txt"/);
  assert.match(at("robots.txt"), new RegExp(`Sitemap: ${siteUrl}/sitemap.xml`));
});

test("media and fonts are copied so the pages render without the Node server", () => {
  for (const f of ["assets/demo.mp4", "assets/demo.webm", "assets/demo.vtt", "assets/demo-poster.jpg", "assets/og.png"]) {
    assert.ok(readFileSync(join(out, f)).length > 0, f);
  }
  for (const f of ["assets/fonts/schibsted-grotesk.woff2", "assets/fonts/jetbrains-mono.woff2"]) {
    assert.ok(readFileSync(join(out, f)).length > 0, f);
  }
});

test("the build is idempotent: a second run does not leave stale pages", () => {
  const stale = join(out, "guides", "removed-page");
  mkdirSync(stale, { recursive: true });
  writeFileSync(join(stale, "index.html"), "<h1>gone</h1>");
  prerender({ siteUrl, outDir: out });
  assert.equal(existsSync(join(stale, "index.html")), false);
});