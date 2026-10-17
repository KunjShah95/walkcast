import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";
import { AUTHOR, DEFINITION, DEMO, DESCRIPTION, FAQ, HOWTO, MORE_FAQ, NAME, ROUTES, SITE_ORIGIN, TAGLINE, UPDATED, type Route } from "./src/content.ts";
import { INDEXNOW_KEY } from "./src/seo.ts";
import { ISSUES_URL, RELEASES_URL, REPO_URL, VERSION, WINDOWS_EXE_URL, WINDOWS_MSI_URL } from "./src/site.ts";

/**
 * Builds the site and everything search and answer engines read:
 *
 *   <route>/index.html  every page prerendered (full content without JavaScript) with its own title,
 *                       description, canonical URL, Open Graph and JSON-LD graph (Organization,
 *                       Person, WebSite, BreadcrumbList, and per page SoftwareApplication,
 *                       VideoObject with the transcript, HowTo, FAQPage)
 *   robots.txt          every crawler welcome, search and AI alike, plus the sitemap
 *   sitemap.xml         every page, the demo as a video entry
 *   llms.txt            a short, quotable summary linking each page; llms-full.txt has every answer
 *   <key>.txt           the IndexNow key, so `npm run web:indexnow` can announce changed pages
 *   404.html            served by Vercel for unknown paths
 *
 * The origin is SITE_URL, else walkcast.kunjshah.in. Preview builds keep the production canonical.
 */
