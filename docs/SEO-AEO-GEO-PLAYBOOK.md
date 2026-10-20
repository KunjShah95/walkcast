# Walkcast — SEO / AEO / GEO playbook

> Structured as the standard five-branch model: **On-Page**, **Off-Page**, **Technical**, **Local**,
> **Tools**. Each item is marked done (in code), to-do, or N/A with a reason.
> Last synced from code: 2026-10-20.
>
> The keyword and trend data behind the priorities is in
> [`SEO-KEYWORD-RESEARCH.md`](SEO-KEYWORD-RESEARCH.md); the measurements are in
> [`SEO-TRENDS-RAW.md`](SEO-TRENDS-RAW.md).

---

## 1. On-Page SEO

| Item | Status | Where |
|---|---|---|
| Title tag optimisation | done | Every page sets a unique `<title>` in `apps/web/src/content.ts` (`ROUTES`). All fourteen titles are ≤ 60 characters, asserted in `test/web-build.test.ts`. |
| Meta descriptions | done | Every route sets a `description`, emitted into `<meta name="description">`, `og:description` and `twitter:description`. All are ≤ 160 characters, asserted in the test. |
| Header tags (H1, H2, H3 hierarchy) | done | Exactly one `h1` per page, asserted per route in the test. The auth story headline is display type, not an `h2`, so the outline is `h1 → h2`. |
| Keyword placement | done | Primary query in the landing `h1`/lede and the `SoftwareApplication` description. Job-intent variants on the guides, which target the modifiers the data showed people actually type ("product demo video", "website tutorial video maker", "loom alternative"), not the empty head terms. |
| Image alt text | done | The site ships no raster content images (inline `aria-hidden` SVG + video posters), so the only image surface is the social card: `og:image:alt` and `twitter:image:alt` per page. Poster art stays `aria-hidden` so it is never read aloud twice. |
| Internal linking structure | done | Global header + footer on every page. The footer reaches all fourteen pages, including the guides index, the three comparison pages and the Lab. `/guides` cross-links every guide; every guide links its siblings and the FAQ. |
| Comparison pages | done | `/compare/loom`, `/compare/screen-studio`, `/compare/scribe` alongside `/compare/screen-recording`. Each opens with a one-paragraph answer, states what the competitor is genuinely good at, gives a dated and sourced price, ends with "choose X when / choose Walkcast when", and lists its facts with a source per row. |
| Guides | done | `/guides` (index), `/guides/product-demo-video`, `/guides/website-tutorial-video`, `/guides/narrated-website-walkthrough`. Each is a complete answer with numbered steps, a file table and an embed snippet. |
| Pricing page | done | `/pricing`, with a full limits table, the reason the tool is free, and the competitors' prices for comparison. |
| Lab page | done | `/lab`, aimed at "browser agent testing", "ai browser agent" and "stagehand evals". It states plainly that Stagehand and Playwright run the agent and the Lab is what you use after the run fails. |
| Schema markup integration | done | JSON-LD `@graph` per page: `Organization`, `Person`, `WebSite`, `WebPage`, `Article` on guides and comparisons, `CollectionPage` + `ItemList` on the guides index, `SoftwareApplication`, `VideoObject`, `HowTo` on every guide, `FAQPage` on every page with questions, `BreadcrumbList` (three levels under `/guides` and `/compare`), and `speakable` on the pages whose first paragraph answers the question. |

## 2. Off-Page SEO

| Item | Status | Action |
|---|---|---|
| Backlink building | to-do | GitHub README → site, site → repo (`rel=me`); awesome-list PRs to `awesome-browser-automation` and `awesome-ai-agents`. |
| Influencer mentions | to-do | Dev.to / Hashnode tutorial ("Turn a login-walled site into a narrated video"), linked from the guides index. |
| Guest posting & PR outreach | to-do | The three comparison pages now exist and are ready to pitch. Pitch them to dev blogs and to the "best Loom alternatives" listicles that already rank. |
| Social bookmarking | to-do | Product Hunt + HN "Show HN" launch day; each links the landing hero video, which is in the sitemap as a `video:video` entry. |
| Forum & Q&A participation | to-do | r/webdev, r/qualityassurance, r/LocalLLaMA (self-host angle); answer "how do I record a walkthrough of a site behind a login?" with the `/how` page as the citation. |
| Review-site profiles | to-do | G2/Capterra/TrustRadius, even for a free tier. AI engines cite these for "best tools" lists. |
| Third-party citation count | to-do | The GEO plan in the research doc: answer engines cite third-party sources about six times more often than a brand's own pages, so this is the larger half of GEO. |

