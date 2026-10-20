/**
 * Pulls live keyword + trend data for the SEO/AEO/GEO work.
 *
 * Sources (all free, no API key):
 *   - Google autocomplete (suggestqueries.google.com)  -> real query strings people type
 *   - Google "related searches" (www.google.com/complete) -> neighbouring intents
 *   - Google Trends (trends.google.com undocumented endpoints) -> relative interest over time
 *
 * Output: JSON, merged into results/seo-trends.json.
 *
 *   node scripts/seo-trends.mjs              # everything
 *   node scripts/seo-trends.mjs --sug-only   # suggestions only
 *   node scripts/seo-trends.mjs --trends-only # trends only, merges into the existing file
 *
 * Note on hosts: trends.google.com rate-limits the data endpoints hard (HTTP 429) from
 * shared IPs, while the country domains serve the same API without that limit. The
 * script rotates country hosts, so keep the explore call and the widget call on the
 * same host or the token will not match.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const TREND_HOSTS = [
  "trends.google.co.uk",
  "trends.google.co.in",
  "trends.google.ca",
  "trends.google.com.au",
  "trends.google.de",
  "trends.google.fr",
];

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

/* ------------------------------------------------------------------ trends */

class Session {
  constructor(host) {
    this.host = host;
    this.cookies = new Map();
  }
  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  absorb(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
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
        Referer: `https://${this.host}/trends/`,
        Cookie: this.header(),
      },
      redirect: "follow",
    });
    this.absorb(res);
    return res;
  }
}

function parseJsonp(text) {
  const body = text.slice(text.indexOf("{"));
  // A bot-challenge page comes back as HTML; treat it as a failure so the host is rotated.
  if (!body.startsWith("{")) throw new Error("challenge page (not JSON)");
  return JSON.parse(body);
}

/** Explore + widget calls on one host. Rotates hosts and retries on 429 or challenge pages. */
async function withTrends(fn, label, attempts = 3) {
  let lastError = "unknown";
  for (let round = 0; round < attempts; round++) {
    for (const host of TREND_HOSTS) {
      const s = new Session(host);
      try {
        await s.get(`https://${host}/trends/`);
        const result = await fn(s);
        if (result) return result;
      } catch (e) {
        lastError = String(e);
        process.stderr.write(`  ${host}: ${lastError}\n`);
      }
      await sleep(1200);
    }
    await sleep(4000 * (round + 1));
  }
  throw new Error(`${label}: ${lastError}`);
}

async function explore(s, req) {
  const url = `https://${s.host}/trends/api/explore?hl=en-US&tz=-480&req=${encodeURIComponent(JSON.stringify(req))}`;
  const res = await s.get(url);
  if (!res.ok) throw new Error(`explore ${res.status}`);
  return parseJsonp(await res.text());
}

/** Interest over time for a set of keywords, as comparable indices (0-100 within the group). */
async function interest(s, keywords, time = "today 12-m") {
  // Trends accepts at most five comparison items per request.
  if (keywords.length > 5) throw new Error(`too many keywords (${keywords.length}, max 5)`);
  const req = {
    comparisonItem: keywords.map((keyword) => ({ keyword, geo: "", time })),
    category: 0,
    property: "",
  };
  const json = await explore(s, req);
  const widget = json.widgets.find((w) => w.id === "TIMESERIES");
  if (!widget) throw new Error("no TIMESERIES widget");
  // The widget echoes the exact request shape Trends expects back; reuse it verbatim.
  const url = `https://${s.host}/trends/api/widgetdata/multiline?hl=en-US&tz=-480&req=${encodeURIComponent(
    JSON.stringify(widget.request),
  )}&token=${widget.token}`;
  const res = await s.get(url);
  if (!res.ok) throw new Error(`multiline ${res.status}`);
  const djson = parseJsonp(await res.text());
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

/** "Top" and "rising" related queries for a seed - the "what is climbing" signal. */
async function related(s, keyword, time = "today 12-m") {
  const req = { comparisonItem: [{ keyword, geo: "", time }], category: 0, property: "" };
  const json = await explore(s, req);
  const result = { rising: [], top: [] };
  for (const w of json.widgets.filter((x) => x.id?.startsWith("RELATED_QUERIES"))) {
    const url = `https://${s.host}/trends/api/widgetdata/relatedsearches?hl=en-US&tz=-480&req=${encodeURIComponent(
      JSON.stringify(w.request),
    )}&token=${w.token}`;
    const res = await s.get(url);
    if (!res.ok) continue;
    const djson = parseJsonp(await res.text());
    for (const r of djson.default?.rankedList ?? []) {
      // The widget calls the list `rankedKeyword`; each group is either top or rising.
      for (const item of r.rankedKeyword ?? r.relatedKeywordQueries ?? []) {
        const entry = {
          query: item.query,
          score: item.value ?? 0,
          rising: item.breakdown?.risingValue ?? item.breakdown?.rising?.value ?? 0,
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

/* ------------------------------------------------------------------ seeds */

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

/** Comparable inside a group only: the index is relative to the group's own peak. */
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
  "video-tools": ["loom", "descript", "vidyard", "screen studio", "tldv"],
  "video-tools-2": ["clipchamp", "obs studio", "screenflow", "veed", "kapwing"],
};

const RELATED_SEEDS = [
  "website walkthrough video",
  "product demo video",
  "video from url",
  "browser agent",
  "ai browser agent",
  "browser agent testing",
  "ai agent testing",
  "screen recording software",
  "website video maker",
  "browser automation testing",
];

async function main() {
  const sugOnly = process.argv.includes("--sug-only");
  const trendsOnly = process.argv.includes("--trends-only");
  const relatedOnly = process.argv.includes("--related-only");
  const target = process.env.SEO_OUT ?? "results/seo-trends.json";

  const out = existsSync(target)
    ? JSON.parse(readFileSync(target, "utf8"))
    : { generatedAt: new Date().toISOString(), seeds: {}, trends: {}, related: {} };
  out.generatedAt = new Date().toISOString();

  if (!trendsOnly && !relatedOnly) {
    for (const seed of SEEDS) {
      out.seeds[seed] = await expand(seed);
      process.stderr.write(`suggestions: ${seed} (${out.seeds[seed].length})\n`);
      await sleep(400);
    }
  }

  if (!sugOnly && !relatedOnly) {
    for (const [name, kws] of Object.entries(TREND_GROUPS)) {
      try {
        out.trends[name] = await withTrends((s) => interest(s, kws), name);
        process.stderr.write(`trends: ${name}\n`);
      } catch (e) {
        // Never let a rate-limited run destroy data that was fetched successfully earlier.
        if (out.trends[name]?.error) out.trends[name] = { error: String(e) };
        else process.stderr.write(`trends FAILED (keeping the earlier result): ${name} ${e}\n`);
      }
      await sleep(1500);
    }
  }

  if (!sugOnly) {
    for (const seed of RELATED_SEEDS) {
      const existing = out.related[seed];
      if (existing && !existing.error && existing.top?.length) continue;
      try {
        out.related[seed] = await withTrends((s) => related(s, seed), seed);
        process.stderr.write(`related: ${seed}\n`);
      } catch (e) {
        if (!existing) out.related[seed] = { error: String(e) };
      }
      await sleep(1500);
    }
  }

  writeFileSync(target, JSON.stringify(out, null, 2));
  process.stderr.write(`written: ${target}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
