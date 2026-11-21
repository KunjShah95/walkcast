# Walkcast target keywords, by page

**Written 20 November 2026.** One main query per URL, the phrasings people actually type (for AEO: use them as
headings and FAQ questions), and what to leave alone. Builds on [`SEO-KEYWORD-RESEARCH.md`](SEO-KEYWORD-RESEARCH.md)
and [`SEO-PRIORITY-MAP.md`](SEO-PRIORITY-MAP.md); it does not replace them.

**What the numbers are.** Autocomplete suggestion counts from Google's suggest endpoint (the seed plus a–c, "for",
"free", "open source", "vs", "windows", "linux", "alternative"), pulled 20 November 2026. A count says how many
distinct completions exist, which is a demand signal. It is not a search volume. No volume data exists until Search
Console is connected; that is the first thing to do, and every row below should be re-ranked by impressions once it is.

## Page to keyword map

| URL | Main query | Phrasings to use as headings or FAQ questions | Status |
|---|---|---|---|
| `/compare/loom` | loom alternative | loom alternative free, open source, for windows, for linux, self hosted | Built, FAQ covers the variants |
| `/compare/screen-studio` | screen studio alternative for windows | for linux, free, open source | Built |
| `/compare/scribe` | scribe alternative for desktop | self hosted, open source, video | Built |
| `/compare/open-source-alternatives` | open source alternatives to guidde / tella / storylane / supademo | open source alternative, free, self hosted, guidde alternative open source | Built 20 Nov. Four vendors, every price read from its own page and dated |
| `/guides/product-demo-video` | product demo video maker | for website, saas, free, how to make a product demo video | Built, retitled "maker" 15 Nov |
| `/guides/website-tutorial-video` | website tutorial video maker | website walkthrough video maker, website guide video | Built, retitled "maker" 15 Nov |
| `/guides/stagehand-evals` | stagehand evals | stagehand testing, stagehand alternatives, stagehand vs browser use, stagehand vs playwright | Built 15 Nov; comparison FAQ added 20 Nov |
| `/lab` | ai agent eval harness | ai agent eval framework, eval tools, eval platform, browser agent testing | FAQ for "eval harness" and "eval framework" added 20 Nov |
| `/guides/how-browser-agents-fail` | how browser agents fail | why browser agents fail, agent reports success but task failed, false success | Built 15 Nov |
| `/pricing` | walkcast pricing | is walkcast free, walkcast open source | Built |

## New evidence from this pull

| Seed | Suggestions | What it says |
|---|---:|---|
| `ai agent evals` | 45 | A real cluster, dominated by developer intent: *eval harness*, *eval framework*, *eval platform*, *eval tools*, *eval metrics*, *eval github*. "Harness" is exactly what Lab is, so the word belongs on `/lab`. Ignore the job-board completions (*analyst*, *freelance*, *jobs*). |
| `stagehand vs` | 20 | People compare it with *browser use*, *playwright*, *playwright mcp*, *browserbase*, *skyvern*. Answer honestly that these drive a browser and Lab tests the result. Do not make claims about what those tools lack beyond their own documentation. |
| `guidde alternative` | 29 | Includes *guidde alternatives open source*. Guidde is a different product (AI how-to videos); a comparison page needs Guidde's current plans cited from their own site first. |
| `tella alternative` | 15 | Includes *tella open source alternative*. Same caveat. |
| `storylane alternative` | 11 | Includes *storylane open source alternative*. Interactive demos, not recordings; small. |
| `supademo alternative` | 5 | Includes *supademo alternatives open source*. Very small. |
| `navattic alternative` | 1 | Not worth a page. |
| `arcade alternative` | 61 | Almost all noise (a synth, a belt, a font). Do not target. |
| `automated product demo` | 4 | Too small. Cover it inside the product demo guide. |
| `record website as video` | 15 | Mostly *record website video chrome* and *scroll video*: a screen-recording and extension intent. Low fit. |

