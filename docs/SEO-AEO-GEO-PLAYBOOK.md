# Walkcast — SEO playbook

> Structured as the standard five-branch model: **On-Page**, **Off-Page**, **Technical**, **Local**,
> **Tools**. Each item is marked done (in code), to-do, or N/A with a reason.  
> Last synced from code: 2026-10-16.

---

## 1. On-Page SEO

| Item | Status | Where |
|---|---|---|
| Title tag optimisation | done | Every page sets a unique `<title>` in `src/site/pages.ts` (`layout()`); landing is `
{NAME} — website video walkthrough generator`. Titles and descriptions are asserted unique per guide in `test/site.test.ts`. |
| Meta descriptions | done | `layout()` emits `<meta name="description">`, mirrored into `og:description` and `twitter:description`. |
| Header tags (H1, H2, H3 hierarchy) | done | Exactly one `h1` per page. The auth story headline was an `h2` **before** the page's `h1`; it is now display type (`p.auth-story .dh`), so the outline is `h1 → h2`. Asserted in `test/site.test.ts`. |
| Keyword placement | done | Primary query in the landing `h1`/lede and `SoftwareApplication` description; job-intent variants on `/guides/<slug>` pages, which target the long tail ("record a login-walled site", "sign in to records site walkthrough"). |
| Image alt text | done | The site ships no raster content images (inline `aria-hidden` SVG + video posters), so the only image surface is the social card: `og:image:alt` and `twitter:image:alt` are emitted per page. Poster/decorative art stays `aria-hidden` so it is never read aloud twice. |
| Internal linking structure | done | Global header + footer on every page; `/guides` cross-links to every guide; each guide carries `BreadcrumbList`; the landing page links to `/how`, `/lab`, `/safety`, `/pricing`, `/guides`. |
| Schema markup integration | done | JSON-LD `@graph` per page: `Organization`, `WebSite`, `WebPage`, `SoftwareApplication`, `VideoObject`, `HowTo`, `ItemList`, `FAQPage`, `Article` on guides, `BreadcrumbList` on guides, `CollectionPage` on the guides index, `Offer` on pricing, plus `speakable` on the "what is" answer block. |

## 2. Off-Page SEO

| Item | Status | Action |
|---|---|---|
| Backlink building | to-do | GitHub README → site, site → repo (`rel=me`); awesome-list PRs to `awesome-browser-automation` and `awesome-ai-agents`. |
| Influencer mentions | to-do | Dev.to / Hashnode tutorial ("Turn a login-walled site into a narrated video"), linked from the guides index. |
| Guest posting & PR outreach | to-do | 3 comparison pages (`/compare/walkcast-vs-looms`, `…-vs-screen-studio`, `/vs/manual-recording`) then pitch them to dev blogs. The `/compare/<slug>` route, page template and sitemap entries already exist and are ready to fill. |
| Social bookmarking | to-do | Product Hunt + HN "Show HN" launch day; each links the landing hero video, which is already in the sitemap as a `video:video` entry. |
| Forum & Q&A participation | to-do | r/webdev, r/qualityassurance, r/LocalLLaMA (self-host angle); answer "how do I record a walkthrough of a site behind a login?" with the `/how` page as the citation. |

## 3. Technical SEO

| Item | Status | Where |
|---|---|---|
| Site speed optimisation | done | Single inlined `<style>` and single inlined JS bundle (vite singlefile), self-hosted woff2 with `rel=preload`, video `preload="metadata"` (hero) / `preload="none"` (guides), `poster` frames so no layout shift, fonts `font-display: swap`. |
| Mobile friendliness | done | `viewport-fit=cover` + `env(safe-area-inset-*)` padding, fluid `clamp()` type, breakpoints at 900/680/400px, `text-wrap: balance`. |
| Sitemap.xml & robots.txt | done | `/sitemap.xml` (with video entries) and `/robots.txt` (explicit allow for search + answer-engine + AI-training bots, deny only `/app`, `/api`, `/auth`, `/files`, `/start`); served with `max-age=3600`. `llms.txt` and `pricing.md` are also listed. |
| Canonical URLs | done | `<link rel="canonical">` on every page. Trailing-slash duplicates now 302 to the canonical form (`/guides/` → `/guides`), GET/HEAD only, `/app` excluded. |
| Structured data & rich snippets | done | See schema row above; FAQ/HowTo/Video markup is validated by `test/site.test.ts`. |
| Internal linking structure (technical) | done | Sitemap lists every indexable URL; `X-Robots-Tag: noindex` guards `/app`; auth pages are `noindex` in the meta tag. |
| HTTPS & security | done | `http` → `https` redirect when `LAB_SITE_URL` is https and the proxy reports `x-forwarded-proto: http`; `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` on every response. Headers are TLS-gated so plain-http local dev is unaffected. |
| 404 handling (added) | done | Real HTTP 404 with a branded `notFoundPage()` carrying `noindex` in both the meta tag and `X-Robots-Tag`, plus internal links back into the site — no soft-404. |

## 4. Local SEO

**N/A with reasons.** Walkcast is a self-hosted, MIT-licensed CLI + web app with no storefront, no
service address and no phone number; there is nothing local to rank. Google Business Profile,
Yelp/IndiaMART/Bing Places and JustDial would all be fabricated listings, which Google treats as
spam and which NAP consistency then has to be maintained across three unowned profiles.

**Revisit only if** the project ever adds a human-facing side — support, an agency tier, or an
on-prem install service. Then the minimum honest set is: a real business entity with a verifiable
address, a GBP with the same NAP as the site footer, Bing Places, one review flow on-site, and
`LocalBusiness`/`Service` JSON-LD on the contact page. NAP consistency means one canonical string
rendered from a single source of truth (a token in the site config) and reused verbatim in GBP,
Yelp and the footer.

## 5. Tools

| Tool | Use |
|---|---|
| Google Search Console | Submit `/sitemap.xml`, request indexing of home + 3 guides, track impressions/clicks per target query. |
| Bing Webmaster Tools | Same sitemap; also the path to IndexNow if added. |
| PageSpeed Insights / Lighthouse / GTmetrix | CI gate on `/`, `/guides/<slug>`, `/how`. Budget: LCP < 2.0s, CLS < 0.02 (inline single-file build should hold this). |
| Ahrefs / Semrush / Ubersuggest | Backlink profile, referring domains for the comparison pages, competitor gap against Loom / Screen Studio / Scribe. |
| Screaming Frog | One-off crawl for status codes, duplicate titles, missing H1s, orphan pages, and internal-link depth after new guides ship. |
| Rich Results Test / schema.org validator | Validate the JSON-LD `@graph` after any markup change. |
| Answer-engine spot checks | Monthly: search the target queries in ChatGPT, Perplexity and Google AI Overviews; log cited URL + snippet in the tracker sheet. |

---

## Target queries (primary)
- "website video walkthrough generator" — home, /pricing
- "narrated website walkthrough from a link" — home
- "browser agent regression test" / "browser AI agent fixture" — /lab
- "sign in to records site walkthrough" — /guides, /how
- "AI browser agent testing tools" — /lab
- "record a website walkthrough with narration" — /how

## AEO answer blocks (use verbatim in content & outreach)
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
- Search Console: impressions/clicks for the 6 primary queries; CTR target > 4%.
- AEO: snippet wins for "what is walkcast" + "website video walkthrough".
- GEO: monthly citation count per platform.
- Regression guard: `npm test` (site/ui suites) asserts the technical items above.