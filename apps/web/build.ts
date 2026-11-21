import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";
import {
  ANSWER_PAGES,
  AUTHOR,
  COMPARE_FAQ,
  COMPARE_INDEX,
  COMPARES,
  DEFINITION,
  DEMO,
  DESCRIPTION,
  FAQ,
  GUIDE_STEPS,
  GUIDES,
  HOWTO,
  LAB_FAQ,
  MORE_FAQ,
  OG_IMAGE_ALT,
  NAME,
  PRICING_FAQ,
  ROUTES,
  SITE_ORIGIN,
  TAGLINE,
  UPDATED,
  type Route,
} from "./src/content.ts";
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
// WEB_OUT keeps a second build (the test suite runs several) from emptying this one's folder.
const out = resolve(process.env.WEB_OUT ?? join(here, "../../dist/web"));
// The server bundle imports React at runtime, so it has to sit inside the repo where node_modules
// is reachable. Naming it after the output folder keeps parallel builds out of each other's way.
const ssrOut = resolve(process.env.WEB_SSR_OUT ?? join(here, "../../dist", `.web-ssr-${basename(out)}`));

const SITE = (process.env.SITE_URL || SITE_ORIGIN).replace(/\/$/, "");
const url = (path: string) => (path === "/" ? `${SITE}/` : `${SITE}${path}`);

// Start from an empty folder: a previous run's prerendered index.html must never be mistaken
// for this run's template.
rmSync(out, { recursive: true, force: true });
await build({ configFile: config, logLevel: "warn", build: { outDir: out, emptyOutDir: true } });
await build({ configFile: config, logLevel: "warn", build: { ssr: join(here, "src/entry-server.tsx"), outDir: ssrOut, emptyOutDir: true } });
const { render } = (await import(pathToFileURL(join(ssrOut, "entry-server.js")).href)) as { render: (path: string) => string };

// ------------------------------------------------------------------ shared facts

const vtt = readFileSync(join(here, "public/assets/demo.vtt"), "utf8");
const transcript = [...vtt.matchAll(/-->[^\n]*\r?\n([\s\S]*?)(?:\r?\n\r?\n|$)/g)].map((m) => m[1]!.trim()).join(" ");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** `sameAs` is how an engine ties this site to the off-site pages describing the same entity. Every
 *  URL here exists; a 404 in sameAs is worse than a short list. */
const ORG = {
  "@type": "Organization",
  "@id": `${SITE}/#org`,
  name: NAME,
  url: `${SITE}/`,
  logo: `${SITE}/assets/logo.png`,
  sameAs: [REPO_URL, "https://www.producthunt.com/products/walkcast"],
  founder: { "@id": `${SITE}/#author` },
};
const PERSON = { "@type": "Person", "@id": `${SITE}/#author`, name: AUTHOR.name, url: AUTHOR.url, sameAs: [AUTHOR.url] };
const WEBSITE = { "@type": "WebSite", "@id": `${SITE}/#site`, url: `${SITE}/`, name: NAME, description: DESCRIPTION, publisher: { "@id": `${SITE}/#org` }, inLanguage: "en" };
const APP = {
  "@type": "SoftwareApplication",
  "@id": `${SITE}/#app`,
  name: NAME,
  description: DEFINITION,
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Windows 10, Windows 11, Linux",
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
  // Third-party copy of the demo. Placeholders like "https://youtu.be/…" are indexed by
  // Third-party copy of the demo. A real https://youtu.be/… or https://www.youtube.com/watch?v=…
  // URL is indexed by answer engines while a placeholder is worse than none at all, so it
  // only ships once it is a real URL. Leave out of the sitemap: only the mounted
  // /assets/demo.mp4 is crawlable.
  ...(DEMO.youtubeUrl ? {
    youtubeUrl: DEMO.youtubeUrl,
    contentUrl: DEMO.youtubeUrl,
  } : {}),
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

/** A HowTo built from the shared step list, so the page and the schema cannot disagree. */
const howToFor = (path: string, name: string, minutes: number) => {
  const steps = GUIDE_STEPS[path] ?? [];
  return {
    "@type": "HowTo",
    "@id": `${url(path)}#howto`,
    name,
    totalTime: `PT${minutes}M`,
    tool: [{ "@type": "HowToTool", name: NAME }],
    supply: [{ "@type": "HowToSupply", name: "A website you own or may test" }],
    step: steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.title,
      text: s.text,
      url: `${url(path)}#step-${i + 1}`,
    })),
  };
};