**The pattern.** Every interactive-demo and how-to-video tool has an "open source alternative" suggestion. That is
Walkcast's one structural advantage in that space (MIT, runs on your own machine), and it is true. The page is now
built at `/compare/open-source-alternatives`: one honest page serving all four small clusters, with each vendor's
price read from its own page on 20 November 2026 and linked. It says plainly that Storylane and Supademo are
interactive-demo tools, not something a narrated video replaces.

## Leave alone

Same list as before, plus: `arcade alternative`, `navattic alternative`, and the job-board completions inside
`ai agent evals`. "Website walkthrough video" as a head term has almost no demand; the modifier *maker* carries it.

## AEO and GEO checklist, scored against the site (20 Nov)

| Check | State |
|---|---|
| AI crawlers allowed in `robots.txt` (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, PerplexityBot, Google-Extended, Bingbot and more) | Yes |
| `llms.txt`, `llms-full.txt`, `pricing.md` | Yes, built from the same content as the pages |
| Direct answer in the first paragraph, marked `speakable` | Yes, on every guide, comparison, lab, pricing and privacy page |
| FAQ blocks with natural-language questions, matched by `FAQPage` schema | Yes |
| `Article`, `HowTo`, `BreadcrumbList`, `FAQPage`, `Organization`, `Person` | Yes |
| `SoftwareApplication` | Home and download only. Google asks it for a rating or review, which Walkcast does not have and does not invent |
| Named author, visible "updated" date, per-page change dates | Yes. Pages now carry their own dates instead of one global one |
| Comparison tables with dated, sourced facts | Yes on all four comparison pages, including the four-vendor open-source roundup |
| Statistics from outside sources on the guides | Yes since 20 Nov. The product demo guide cites Wyzowl's 2026 survey (266 respondents, fieldwork late 2025); the agent-failure guide cites WebArena and τ-bench; the Stagehand guide cites Stagehand's docs and τ-bench. Every figure is linked |
| Quotations from named people | **Gap.** No one is quoted. Only add real ones, with permission |
| Original data | The agent-failure page is the one piece. More fixtures and a live-model run with several seeds would make it citable as data rather than as a walkthrough |
| Presence outside the site | **Gap, and the biggest lever.** Reddit, YouTube, directories, GitHub lists, DEV. See below |

## Presence, which is where AI answers are mostly sourced

AI answers cite third-party pages far more often than the brand's own. In order of effort:

1. **YouTube.** Upload the 71-second demo. The build already has a slot for it (`DEMO.youtubeUrl`), left empty on
   purpose until it is a real URL. Use "Walkcast demo: a narrated walkthrough of a live website" and link the site.
2. **GitHub.** Fill in the repository's About description, topics (`website-walkthrough`, `product-demo`,
   `browser-agent`, `playwright`, `stagehand`, `evals`, `regression-testing`) and a social preview image.
3. **Directories.** `docs/directory-submissions.md` has the tracker and the order. Tag each link (`?ref=`).
4. **Communities.** One real, useful post each on r/webdev, r/SideProject, DEV and the Playwright and Stagehand
   communities, written as a how-to or a result, not an announcement. Disclose that you made it.
5. **Product Hunt.** The listing already exists (it is in the site's `sameAs`); keep its description identical to
   the site's.

## Measuring it

- **Search Console and Bing Webmaster Tools.** Verify both (the build reads `GOOGLE_SITE_VERIFICATION` and
  `BING_SITE_VERIFICATION`). Bing's AI Performance report shows Copilot and Bing citations for free.
- **Ahrefs Web Analytics** is now installed on the site, next to Vercel Analytics. Watch referrals from
  `chatgpt.com`, `perplexity.ai`, `copilot.microsoft.com` and `gemini.google.com`.
- **Monthly by hand.** Run the ten rows of the page map above through ChatGPT, Perplexity and Google, and log
  whether Walkcast is cited and which competitor is. Twenty minutes a month is enough to see a trend.
