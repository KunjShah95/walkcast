import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";

/**
 * Builds the site, then prerenders the page into dist/web/index.html so the full content is in
 * the HTML (search engines and AI crawlers read it without running JavaScript). The browser bundle
 * hydrates that markup.
 */
const here = import.meta.dirname;
const config = join(here, "vite.config.ts");
const out = resolve(here, "../../dist/web");
const ssrOut = resolve(here, "../../dist/web-ssr");

await build({ configFile: config, logLevel: "warn" });
await build({ configFile: config, logLevel: "warn", build: { ssr: join(here, "src/entry-server.tsx"), outDir: ssrOut, emptyOutDir: true } });

const { render } = (await import(pathToFileURL(join(ssrOut, "entry-server.js")).href)) as { render: () => string };
const indexPath = join(out, "index.html");
const html = readFileSync(indexPath, "utf8");
const marker = '<div id="root"></div>';
if (!html.includes(marker)) throw new Error(`${indexPath} has no ${marker} to fill`);
writeFileSync(indexPath, html.replace(marker, `<div id="root">${render()}</div>`));
rmSync(ssrOut, { recursive: true, force: true });
console.log(`Prerendered ${indexPath}`);
