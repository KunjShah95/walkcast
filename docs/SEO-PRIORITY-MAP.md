# Walkcast keyword and citation map

**Reviewed 5 November 2026.** Use this map to decide which page to improve next. Each URL owns one main search intent; supporting phrases belong in useful headings, examples and answers on that page.

## What the evidence can and cannot say

The current research pull is [`results/seo-trends.json`](../results/seo-trends.json), generated 20 October 2026 from Google autocomplete and a partial Trends pull. The counts below are suggestion counts for a seed phrase. They are not monthly search volumes or ranking estimates. Trends returned incomplete data, and this repository has no Search Console query export, so performance must not be guessed from the suggestion counts.

Google says its AI search features use the same basic search requirements and helpful-content principles as the rest of Search. Crawlable pages and accurate, visible information are prerequisites, not a guarantee of crawling, indexing, ranking or citation. The site therefore does **not** emit a `meta keywords` tag; Google says it ignores that tag. FAQ and HowTo structured data should match visible page content and should not be presented as a promise of a rich result.

References: [Google AI features and your website](https://developers.google.com/search/docs/appearance/ai-features), [Google supported meta tags](https://developers.google.com/search/docs/crawling-indexing/special-tags), and [Google's FAQ and HowTo result changes](https://developers.google.com/search/blog/2023/08/howto-faq-changes).

## Priority by fit and intent

| Priority | Main query and variants | Page to improve | Intent | Evidence and editorial focus |
|---|---|---|---|---|
| 1 | `loom alternative`; free, open-source, Windows and Linux variants | [`/compare/loom`](../apps/web/src/content.ts) | Choosing a replacement | The seed returned 82 suggestions. Explain the different job clearly: Loom records the person's screen; Walkcast records a real website visit. Keep the comparison fair and cite Loom's current plan details. |
| 2 | `screen studio alternative for Windows`; Linux variant | [`/compare/screen-studio`](../apps/web/src/content.ts) | Choosing a replacement | The seed returned 57 suggestions. Lead with platform and output differences. Keep Screen Studio's strengths visible, and date its price and system-requirement sources. |
| 3 | `product demo video maker`; free, for website, SaaS and how-to variants | [`/guides/product-demo-video`](../apps/web/src/content.ts) | Make or evaluate a product demo | The `product demo video` seed returned 108 suggestions. Show the real capture-to-export steps and a sample result. Do not describe Walkcast as an AI video generator. |
| 4 | `website tutorial video maker`; website guide video variants | [`/guides/website-tutorial-video`](../apps/web/src/content.ts) | Make a tutorial | The `website walkthrough video` seed returned 16 suggestions, mostly modifier phrases. Focus on the searched modifier `website tutorial video maker`, not the weak head term. |
| 5 | `scribe alternative for desktop`; self-hosted and video variants | [`/compare/scribe`](../apps/web/src/content.ts) | Choosing a replacement | The seed returned 117 suggestions. Compare screenshot guides with video plus a written guide. Link each Scribe plan and product claim to Scribe's own current pages. |
| 6 | `AI browser agent`; `Stagehand evals`, testing and alternatives | [`/lab`](../apps/web/src/content.ts) | Developer research | `AI browser agent` returned 147 suggestions; `Stagehand` returned 276, but much of that seed is unrelated noise. Target the narrow developer intent and show a reproducible failed-run fixture. |
| 7 | `website video maker` | [`/guides/website-tutorial-video`](../apps/web/src/content.ts) | Find a tool | The seed returned 71 suggestions. Treat it as a secondary phrase on the tutorial page; do not create a near-duplicate landing page just to repeat the phrase. |
| 8 | `Walkcast pricing`; `is Walkcast free` | [`/pricing`](../apps/web/src/content.ts) | Verify cost | Answer with the current MIT licence and product limits. Link the licence and keep every product claim aligned with the release that is available. |

Suggestion counts are not comparable across seeds and do not establish demand by themselves. Before making a new route, check Search Console queries and landing-page performance for an existing page that can satisfy the intent.

## Citation checklist

Keep each factual comparison claim adjacent to its source. Prefer the product owner's documentation for prices, platform requirements and plan limits, and the Walkcast repository for Walkcast capabilities.

| Page | Primary citations to keep current |
|---|---|
| `/compare/loom` | [Loom pricing](https://www.loom.com/pricing), [Loom plan details](https://support.atlassian.com/loom/docs/available-loom-plans), [Walkcast source](https://github.com/KunjShah95/walkcast) |
| `/compare/screen-studio` | [Screen Studio pricing](https://screen.studio/4), [Screen Studio download and requirements](https://screen.studio/download), [Walkcast source](https://github.com/KunjShah95/walkcast) |
| `/compare/scribe` | [Scribe pricing](https://scribe.com/pricing), [Walkcast source](https://github.com/KunjShah95/walkcast) |
| Guides and `/lab` | Walkcast README, release notes, reproducible demos, and linked primary documentation for any third-party technical claims |

Recheck prices before changing published copy. Record the date in `COMPARES.priceChecked` and keep the source URL beside the fact in `COMPARES.facts`. Do not add a statistic without a source that supports the exact number and context.

## Crawl and citation operations

1. Keep each route server-rendered/prerendered with a unique title, description, canonical URL, visible answer and useful internal links.
2. Keep `robots.txt` and both sitemaps in the build; submit them in Search Console and Bing Webmaster Tools when the owner account is connected.
3. After a material page change, use Search Console URL inspection to request recrawl and verify the indexed canonical. IndexNow can notify participating engines of changed URLs, but it cannot force indexing.
4. Track query, impressions, clicks, CTR, average position and landing page in a Search Console export. Track AI citations separately by platform, query, cited URL and capture date; manually sample the priority queries monthly.
5. Earn third-party references through useful, transparent contributions to developer communities and directories. Never manufacture reviews, citations, customer counts or rankings.

Current limitation: this repo has no Search Console or Bing Webmaster credentials/data, so steps 2–4 need the site owner's connected account before measured crawl or citation reporting can be completed. No implementation can guarantee a search engine will index, rank or cite a page.