/**
 * The competitor in a comparison page, described as an entity so engines can relate the two.
 *
 * A plain Thing, not a SoftwareApplication: Google's software-app rich result requires an
 * aggregateRating or a review, and a competitor's rating is not ours to state. Typed as an app it
 * was a validation error on every comparison page for a result the page could never earn.
 */
const competitor = (path: string) => {
  const c = COMPARES.find((x) => x.path === path);
  if (!c) return null;
  return {
    "@type": "Thing",
    "@id": `${c.themUrl}#app`,
    name: c.them,
    url: c.themUrl,
    description: c.price,
  };
};

/**
 * The pages whose subject is the app itself. Only these carry the full SoftwareApplication node.
 * Google validates that node for the software-app rich result, which needs an aggregateRating or a
 * review; Walkcast has no genuine ratings and never invents them, so the node is kept where the app
 * is the entity being described (home, download) and every other page refers to it by name and URL.
 * That took the validation error from every page that mentioned the app down to the two that are
 * about it.
 */
const APP_PAGES = new Set(["/", "/download"]);

/** What a page that is not about the app says the app is: enough to resolve `about`, nothing a rich result checks. */
const APP_REFERENCE = { "@type": "Thing", "@id": `${SITE}/#app`, name: NAME, url: `${SITE}/`, description: DEFINITION };

function graphFor(route: Route) {
  const kind = route.kind ?? "webpage";
  const isGuide = kind === "guide";
  const isCompare = kind === "compare";
  // Each page carries its own change date: editing one page must not date all of them.
  const modified = route.updated ?? UPDATED;
  const pageType = kind === "index" ? "CollectionPage" : isGuide || isCompare ? "Article" : kind === "faq" ? "FAQPage" : "WebPage";
  const page: Record<string, unknown> = {
    "@type": pageType,
    "@id": `${url(route.path)}#page`,
    url: url(route.path),
    name: route.title,
    description: route.description,
    isPartOf: { "@id": `${SITE}/#site` },
    about: { "@id": `${SITE}/#app` },
    inLanguage: "en",
    dateModified: modified,
    author: { "@id": `${SITE}/#author` },
    publisher: { "@id": `${SITE}/#org` },
  };
  if (isGuide || isCompare) {
    page.headline = route.label;
    page.image = `${SITE}/assets/og.png`;
    page.datePublished = UPDATED;
  }
  // The one-paragraph answer is the passage voice assistants read out. Naming it says so.
  const answerSelector = route.answerSelector ?? (ANSWER_PAGES.has(route.path) ? ".answer" : undefined);
  if (answerSelector) {
    page.speakable = { "@type": "SpeakableSpecification", cssSelector: [answerSelector] };
  }
  if (kind === "index") {
    page.mainEntity = {
      "@type": "ItemList",
      itemListElement: (route.path === "/compare" ? COMPARE_INDEX.flatMap((g) => g.items) : GUIDES).map((g, i) => ({ "@type": "ListItem", position: i + 1, name: g.label, url: url(g.path) })),
    };
  }
  if (kind === "faq") {
    page.mainEntity = [...FAQ, ...MORE_FAQ].map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } }));
  }

  // Breadcrumbs: a guide sits under /guides, so the trail has three steps, not two.
  const trail: { name: string; item: string }[] = [{ name: NAME, item: `${SITE}/` }];
  if (route.path.startsWith("/guides/")) trail.push({ name: "Guides", item: url("/guides") });
  if (route.path.startsWith("/compare/")) trail.push({ name: "Compare", item: url("/compare") });
  if (route.path !== "/") trail.push({ name: route.label, item: url(route.path) });
  const crumbs = {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.name, item: t.item })),
  };

  // Every page's `about` points at the app, so every page defines it: in full where the page is
  // about the app, as a plain reference elsewhere.
  const extra: unknown[] = [APP_PAGES.has(route.path) ? APP : APP_REFERENCE];
  if (kind === "landing") {
    extra.push(VIDEO, { ...howTo, "@id": `${SITE}/#howto` }, faqPage(`${SITE}/#faq`, FAQ));
  } else if (kind === "guide") {
    extra.push(VIDEO);
    if (GUIDE_STEPS[route.path]) extra.push(howToFor(route.path, route.label, 5));
  } else if (kind === "compare") {
    const comp = competitor(route.path);
    if (comp) extra.push(comp);
  }

  // A page's own questions, emitted as FAQPage so an engine can lift them directly.
  const ownFaq: [string, string][] =
    kind === "lab" ? LAB_FAQ : kind === "pricing" ? PRICING_FAQ : (route.faq ?? COMPARE_FAQ[route.path] ?? []);
  if (ownFaq.length) extra.push(faqPage(`${url(route.path)}#faq`, ownFaq));

  return { "@context": "https://schema.org", "@graph": [ORG, PERSON, WEBSITE, page, crumbs, ...extra] };
}

