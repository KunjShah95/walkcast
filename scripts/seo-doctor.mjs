#!/usr/bin/env node
/**
 * The crawl doctor: checks the live site the way a search engine does, and says which end of the
 * problem you are looking at.
 *
 *   npm run seo:doctor
 *   SITE_URL=https://example.com npm run seo:doctor
 *
 * Search Console's Sitemaps report has exactly one failure that means "I could not reach the file":
 * **Couldn't fetch**. Every other message in that report means the file arrived and was rejected.
 * This script separates the two by answering, over real HTTP:
 *
 *   - can the host be resolved at all, on the apex and on www
 *   - does robots.txt parse, and does every Sitemap: line it declares return 200
 *   - is the sitemap valid XML with absolute https URLs, no duplicates, no future <lastmod>
 *   - does every URL inside it return 200, self-canonical, one <h1>, no noindex, valid JSON-LD
 *   - are llms.txt, llms-full.txt, pricing.md and the IndexNow key actually served
 *
 * Exits 0 when nothing failed. Warnings never fail the run.
 */
import { lookup, resolveCname } from "node:dns/promises";

const SITE = (process.env.SITE_URL || "https://walkcast.kunjshah.in").replace(/\/$/, "");
const HOST = new URL(SITE).host;
const UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const TIMEOUT = 20_000;

let failed = 0;
let warned = 0;
let checks = 0;

const line = (mark, text) => {
  checks += 1;
  if (mark === "fail") failed += 1;
  if (mark === "warn") warned += 1;
  const glyph = mark === "ok" ? "ok  " : mark === "warn" ? "warn" : "FAIL";
  console.log(`  ${glyph}  ${text}`);
};
const ok = (t) => line("ok", t);
const warn = (t) => line("warn", t);
const fail = (t) => line("fail", t);
const head = (t) => console.log(`\n${t}`);

