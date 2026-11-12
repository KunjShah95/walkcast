# Sitemap "Couldn't fetch" — diagnosis, the fix, and where the traffic actually comes from

*Written 12 November 2026 for walkcast.kunjshah.in.*

---

## 1. The short version

**The sitemap was never broken.** On 12 November 2026, `https://walkcast.kunjshah.in/sitemap.xml`
returned `200` with valid XML, 14 URLs, correct content type, to a Googlebot user agent. All 14 URLs
inside it returned `200`, each with its own canonical, one `<h1>`, no `noindex`, and parseable JSON-LD.

That matters because **"Couldn't fetch" is the only message in Search Console that means "I could not
reach the file at all."** Every other message in that report (*Sitemap could not be read*, *URLs not
allowed*, *Has invalid URL*, *Missing XML tag*) means the file arrived and was rejected.

So the failure is not in the file. It is one of these four, in this order of likelihood:

| # | Cause | How to confirm |
|---|---|---|
| 1 | **The sitemap was submitted on the `www` host, and `www` has no DNS record.** | `nslookup www.walkcast.kunjshah.in` → no answer. Confirmed. |
| 2 | **The property in Search Console is a different host** (`http://`, `www`, or a bare domain variant). | Top-left property switcher in GSC shows the exact host. |
| 3 | **Google fetched during a deploy window** and got a 404/500. GSC keeps the last result until it retries. | Re-submitting usually clears it. |
| 4 | **Transient DNS/TLS failure** on Google's side. | Nothing to fix; re-submit. |

Cause 1 is real and confirmed: **`www.walkcast.kunjshah.in` does not resolve at all.** If the sitemap
was ever added under a `www` property, or the URL was typed with `www`, Google is being asked to fetch
a host that does not exist, and it can never succeed.

---

## 2. What changed in the repository

| File | Change | Why |
|---|---|---|
| `apps/web/build.ts` | `<lastmod>` is now a full W3C datetime (`2026-11-05T00:00:00+00:00`) | `YYYY-MM-DD` is legal, but validators and the video extension expect the full form. One less thing a checker can flag. |
| `apps/web/build.ts` | `<video:duration>` is derived from `DEMO.durationIso` instead of hardcoded `71` | A hardcoded number silently goes stale when the demo is re-recorded; a wrong duration drops the whole `<url>` from Google's video index. |
| `apps/web/build.ts` | `<video:publication_date>` uses the YouTube date when a YouTube URL is set | The field must describe the copy that `content_loc` points at. |
| `apps/web/build.ts` | Added `assertSitemap()`: the build now **fails** on a non-HTTPS `<loc>`, a `<loc>` on the wrong host, a query/fragment in a `<loc>`, a duplicate URL, a malformed `<lastmod>`, or a `<lastmod>` in the future | A broken sitemap can no longer be deployed by accident. The build is the check. |
| `apps/web/build.ts` | `robots.txt` declares **one** sitemap. The `.md`/`.txt` files moved out of it. | A sitemap of text files reads as a file full of *URL not allowed* in the Sitemaps report. Search engines index pages; `llms.txt` is where agents look. |
| `apps/web/build.ts` | `sitemap-agents.xml` is linked from `llms.txt` instead of `robots.txt` | Same reason: agents read `llms.txt`, search engines read `robots.txt`. One audience and one file each. |
| `apps/web/build.ts` | `GOOGLE_SITE_VERIFICATION` and `BING_SITE_VERIFICATION` env vars emit the ownership meta tags | Lets you verify a property without touching DNS — useful when the nameservers live at a registrar. |
| `apps/web/build.ts` | `Organization.sameAs` now includes the Product Hunt listing | `sameAs` is how an engine connects this site to the off-site pages describing the same entity. It is a GEO signal, not an SEO one. |
| `vercel.ts` | Cache headers now cover `sitemap-agents.xml`, `pricing.md` and the IndexNow key file | They were served with `max-age=0`, so every crawler hit the origin. |
| `vercel.ts` | Sitemaps are served as `application/xml; charset=utf-8` explicitly | A checker that guesses latin-1 can report a UTF-8 sitemap as unreadable. |
| `vercel.ts` | A permanent `www` → apex redirect is defined | Dormant until the DNS record exists, then it makes every stale `www` link land on the canonical host instead of a 404. |
| `scripts/seo-doctor.mjs` | New `npm run seo:doctor` | Reproduces Google's fetch over real HTTP and tells you which of the four causes you are looking at. Run it **before** you press Submit. |
| `test/web-build.test.ts` | New test: "the sitemap is a file a crawler cannot reject" | The validation above is now enforced in CI, not just at build time. |

Verified after the change: `npx tsc --noEmit` clean, `npx tsc -p apps/web --noEmit` clean,
`npm run web:build` builds 14 pages, `npx tsx --test test/web-build.test.ts` → **9/9 pass**,
`npm run seo:doctor` → **37 checks, 0 failed**.