// ------------------------------------------------------------------ pages

/**
 * Ownership tags, when the environment provides them. Both consoles accept DNS or an uploaded file,
 * but a meta tag is the one method that needs no access to the DNS provider — which matters when the
 * domain's nameservers sit at a registrar rather than at the host. Set GOOGLE_SITE_VERIFICATION and
 * BING_SITE_VERIFICATION (the msvalidate.01 value) in the Vercel project settings.
 */
const VERIFY_TAGS = [
  process.env.GOOGLE_SITE_VERIFICATION ? `<meta name="google-site-verification" content="${esc(process.env.GOOGLE_SITE_VERIFICATION)}">` : "",
  process.env.BING_SITE_VERIFICATION ? `<meta name="msvalidate.01" content="${esc(process.env.BING_SITE_VERIFICATION)}">` : "",
].filter(Boolean);

const templateFile = join(out, "index.html");
if (!existsSync(templateFile)) {
  throw new Error(`the client build left no ${templateFile} to fill; WEB_OUT may point at the wrong folder.`);
}
const template = readFileSync(templateFile, "utf8");
for (const marker of ['<div id="root"></div>', "<!--seo-->", "<title>"]) {
  if (!template.includes(marker)) throw new Error(`${templateFile} has no ${marker} to fill: it is not the client build's index.html.`);
}
const setMeta = (html: string, attr: "name" | "property", key: string, value: string) =>
  html.replace(new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`), `$1${esc(value)}$2`);

for (const route of ROUTES) {
  const head = [
    `<link rel="canonical" href="${url(route.path)}">`,
    `<link rel="me" href="${REPO_URL}">`,
    ...VERIFY_TAGS,
    `<meta property="og:url" content="${url(route.path)}">`,
    `<meta property="og:image" content="${SITE}/assets/og.png">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:alt" content="${OG_IMAGE_ALT}">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:site_name" content="${NAME}">`,
    `<meta name="twitter:image:alt" content="${OG_IMAGE_ALT}">`,
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
// Exactly one Sitemap line. Two sitemaps in robots.txt makes Google fetch and validate both, and a
// sitemap of .txt files reads as a file full of "URL not allowed" in the Sitemaps report. The agent
// files are advertised from llms.txt, which is where an agent looks for them anyway.
writeFileSync(
  join(out, "robots.txt"),
  `# ${NAME}: public pages. Search engines and AI crawlers are welcome to read, index and cite them.\n\n${BOTS.map((b) => `User-agent: ${b}`).join("\n")}\nAllow: /\n\nUser-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`,
);

/**
 * sitemaps.org accepts a bare date, but the video extension (and every sitemap validator) wants a
 * full W3C datetime. Normalising here means a bad value can only come from content.ts, never from
 * the writer.
 */
const w3c = (d: string) => (d.length === 10 ? `${d}T00:00:00+00:00` : d);
/** `PT1M11S` → 71, the seconds the video sitemap entry requires. */
const durationSeconds = (iso: string) => {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
};
const VIDEO_SECONDS = durationSeconds(DEMO.durationIso);
if (!VIDEO_SECONDS) throw new Error(`DEMO.durationIso is not an ISO 8601 duration: ${DEMO.durationIso}`);

