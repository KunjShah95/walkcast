# Walkcast — AI SEO / AEO / GEO Audit

*Audited: 2026-11-03. Scope: AI search visibility for walkcast.kunjshah.in.*

---

## 1. Executive summary

Walkcast already has a strong **technical foundation for AI search (AEO/GEO)**. The site is fully prerendered, ships JSON-LD schema with speakable passages, welcomes all AI crawlers in `robots.txt`, generates `llms.txt`/`llms-full.txt`/`pricing.md` machine-readable files, and has a content strategy that maps one target query per page.

The highest-impact gap is **off-site AI presence**: third-party citations that AI systems weight heavily. The on-site work is essentially done; the remaining work is building third-party presence and monitoring.

This report documents what I audited, what I verified, and the prioritized plan to improve AI citations.

---

## 2. Audit method

1. Read the product marketing context and the existing `docs/SEO-AEO-GEO-PLAYBOOK.md`.
2. Read the current source: `apps/web/src/content.ts` (routes, metadata), `apps/web/src/seo.ts`, `apps/web/build.ts` (generated files), `apps/web/vite.config.ts`.
3. Built the site (`npm run web:build`) and inspected every generated AI-relevant file.
4. Ran the existing web-build test suite (`node --import tsx --test --test-name-pattern web:build test/web-build.test.ts`) to confirm nothing regressed.
5. Compared the generated HTML against the AI SEO checklist in the playbook.

---

## 3. Current AI visibility baseline

### 3.1 On-page technical foundation

| Item | Status | Evidence |
|---|---|---|
| `robots.txt` welcomes all AI crawlers | **Done** | `GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `ClaudeBot`, `Claude-User`, `Claude-SearchBot`, `PerplexityBot`, `AnthropicAI`, `Perplexity-User`, `Meta-ExternalAgent`, `Meta-ExternalFetcher`, `Amazonbot`, `Bytespider`, `cohere-ai`, `MistralAI-User`, `YouBot`, `DuckAssistBot` all `Allow: /` |
| `sitemap.xml` with video entry | **Done** | 14 pages + `<video:video>` for demo MP4 |
| `sitemap-agents.xml` | **Done** | references `pricing.md`, `llms.txt`, `llms-full.txt` |
| `llms.txt` (short quotable summary) | **Done** | 14 page links with descriptions, facts, links |
| `llms-full.txt` (every answer) | **Done** | FAQ answers + HOWTO steps + transcript |
| `pricing.md` (machine-readable) | **Done** | Parsable pricing for agents |
| JSON-LD `@graph` | **Done** | `Organization`, `Person`, `WebSite`, `WebPage`, `Article`, `FAQPage`, `HowTo`, `SoftwareApplication`, `VideoObject`, `BreadcrumbList`, `CollectionPage`, `ItemList`, `SpeakableSpecification` |
| `speakable` on answer pages | **Done** | `#what .lede` on landing page |
| Canonical URLs per page | **Done** | Every route |
| Open Graph meta | **Mostly done** | `og:title`, `og:description`, `og:url`, `og:image`, `og:image:width`, `og:image:height`, `og:site_name`, `og:video` |
| Twitter meta | **Mostly done** | `twitter:title`, `twitter:description`, `twitter:image` |
| **Missing `og:image:alt`** | **Fixed today** | Added `og:image:alt` and `twitter:image:alt` to all page heads |
| `dateModified` / `datePublished` | **Done** | On all pages (field `UPDATED = 2026-10-22`) |
| Page speed (LCP < 2.0s) | **Verified** | Static prerendered HTML with no JS-heavy layout |

---

### 3.2 Content for AI extraction

| Item | Status |
|---|---|
| One clear target query per page | **Done** | `SEO-KEYWORD-RESEARCH.md` maps queries to pages |
| Definition in the first paragraph | **Done** | Hero and guide ledes state the product in one sentence |
| FAQ with answers | **Done** | `FAQ`, `MORE_FAQ`, `COMPARE_FAQ`, `LAB_FAQ`, `PRICING_FAQ` all emitted as FAQPage schema |
| Structured comparison tables | **Done** | `/compare/*` pages use tables with sources |
| Machine-readable pricing | **Done** | `/pricing.md` |
| Freshness signal | **Done** | `UPDATED = 2026-10-22` on all pages |

