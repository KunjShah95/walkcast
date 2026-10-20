# Walkcast — keyword and trend research

> The strategy this file carries. The measurements behind it are in
> [`SEO-TRENDS-RAW.md`](SEO-TRENDS-RAW.md) (generated) and `results/seo-trends.json` (raw).
> Re-pull with `node scripts/seo-trends.mjs`; regenerate the dump with `node scripts/seo-report.mjs`.
>
> Pulled 20 October 2026. Prices quoted from vendor pages checked the same day.

## Where the data came from

Three free Google surfaces, no account and no API key:

- **Autocomplete** (`suggestqueries.google.com`). For each seed query, the direct completions plus every
  `seed + a` … `seed + z` and `seed + 0` … `seed + 9` expansion. This is what people actually type.
  It is the only honest source of long-tail demand available without paying for a keyword tool.
- **Trends** (`trends.google.com/trends/api`). Interest over time for keyword groups. The index is
  relative *within a group* (0–100 is that group's own peak), so only groups are comparable with groups.
- **Related and rising queries** (same endpoint). What is climbing, rather than what is big.

Search volume is not available without a paid API, so nothing below is a volume number. What is
measured is **suggestion density** — how many independent seeds a phrase surfaces under — which is a
demand signal, and **trend**, which is a direction. That is enough to choose what to write.

Two practical notes, both learned the hard way while pulling this:

- `trends.google.com` rate-limits the data endpoints to HTTP 429 from shared IPs; the country
  domains serve the same API without that limit. The script rotates hosts and keeps the explore call
  and the widget call on the same host, because the token is bound to it.
- Trends accepts at most five comparison items per request. The sixth is a 400, not a truncation.

**What this pull did not get.** Three of the six interest groups, and all of the related/rising
query data, were rate-limited before they could be fetched. The numbers that are here come from the
groups that succeeded and are recorded, with their provenance, in `results/seo-trends.json` under
`trendsSnapshot`. The script will replace them with fresh numbers the next time Trends is
reachable, and the failed groups are listed under `notCaptured` so the gap is visible rather than
silent. The autocomplete data — 2,161 suggestions across 24 seeds — is complete, and that is the
primary signal this document rests on.

## The headline finding: the head term is nearly empty

"Website walkthrough video" is the phrase Walkcast has been built around and the phrase its title
uses. Google Trends says it is **almost nothing**:

| Keyword (one group, 12 months) | Average interest | 12-month total |
|---|---:|---:|
| loom | 71.5 | 3789 |
| scribe | 34.8 | 1847 |
| product demo video | 0.9 | 48 |
| screen recording software | 1.3 | 68 |
| **website walkthrough video** | **0.0** | **0** |

Autocomplete agrees that the phrase exists but that nobody finishes it: it returns 16 completions,
and the real ones are all modifiers — *website walkthrough video **maker***, *website walkthrough video
**template***, *website walkthrough video **examples***. The demand is in the modifier, not the head.

The same pattern holds across the board. **"How to record a website walkthrough" returns zero
autocomplete suggestions.** Nobody phrases it that way. "How to make a walkthrough video" and
"how to make a product demo video" both do.

Two more groups from the same pull, for context on what Google considers a normal-sized term:

| Keyword (one group, 12 months) | Average interest | 12-month total |
|---|---:|---:|
| playwright | 60.5 | 3209 |
| test automation | 14.5 | 768 |
| regression testing | 4.4 | 235 |
| ai agent testing | 2.4 | 129 |
| browser agent testing | 0.0 | 2 |
| how to record website | 31.9 | 1693 |
| explainer video | 23.4 | 1239 |
| website tutorial video | 12.5 | 665 |
| create product demo video | 0.2 | 9 |

Two things to take from those. "browser agent testing" has a total of **2** across twelve months —
the phrase is empty, exactly like "website walkthrough video", and the Lab cannot be ranked on it
however good the page is. "website tutorial video" at 665 is a real term, and it is the one the
guides are built around.

**What this changes.** Stop writing for "website walkthrough video". Write for the modifier that
carries the intent, and let the page title carry the head term once for the reader.

## The four clusters worth money

### 1. "Product demo video" — the largest real head term (108 suggestions)

The suggestions are dense and consistent: *product demo video maker*, *product demo video generator*,
*product demo video software*, *best product demo video tools*, *ai product demo video generator*,
*product demo video for website*, *saas product demo video*, *how to make a product demo video*,
*product demo video best practices*, *product demo video length*, *product demo video cost*,
*product demo video script*, *yc product demo video examples*, *product launch demo video*.

Sub-intents worth naming separately:

- **"with ai" / "ai generator"** — the whole cluster is AI-shaped. Walkcast is not an AI generator and
  should not pretend to be. Its honest answer is stronger: the demo is the *real product*, not a
  generated mockup. That is a direct answer to the "ai product demo video generator" query, and it is
  the one nobody else can make.
- **"for website" / "saas"** — the exact fit. The product demo people want is a demo of their web app.
- **"examples" / "length" / "best practices"** — informational, low competition, and they feed the
  comparison pages.
- **"cost" / "maker" / "free"** — commercial intent. Answering "what does a product demo video cost"
  honestly (Walkcast: nothing) is a good AEO answer.

### 2. "Loom alternative" and the other comparison queries — highest intent, best cited

The suggestion counts here are not noise; they are people explicitly looking for a substitute.
Screen Studio, Mac only, and people search for "screen studio alternative **for windows**" and
"screen studio alternative **for linux**" — Walkcast runs on both. Loom: "loom alternative free",
"loom alternatives **open source**", "loom alternative **self hosted**", "loom alternatives for
windows / for linux", "loom alternative **reddit**", "websites like loom". Scribe: "scribe
alternative **for desktop**", "scribe **self hosted** alternative", "scribe open source alternative
github", "scribe documentation alternatives", "**video** scribe alternative".

Three things make these the highest-value queries on the list:

- **Comparison articles are the most-cited content type in AI search** (~33% of citations, per the
  Princeton GEO study). Answer engines quote tables, not paragraphs.
- **They are near the bottom of the funnel.** Someone searching "loom alternative" is choosing a
  tool this week.
- **They are winnable.** A new domain with no authority can rank for a specific alternative query;
  it cannot rank for "screen recording software".

The AI-overlap check matters here too: Loom, Screen Studio, Scribe, Descript, Clipchamp, OBS and
TLDV are all named in answer-engine comparisons for these terms. Only Loom, Screen Studio and Scribe
have a distinctive "website recording" wedge against Walkcast — the others are generic screen
recorders and would be dishonest to claim against.

### 3. "AI browser agent" and "stagehand evals" — the Lab's territory, and it is hot

"ai browser agent" returns 147 suggestions with a clear developer shape: *how to build ai browser
agent*, *ai browser agent open source*, *ai browser agent for linux / for windows*, *ai agent browser
mcp*, *build ai browser agent*, *browser use ai agent alternative*, *best ai browser agent reddit*,
*ai browser agents with python and playwright*, *local ai browser agent*, *ai browser agent github*.

"stagehand" returns 276 — mostly theatre — but the developer slice is precise and small: *stagehand
evals*, *stagehand testing*, *stagehand qa*, *stagehand alternatives*, *stagehand vs playwright*,
*stagehand vs browser use*, *stagehand simulator*, *stagehand framework*, *stagehand browser use*,
*stagehand observe / extract / act*, *stagehand mcp*, *stagehand playwright*.

"stagehand evals", "stagehand testing" and "stagehand alternatives" are three queries where the
answer is genuinely Walkcast Lab: Stagehand runs the agent, and Lab is what you use after the run
fails. This is the single best AEO/GEO opportunity in the project, because the competing answer does
not exist yet — the whole category of "agent evals" is being written right now, and the queries are
small enough to win.

**"browser agent testing"** itself returns 14 suggestions, mostly noise about the HTTP `User-Agent`
header, and a Trends total of **2** across twelve months. The real demand sits in "browser automation
testing" (157 suggestions), but that cluster is dominated by Selenium course, salary and job
enquiries — which are not ours and must not be targeted. The winnable dev slice is narrow and
specific: *browser automation testing tools*, *ai browser automation testing*, *cross browser
automation testing tools*, *playwright web automation testing guide*, *browser automation testing
github*.

### 4. "Screen recording software" — big, and mostly not ours

241 suggestions, and almost all of it is the wrong job: *screen recording app for android*, *screen
recording app for chromebook*, *screen recording app apk*, *screen recording app that bypasses*,
*free screen recording software unlimited time*, *best screen recording software for windows 7*.

Walkcast does not record screens. Targeting this head term would be claiming a job it cannot do, and
the one query inside it that does fit — *screen recording software better than obs* — is a
screencast query, not a website query. Leave it alone. It is worth one comparison page
(`/compare/screen-recording`, which now exists) and nothing more.

## The clusters with no demand — do not build for them

| Seed | Suggestions | Verdict |
|---|---:|---|
| "how to record a website walkthrough" | 0 | Nobody phrases it this way. |
| "narrated website walkthrough" | 0 | The feature is real; the phrase is not searched. |
| "record website behind login" | 0 | The differentiator is invisible to search. Sell it on-page, not in a title. |
| "video for website onboarding" | 0 | Same. |
| "regression test fixture" | 0 | Same. |
| "video from url" | 249 | **All downloader noise.** "download video from url", "video url extractor", "m3u8", "jwplayer". The only usable intents are "video from a link", "video from a website" and "convert a website into a video" — none of which is a head term. |
| "stagehand" | 276 | Mostly theatre and labour law. The developer slice is worth targeting; the rest is not ours and must be filtered out of any analysis. |

Two of these are worth pausing on. "Record a website behind a login" and "narrated website
walkthrough" are zero-volume phrases that describe exactly what Walkcast does better than anything
else. The conclusion is not to give up on them — it is that the differentiator belongs in the page
body, the FAQ and the comparison tables, not in a URL that nobody types.

## What was built from this, 20 October 2026

### New pages (14 pages, up from 6)

| Page | Query it targets | Why |
|---|---|---|
| `/guides` | "walkcast guides", a hub for all of them | `CollectionPage` with an `ItemList`; every guide now has one parent |
| `/guides/product-demo-video` | "product demo video", "how to make a product demo video", "product demo video for website", "saas product demo video" | The largest real head term in the set |
| `/guides/website-tutorial-video` | "website tutorial video maker", "website walkthrough video maker", "website guide video" | Where the modifier demand actually sits |
| `/compare/loom` | "loom alternative", "loom alternatives free / open source / for windows / for linux" | Highest commercial intent |
| `/compare/screen-studio` | "screen studio alternative for windows / for linux / free / open source" | Screen Studio is macOS-only, so the platform gap is the wedge |
| `/compare/scribe` | "scribe alternative for desktop", "scribe self hosted alternative", "video scribe alternative" | The output gap (video vs screenshots) is the wedge |
| `/lab` | "browser agent testing", "ai browser agent", "stagehand evals", "stagehand testing", "stagehand alternatives" | The one query set where the category is still being written |
| `/pricing` | "walkcast pricing", "walkcast free", "is walkcast free" | The claim that has to be checkable |

The existing `/compare/screen-recording` stays for the generic "screen recording" intent.

### Comparison pages, written to be citable

Comparison articles are the most-cited content type in AI search, so each one is built to be
extracted rather than read:

- A **one-paragraph answer** at the top, marked `speakable` in the schema, so a voice assistant has
  a passage to read.
- **What the competitor is genuinely good at**, before the comparison. "Loom's free Starter plan
  allows 25 videos of up to five minutes" is a fact, and a page that only flatters itself gets
  discounted by both readers and engines.
- **"Choose X when" / "Choose Walkcast when"** — the decision, stated in both directions.
- **A price with a date and a source link.** Prices were checked on 20 October 2026 against each
  vendor's own pricing page, and every number on the page carries that date. Stale prices are worse
  than no prices.
- **A facts table with a source per row.** Citing sources is the single largest GEO lever in the
  Princeton study (+40% visibility).
- **The competitor as a named entity** in the JSON-LD (`SoftwareApplication` with its own URL), so an
  engine can relate Walkcast to Loom rather than reading them as two unrelated strings.
- **A `FAQPage`** on every comparison page, built from the same questions that appear in the page.

### Structured data

- `HowTo` on all three guides, generated from one shared step list (`GUIDE_STEPS`) that the page
  renders and the schema is built from, so a step cannot be on the page and missing from the schema.
- `CollectionPage` + `ItemList` on `/guides`.
- `Article` with `datePublished`, `author` and `publisher` on every guide and comparison.
- `speakable` on every page whose first paragraph answers the page's question.
- Three-level `BreadcrumbList` (Walkcast → Guides → guide), which the two-level version got wrong.

### Machine-readable files for agents

- `/pricing.md` — the price, its limits and what the tool does not do, in plain text. An agent
  comparing tools on a buyer's behalf cannot scrape a rendered pricing section; it can parse this.
- `/sitemap-agents.xml` — the same sitemap for `pricing.md`, `llms.txt` and `llms-full.txt`, advertised
  in `robots.txt`.
- `llms.txt` now links the pricing file and lists all fourteen pages.

### Internal linking

The footer now reaches all fourteen pages, including the three comparison pages and the Lab. The
guides index cross-links every guide, and every comparison page links the other two.

## What to do next, in order

1. **Publish and let it index.** Everything above is one deployment away from being live. Nothing
   else in this list matters until the pages are crawled.
2. **Submit the sitemaps.** Search Console for `/sitemap.xml` and `/sitemap-agents.xml`; Bing for
   IndexNow. Ask for indexing of the home page, `/guides`, the three comparison pages and `/lab`.
3. **Watch the comparison pages first.** They are the highest-intent set and the fastest to move.
   If `/compare/loom` gets impressions for "loom alternative" within a month, the playbook works.
4. **Write the next guide only from data.** The next candidate is a "stagehand testing" or "stagehand
   evals" guide, because the Lab already exists and the demand is real but unserved. Do not write a
   guide for a phrase the data shows nobody types.
5. **Third-party presence is still the biggest gap.** The GEO playbook's citation plan (GitHub,
   Product Hunt, Reddit, Dev.to, YouTube, G2) is untouched. Answer engines cite third-party sources
   about six times more often than a brand's own pages, so the comparison pages on our own domain are
   the smaller half of this. A Loom-alternative post on a dev blog, or a well-answered
   r/webdev thread, is worth more than any page we publish.
6. **Re-pull the data in three months.** `npm run seo:pull` then `npm run seo:report`. The script is
   idempotent and takes about fifteen minutes. The suggestion density numbers are the cheapest
   early-warning system available: when a cluster stops appearing, the demand moved.

## What this does not cover

- **Real volume.** Suggestion density is a proxy. If the project ever gets a Search Console property,
  the query report in there replaces every estimate in this document with a fact.
- **The AI Overviews layer.** Checking whether Google shows an AI Overview for each query, and what
  it cites, needs a different tool and is worth doing once the pages are live. The
  `speakable` markup, the answer paragraphs and the comparison tables are the preparation for it.
- **Ranking.** Nothing here says whether a page ranks. It says which pages are worth building, on
  evidence, instead of on a hunch.