const urlEntry = (r: Route) =>
  `  <url>
    <loc>${url(r.path)}</loc>
    <lastmod>${w3c(r.updated ?? UPDATED)}</lastmod>
    <changefreq>${r.path === "/" ? "weekly" : "monthly"}</changefreq>
    <priority>${r.path === "/" ? "1.0" : "0.8"}</priority>${
      r.path === "/"
        ? `
    <video:video>
      <video:thumbnail_loc>${SITE}/assets/demo-poster.jpg</video:thumbnail_loc>
      <video:title>${esc(DEMO.title)}</video:title>
      <video:description>${esc(DEMO.description)}</video:description>
      <video:content_loc>${SITE}/assets/demo.mp4</video:content_loc>
      <video:duration>${VIDEO_SECONDS}</video:duration>
      <video:publication_date>${w3c(DEMO.youtubeUrl ? DEMO.youtubeUploadDate : DEMO.uploadDate)}</video:publication_date>
      <video:family_friendly>yes</video:family_friendly>
    </video:video>`
        : ""
    }
  </url>`;

/**
 * Search Console reports "Couldn't fetch" only when it cannot retrieve the file at all. Everything
 * else it reports is a validation error, and every validation error is one of these. Validating at
 * build time means the sitemap cannot ship with a value that generates one.
 */
