/**
 * Turns results/seo-trends.json into a readable keyword research report.
 *
 *   node scripts/seo-report.mjs [in.json] [out.md]
 *
 * The script does the mechanical work (collect, classify, cluster, count). The
 * judgement about which cluster to attack first lives in the strategy section of
 * the generated markdown, which is edited by hand afterwards.
 */
import { readFileSync, writeFileSync } from "node:fs";

const inFile = process.argv[2] ?? "results/seo-trends.json";
const outFile = process.argv[3] ?? "docs/SEO-TRENDS-RAW.md";
const data = JSON.parse(readFileSync(inFile, "utf8"));

/* ------------------------------------------------------------------ classification */

const ALTERNATIVE = /\b(alternative|alternatives|vs|versus|instead of|better than|comparison|compare)\b/;
const HOWTO = /\b(how to|how do|how can|steps|step by step|tutorial|guide|setup|set up|create|make|record)\b/;
const CATEGORY = /\b(software|tool|tools|app|apps|application|generator|maker|creator|platform|service|extension|plugin|api)\b/;
const QUESTION = /^(what|why|how|when|where|who|can|does|is|are|do|did|will|should)\b/;
const BRANDS = [
  "loom", "scribe", "descript", "vidyard", "tldv", "clipchamp", "obs", "screen studio", "screenflow",
  "bubble", "flowise", "playwright", "puppeteer", "selenium", "stagehand", "browserbase", "browser use",
  "openai", "chatgpt", "claude", "gemini", "cursor", "langchain", "agent", "agents", "gamma", "canva",
  "microsoft", "apple", "google", "youtube", "notion", "hubspot", "salesforce", "zapier",
];

/**
 * Noise: queries that belong to a different person with the same words. Stagehands on tour,
 * Kindle Scribe owners, people looking for a loom knitting tool, and course and salary
 * enquiries for Selenium testers are all real searches, just not ours.
 */
const NOISE = [
  /\b(stagehand|stage hand)\b.*\b(union|local \d|gigs|salary|jobs|job|hire|hiring|costume|dress code|apprentice|vacancies|theatre|theater|backstage|rigger|roadie|festival|concert|actor|technician|crew|tool belt|tool pouch|hard hat|stagehand definition|how much do|how much does)\b/,
  /^\d{3,}\s/,
  /\b\d{3,5}\s+\w+\s+(ave|st|ave\.|street)\b/,
  /\b(kindle|rainbow|inkle|komodo|feather and loom|plastic scribe|wooden scribe|chisel|pen|stylus|notepad)\b.*\b(scribe|loom)\b/,
  /\b(salary|salaries|resume|cv|interview questions|certification|course|courses|training|job description|job openings|fresher|remote jobs|internship|apprenticeship)\b/,
  /\b(salary|fresher|learn|cheapest|cheaper for|is|are the same as)\b/,
  /\b(studio display|studio monitor|small studio|screen size)\b/,
  /\b(app store|google play|apk|apk download|chrome extension for|for iphone|for android)\b/,
  /\b(download|from (facebook|instagram|youtube|twitter|x |netflix|vimeo|zoom)|video downloader|extract video|save video|rip video|convert|m3u8|rtsp|m3u|blob url|jwplayer|comfyui|unity|swift|placeholder)\b/,
  /\b(onlyfans|bypasses|snapchat|hidden|secret|recovery|roblox|whatsapp)\b/,
  /\b(love song|birthday|kissing|cartoon|invitation|lyrics|photo video|deepfake|3d video maker)\b/,
  /\b(kannada|tamil|hindi|urdu|marathi|bengali)\b/,
  /\b(local \d+)\b/,
];