---

## 3. Do this in Search Console

Order matters. Do not submit until step 2 passes.

1. **Check the property.** Top-left switcher. It must be one of:
   - `https://walkcast.kunjshah.in/` (URL-prefix), or
   - `kunjshah.in` (Domain property).
   **Not** `https://www.walkcast.kunjshah.in/` — that host does not resolve, so no sitemap on it can
   ever be fetched.
2. **Run the doctor locally first:**
   ```
   npm run seo:doctor
   ```
   It must end `RESULT: PASSED`. If the sitemap line fails here, it will fail in Search Console too.
3. **Remove and re-add the sitemap.** Indexing → Sitemaps → delete `sitemap.xml` → enter exactly
   `sitemap.xml` under the `https://walkcast.kunjshah.in/` prefix (GSC fills in the host). Do not add
   `sitemap-agents.xml` — it is not a search sitemap and will only produce noise.
4. **Inspect three URLs.** URL Inspection → paste `/`, `/compare/loom`, `/lab` → *Test live URL*. This
   asks Google to fetch right now and tells you if the page is reachable, independent of the sitemap.
5. **Wait.** Sitemap status is not live. Google retries on its own schedule; "Couldn't fetch" can
   persist for a day or two after the cause is gone.

### Fixing the `www` hole (5 minutes, permanent)

At the registrar holding `kunjshah.in` (Hostinger, per the current nameservers), add:

```
Type:  CNAME
Name:  www.walkcast
Value: abd83919e72cd850.vercel-dns-017.com
```

That is the same target `walkcast.kunjshah.in` already points at. Then add `www.walkcast.kunjshah.in`
as a domain in the Vercel project. The redirect in `vercel.ts` then sends every `www` URL to the apex
permanently. Until this is done, any `www` link — yours, a directory's, or a person's — is a hard
failure.

---

## 4. The three terms, in plain English

People use these interchangeably and then disagree about them. They are three different games.

| Term | Stands for | The game | What wins |
|---|---|---|---|
| **SEO** | Search Engine Optimisation | Rank a URL in a list of ten blue links | Crawlability, one intent per page, internal links, backlinks, page speed |
| **AEO** | Answer Engine Optimisation | Be the one passage an engine *quotes* | A direct answer in the first 40–60 words, question-shaped headings, FAQ/HowTo schema |
| **GEO** | Generative Engine Optimisation | Be *cited* inside an AI-written answer | Being mentioned on third-party pages the model already trusts; statistics with sources; dates; named author |

GEO is sometimes called **LLMO** (Large Language Model Optimisation). Same thing.

### The rest of the vocabulary you will meet

- **SERP** — Search Engine Results Page. Where you are or are not.
- **Impression** — your URL appeared in a result. **Click** — someone chose it. **CTR** — clicks ÷ impressions.
  **Position** — average rank. These four are the whole of the Performance report.
- **Crawled vs indexed vs ranked.** *Crawled*: Googlebot downloaded the page. *Indexed*: Google stored it.
  *Ranked*: it appears for a query. A page can be crawled and not indexed; that is the bucket that
  matters when something is invisible.
- **Canonical** — `<link rel="canonical">`. Tells Google which URL is the real one when several are
  identical. Every page here is self-canonical, which is what you want.
- **`<lastmod>`** — the "when did this change" field in the sitemap. A wrong or future-dated value is
  the one sitemap field engines act on, which is why the build now refuses to emit one.
- **JSON-LD / structured data** — a `<script type="application/ld+json">` block that states the facts
  about the page in a vocabulary (Schema.org) machines read. This site emits `Organization`, `Person`,
  `WebSite`, `SoftwareApplication`, `VideoObject` (with transcript), `HowTo`, `FAQPage`,
  `BreadcrumbList`, `SpeakableSpecification`.
- **`speakable`** — marks the paragraph a voice assistant should read aloud. Already applied to the
  answer paragraph on key pages.
- **`llms.txt`** — a plain-text brief for AI systems: what this is, the facts, and where each page lives.
  Not a standard, but agents are starting to read it. `llms-full.txt` is the long version.
- **IndexNow** — a ping that tells Bing, Yandex, Seznam and Naver a URL changed, instead of waiting for a
  crawl. `npm run web:indexnow`. It cannot make Google recrawl; Google's path is URL Inspection.
- **Backlink** — another site linking to you. Still the strongest off-page signal in traditional SEO.
- **Citation (GEO)** — a third-party page *mentioning* you, link or not. AI answers lean on these far
  more than on your own site: roughly 6.5x more likely to cite a third party than your domain.
- **E-E-A-T** — Experience, Expertise, Authoritativeness, Trust. The quality bar Google's reviewers
  apply. The visible "Updated <date> by <name>" byline on every page is an E-E-A-T signal.
- **AI Overview** — the AI-written block above Google's results. Appears in roughly 45% of searches and
  reduces clicks to the sites below by up to 58%. It is why AEO and GEO now matter more than they did.
