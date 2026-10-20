/**
 * Pulls live keyword + trend data for the SEO/AEO/GEO work.
 *
 * Sources (all free, no API key):
 *   - Google autocomplete (suggestqueries.google.com)  -> real query strings people type
 *   - Google "related searches" (www.google.com/complete) -> neighbouring intents
 *   - Google Trends (trends.google.com undocumented endpoints) -> relative interest over time
 *
 * Output: JSON on stdout/file so it can be turned into a report.
 *
 *   node scripts/seo-trends.mjs            # trends + suggestions
 *   node scripts/seo-trends.mjs --sug-only # skip Trends (it rate-limits hard)
 */
import { writeFileSync } from "node:fs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** ------------------------------------------------------------------ suggestions */

/** Alphabetical + common-typing variants Google fills in for a seed query. */
const ALPHA = "abcdefghijklmnopqrstuvwxyz".split("");
const NUM = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

async function suggest(endpoint, q) {
  const url = `${endpoint}?client=firefox&hl=en&gl=us&q=${encodeURIComponent(q)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" } });
      if (!res.ok) throw new Error(`${res.status}`);
      const raw = await res.text();
      const json = JSON.parse(raw);
      return Array.isArray(json[1]) ? json[1] : [];
    } catch {
      await sleep(1200 * (attempt + 1));
    }
  }
  return [];
}

/** Suggestions for a seed plus seed+" <letter>" expansions (catches the long tail). */
async function expand(seed) {
  const out = new Set();
  const direct = await suggest("https://suggestqueries.google.com/complete/search", seed);
  direct.forEach((s) => out.add(s.toLowerCase()));
  for (const ch of ALPHA) {
    const more = await suggest("https://suggestqueries.google.com/complete/search", `${seed} ${ch}`);
    more.forEach((s) => out.add(s.toLowerCase()));
    await sleep(120);
  }
  for (const ch of NUM) {
    const more = await suggest("https://suggestqueries.google.com/complete/search", `${seed} ${ch}`);
    more.forEach((s) => out.add(s.toLowerCase()));
    await sleep(120);
  }
  const rel = await suggest("https://www.google.com/complete/search", seed);
  rel.forEach((s) => out.add(s.toLowerCase()));
  return [...out].sort();
}

/** ------------------------------------------------------------------ trends */

class Session {
  constructor() {
    this.cookies = new Map();
  }
  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  absorb(res) {
    const raw = res.headers.getSetCookie?.() ?? [];
    for (const c of raw) {
      const [pair] = c.split(";");
      const idx = pair.indexOf("=");
      if (idx > 0) this.cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }
  async get(url) {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: this.header(),
      },
      redirect: "follow",
    });
    this.absorb(res);
    return res;
  }
}

/** Trends rate-limits hard on shared IPs: retry 429/5xx with a growing pause. */
async function retry(s, url, tries = 6) {
  let wait = 8000;
  for (let i = 0; i < tries; i++) {
    const res = await s.get(url);
    if (res.ok) return res;
    if (res.status !== 429 && res.status < 500) return res;
    process.stderr.write(`  ${res.status} on ${url.split("?")[0]} - waiting ${wait / 1000}s\n`);
    await sleep(wait);
    wait = Math.min(wait * 2, 90000);
  }
  return s.get(url);
}

async function trendsSession() {
  const s = new Session();
  await s.get("https://trends.google.com/trends/");
  return s;
}

function parseJsonp(text) {
  return JSON.parse(text.slice(text.indexOf("{")));
}

async function explore(s, req) {
  const url = `https://trends.google.com/trends/api/explore?hl=en-US&tz=-480&req=${encodeURIComponent(
    JSON.stringify(req)
  )}`;
  const res = await retry(s, url);
  if (!res.ok) throw new Error(`explore ${res.status}`);
  return parseJsonp(await res.text());
}

/**
 * Interest over time for a set of keywords, as comparable indices (0-100 within the group).
 */
async function interest(s, keywords, time = "today 12-m") {
  const req = {
    comparisonItem: keywords.map((keyword) => ({ keyword, geo: "", time })),
    category: 0,
    property: "",
  };
  const json = await explore(s, req);
  const widget = json.widgets.find((w) => w.id === "TIMESERIES");
  if (!widget) throw new Error("no TIMESERIES widget");
  // The widget echoes the exact request shape Trends expects back; reuse it verbatim.
  const url = `https://trends.google.com/trends/api/widgetdata/multiline?hl=en-US&tz=-480&req=${encodeURIComponent(
    JSON.stringify(widget.request)
  )}&token=${widget.token}`;
  const dres = await retry(s, url);
  if (!dres.ok) throw new Error(`multiline ${dres.status}`);
  const djson = parseJsonp(await dres.text());
  const series = djson.default?.timelineData ?? [];
  const values = new Map(keywords.map((k) => [k, []]));
  for (const point of series) {
    (point.value ?? []).forEach((v, i) => {
      const k = keywords[i];
      if (k) values.get(k).push(v);
    });
  }
  const out = {};
  for (const [k, arr] of values) {
    const sum = arr.reduce((a, b) => a + b, 0);
    out[k] = {
      total: sum,
      average: arr.length ? Math.round((sum / arr.length) * 10) / 10 : 0,
      peak: arr.length ? Math.max(...arr) : 0,
      last: arr.length ? arr[arr.length - 1] : 0,
      points: arr,
    };
  }
  return out;
}

/** "Top" and "rising" related queries for a seed - the "what is trending" signal. */
async function related(s, keyword, time = "today 12-m") {
  const req = { comparisonItem: [{ keyword, geo: "", time }], category: 0, property: "" };
  const json = await explore(s, req);
  const result = { rising: [], top: [] };
  for (const w of json.widgets.filter((x) => x.id?.startsWith("RELATED_QUERIES"))) {
    const url = `https://trends.google.com/trends/api/widgetdata/relatedsearches?hl=en-US&tz=-480&req=${encodeURIComponent(
      JSON.stringify(w.request)
    )}&token=${w.token}`;
    const dres = await retry(s, url);
    if (!dres.ok) continue;
    const djson = parseJsonp(await dres.text());
    for (const r of djson.default?.rankedList ?? []) {
      for (const item of r.relatedKeywordQueries ?? []) {
        const entry = {
          query: item.query,
          score: item.value ?? 0,
          rising: item.breakdown?.rising?.value ?? 0,
        };
        if (r.rising) result.rising.push(entry);
        else result.top.push(entry);
      }
    }
  }
  result.top.sort((a, b) => b.score - a.score);
  result.rising.sort((a, b) => b.rising - a.rising);
  return result;
}

/** "Trending now" - the live breaking-topic list, for context on what the zeitgeist is doing. */
async function trendingNow(s, geo = "US") {
  const url = `https://trends.google.com/trends/api/dailytrends?hl=en-US&tz=-480&geo=${geo}&ns=15`;
  const res = await retry(s, url);
  if (!res.ok) throw new Error(`dailytrends ${res.status}`);
  const djson = parseJsonp(await res.text());
  const days = djson.default?.trendingSearchesDays ?? [];
  const latest = days[0]?.trendingSearches ?? [];
  return latest.map((t) => ({
    query: t.title?.query,
    traffic: t.breakdown?.[0]?.value ?? t.traffic?.[0]?.value ?? null,
    related: (t.relatedQueries ?? []).map((r) => r.query),
    news: (t.newsArticles ?? []).map((n) => n.title).slice(0, 3),
  }));
}