/** Which page a query should be won by. Anything unmatched lands in "other". */
const PAGES = [
  { page: "/compare/scribe", re: /\bscribe\b/ },
  { page: "/compare/screen-studio", re: /\bscreen studio\b|\bstudio display\b/ },
  { page: "/compare/loom", re: /\bloom\b/ },
  { page: "/compare/screen-recording", re: /\b(screen record|screen capture|screen shot|screenshot|obs\b|game ?bar|xbox|clipchamp|descript|vidyard|tldv|apowers|bandicam|camtasia|snagit|greenshot|shotcut|loom ai)\b/ },
  { page: "/lab", re: /\b(browser agent|ai agent|agent test|agent browser|regression|fixture|stagehand|playwright|puppeteer|selenium|browser automation|browser use|agent evals|evals|headless|test automation|agentic|llm)\b/ },
  {
    page: "/guides/product-demo-video",
    re: /\b(product demo|demo video|demo of|sales demo|demo video|launch video|explainer video|product hunt demo|yc .*demo|demo video length|demo video script|demo video cost|demo video thumbnail|demo video best practice)\b/,
  },
  {
    page: "/guides/website-tutorial-video",
    re: /\b(website tutorial video|website walkthrough video|walkthrough video|website guide video|web tutorial video|website preview|website showcase|website presentation video|website demo video|walkthrough of website|what is a walkthrough video|make a walkthrough video)\b/,
  },
  { page: "/guides/narrated-website-walkthrough", re: /\b(narrated|voice ?over|caption|transcript)\b/ },
  { page: "/download", re: /\b(download|installer|setup\.exe|\.msi|\.dmg|\.appimage|\.deb\b|install|for windows|for mac|for linux)\b/ },
  { page: "/pricing", re: /\b(pricing|price|cost|how much|free|subscription|per month|cheaper)\b/ },
  { page: "/privacy", re: /\b(password|privacy|gdpr|local|offline|on my (pc|computer|machine)|self.?host|no upload|telemetry|analytics|data)\b/ },
  { page: "/faq", re: /^(what|is|can|does|how long|how much|why|do)\b/ },
];

function isNoise(q) {
  return NOISE.some((re) => re.test(q));
}

function classify(q) {
  const intents = [];
  if (ALTERNATIVE.test(q)) intents.push("alternative");
  if (HOWTO.test(q)) intents.push("how-to");
  if (CATEGORY.test(q)) intents.push("category");
  if (QUESTION.test(q)) intents.push("question");
  if (BRANDS.some((b) => q.includes(b))) intents.push("brand");
  const page = PAGES.find((p) => p.re.test(q))?.page ?? "other";
  return { intents, page };
}

/* ------------------------------------------------------------------ collect */

// A query seen under more than one seed is a stronger signal than a one-off.
const seen = new Map();
for (const [seed, list] of Object.entries(data.seeds ?? {})) {
  for (const q of list) {
    const entry = seen.get(q) ?? { query: q, seeds: [] };
    entry.seeds.push(seed);
    seen.set(q, entry);
  }
}

const rows = [];
for (const [query, entry] of seen) {
  if (isNoise(query)) continue;
  const { intents, page } = classify(query);
  rows.push({ query, seeds: entry.seeds, seedCount: entry.seeds.length, intents, page });
}
rows.sort((a, b) => b.seedCount - a.seedCount || a.query.localeCompare(b.query));

/* ------------------------------------------------------------------ report */

const L = [];
const push = (...lines) => L.push(...lines);

push("# Walkcast — Google trends and autocomplete, raw dump");
push("");
push(`Pulled ${new Date(data.generatedAt).toISOString().slice(0, 10)} from Google.`);
push("");
push("This file is generated. The judgement about what to do with it lives in");
push("`docs/SEO-KEYWORD-RESEARCH.md`; regenerate this with `node scripts/seo-report.mjs`.");
push("");
push("## Method");
push("");
push("Three free Google surfaces, no account and no API key:");
push("");
push("- **Autocomplete** (`suggestqueries.google.com`) — for each seed query, the direct completions plus every");
push("  `seed + a` … `seed + z` and `seed + 0` … `seed + 9` expansion. This is what people actually type, and it");
push("  is the only honest source of long-tail demand available without a paid tool.");
push("- **Trends** (`trends.google.com/trends/api`) — interest over time for keyword groups, so comparisons inside a");
push("  group are valid (0–100 within the group, not absolute volume).");
push("- **Related and rising queries** — the same endpoint, which returns what is climbing rather than what is big.");
push("");
push("Volume is not available without a paid API, so this report ranks by **suggestion density** (how many seeds a");
push("query surfaces under), **intent** and **trend**. That is a proxy for opportunity, not a search volume number.");
push("");
push("Reproduce with `node scripts/seo-trends.mjs`; regenerate this file with `node scripts/seo-report.mjs`.");
push("");