## 3. Technical SEO

| Item | Status | Where |
|---|---|---|
| Site speed optimisation | done | Single inlined `<style>` and single inlined JS bundle (vite singlefile), self-hosted woff2 with `rel=preload`, video `preload="metadata"` (hero) / `preload="none"` (guides), `poster` frames so no layout shift, `font-display: swap`. |
| Mobile friendliness | done | `viewport-fit=cover` + `env(safe-area-inset-*)` padding, fluid `clamp()` type, breakpoints at 900/680/400px, `text-wrap: balance`. |
| Sitemap.xml & robots.txt | done | `/sitemap.xml` (with video entries) and `/robots.txt`, which explicitly allows search, answer-engine and AI-training bots and denies nothing. `max-age=3600`. `/sitemap-agents.xml` carries the machine-readable files. |
| Canonical URLs | done | `<link rel="canonical">` on every page. Trailing-slash duplicates 302 to the canonical form, GET/HEAD only, `/app` excluded. |
| Structured data & rich snippets | done | See the schema row above; validated per page in `test/web-build.test.ts`. |
| Internal linking structure (technical) | done | Sitemap lists every indexable URL; `X-Robots-Tag: noindex` guards `/app`; auth pages are `noindex` in the meta tag. |
| HTTPS & security | done | `http` → `https` redirect when `LAB_SITE_URL` is https and the proxy reports `x-forwarded-proto: http`; `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` on every response. Headers are TLS-gated so plain-http local dev is unaffected. |
| 404 handling | done | Real HTTP 404 with a branded `notFoundPage()` carrying `noindex` in both the meta tag and `X-Robots-Tag`, plus internal links back into the site — no soft-404. |

## 4. Local SEO

**N/A with reasons.** Walkcast is a self-hosted, MIT-licensed desktop app with no storefront, no
service address and no phone number; there is nothing local to rank. Google Business Profile,
Yelp/IndiaMART/Bing Places and JustDial would all be fabricated listings, which Google treats as
spam and which NAP consistency then has to be maintained across three unowned profiles.

**Revisit only if** the project ever adds a human-facing side — support, an agency tier, or an
on-prem install service. Then the minimum honest set is: a real business entity with a verifiable
address, a GBP with the same NAP as the site footer, Bing Places, one review flow on-site, and
`LocalBusiness`/`Service` JSON-LD on the contact page. NAP consistency means one canonical string
rendered from a single source of truth (a token in the site config) and reused verbatim in GBP,
Yelp and the footer.

## 5. AEO and GEO

