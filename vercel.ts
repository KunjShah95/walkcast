/**
 * Vercel project configuration: the marketing site only. apps/web is a static React build
 * (Vite) prerendered into dist/web, one index.html per page; there are no functions.
 *
 * trailingSlash: false gives every page one URL (/faq, not /faq/), matching the canonical tags
 * and the sitemap.
 */

/** The IndexNow key file is served from the repo, so its URL is stable and can be cached. */
const INDEXNOW_KEY_FILE = "4c0c276234846f5ee9ee59b6c145139b.txt";

/** One hour. Long enough to spare the origin, short enough that a deploy is visible the same hour. */
const CRAWLER_FILES = [
  "robots\\.txt",
  "sitemap\\.xml",
  "sitemap-agents\\.xml",
  "llms\\.txt",
  "llms-full\\.txt",
  "pricing\\.md",
  INDEXNOW_KEY_FILE.replace(/\./g, "\\."),
].join("|");

export const config = {
  framework: null,
  buildCommand: "npm run web:build",
  outputDirectory: "dist/web",
  trailingSlash: false,
  redirects: [
    {
      /**
       * www has no DNS record today, so this rule is dormant. It exists so that the day the record
       * is added — the usual fix when Search Console cannot fetch a sitemap submitted on the www
       * host — every www URL a crawler already holds lands on the canonical host.
       */
      source: "/:path*",
      has: [{ type: "host" as const, value: "www.walkcast.kunjshah.in" }],
      destination: "https://walkcast.kunjshah.in/:path*",
      permanent: true,
    },
  ],
  headers: [
    {
      // Vite's hashed bundles and the demo media never change under the same name.
      source: "/assets/(.*)",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    },
    {
      source: `/(${CRAWLER_FILES})`,
      headers: [{ key: "Cache-Control", value: "public, max-age=3600" }],
    },
    {
      /**
       * Static hosting guesses application/xml from the extension, but a sitemap checker that sees
       * no charset occasionally reads the bytes as latin-1 and then reports the file as unreadable.
       * Saying it outright costs one header.
       */
      source: "/(sitemap\\.xml|sitemap-agents\\.xml)",
      headers: [{ key: "Content-Type", value: "application/xml; charset=utf-8" }],
    },
  ],
};

export default config;