/* --- suggestions per seed --- */
push("## What people search for, by seed");
push("");
push("| Seed | Suggestions | Distinct new queries |");
push("|---|---:|---:|");
for (const [seed, list] of Object.entries(data.seeds ?? {})) {
  const unique = new Set(list.filter((q) => q !== seed.toLowerCase())).size;
  push(`| ${seed} | ${list.length} | ${unique} |`);
}
push("");

/* --- clusters --- */
push("## Keyword clusters");
push("");
push("Grouped by the page that should win the query. *Seeds* is how many of the seed queries the phrase appeared");
push("under — a phrase that shows up under many seeds is a demand signal, not a coincidence.");
push("");

const byPage = new Map();
for (const r of rows) {
  if (!byPage.has(r.page)) byPage.set(r.page, []);
  byPage.get(r.page).push(r);
}
const order = [...byPage.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [page, list] of order) {
  push(`### \`${page}\` — ${list.length} queries`);
  push("");
  push("| Query | Seeds | Intent |");
  push("|---|---:|---|");
  for (const r of list.slice(0, 40)) {
    push(`| ${r.query} | ${r.seedCount} | ${r.intents.join(", ") || "—"} |`);
  }
  if (list.length > 40) push(`| …and ${list.length - 40} more | | |`);
  push("");
}

/* --- trends --- */
// The live pull is rate-limited from shared IPs, so a snapshot of the last successful pull is
// kept alongside it. Prefer the live data; fall back to the snapshot.
const trendGroups = { ...(data.trendsSnapshot?.groups ?? {}) };
for (const [group, value] of Object.entries(data.trends ?? {})) {
  if (!value?.error) trendGroups[group] = value;
}
if (Object.keys(trendGroups).length) {
  push("## Trend interest");
  push("");
  push("Indices are relative inside each group (0–100 is the group's peak). A group is only comparable with itself.");
  push("");
  if (data.trendsSnapshot?.provenance) {
    push(`_${data.trendsSnapshot.provenance}_`);
    push("");
  }
  for (const [group, data_] of Object.entries(trendGroups)) {
    push(`### ${group}`);
    push("");
    push("| Keyword | Average interest | Peak | Last point | 12-month total |");
    push("|---|---:|---:|---:|---:|");
    const list = Object.entries(data_).sort((a, b) => b[1].total - a[1].total);
    for (const [kw, v] of list) {
      push(`| ${kw} | ${v.average} | ${v.peak} | ${v.last ?? "—"} | ${v.total} |`);
    }
    push("");
  }
  if (data.trendsSnapshot?.notCaptured?.length) {
    push("**Not captured in this run:**");
    push("");
    for (const g of data.trendsSnapshot.notCaptured) push(`- ${g}`);
    push("");
  }
}

/* --- related / rising --- */
if (Object.keys(data.related ?? {}).length) {
  push("## Related and rising queries");
  push("");
  for (const [seed, r] of Object.entries(data.related)) {
    if (r.error || (!r.top?.length && !r.rising?.length)) continue;
    push(`### ${seed}`);
    push("");
    if (r.top?.length) {
      push("**Top related**");
      push("");
      for (const t of r.top.slice(0, 15)) push(`- ${t.query} (${t.score})`);
      push("");
    }
    if (r.rising?.length) {
      push("**Rising**");
      push("");
      for (const t of r.rising.slice(0, 15)) push(`- ${t.query} (+${t.rising})`);
      push("");
    }
  }
}

/* --- trending now --- */
if (Array.isArray(data.trendingNow) && data.trendingNow.length) {
  push("## Trending now (Google, US)");
  push("");
  push("Context for the zeitgeist, not a keyword source.");
  push("");
  for (const t of data.trendingNow.slice(0, 25)) {
    push(`- **${t.query}**${t.related?.length ? ` — related: ${t.related.slice(0, 4).join(", ")}` : ""}`);
  }
  push("");
}

writeFileSync(outFile, L.join("\n"));
console.log(`wrote ${outFile} (${rows.length} distinct queries across ${byPage.size} clusters)`);