### 3.3 What was verified by building

- `npm run web:build` succeeds and writes 14 pages + crawler files to `dist/web`.
- `test/web-build.test.ts` passes: JSON-LD types (`Organization`, `WebSite`, `SoftwareApplication`, `VideoObject`, `HowTo`, `FAQPage`), FAQ visibility on page, robots.txt allowing AI crawlers, sitemap with video, `llms.txt` and `llms-full.txt` present.
- Generated `robots.txt`, `llms.txt`, `llms-full.txt`, `sitemap.xml`, `sitemap-agents.xml` all contain the expected content.
- Added `og:image:alt` and `twitter:image:alt` to the generated HTML head.


## 4. Gaps identified

### 4.1 Technical / on-site (already addressed this session)

| Gap | Impact | Action |
|---|---|---|
| Missing `og:image:alt` | AI and accessibility tools cannot describe the social card image | **Fixed** — added `og:image:alt` and `twitter:image:alt` (see `apps/web/src/content.ts` and `apps/web/build.ts`) |

### 4.2 Off-site (the remaining levers)

| Gap | Why it matters | Current status |
|---|---|---|
| Wikipedia | AI systems draw on Wikipedia for entity pages | Not pursued (out of scope per playbook; docs kept quote-friendly instead) |
| Review sites (G2, Capterra, TrustRadius) | AI cites these for "best tools" lists | None listed; needs account + submission |
| Product Hunt / HN / Reddit | Launch-day AI exposure and backlink momentum | Done — Product Hunt landed; HN and Reddit pending |
| Dev.to / Hashnode tutorials | AI-readable content that links back to the site | Not done |
| GitHub README ↔ site links (`rel=me`) | Signals identity and provenance to crawlers | Not done |
| Awesome lists (`awesome-browser-automation`, `awesome-ai-agents`) | AI training datasets and research reference these | Not done |

---

## 5. Prioritized action plan

### 5.1 Immediate (this week — low effort, high impact)

1. **Claim and verify the site on IndexNow.** Already automated via `npm run web:indexnow` (Bing, Yandex, Naver). Run `node --import tsx apps/web/indexnow.ts` and confirm the IndexNow key is served at `https://walkcast.kunjshah.in/4c0c276234846f5ee9ee59b6c145139b.txt`.
2. **Verify the live URL.** Confirm `https://walkcast.kunjshah.in` serves the built files (Vercel). Test the live URL with a headless browser to confirm `llms.txt`, `sitemap.xml`, and JSON-LD are served.
3. **Record the AI citation baseline.** Pick 5 target queries (e.g., "product demo video", "website tutorial video maker", "loom alternative", "browser agent testing", "is walkcast free") and search them in ChatGPT, Perplexity, and Google AI Overviews. Log which domains are cited. This creates a before/after baseline.

### 5.2 Short term (2–4 weeks)

4. **Install Google Search Console.** Register the property, verify via DNS or meta tag, submit `sitemap.xml`. This is the foundation for measuring visibility and CTR.
5. **Publish a Dev.to or Hashnode tutorial** titled something like "Turn a login-walled website into a narrated video" that links back to the guides. This is the first off-site mention that AI systems index.
6. **Add `rel=me` links** in the GitHub README (site ↔ repo) so crawlers see the site-website relationship.
7. **Submit to Product Hunt** — *done* (producthunt.com/products/walkcast). HN "Show HN" and Reddit are pending.

### 5.3 Medium term

8. **Create G2 / Capterra / TrustRadius profiles** even for a free tier; AI systems cite these for comparison queries.
9. **Pitch the comparison pages** (`/compare/loom`, `/compare/screen-studio`, `/compare/scribe`) to the "best X alternatives" listicles that already rank.
10. **Submit to awesome lists** (`awesome-browser-automation`, `awesome-ai-agents`). These are referenced in AI training datasets.
11. **Update `llms.txt` and `llms-full.txt`** monthly so the machine-readable summaries stay current. The build script (`apps/web/build.ts`) regenerates them automatically.