/** ------------------------------------------------------------------ main */

const SEEDS = [
  // product / category
  "website walkthrough video",
  "product demo video",
  "screen recording software",
  "video from url",
  "website video maker",
  // the differentiator
  "record website behind login",
  "narrated website walkthrough",
  "automated website video",
  // lab / agent side
  "browser agent testing",
  "ai agent testing tools",
  "browser automation testing",
  "ai browser agent",
  "regression test fixture",
  "stagehand",
  // adjacent tools people compare with
  "loom alternative",
  "scribe alternative",
  "screen studio alternative",
  "tldv alternative",
  "microsoft clipchamp",
  "descript",
  "vidyard demo",
  // prompts / how-to intents
  "how to record a website walkthrough",
  "create a product demo video",
  "video for website onboarding",
];

const TREND_GROUPS = {
  "walkthrough-video": [
    "website walkthrough video",
    "product demo video",
    "screen recording software",
    "loom",
    "scribe",
  ],
  "walkthrough-howto": [
    "how to record website",
    "create product demo video",
    "website tutorial video",
    "explainer video",
  ],
  "browser-agents": ["browser agent", "ai agent", "browser automation", "ai browser", "stagehand"],
  "agent-testing": [
    "ai agent testing",
    "browser agent testing",
    "regression testing",
    "test automation",
    "playwright",
  ],
  "video-tools": ["loom", "descript", "vidyard", "screen studio", "tldv", "clipchamp"],
};

async function main() {
  const sugOnly = process.argv.includes("--sug-only");
  const out = { generatedAt: new Date().toISOString(), seeds: {}, trends: {}, related: {} };

  const session = sugOnly ? null : await trendsSession();

  for (const seed of SEEDS) {
    out.seeds[seed] = await expand(seed);
    process.stderr.write(`suggestions: ${seed} (${out.seeds[seed].length})\n`);
    await sleep(400);
  }

  if (!sugOnly) {
    for (const [name, kws] of Object.entries(TREND_GROUPS)) {
      try {
        out.trends[name] = await interest(session, kws);
        process.stderr.write(`trends: ${name}\n`);
      } catch (e) {
        out.trends[name] = { error: String(e) };
        process.stderr.write(`trends FAILED: ${name} ${e}\n`);
      }
      await sleep(3000);
    }

    for (const seed of ["website walkthrough video", "browser agent", "ai agent testing"]) {
      try {
        out.related[seed] = await related(session, seed);
        process.stderr.write(`related: ${seed}\n`);
      } catch (e) {
        out.related[seed] = { error: String(e) };
      }
      await sleep(3000);
    }

    try {
      out.trendingNow = await trendingNow(session);
      process.stderr.write(`trendingNow: ${out.trendingNow.length}\n`);
    } catch (e) {
      out.trendingNow = { error: String(e) };
    }
  }

  const target = process.env.SEO_OUT ?? "results/seo-trends.json";
  writeFileSync(target, JSON.stringify(out, null, 2));
  process.stderr.write(`written: ${target}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
