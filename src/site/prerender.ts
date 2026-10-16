/**
 * Prerender the public site to static files.
 *
 * Every public page in `pages.ts` is a pure `string` function over `(siteUrl, user)`, and the
 * whole marketing surface renders with `user = null`. That means the site is not "a server that
 * happens to serve HTML" — it is a set of documents, and a static host can serve them as files.
 *
 * This writes that set into `outDir`: one `<page>/index.html` per route so clean URLs work with
 * no rewrite rules, plus the crawler files, the fonts, the demo media, and a 404.
 *
 * What it cannot produce, because it needs a running process: `/app` (the dashboard talks to
 * `/api`), the auth pages (POST targets with per-session state), and `/api/*`. Those come from the
 * Node server: `npm run dev` locally, and on Vercel the same server bundled into a function
 * (src/deploy/vercel-build.ts) that answers every path without a static file.
 */
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { siteFacts } from "./facts.ts";
import { webManifest, SERVICE_WORKER } from "./pwa.ts";
import { guideBySlug, GUIDES } from "./guides.ts";
import {
  assetPath,
  comparePage,
  compareSlugs,
  FAVICON,
  guidesIndexPage,
  guidePage,
  howPage,
  labPage,
  landingPage,
  llmsTxt,
  notFoundPage,
  pricingMd,
  pricingPage,
  robotsTxt,
  safetyPage,
  sitemapXml,
} from "./pages.ts";

const REPO = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

/** Written verbatim; the text files the crawlers and LLMs fetch by URL. */
const RAW: [string, (url: string) => string][] = [
  ["robots.txt", robotsTxt],
  ["sitemap.xml", sitemapXml],
  ["llms.txt", llmsTxt],
  ["pricing.md", pricingMd],
];

export interface PrerenderOptions {
  /** Absolute site URL for canonical tags, the sitemap and JSON-LD. */
  siteUrl: string;
  outDir: string;
}

export function prerender({ siteUrl, outDir }: PrerenderOptions): string[] {
  rmSync(outDir, { recursive: true, force: true });
  const written: string[] = [];
  const facts = siteFacts(REPO);

  /** A page becomes `<route>/index.html` so `/guides` resolves without a rewrite. */
  const page = (route: string, html: string) => {
    const dir = route === "/" ? outDir : join(outDir, route);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), html);
    written.push(route === "/" ? "/" : `${route}/`);
  };
  const file = (route: string, body: string | Buffer) => {
    const dest = join(outDir, route);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, body);
    written.push(route);
  };

  // The marketing pages. `user = null` is the anonymous view, which is what a static host can
  // only ever serve; the signed-in variants exist on the Node server.
  page("/", landingPage(siteUrl, null, facts));
  page("/how", howPage(siteUrl, null));
  page("/lab", labPage(siteUrl, null, facts));
  page("/safety", safetyPage(siteUrl, null));
  page("/pricing", pricingPage(siteUrl, null));
  page("/guides", guidesIndexPage(siteUrl, null));
  for (const g of GUIDES) page(`/guides/${g.slug}`, guidePage(siteUrl, guideBySlug(g.slug)!, null));
  for (const slug of compareSlugs()) {
    const html = comparePage(siteUrl, slug, null);
    if (html) page(`/compare/${slug}`, html);
  }

  for (const [route, fn] of RAW) file(route, fn(siteUrl));

  // PWA assets.
  file("manifest.webmanifest", webManifest({ siteUrl }));
  file("sw.js", SERVICE_WORKER);

  // 404 for static hosts. `noindex` is in the markup; on Vercel unknown paths reach the server
  // function instead, which sends its own 404 with an X-Robots-Tag header.
  file("404.html", notFoundPage(siteUrl));
  file("favicon.svg", FAVICON);
  for (const [name] of Object.entries({
    "demo.mp4": "", "demo.webm": "", "demo.vtt": "", "demo-poster.jpg": "", "og.png": "",
  })) {
    const asset = assetPath(name);
    if (asset) file(`assets/${name}`, readFileSync(asset.path));
    else throw new Error(`missing asset: ${name}`);
  }
  for (const name of ["fonts/schibsted-grotesk.woff2", "fonts/jetbrains-mono.woff2"]) {
    const asset = assetPath(name);
    if (!asset) throw new Error(`missing font: ${name}`);
    mkdirSync(join(outDir, "assets", "fonts"), { recursive: true });
    copyFileSync(asset.path, join(outDir, "assets", name));
    written.push(`assets/${name}`);
  }

  return written;
}