const here = import.meta.dirname;
// Load .env so SITE_URL (and others) are available without exporting them in the shell.
try {
  for (const line of readFileSync(join(here, "..", "..", ".env"), "utf8").split(/\r?\n/)) {
    const m = /^(?:export\s+)?([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) process.env[m[1]!] ??= m[2]!.replace(/^(["'])(.*)\1$/, "$2").trim();
  }
} catch {
  /* no .env */
}
const config = join(here, "vite.config.ts");
const out = resolve(here, "../../dist/web");
const ssrOut = resolve(here, "../../dist/web-ssr");

const SITE = (process.env.SITE_URL || SITE_ORIGIN).replace(/\/$/, "");
const url = (path: string) => (path === "/" ? `${SITE}/` : `${SITE}${path}`);

await build({ configFile: config, logLevel: "warn" });
await build({ configFile: config, logLevel: "warn", build: { ssr: join(here, "src/entry-server.tsx"), outDir: ssrOut, emptyOutDir: true } });
const { render } = (await import(pathToFileURL(join(ssrOut, "entry-server.js")).href)) as { render: (path: string) => string };

// ------------------------------------------------------------------ shared facts

const vtt = readFileSync(join(here, "public/assets/demo.vtt"), "utf8");
const transcript = [...vtt.matchAll(/-->[^\n]*\r?\n([\s\S]*?)(?:\r?\n\r?\n|$)/g)].map((m) => m[1]!.trim()).join(" ");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const ORG = { "@type": "Organization", "@id": `${SITE}/#org`, name: NAME, url: `${SITE}/`, logo: `${SITE}/favicon.svg`, sameAs: [REPO_URL], founder: { "@id": `${SITE}/#author` } };
const PERSON = { "@type": "Person", "@id": `${SITE}/#author`, name: AUTHOR.name, url: AUTHOR.url, sameAs: [AUTHOR.url] };
const WEBSITE = { "@type": "WebSite", "@id": `${SITE}/#site`, url: `${SITE}/`, name: NAME, description: DESCRIPTION, publisher: { "@id": `${SITE}/#org` }, inLanguage: "en" };
const APP = {
  "@type": "SoftwareApplication",
  "@id": `${SITE}/#app`,
  name: NAME,
  description: DEFINITION,
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Windows 10, Windows 11",
  softwareVersion: VERSION,
  downloadUrl: [WINDOWS_EXE_URL, WINDOWS_MSI_URL],
  installUrl: url("/download"),
  releaseNotes: `${RELEASES_URL}/tag/v${VERSION}`,
  license: "https://opensource.org/licenses/MIT",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  screenshot: `${SITE}/assets/demo-poster.jpg`,
  author: { "@id": `${SITE}/#author` },
  publisher: { "@id": `${SITE}/#org` },
};
const VIDEO = {
  "@type": "VideoObject",
  "@id": `${SITE}/#demo`,
  name: DEMO.title,
  description: DEMO.description,
  thumbnailUrl: `${SITE}/assets/demo-poster.jpg`,
  contentUrl: `${SITE}/assets/demo.mp4`,
  uploadDate: DEMO.uploadDate,
  duration: DEMO.durationIso,
  transcript,
};
const faqPage = (id: string, items: [string, string][]) => ({
  "@type": "FAQPage",
  "@id": id,
  mainEntity: items.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
});
const howTo = {
  "@type": "HowTo",
  "@id": `${url("/guides/narrated-website-walkthrough")}#howto`,
  name: "How to make a narrated video walkthrough of a website",
  totalTime: "PT5M",
  tool: [{ "@type": "HowToTool", name: NAME }],
  supply: [{ "@type": "HowToSupply", name: "A website you own or may test" }],
  step: HOWTO.map(([name, text], i) => ({ "@type": "HowToStep", position: i + 1, name, text, url: `${url("/guides/narrated-website-walkthrough")}#step-${i + 1}` })),
};

function graphFor(route: Route) {
  const page = {
    "@type": route.path.startsWith("/guides") ? "Article" : route.path === "/faq" ? "FAQPage" : "WebPage",
    "@id": `${url(route.path)}#page`,
    url: url(route.path),
    name: route.title,
    description: route.description,
    isPartOf: { "@id": `${SITE}/#site` },
    about: { "@id": `${SITE}/#app` },
    inLanguage: "en",
    dateModified: UPDATED,
    author: { "@id": `${SITE}/#author` },
    publisher: { "@id": `${SITE}/#org` },
    ...(route.path.startsWith("/guides") ? { headline: route.label, image: `${SITE}/assets/og.png`, datePublished: UPDATED } : {}),
    ...(route.path === "/faq"
      ? { mainEntity: [...FAQ, ...MORE_FAQ].map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }
      : {}),
  };
  const crumbs = {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: NAME, item: `${SITE}/` },
      ...(route.path === "/" ? [] : [{ "@type": "ListItem", position: 2, name: route.label, item: url(route.path) }]),
    ],
  };
  const extra =
    route.path === "/"
      ? [APP, VIDEO, { ...howTo, "@id": `${SITE}/#howto` }, faqPage(`${SITE}/#faq`, FAQ)]
      : route.path === "/guides/narrated-website-walkthrough"
        ? [APP, howTo, VIDEO]
        : route.path === "/download" || route.path === "/compare/screen-recording"
          ? [APP]
          : [];
  return { "@context": "https://schema.org", "@graph": [ORG, PERSON, WEBSITE, page, crumbs, ...extra] };
}

// ------------------------------------------------------------------ pages

const template = readFileSync(join(out, "index.html"), "utf8");
for (const marker of ['<div id="root"></div>', "<!--seo-->", "<title>"]) {
  if (!template.includes(marker)) throw new Error(`dist/web/index.html has no ${marker} to fill`);
}
const setMeta = (html: string, attr: "name" | "property", key: string, value: string) =>
  html.replace(new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`), `$1${esc(value)}$2`);

for (const route of ROUTES) {
  const head = [
    `<link rel="canonical" href="${url(route.path)}">`,
    `<meta property="og:url" content="${url(route.path)}">`,
    `<meta property="og:image" content="${SITE}/assets/og.png">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:site_name" content="${NAME}">`,
    `<meta name="twitter:image" content="${SITE}/assets/og.png">`,
    `<meta name="author" content="${esc(AUTHOR.name)}">`,
    route.path === "/" ? `<meta property="og:video" content="${SITE}/assets/demo.mp4">` : "",
    `<link rel="alternate" type="text/plain" href="${SITE}/llms.txt" title="${esc(NAME)} for language models">`,
    `<script type="application/ld+json">${JSON.stringify(graphFor(route)).replace(/</g, "\\u003c")}</script>`,
  ]
    .filter(Boolean)
    .join("\n    ");
  let html = template
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(route.title)}</title>`)
    .replace('<div id="root"></div>', `<div id="root">${render(route.path)}</div>`)
    .replace("<!--seo-->", head);
  html = setMeta(html, "name", "description", route.description);
  for (const key of ["og:title", "twitter:title"]) html = setMeta(html, key.startsWith("og") ? "property" : "name", key, route.title);
  for (const key of ["og:description", "twitter:description"]) html = setMeta(html, key.startsWith("og") ? "property" : "name", key, route.description);
  const file = route.path === "/" ? join(out, "index.html") : join(out, route.path.slice(1), "index.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}
rmSync(ssrOut, { recursive: true, force: true });

// ------------------------------------------------------------------ crawler files

// Search engines and AI crawlers are all welcome: every page is public and says nothing private.
const BOTS = [
  "Googlebot", "Bingbot", "DuckDuckBot", "YandexBot", "Applebot", "Applebot-Extended", "Google-Extended", "GPTBot", "OAI-SearchBot",
  "ChatGPT-User", "ClaudeBot", "Claude-User", "Claude-SearchBot", "anthropic-ai", "PerplexityBot", "Perplexity-User", "CCBot",
  "Meta-ExternalAgent", "Meta-ExternalFetcher", "Amazonbot", "Bytespider", "cohere-ai", "MistralAI-User", "YouBot", "DuckAssistBot",
];
writeFileSync(
  join(out, "robots.txt"),
  `# ${NAME}: public pages. Search engines and AI crawlers are welcome to read, index and cite them.\n\n${BOTS.map((b) => `User-agent: ${b}`).join("\n")}\nAllow: /\n\nUser-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`,
);

