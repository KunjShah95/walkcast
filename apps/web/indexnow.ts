import { ROUTES, SITE_ORIGIN } from "./src/content.ts";
import { INDEXNOW_KEY } from "./src/seo.ts";

/**
 * Announce every page to IndexNow after a deploy: `npm run web:indexnow`. Run it once the domain
 * serves the new build (the engines fetch /<key>.txt to verify ownership).
 */
const site = (process.env.SITE_URL || SITE_ORIGIN).replace(/\/$/, "");
const host = new URL(site).host;
const urlList = ROUTES.map((r) => (r.path === "/" ? `${site}/` : `${site}${r.path}`));

const key = await fetch(`${site}/${INDEXNOW_KEY}.txt`).then((r) => (r.ok ? r.text() : ""), () => "");
if (key.trim() !== INDEXNOW_KEY) {
  console.error(`${site}/${INDEXNOW_KEY}.txt does not serve the key yet; deploy first.`);
  process.exit(1);
}
const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host, key: INDEXNOW_KEY, keyLocation: `${site}/${INDEXNOW_KEY}.txt`, urlList }),
});
console.log(`IndexNow: ${res.status} ${res.statusText} for ${urlList.length} URLs on ${host}`);
if (res.status >= 400) process.exit(1);