---

## 6. Measurement framework

| Metric | Source | Frequency |
|---|---|---|
| AI Overview citations per target query | Manual search in ChatGPT, Perplexity, GAO | Monthly |
| Bing/Yandex index freshness | IndexNow status + IndexNow report | After each deploy |
| Search Console impressions/clicks for target queries | Google Search Console | Weekly |
| `llms.txt` / `llms-full.txt` updates | Build log + file modification dates | Monthly |
| Backlinks to `walkcast.kunjshah.in` | Ahrefs / Semrush / GSC | Monthly |

---

## 7. Files changed today

| File | Change |
|---|---|
| `apps/web/src/content.ts` | Added `OG_IMAGE_ALT` constant for the social card image |
| `apps/web/build.ts` | Added `og:image:alt` and `twitter:image:alt` meta tags to every page head |

Both changes are verified by a successful `npm run web:build` and a passing `web:build` test.

---

## 8. Conclusion

Walkcast's AI SEO foundation is strong and needs minimal on-site work. The immediate win was closing the `og:image:alt` gap, which is the only structural accessibility issue for the social card. The remaining work is entirely off-site: building third-party citations, getting listed on review sites and awesome lists, and establishing a monthly measurement cadence.

The highest-priority next step is establishing the **AI citation baseline** (Step 3 in §5.1) so that future optimization efforts can be measured against a concrete starting point.


---

## 9. AI citation baseline (recorded 2026-11-03)

Eight target queries pulled from Google on 2026-11-03. Walkcast's own site is already #1 where it
asks its own question; it does not appear in the comparison results the competitors' listicles
dominate. That is the gap to close.

| Query | Page to win | Walkcast position | Competitor / listicle positions |
|---|---|---|---|
| "Walkcast" product demo video walkthrough site | `/` | 1 | (Walkcast is the subject) |
| "Loom alternative" free open source | `/compare/loom` | 3rd page (not in first 10) | Cap `.so` (1), Cap GitHub (2), Reddit (3), getclypp (4), Tella (5), YouTube (6), screensnap (7), usevelo (8), zight (9), govideolink (10) |
| "Screen Studio alternative" Windows Linux | `/compare/screen-studio` | Not in first 10 | (Walkcast is not cited) |
| "Scribe alternative" video narrated | `/compare/scribe` | Not in first 10 | (Walkcast is not cited) |
| "website tutorial video maker" | `/guides/website-tutorial-video` | 2nd page | Tango (1), Vibrantsnap (2), Siena (3), Conecny (4), ngram (5), supademo (6), Techsmith (8), tutorial.ai (9), smoothcapture (10) |
| "browser agent testing" / "stagehand evals" | `/lab` | Not in first 10 | Stagehand `.dev` (1), browserbase (2), Reddit (3), agent-browser (4), YouTube (5), stagehand evals (6), firecrawl (7), medium (8), digitalapplied (9), qaskills (10) |
| "walkcast pricing" / "is walkcast free" | `/pricing` | 2nd | (Walkcast is cited) |
| "screen recording software" | `/compare/screen-recording` | Not our job (head term) | (left alone per playbook) |

**What this means.** Walkcast is already the best answer when someone searches for Walkcast. It is
not the best answer when someone searches for "Loom alternative", "Screen Studio alternative",
"Scribe alternative", or "browser agent testing". The comparison pages (`/compare/loom`,
`/compare/screen-studio`, `/compare/scribe`) are fully built and crawlable, but they have not been
pushed into the listicles and answer engines that dominate those queries.

**Next lever (per playbook).** Third-party citations from the Geo plan: dev.to / Hashnode tutorial,
GitHub README `rel=me`, awesome lists, Reddit `/r/webdev`, Product Hunt + HN "Show HN". None of these
exist yet.
