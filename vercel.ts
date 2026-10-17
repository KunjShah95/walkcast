/**
 * Vercel project configuration: the marketing site only. apps/web is a static React build
 * (Vite) prerendered into dist/web, one index.html per page; there are no functions.
 *
 * trailingSlash: false gives every page one URL (/faq, not /faq/), matching the canonical tags
 * and the sitemap.
 */
export const config = {
  framework: null,
  buildCommand: "npm run web:build",
  outputDirectory: "dist/web",
  trailingSlash: false,
  headers: [
    {
      // Vite's hashed bundles and the demo media never change under the same name.
      source: "/assets/(.*)",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    },
    {
      source: "/(robots.txt|sitemap.xml|llms.txt|llms-full.txt)",
      headers: [{ key: "Cache-Control", value: "public, max-age=3600" }],
    },
  ],
};

export default config;