- **Crawl budget** — how many URLs Googlebot will spend on your site in a period. A sitemap full of
  404s is how a small site wastes it.
- **Orphan page** — a page with no internal links pointing to it. Effectively invisible, sitemap or not.

---

## 5. Where this site actually stands

**Technical foundation: done, and better than most.** Prerendered HTML (no JavaScript needed to read the
copy), per-page canonicals, a full JSON-LD graph, video sitemap with the transcript, `llms.txt`,
`llms-full.txt`, `pricing.md`, IndexNow, 25 named AI crawlers explicitly allowed, 14 pages all returning
200 with 465–2,155 words.

**Content: thin, and that is the real limiter.** 14 pages. Three guides, four comparison pages, one FAQ.
That is a product site, not a topical authority. Nothing on the site is broken; there is simply not
enough of it, and it is not linked from anywhere off-site.

**The honest ranking of what is holding traffic back:**

1. **No third-party citations.** For "Loom alternative", "Screen Studio alternative", "Scribe
   alternative" and "browser agent testing", Walkcast is not in the first ten results and is not cited
   by any AI answer. The comparison pages are built and crawlable; they are simply not in front of
   anyone. This is the single biggest lever and it is off-site work, not code.
2. **`/lab` has no search history.** "AI browser agent testing" is the one category here with real,
   growing demand and no dominant incumbent. The page exists; nothing points at it.
3. **No measurement baseline.** Without 28 days of Search Console data you cannot tell which page is
   one edit from page one and which is invisible. Everything else is guesswork until this exists.
4. **The three guides are the weakest commercial pages.** 756–1,032 words each, no sample output above
   the steps, and no FAQ block — the format answer engines quote most readily.
5. **The homepage title is brand-led**, not query-led. Their own audit says leave it alone until there
   is a baseline. That is right: changing the title of the only page with history is a bet, not a fix.

---

## 6. What to focus on, in order

Ranked by expected traffic per hour spent. Nothing here needs new code.

**This week — prove it and measure it**

1. Fix the `www` CNAME (§3), remove and re-add the sitemap, run `npm run seo:doctor`.
2. Export Search Console for 28 days: Performance → Queries and Pages; Page indexing → full reason
   breakdown; Sitemaps; Core Web Vitals. This is the baseline; without it, everything below is faith.
3. Run `npm run web:indexnow` after the deploy, so Bing/Copilot see the change the same day.

**Next two weeks — the pages that already have intent**

4. Add a **real sample output** to `/guides/product-demo-video`: the actual MP4, embedded, above the
   steps. It is the strongest commercial query on the site and the page asks the reader to imagine the
   result.
5. Add a **3-question FAQ block** to each of the three guides. Answer engines quote a Q&A pair; they
   rarely quote a paragraph. The `FAQPage` schema path is already wired — it needs the content and a
   visible list.
6. Get `/lab` in front of the people searching "browser agent testing": one real post on the Stagehand /
   browser-use / Playwright communities, linking the page because it answers the question, not because
   it needs a link.

**Weeks three and four — the off-site work that actually moves GEO**

7. Update the existing directory listings before adding new ones. An improved listing on a site that
   already ranks beats a new stub on one that does not.
8. Publish one engineering article with a reproducible artefact: *"A browser agent said it succeeded and
   had not."* That is a citable, original, first-hand claim — the exact shape AI answers quote.
9. Get on the review sites that AI answers cite for tool comparisons (G2, Capterra, TrustRadius,
   AlternativeTo), even as a free product.
10. Open PRs to `awesome-browser-automation` and `awesome-ai-agents` after reading their CONTRIBUTING.

**Then — only then — decide about new pages.** A new page competes with the 14 that exist. Fix the
pages that already have intent first.

---

## 7. How to tell whether it is working

| Check | Where | How often | What good looks like |
|---|---|---|---|
| Sitemap status = Success, discovered = indexed | GSC → Sitemaps | Weekly | 14 submitted, 14 indexed |
| Impressions trend | GSC → Performance | Weekly | Rising before clicks do — that is normal, it means ranking is starting |
| Pages in "Crawled – currently not indexed" | GSC → Page indexing | Monthly | Falling. This is the list of pages Google saw and judged thin |
| Queries with impressions but no clicks | GSC → Performance → Queries, CTR < 1% | Monthly | Each one is a title/description rewrite, in priority order |
| AI citations for 8 fixed queries | ChatGPT, Perplexity, Google AI Overview | Monthly, same 8 queries | Walkcast named at all. Record who is named instead |
| Sitemap still fetchable | `npm run seo:doctor` | Every deploy | `RESULT: PASSED` |

The trap to avoid: watching clicks. For the first month, impressions and indexed-page count are the only
honest signals. A site that goes from 0 to 400 impressions a week has started working even if it earned
nine clicks.
