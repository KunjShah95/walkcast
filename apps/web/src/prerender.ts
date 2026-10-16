/**
 * Prerender the public site to static files.
 *
 * Every page in `pages.ts` is a pure `string` function of `siteUrl`. The site has no accounts,
 * no API and no server: it is a set of documents, and a static host serves them as files. The
 * product itself (recording, the dashboard, sign-in) is the desktop app in apps/desktop.
 *
 * This writes that set into `outDir`: one `<page>/index.html` per route so clean URLs work with
 * no rewrite rules, plus the crawler files, the fonts, the demo media, and a 404.
 */
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FAVICON } from "../../../packages/brand/src/index.ts";
import { siteFacts } from "./facts.ts";
import { guideBySlug, GUIDES } from "./guides.ts";
import {
  assetPath,
  comparePage,
  compareSlugs,
  downloadPage,
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

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

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

  page("/", landingPage(siteUrl, facts));
  page("/how", howPage(siteUrl));
  page("/lab", labPage(siteUrl, facts));
  page("/safety", safetyPage(siteUrl));
  page("/pricing", pricingPage(siteUrl));
  page("/download", downloadPage(siteUrl));
  page("/guides", guidesIndexPage(siteUrl));
  for (const g of GUIDES) page(`/guides/${g.slug}`, guidePage(siteUrl, guideBySlug(g.slug)!));
  for (const slug of compareSlugs()) {
    const html = comparePage(siteUrl, slug);
    if (html) page(`/compare/${slug}`, html);
  }

  for (const [route, fn] of RAW) file(route, fn(siteUrl));

  // 404 for static hosts. `noindex` is in the markup; Vercel serves it for any unknown path.
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