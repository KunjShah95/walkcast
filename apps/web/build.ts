import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";
import { DEFINITION, DEMO, DESCRIPTION, FAQ, HOWTO, NAME, TAGLINE } from "./src/content.ts";
import { ISSUES_URL, RELEASES_URL, REPO_URL, VERSION, WINDOWS_EXE_URL, WINDOWS_MSI_URL } from "./src/site.ts";

/**
 * Builds the site and everything crawlers read:
 *
 *   index.html     the page prerendered (full content without JavaScript), canonical URL, Open Graph,
 *                  and a JSON-LD graph: Organization, WebSite, SoftwareApplication, VideoObject
 *                  (with the transcript), HowTo and FAQPage
 *   robots.txt     every crawler welcome, search and AI alike, plus the sitemap
 *   sitemap.xml    the page with a video entry for the demo
 *   llms.txt       a short, quotable summary for answer engines; llms-full.txt has every answer
 *   404.html       served by Vercel for unknown paths
 *
 * The origin is SITE_URL, else Vercel's production domain, else the current production alias.
 */
const here = import.meta.dirname;
const config = join(here, "vite.config.ts");
const out = resolve(here, "../../dist/web");
const ssrOut = resolve(here, "../../dist/web-ssr");

const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const SITE = (process.env.SITE_URL ?? (vercelProd ? `https://${vercelProd}` : "https://walkcast-chi.vercel.app")).replace(/\/$/, "");
const TODAY = new Date().toISOString().slice(0, 10);

await build({ configFile: config, logLevel: "warn" });
await build({ configFile: config, logLevel: "warn", build: { ssr: join(here, "src/entry-server.tsx"), outDir: ssrOut, emptyOutDir: true } });
const { render } = (await import(pathToFileURL(join(ssrOut, "entry-server.js")).href)) as { render: () => string };

// ------------------------------------------------------------------ the transcript, from the real captions

const vtt = readFileSync(join(here, "public/assets/demo.vtt"), "utf8");
const transcript = [...vtt.matchAll(/-->[^\n]*\r?\n([\s\S]*?)(?:\r?\n\r?\n|$)/g)].map((m) => m[1]!.trim()).join(" ");

// ------------------------------------------------------------------ JSON-LD

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const graph = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${SITE}/#org`, name: NAME, url: SITE, logo: `${SITE}/favicon.svg`, sameAs: [REPO_URL] },
    { "@type": "WebSite", "@id": `${SITE}/#site`, url: SITE, name: NAME, description: DESCRIPTION, publisher: { "@id": `${SITE}/#org` }, inLanguage: "en" },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE}/#app`,
      name: NAME,
      description: DEFINITION,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Windows 10, Windows 11",
      softwareVersion: VERSION,
      downloadUrl: [WINDOWS_EXE_URL, WINDOWS_MSI_URL],
      installUrl: `${SITE}/#download`,
      releaseNotes: RELEASES_URL,
      license: "https://opensource.org/licenses/MIT",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      screenshot: `${SITE}/assets/demo-poster.jpg`,
      publisher: { "@id": `${SITE}/#org` },
    },
    {
      "@type": "VideoObject",
      "@id": `${SITE}/#demo`,
      name: DEMO.title,
      description: DEMO.description,
      thumbnailUrl: `${SITE}/assets/demo-poster.jpg`,
      contentUrl: `${SITE}/assets/demo.mp4`,
      uploadDate: DEMO.uploadDate,
      duration: DEMO.durationIso,
      transcript,
    },
    {
      "@type": "HowTo",
      "@id": `${SITE}/#howto`,
      name: "How to make a narrated video walkthrough of a website",
      totalTime: "PT5M",
      tool: [{ "@type": "HowToTool", name: NAME }],
      step: HOWTO.map(([name, text], i) => ({ "@type": "HowToStep", position: i + 1, name, text, url: `${SITE}/#download` })),
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE}/#faq`,
      mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ],
};

const head = [
  `<link rel="canonical" href="${SITE}/">`,
  `<meta property="og:url" content="${SITE}/">`,
  `<meta property="og:image" content="${SITE}/assets/og.png">`,
  `<meta property="og:image:width" content="1200">`,
  `<meta property="og:image:height" content="630">`,
  `<meta property="og:site_name" content="${NAME}">`,
  `<meta name="twitter:image" content="${SITE}/assets/og.png">`,
  `<meta property="og:video" content="${SITE}/assets/demo.mp4">`,
  `<link rel="alternate" type="text/plain" href="${SITE}/llms.txt" title="${esc(NAME)} for language models">`,
  `<script type="application/ld+json">${JSON.stringify(graph).replace(/</g, "\\u003c")}</script>`,
].join("\n    ");

