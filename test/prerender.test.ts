import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { compareSlugs } from "../src/site/pages.ts";
import { prerender } from "../src/site/prerender.ts";
import { GUIDES } from "../src/site/guides.ts";

const siteUrl = "https://lab.example";
const out = mkdtempSync(join(tmpdir(), "lab-prerender-"));
after(() => rmSync(out, { recursive: true, force: true }));

const written = prerender({ siteUrl, outDir: out });
const at = (p: string) => readFileSync(join(out, p), "utf8");

test("prerender writes every public page, the crawler files and the assets", () => {
  // A static host resolves /guides from guides/index.html with no rewrite rules, so each route
  // has to exist as a directory with an index.html — a missing one is a 404, not a soft failure.
  const routes = [
    "/", "/how", "/lab", "/safety", "/pricing", "/guides",
    ...GUIDES.map((g) => `/guides/${g.slug}`),
    ...compareSlugs().map((s) => `/compare/${s}`),
  ];
  const files = ["robots.txt", "sitemap.xml", "llms.txt", "pricing.md", "404.html", "favicon.svg"];
  for (const route of routes) {
    const file = route === "/" ? "index.html" : `${route.replace(/^\//, "")}/index.html`;
    assert.ok(existsSync(join(out, file)), `missing ${file}`);
  }
  for (const f of files) assert.ok(existsSync(join(out, f)), `missing ${f}`);
  assert.equal(written.length, routes.length + files.length + 9, "every page, plus 5 demo/social assets and 4 fonts");
});

test("the export is stamped with the site URL, not localhost", () => {
  for (const page of ["index.html", "sitemap.xml", "llms.txt", "pricing.md"]) {
    const body = at(page);
    assert.ok(!body.includes("localhost"), `${page} leaks a localhost origin`);
  }
  assert.match(at("index.html"), new RegExp(`<link rel="canonical" href="${siteUrl}/">`));
  assert.match(at("sitemap.xml"), new RegExp(`<loc>${siteUrl}/pricing</loc>`));
  // The sitemap must only list pages that were actually written, or it advertises 404s.
  // Routes that only exist behind the proxy (rewrites in vercel.json) are the allowed exception.
  const proxied = new Set(["/signup"]);
  for (const loc of at("sitemap.xml").matchAll(/<loc>[^<]+<\/loc>/g)) {
    const path = loc[0].replace(/<\/?loc>/g, "").slice(siteUrl.length);
    const isFile = existsSync(join(out, path));
    const isPage = existsSync(join(out, path, "index.html"));
    assert.ok(path === "/" || proxied.has(path) || isFile || isPage, `sitemap lists ${path}, which was not exported`);
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

test("media and fonts are copied so the pages render without the Node server", () => {
  for (const f of ["assets/demo.mp4", "assets/demo.webm", "assets/demo.vtt", "assets/demo-poster.jpg", "assets/og.png"]) {
    assert.ok(readFileSync(join(out, f)).length > 0, f);
  }
  for (const f of ["assets/fonts/geist.woff2", "assets/fonts/geist-mono.woff2", "assets/fonts/fraunces.woff2", "assets/fonts/fraunces-italic.woff2"]) {
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