const urlEntry = (r: Route) =>
  `  <url>
    <loc>${url(r.path)}</loc>
    <lastmod>${UPDATED}</lastmod>
    <changefreq>${r.path === "/" ? "weekly" : "monthly"}</changefreq>
    <priority>${r.path === "/" ? "1.0" : "0.8"}</priority>${
      r.path === "/"
        ? `
    <video:video>
      <video:thumbnail_loc>${SITE}/assets/demo-poster.jpg</video:thumbnail_loc>
      <video:title>${esc(DEMO.title)}</video:title>
      <video:description>${esc(DEMO.description)}</video:description>
      <video:content_loc>${SITE}/assets/demo.mp4</video:content_loc>
      <video:duration>71</video:duration>
      <video:publication_date>${DEMO.uploadDate}</video:publication_date>
      <video:family_friendly>yes</video:family_friendly>
    </video:video>`
        : ""
    }
  </url>`;
writeFileSync(
  join(out, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${ROUTES.map(urlEntry).join("\n")}
</urlset>
`,
);

const pages = ROUTES.map((r) => `- [${r.label}](${url(r.path)}): ${r.description}`).join("\n");
const links = [
  `- [Download for Windows (.exe)](${WINDOWS_EXE_URL}): recommended installer, no admin rights needed`,
  `- [Download for Windows (.msi)](${WINDOWS_MSI_URL}): per-machine package for IT rollouts`,
  `- [Releases](${RELEASES_URL}): every version and its notes`,
  `- [Source code](${REPO_URL}): MIT licensed`,
  `- [Full answers](${SITE}/llms-full.txt): every FAQ answer in plain text`,
].join("\n");
const facts = [
  "- Platform: Windows 10 and 11, 64-bit (macOS and Linux from source)",
  `- Version: ${VERSION}`,
  "- Price: free, MIT licensed, no paid tier, no watermark",
  "- Output: MP4 (H.264 + AAC), WebM, WebVTT captions, transcript, WAV narration, page list with HTTP status",
  "- Voice: the voices built into Windows, offline (flite when run from source on Linux/macOS)",
  "- Limits: up to 30 pages per recording, same site only",
  "- Safety: password held in memory only, stops at CAPTCHA and 2FA, no form submissions after sign-in, respects robots.txt",
  "- Privacy: runs on your PC, no analytics, recordings are never uploaded",
  `- Made by: ${AUTHOR.name} (${AUTHOR.url})`,
].join("\n");
writeFileSync(join(out, "llms.txt"), `# ${NAME}\n\n> ${TAGLINE}. ${DEFINITION}\n\n## Facts\n\n${facts}\n\n## Pages\n\n${pages}\n\n## Links\n\n${links}\n`);
writeFileSync(
  join(out, "llms-full.txt"),
  `# ${NAME}: full answers\n\n> ${DEFINITION}\n\n## Facts\n\n${facts}\n\n## How to make a narrated walkthrough\n\n${HOWTO.map(([t, d], i) => `${i + 1}. **${t}.** ${d}`).join("\n")}\n\n## Questions\n\n${[...FAQ, ...MORE_FAQ].map(([q, a]) => `### ${q}\n\n${a}`).join("\n\n")}\n\n## Demo transcript\n\n${transcript}\n\n## Pages\n\n${pages}\n\n## Links\n\n${links}\n- [Support](${ISSUES_URL})\n`,
);

writeFileSync(join(out, `${INDEXNOW_KEY}.txt`), INDEXNOW_KEY);

writeFileSync(
  join(out, "404.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page not found · ${NAME}</title><meta name="robots" content="noindex"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.6 system-ui,sans-serif;color:#1b1a17;background:#fff;text-align:center;padding:24px}h1{font-size:44px;letter-spacing:-.04em;margin:0}p{color:#6b665d}a{display:inline-block;margin-top:12px;background:#9c5700;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600}</style></head><body><main><p style="font-family:ui-monospace,monospace;font-size:13px">404 · no recording at this address</p><h1>This page was never walked.</h1><p>The link may be old. Everything is on the home page.</p><a href="/">Back to ${NAME}</a></main></body></html>`,
);

console.log(`Built ${ROUTES.length} pages in ${out} for ${SITE}`);