// ------------------------------------------------------------------ index.html

const indexPath = join(out, "index.html");
let html = readFileSync(indexPath, "utf8");
for (const marker of ['<div id="root"></div>', "<!--seo-->"]) {
  if (!html.includes(marker)) throw new Error(`${indexPath} has no ${marker} to fill`);
}
html = html.replace('<div id="root"></div>', `<div id="root">${render()}</div>`).replace("<!--seo-->", head);
writeFileSync(indexPath, html);
rmSync(ssrOut, { recursive: true, force: true });

// ------------------------------------------------------------------ crawler files

// Search engines and AI crawlers are all welcome: the page is public and says nothing private.
const BOTS = ["Googlebot", "Bingbot", "DuckDuckBot", "Applebot", "Applebot-Extended", "Google-Extended", "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "Claude-SearchBot", "PerplexityBot", "Perplexity-User", "CCBot", "Meta-ExternalAgent", "Amazonbot", "Bytespider"];
writeFileSync(
  join(out, "robots.txt"),
  `# ${NAME}: a public landing page. Search engines and AI crawlers are welcome.\n\n${BOTS.map((b) => `User-agent: ${b}`).join("\n")}\nAllow: /\n\nUser-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`,
);

writeFileSync(
  join(out, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
  <url>
    <loc>${SITE}/</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
    <video:video>
      <video:thumbnail_loc>${SITE}/assets/demo-poster.jpg</video:thumbnail_loc>
      <video:title>${esc(DEMO.title)}</video:title>
      <video:description>${esc(DEMO.description)}</video:description>
      <video:content_loc>${SITE}/assets/demo.mp4</video:content_loc>
      <video:duration>71</video:duration>
      <video:publication_date>${DEMO.uploadDate}</video:publication_date>
      <video:family_friendly>yes</video:family_friendly>
    </video:video>
  </url>
  <url>
    <loc>${SITE}/llms.txt</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
</urlset>
`,
);

const links = [
  `- [Home](${SITE}/): what Walkcast does, the narrated demo and the FAQ`,
  `- [Download for Windows (.exe)](${WINDOWS_EXE_URL}): recommended installer, no admin rights needed`,
  `- [Download for Windows (.msi)](${WINDOWS_MSI_URL}): per-machine package for IT rollouts`,
  `- [Releases](${RELEASES_URL}): every version and its notes`,
  `- [Source code](${REPO_URL}): MIT licensed`,
  `- [Full answers](${SITE}/llms-full.txt): every FAQ answer in plain text`,
].join("\n");
const facts = [
  "- Platform: Windows 10 and 11, 64-bit (macOS and Linux from source)",
  `- Version: ${VERSION}`,
  "- Price: free, MIT licensed, no paid tier",
  "- Output: MP4 (H.264 + AAC), WebM, WebVTT captions, transcript, WAV narration, page list with HTTP status",
  "- Limits: up to 30 pages per recording, same site only",
  "- Safety: password held in memory only, stops at CAPTCHA and 2FA, no form submissions after sign-in, respects robots.txt",
].join("\n");
writeFileSync(join(out, "llms.txt"), `# ${NAME}\n\n> ${TAGLINE}. ${DEFINITION}\n\n## Facts\n\n${facts}\n\n## Links\n\n${links}\n`);
writeFileSync(
  join(out, "llms-full.txt"),
  `# ${NAME}: full answers\n\n> ${DEFINITION}\n\n## Facts\n\n${facts}\n\n## How to make a narrated walkthrough\n\n${HOWTO.map(([t, d], i) => `${i + 1}. **${t}.** ${d}`).join("\n")}\n\n## Questions\n\n${FAQ.map(([q, a]) => `### ${q}\n\n${a}`).join("\n\n")}\n\n## Demo transcript\n\n${transcript}\n\n## Links\n\n${links}\n- [Support](${ISSUES_URL})\n`,
);

mkdirSync(out, { recursive: true });
writeFileSync(
  join(out, "404.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page not found · ${NAME}</title><meta name="robots" content="noindex"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.6 system-ui,sans-serif;color:#1b1a17;background:#fff;text-align:center;padding:24px}h1{font-size:44px;letter-spacing:-.04em;margin:0}p{color:#6b665d}a{display:inline-block;margin-top:12px;background:#9c5700;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600}</style></head><body><main><p style="font-family:ui-monospace,monospace;font-size:13px">404 · no recording at this address</p><h1>This page was never walked.</h1><p>The link may be old. The landing page has everything.</p><a href="/">Back to ${NAME}</a></main></body></html>`,
);

console.log(`Built ${out} for ${SITE}`);