async function get(url) {
  const res = await fetch(url, {
    redirect: "manual",
    headers: { "user-agent": UA, accept: "*/*" },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const body = res.status < 300 || res.status >= 400 ? await res.text() : "";
  return { res, body };
}

// ------------------------------------------------------------------ DNS

async function dns() {
  head("DNS");
  // `lookup` is the OS resolver, so it follows the CNAME chain. resolve4() asks for an A record on
  // the name itself and reports "no record" for a name that is a CNAME — which is how this host is
  // set up, and how most hosts on a platform are set up.
  let addrs = [];
  try {
    addrs = await lookup(HOST, { all: true });
  } catch (e) {
    fail(`${HOST} does not resolve (${e.code ?? e.message}): nothing can fetch this site`);
  }
  const v4 = addrs.filter((a) => a.family === 4).map((a) => a.address);
  const v6 = addrs.filter((a) => a.family === 6).map((a) => a.address);
  if (v4.length) ok(`${HOST} resolves on IPv4 → ${v4.join(", ")}`);
  else if (addrs.length === 0) fail(`${HOST} has no IPv4 address: nothing can fetch this site`);
  if (v6.length) ok(`${HOST} resolves on IPv6 → ${v6.join(", ")}`);
  else ok(`${HOST} has no AAAA record (IPv4 only — fine)`);
  try {
    const cname = await resolveCname(HOST);
    ok(`${HOST} is a CNAME → ${cname.join(", ")}`);
  } catch {
    /* an A record at the apex is normal */
  }

  // The www host is the single most common reason a sitemap "cannot be fetched": the property, or
  // the sitemap URL typed into the console, was on www and www does not resolve.
  const WWW = `www.${HOST}`;
  try {
    const www = await lookup(WWW, { all: true });
    ok(`${WWW} resolves → ${www.map((a) => a.address).join(", ")}`);
  } catch {
    warn(
      `${WWW} has NO record. A sitemap submitted on the www host can never be fetched. ` +
        `Either submit ${SITE}/sitemap.xml, or add a CNAME for www pointing at the same target as ${HOST}.`,
    );
  }
}

// ------------------------------------------------------------------ robots.txt

async function robots() {
  head("robots.txt");
  const { res, body } = await get(`${SITE}/robots.txt`);
  if (res.status !== 200) return fail(`/robots.txt returned ${res.status} — crawlers treat a 5xx as "retry later" and a 4xx as "no rules"`);
  ok(`200 ${res.headers.get("content-type") ?? "(no content-type)"}`);

  const sitemaps = [...body.matchAll(/^\s*Sitemap:\s*(\S+)\s*$/gim)].map((m) => m[1]);
  if (!sitemaps.length) return fail("robots.txt declares no Sitemap: line, so nothing is discovered automatically");
  for (const s of sitemaps) {
    let parsed;
    try {
      parsed = new URL(s);
    } catch {
      fail(`Sitemap: ${s} is not an absolute URL`);
      continue;
    }
    if (parsed.host !== HOST) fail(`Sitemap: ${s} points at ${parsed.host}, not ${HOST} — Search Console will refuse it`);
    else ok(`declares Sitemap: ${s}`);
  }

  const disallow = [...body.matchAll(/^\s*Disallow:\s*(\S+)/gim)].map((m) => m[1]).filter((d) => d === "/");
  if (disallow.length) fail('robots.txt has "Disallow: /" — the whole site is blocked');
  else ok("nothing is disallowed site-wide");
  return sitemaps;
}

// ------------------------------------------------------------------ sitemap.xml

const VIDEO_FIELDS = [
  "thumbnail_loc",
  "title",
  "description",
  "duration",
  "publication_date",
];

async function sitemap(url) {
  head(url.replace(SITE, "") || "/");
  const { res, body } = await get(url);
  if (res.status >= 300 && res.status < 400) {
    return fail(`${res.status} redirect to ${res.headers.get("location")} — submit the final URL, not this one`);
  }
  if (res.status !== 200) {
    return fail(`${res.status} ${res.statusText}. This is the only sitemap error that reads as "Couldn't fetch": the file is not being served.`);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (!/xml/.test(ct)) fail(`content-type is "${ct}" — a browser or checker may treat it as a download`);
  else ok(`200 ${ct} (${body.length} bytes)`);

  if (!body.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) fail("the XML declaration is not the first thing in the file");
  const open = (body.match(/<url>/g) ?? []).length;
  const close = (body.match(/<\/url>/g) ?? []).length;
  if (open !== close) fail(`${open} <url> entries but ${close} </url> closes: the XML is truncated or malformed`);
  if (!/<\/urlset>\s*$/.test(body)) fail("the document does not end with </urlset>");
  if (open === 0) fail("no <url> entries");
  else ok(`${open} <url> entries`);

  const locs = [...body.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  const hosts = new Set();
  for (const loc of locs) {
    try {
      const u = new URL(loc);
      hosts.add(u.host);
      if (u.protocol !== "https:") fail(`<loc> is not https: ${loc}`);
      if (u.search || u.hash) fail(`<loc> carries a query or fragment: ${loc}`);
    } catch {
      fail(`<loc> is not an absolute URL: ${loc}`);
    }
  }
  if (hosts.size === 1 && [...hosts][0] === HOST) ok(`every <loc> is https on ${HOST}`);
  else if (hosts.size) fail(`<loc> hosts are ${[...hosts].join(", ")}, expected only ${HOST}`);
  if (new Set(locs).size !== locs.length) fail("duplicate <loc> entries");
  else ok("no duplicate URLs");

  const dates = [...body.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)].map((m) => m[1]);
  const bad = dates.filter((d) => Number.isNaN(Date.parse(d)));
  const future = dates.filter((d) => Date.parse(d) > Date.now() + 86_400_000);
  if (bad.length) fail(`<lastmod> is not a date: ${bad.slice(0, 3).join(", ")}`);
  if (future.length) fail(`<lastmod> is in the future: ${future.slice(0, 3).join(", ")}`);
  if (dates.length && !bad.length && !future.length) ok(`${dates.length} <lastmod> values are valid and not future-dated`);

  if (body.includes("<video:video>")) {
    const missing = VIDEO_FIELDS.filter((f) => !body.includes(`<video:${f}>`));
    if (missing.length) fail(`video entry is missing ${missing.join(", ")}`);
    else ok("video entry has every field Google requires");
    const duration = Number(/<video:duration>(\d+)<\/video:duration>/.exec(body)?.[1] ?? 0);
    if (!(duration >= 1 && duration <= 28_800)) fail(`<video:duration> is ${duration}; Google accepts 1–28800 seconds`);
  }
  return locs;
}

// ------------------------------------------------------------------ the pages themselves

async function pages(locs) {
  head(`pages in the sitemap (${locs.length})`);
  const titles = new Map();
  for (const loc of locs) {
    const path = loc.replace(SITE, "") || "/";
    let res;
    let body;
    try {
      ({ res, body } = await get(loc));
    } catch (e) {
      fail(`${path} — request failed: ${e.message}`);
      continue;
    }
    if (res.status >= 300 && res.status < 400) {
      fail(`${path} ${res.status} → ${res.headers.get("location")} (the sitemap should list the final URL)`);
      continue;
    }
    if (res.status !== 200) {
      fail(`${path} ${res.status}. A sitemap listing a URL that is not 200 is the classic crawl-budget leak.`);
      continue;
    }

    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(body)?.[1];
    const title = /<title>([^<]*)<\/title>/.exec(body)?.[1] ?? "";
    const h1 = (body.match(/<h1[\s>]/g) ?? []).length;
    const noindex = /<meta name="robots" content="[^"]*noindex/.test(body);
    const problems = [];
    if (canonical !== loc) problems.push(`canonical is ${canonical ?? "missing"}, not itself`);
    if (!title) problems.push("no title");
    if (h1 !== 1) problems.push(`${h1} h1 tags`);
    if (noindex) problems.push("noindex");
    if (titles.has(title)) problems.push(`title duplicates ${titles.get(title)}`);
    const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(body)?.[1];
    if (!ld) problems.push("no JSON-LD");
    else
      try {
        JSON.parse(ld);
      } catch {
        problems.push("JSON-LD does not parse");
      }
    titles.set(title, path);

    const words = body
      .replace(/<script[\s\S]*?<\/script>/g, " ")
      .replace(/<style[\s\S]*?<\/style>/g, " ")
      .replace(/<[^>]+>/g, " ")
      .split(/\s+/)
      .filter((w) => /[a-zA-Z]/.test(w)).length;

    if (problems.length) fail(`${path} — ${problems.join("; ")}`);
    else ok(`${path.padEnd(40)} 200  ${String(words).padStart(4)} words  h1=1  canonical ok`);
  }
}

// ------------------------------------------------------------------ machine-readable files

async function files() {
  head("machine-readable files");
  const wanted = ["/llms.txt", "/llms-full.txt", "/pricing.md", "/4c0c276234846f5ee9ee59b6c145139b.txt"];
  for (const path of wanted) {
    try {
      const { res, body } = await get(`${SITE}${path}`);
      if (res.status !== 200) fail(`${path} ${res.status}`);
      else ok(`${path.padEnd(40)} 200  ${body.length} bytes`);
    } catch (e) {
      fail(`${path} — ${e.message}`);
    }
  }

  // The 404 page is legitimately a 200 file; what matters is that it cannot be indexed.
  try {
    const { res, body } = await get(`${SITE}/404.html`);
    if (res.status !== 200) fail(`/404.html ${res.status} — Vercel needs this file to answer unknown paths`);
    else if (!/name="robots" content="[^"]*noindex/.test(body)) fail("/404.html is indexable: it must carry noindex");
    else ok("/404.html                                200  noindex");
  } catch (e) {
    fail(`/404.html — ${e.message}`);
  }
}

// ------------------------------------------------------------------ run

console.log(`Walkcast crawl doctor\nsite: ${SITE}\nchecked against a Googlebot user-agent, ${TIMEOUT / 1000}s timeout\n`);

await dns();
const declared = (await robots()) ?? [];
await sitemap(`${SITE}/sitemap.xml`);
for (const other of declared) if (other !== `${SITE}/sitemap.xml` && other.startsWith(SITE)) await sitemap(other);

const { body } = await get(`${SITE}/sitemap.xml`);
const locs = [...body.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
if (locs.length) await pages(locs);
await files();

console.log(`\n${failed ? "RESULT: FAILED" : "RESULT: PASSED"} — ${checks} checks, ${failed} failed, ${warned} warnings`);
if (failed) {
  console.log("\nIf the sitemap itself failed, Search Console will say \"Couldn't fetch\". Fix the host or the");
  console.log("200 above, redeploy, then remove and re-add the sitemap in Search Console.");
}
process.exit(failed ? 1 : 0);