function assertSitemap(file: string, xml: string) {
  if (!xml.startsWith(`<?xml version="1.0" encoding="UTF-8"?>\n`)) throw new Error(`${file}: the XML declaration must be the first thing in the file`);
  const open = (xml.match(/<url>/g) ?? []).length;
  const close = (xml.match(/<\/url>/g) ?? []).length;
  if (open !== close) throw new Error(`${file}: ${open} <url> entries but ${close} </url> closes`);
  if (!xml.trimEnd().endsWith("</urlset>")) throw new Error(`${file}: the document does not close </urlset>`);

  const host = new URL(SITE).host;
  const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]!);
  if (locs.length !== open) throw new Error(`${file}: ${open} entries but ${locs.length} <loc> values`);
  if (new Set(locs).size !== locs.length) throw new Error(`${file}: duplicate <loc> entries`);

  // A crawl budget spent on a 404 is worse than no entry at all, so every URL is checked here and
  // again, over HTTP, by `npm run seo:doctor` once it is deployed.
  const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
  for (const loc of locs) {
    let parsed: URL;
    try {
      parsed = new URL(loc);
    } catch {
      throw new Error(`${file}: <loc> is not an absolute URL: ${loc}`);
    }
    if (parsed.protocol !== "https:") throw new Error(`${file}: <loc> is not https: ${loc}`);
    if (parsed.host !== host) throw new Error(`${file}: <loc> is not on ${host} (canonical host mismatch): ${loc}`);
    if (parsed.search || parsed.hash) throw new Error(`${file}: <loc> carries a query or fragment: ${loc}`);
  }
  for (const [, raw] of xml.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)) {
    const t = Date.parse(raw!);
    if (Number.isNaN(t)) throw new Error(`${file}: <lastmod> is not a date: ${raw}`);
    // A future date is the one <lastmod> error engines act on, so it is never worth risking.
    if (t > tomorrow) throw new Error(`${file}: <lastmod> is in the future: ${raw}`);
  }
}
const pages = ROUTES.map((r) => `- [${r.label}](${url(r.path)}): ${r.description}`).join("\n");
const links = [
  `- [Download for Windows (.exe)](${WINDOWS_EXE_URL}): recommended installer, no admin rights needed`,
  `- [Download for Windows (.msi)](${WINDOWS_MSI_URL}): per-machine package for IT rollouts`,
  `- [Releases](${RELEASES_URL}): every version and its notes`,
  `- [Source code](${REPO_URL}): MIT licensed`,
  `- [Pricing in plain text](${SITE}/pricing.md): the price, in a format an agent can parse`,
  `- [Full answers](${SITE}/llms-full.txt): every FAQ answer in plain text`,
  `- [XML sitemap](${SITE}/sitemap.xml): every page, with the demo recording as a video entry`,
  `- [Agent sitemap](${SITE}/sitemap-agents.xml): the plain-text files above, as XML`,
].join("\n");
const facts = [
  `- Last updated: ${UPDATED}`,
  "- Platform: Windows 10 and 11 (64-bit, .exe or .msi), and 64-bit Linux (AppImage or .deb)",
  `- Version: ${VERSION}`,
  "- Price: free, MIT licensed, no paid tier, no watermark",
  "- Output: MP4 (H.264 + AAC), WebM, WebVTT captions, transcript, WAV narration, page list with HTTP status",
  "- Sharing: a share link that plays the walkthrough for anyone who has it (no account, expiring), a one-line iframe embed, notes pinned to the second of the video, and the whole visit as a Markdown document",
  "- Voice: the voices built into Windows, offline (flite when run from source on Linux)",
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

// A price an agent can read without running JavaScript. An agent comparing tools on a buyer's
// behalf cannot scrape a rendered pricing section; this file it can just parse.
writeFileSync(
  join(out, "pricing.md"),
  `# Pricing — ${NAME}\n\nLast updated: ${UPDATED}\n\n## Free\n\n- Price: $0 total, forever\n- License: MIT\n- Seats: unlimited. There is no account system and no per-user pricing.\n- Recordings per day: no limit. The only ceiling is your machine.\n- Pages per recording: up to 30, on one site.\n- Watermark: none.\n- Paid tier: none. There is no paid tier and no plan for one.\n- Cloud narration voices: optional and not required. Use the built-in offline voices at no cost,\n  or bring your own ElevenLabs or OpenAI key.\n- Disk: about 600 MB (the app plus the recording browser it downloads once).\n- Network: only the sites you record. Recordings are never uploaded.\n\n## What you get\n\n- A desktop app for Windows 10 or 11 (64-bit) and 64-bit Linux.\n- One link in, one video out: an MP4 with a spoken voice-over, WebVTT captions, a transcript,\n  the narration as a WAV file, and a list of every page visited with its HTTP status.\n- Pages behind a login, recorded with a test account you provide.\n- Walkcast Lab, in the same app: failed browser AI agent runs turned into classified causes\n  and replayable regression fixtures.\n\n## What it does not do\n\n- It does not record your screen. It records your website, in its own browser.\n- It does not submit forms. It stops at CAPTCHA and two-factor prompts.\n- It does not edit or splice video. It records one continuous visit.\n\n## Links\n\n- [Pricing page](${url("/pricing")})\n- [Download](${url("/download")})\n- [Source code](${REPO_URL})\n`,
);

// The one sitemap a search engine should submit. Only HTML pages belong in it: a .txt or .md file
// is not a page, and listing one makes Search Console report every entry as "URL not allowed".
const pageSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${ROUTES.map(urlEntry).join("\n")}
</urlset>
`;
assertSitemap("sitemap.xml", pageSitemap);
writeFileSync(join(out, "sitemap.xml"), pageSitemap);

// The machine-readable files still get an index of their own, for an agent that would rather read
// XML than prose. It is not advertised in robots.txt as a search sitemap, because it is not one;
// llms.txt links it instead.
const agentSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[
  ["/pricing.md", "0.6"],
  ["/llms.txt", "0.5"],
  ["/llms-full.txt", "0.5"],
]
  .map(
    ([path, priority]) => `  <url>
    <loc>${url(path!)}</loc>
    <lastmod>${w3c(UPDATED)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${priority}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>
`;
assertSitemap("sitemap-agents.xml", agentSitemap);
writeFileSync(join(out, "sitemap-agents.xml"), agentSitemap);

writeFileSync(join(out, `${INDEXNOW_KEY}.txt`), INDEXNOW_KEY);

writeFileSync(
  join(out, "404.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page not found · ${NAME}</title><meta name="robots" content="noindex"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.6 system-ui,sans-serif;color:#1b1a17;background:#fff;text-align:center;padding:24px}h1{font-size:44px;letter-spacing:-.04em;margin:0}p{color:#6b665d}a{display:inline-block;margin-top:12px;background:#9c5700;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600}</style></head><body><main><p style="font-family:ui-monospace,monospace;font-size:13px">404 · no recording at this address</p><h1>This page was never walked.</h1><p>The link may be old. Everything is on the home page.</p><a href="/">Back to ${NAME}</a></main></body></html>`,
);

console.log(`Built ${ROUTES.length} pages in ${out} for ${SITE}`);