| Item | Status | Where |
|---|---|---|
| `speakable` markup | done | `SpeakableSpecification` on the pages whose opening paragraph answers the page's question, checked against the class that paragraph actually uses in the test. |
| Self-contained answer blocks | done | Every guide, comparison and the Lab open with a bold "Short answer" paragraph that stands alone. |
| Comparison tables as extractable structure | done | The four comparison pages carry a `Question / Walkcast / Them / Note` table. Tables are what answer engines quote. |
| Sourced statistics | done | The comparison pages give a price with the date it was checked and a link to the vendor's own pricing page, and a facts table with a source per row. Citing sources is the largest GEO lever in the Princeton study. |
| Author attribution and freshness | done | A named author with a profile link, and a visible "Updated <date>" on every document page. |
| `llms.txt` and `llms-full.txt` | done | A short quotable summary linking every page, and a full-answers file with every FAQ answer in plain text. |
| `/pricing.md` | done | The price, its limits and what the tool does not do, in plain text, so an agent comparing tools on a buyer's behalf can parse it without running JavaScript. Linked from `/pricing`, the footer and `llms.txt`. |
| AI crawler access | done | `robots.txt` allows `Googlebot`, `Google-Extended`, `GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `ClaudeBot`, `anthropic-ai`, `PerplexityBot`, `CCBot`, `Meta-ExternalAgent`, `Amazonbot`, `Bytespider`, `cohere-ai`, `MistralAI-User`, `YouBot`, `DuckAssistBot` and the rest. Nothing is blocked. |
| Entity disambiguation | done | The competitor in each comparison is a named `SoftwareApplication` with its own URL, so an engine can relate Walkcast to it rather than reading two unrelated strings. |
| Machine-readable sitemap | done | `/sitemap-agents.xml` lists `pricing.md`, `llms.txt` and `llms-full.txt`, and is advertised in `robots.txt`. |
| Measurement | to-do | Once the pages are live: Search Console for impressions and clicks per target query, and monthly manual checks of the target queries in ChatGPT, Perplexity and Google AI Overviews, logging the cited URL and snippet. |

## 6. Tools

| Tool | Use |
|---|---|
| Google autocomplete + Trends | The scripts in `scripts/`: `seo-trends.mjs` pulls suggestions, interest and related queries; `seo-report.mjs` turns that into `docs/SEO-TRENDS-RAW.md`. Run `node scripts/seo-trends.mjs` quarterly. |
| Google Search Console | Submit `/sitemap.xml` and `/sitemap-agents.xml`, request indexing of home, `/guides`, the comparison pages and `/lab`, track impressions and clicks per target query. |
| Bing Webmaster Tools | Same sitemaps; the path to IndexNow. |
| PageSpeed Insights / Lighthouse | CI gate on `/`, `/guides/<slug>`, `/compare/<slug>`. Budget: LCP < 2.0s, CLS < 0.02. |
| Ahrefs / Semrush / Ubersuggest | Backlink profile, referring domains for the comparison pages, competitor gap against Loom / Screen Studio / Scribe. |
| Screaming Frog | One-off crawl for status codes, duplicate titles, missing H1s, orphan pages and internal-link depth after new pages ship. |
| Rich Results Test / schema.org validator | Validate the JSON-LD `@graph` after any markup change. |
| Answer-engine spot checks | Monthly: search the target queries in ChatGPT, Perplexity and Google AI Overviews; log cited URL + snippet. |

---

## Target queries

Mapped to the page that should win each one. Sourced from the Google pull in
`docs/SEO-KEYWORD-RESEARCH.md`.

| Query | Page | Notes |
|---|---|---|
| "product demo video", "how to make a product demo video", "product demo video for website" | `/guides/product-demo-video` | Largest real head term in the set. |
| "website tutorial video maker", "website walkthrough video maker" | `/guides/website-tutorial-video` | Where the modifier demand sits. |
| "website walkthrough video" | `/guides/narrated-website-walkthrough` | Near-zero volume as a head term. Treat as a brand phrase, not a ranking bet. |
| "loom alternative", "loom alternatives free / open source / for windows / for linux" | `/compare/loom` | Highest commercial intent on the list. |
| "screen studio alternative for windows / for linux" | `/compare/screen-studio` | Screen Studio is macOS-only, so the platform gap is the wedge. |
| "scribe alternative for desktop", "scribe self hosted alternative" | `/compare/scribe` | The output gap (video vs screenshots) is the wedge. |
| "browser agent testing", "ai browser agent", "stagehand evals", "stagehand testing" | `/lab` | The category is still being written, so the queries are small enough to win. |
| "walkcast pricing", "is walkcast free" | `/pricing` | The claim that has to be checkable. |
| "sign in to records site walkthrough" | `/guides`, `/faq` | Zero volume as a phrase; it belongs in the body, not a URL. |
| "screen recording software" | `/compare/screen-recording` | Big, and mostly the wrong job. One page, no more. |

## AEO answer blocks (use verbatim in content and outreach)

- "Walkcast is a website video walkthrough generator: paste a link (plus an optional login) and it signs in, browses the pages you can reach as a visitor, and returns an MP4 with spoken narration, WebVTT captions and a transcript."
- "It never submits forms and stops at CAPTCHA and two-factor prompts; passwords stay in memory and are scrubbed from traces."
- "It is free, MIT-licensed, self-hostable and works behind any ordinary login form including two-step email-then-password."

## GEO citation plan (where AI must find us)

1. Wikipedia (if notable) — out of scope for now; instead keep docs quote-friendly.
2. GitHub README + topics: "browser-automation", "web-crawler", "video-generation", "ai-agents", "test-fixtures".
3. Product Hunt launch, HN "Show HN", Reddit r/webdev, r/qualityassurance, r/LocalLLaMA.
4. Dev.to / Hashnode tutorials.
5. YouTube — hero walkthrough + 2-minute how-to; linked in `VideoObject` schema + sitemap video entry.
6. G2/Capterra/TrustRadius profiles (even for a free tier) — AI cites these for "best tools" lists.
7. Awesome lists: awesome-browser-automation, awesome-ai-agents.

## Measurement

- Search Console: impressions and clicks for the target queries above; CTR target > 4%.
- AEO: snippet wins for "what is walkcast" and "product demo video".
- GEO: monthly citation count per platform.
- Regression guard: `npm test` (the site suite) asserts the technical items above, including the
  title and description lengths, the `speakable` markup, the comparison-page structure and the
  machine-readable files.
