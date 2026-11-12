# SEO execution — Lattice + Walkcast (12 November 2026)

This is the execution record for the two organic channels: Lattice (AI infrastructure discovery) and
Walkcast (website walkthroughs and browser-agent testing). It replaces the earlier "unverified" status
with live measurements, maps keywords onto the URLs that actually exist, and lists the fixes in priority
order.

Two limits are stated up front, because everything below depends on them:

- **No Search Console data.** No impressions, clicks, CTR, position or indexing counts appear in this
  document. The owner has both properties connected but has not yet exported the reports.
- **No keyword volumes.** Nothing here claims monthly search volume or difficulty. Where a demand signal
  is cited it is Google autocomplete suggestion count from `results/seo-trends.json` (pulled 20 October
  2026), which is a phrase-expansion signal, not demand.

## 1. Live verification

Fetched on 12 November 2026. Status codes are the real HTTP responses, not source-code reading.

| Endpoint | Status | Bytes | What it contains |
|---|---|---|---|
| `https://walkcast.kunjshah.in/` | 200 | 125,536 | Prerendered HTML, canonical, JSON-LD graph, OG image |
| `/robots.txt` | 200 | 853 | 25 named crawlers + `*`, all `Allow: /`, both sitemaps declared |
| `/sitemap.xml` | 200 | 3,271 | 14 URLs, `<video:video>` on the home entry |
| `/sitemap-agents.xml` | 200 | 627 | `pricing.md`, `llms.txt`, `llms-full.txt` |
| `/llms.txt` | 200 | 5,061 | Short quotable summary with per-page links |
| `https://lattice.kunjshah.in/` | 200 | 532,936 | Prerendered HTML, canonical, JSON-LD graph |
| `/robots.txt` | 200 | 861 | Crawler groups with `Content-Signal`, `Host:`, sitemap declared |
| `/sitemap.xml` | 200 | 52,045 | 286 URLs |
| `/llms.txt` | 200 | 64,595 | Index summary, dataset links, disambiguation notice |

Both sites are therefore crawlable and correctly advertised. Discovery is not the bottleneck; indexing
quality and off-site authority are.

### Walkcast inventory (14 URLs)

All 14 sitemap URLs return 200, each with a unique title, a unique description, a self-referencing
canonical and exactly one `<h1>`:

`/` · `/guides` · `/guides/narrated-website-walkthrough` · `/guides/product-demo-video` ·
`/guides/website-tutorial-video` · `/compare/screen-recording` · `/compare/loom` ·
`/compare/screen-studio` · `/compare/scribe` · `/lab` · `/faq` · `/pricing` · `/download` · `/privacy`

The four comparison pages are linked from the footer, the `#compare` section and the product-demo guide,
so none is orphaned. There is no `/compare` hub URL; that is a navigation choice, not a defect.

### Lattice inventory (286 URLs)

| Family | URLs | Notes |
|---|---|---|
| Tool profiles | 112 | `/{layer}/{tool}` |
| Alternatives pages | 39 | `/{layer}/{tool}/alternatives`, linked from their tool page |
| Section hubs | 10 | Inference, routing, retrieval, training, agents, workflows, guardrails, prompting, evals, reference |
| Comparisons | 17 | 1 hub + 15 comparisons + the side-by-side builder |
| Glossary | 52 | 1 hub + 51 terms |
| Essays | 17 | 1 index + 16 essays |
| Workload stacks | 8 | `/stack-builder` + 7 stacks |
| Role pages | 6 | 1 hub + 5 roles |
| Fix / symptom pages | 8 | 1 hub + 7 symptoms |
| Bands, root and meta | 17 | `/bands/*` (4), `/`, `/all`, `/review`, `/methodology`, `/verification`, `/corrections`, `/submit`, `/submissions`, `/about`, `/start`, `/contact`, `/privacy`, `/returns` |

The 112 figure on `/all` and in `llms.txt` is consistent with the 112 tool profiles; the extra 39 sitemap
entries under layer prefixes are the alternatives pages, not unlisted tools. This was checked rather than
assumed.

That inventory is the live state. The changes in §5 add one URL (`/alternatives`, the index of the 39
alternatives pages), which is not deployed at the time of writing.

## 2. Keyword-to-URL map — Lattice

One primary intent per URL. Supporting phrases belong in the H2s, the FAQ block and the internal links,
not in a second page.

| URL | Primary intent | Supporting phrases | Current state | Next action |
|---|---|---|---|---|
| `/` | AI infrastructure tools | AI infrastructure index, AI stack layers | Title disambiguates from Lattice HR | Keep. Do not add generic "directory" copy above the fold |
| `/all` | AI infrastructure directory | all AI tools list, open-source AI infrastructure | 112 tools, filterable, 5.5k words | H1 is "Every tool, filterable." Add one sentence naming it the directory |
| `/stack-builder` | AI stack builder | build an AI infrastructure stack, production AI stack | Client-side wizard, 601 words | Add a static, crawlable explanation of the four questions it asks |
| `/compare` | AI infrastructure comparison | compare AI tools, tool comparisons | 15 comparisons | Keep; link the alternatives pages from here |
| `/compare/vector-databases` | vector database comparison | best vector DB for RAG | Exists | Already the strongest commercial asset — raise internal links to it |
| `/compare/llm-observability` | LLM observability tools | agent observability, evals vs tracing | Exists | Pair with `/evaluation-observability` hub both ways |
| `/compare/vllm-vs-llama-cpp` | vLLM vs llama.cpp | inference engine comparison | Exists | Pair with `/inference-serving` and the runtime essay |
| `/compare/llm-gateways` | LLM gateway comparison | AI gateway, model router | Exists | Pair with `/routing-gateways` |
| `/stack/rag` | RAG infrastructure stack | RAG architecture, RAG tools | **Broken H1 and description** (see G1) | Fix copy |
| `/stack/{agent,chatbot,search,llm-api}` | AI agent / chatbot / search / LLM API stack | per-workload stack | **Broken H1 and description** (see G1) | Fix copy |
| `/fix/*` | symptom queries | why is my LLM slow, LLM costs too high, RAG hallucinations | 7 symptom pages | Strongest long-tail cluster; link from every tool page footer |
| `/{layer}/{tool}` | "[tool] review", "what is [tool]" | licence, cost, when to skip | ~595 words each | Keep. Ensure one comparison link and one alternatives link per page |
| `/{layer}/{tool}/alternatives` | "[tool] alternatives" | free / open-source alternative | 39 pages, no index | Build `/alternatives` hub listing all 39 |
| `/glossary/{term}` | "what is [term]" | KV cache, continuous batching, reranking | 51 terms | Add one "tool that implements this" link per term |
| `/roles/{role}` | AI platform engineer tools | AI infra engineer stack | 5 roles | Keep |
| `/bands/*` | navigation | compute / state / control | 3 bands | Low commercial intent; keep as internal navigation only |
| `/blog/*` | engineering guides | how to choose, when not to | 16 essays | Each essay needs one link to a comparison and one to a stack |

Queries worth writing next, all matching pages that already exist or need one:

- "which vector database for RAG" → `/compare/vector-databases`
- "vLLM vs llama.cpp production" → `/compare/vllm-vs-llama-cpp`
- "how to monitor LLM inference latency" → `/compare/llm-observability`
- "best open-source stack for AI agents" → `/stack/agent`
- "AI gateway vs direct provider calls" → `/compare/llm-gateways`

## 3. Keyword-to-URL map — Walkcast

Target query per URL, with the gap that stops the page ranking for it today.

| URL | Primary query | Supporting | Gap |
|---|---|---|---|
| `/` | website walkthrough video maker | video tour of a website, product demo video | Title is brand-led ("Paste a link, get a video tour"). Test a query-led title only after a GSC baseline |
| `/guides/product-demo-video` | product demo video maker | SaaS demo video, demo video from live app | 1,068 words, good. Add a sample output above the steps |
| `/guides/website-tutorial-video` | website tutorial video maker | website guide video, how to video a website | 790 words. Weakest of the three guides |
| `/guides/narrated-website-walkthrough` | narrated website walkthrough | website walkthrough with voiceover | 848 words. Closest match to the homepage promise |
| `/compare/loom` | Loom alternative | free Loom alternative, Loom alternative Windows | Strongest intent page; prices checked 5 Nov 2026 |
| `/compare/screen-studio` | Screen Studio alternative for Windows | Screen Studio Linux | Correctly leads with platform |
| `/compare/scribe` | Scribe alternative | Scribe alternative for desktop, screenshot vs video | Correctly leads with output format |
| `/compare/screen-recording` | Walkcast vs screen recording | screen recorder vs generated walkthrough | Supports the Loom page; do not let them compete for "Loom alternative" |
| `/lab` | AI browser agent testing | browser agent regression testing, agent observability | **`observability` did not appear anywhere on the page** (fixed today, see §5) |
| `/pricing` | is Walkcast free | Walkcast pricing, MIT licence | Answers in the first line; keep |
| `/faq` | Walkcast questions | login recording, password handling | Keep; this is the answer-engine surface |
| `/download` | download Walkcast | Windows installer, Linux AppImage | Keep |

Deliberate non-targets: "AI video generator", "AI website builder", "screen recorder". Walkcast records a
real browser visit; ranking for generator queries would bring traffic that bounces.

## 4. Indexing gap register

Severity is about effect on indexing or click-through, not effort.

| # | Site | Severity | Evidence | Fix |
|---|---|---|---|---|
| G1 | Lattice | **P0** | 6 of 7 `/stack/*` pages render the slug into the H1 and description: "A rag application stack.", "A ai agent stack.", "A ai chatbot stack.", "A ai search stack.", "A llm api stack." and "The default-case stack for a ai agent". These strings are the SERP snippet | Store a display label with correct article and casing per stack; never derive copy from the slug. `voice` and `finetuned` are already correct |
| G2 | Lattice | **P1** | 270 of 286 URLs share `<lastmod>2026-09-01</lastmod>`. That is the dataset's verification month (`datasetModified = ${AS_OF}-01`), not the build time, but editing one page's copy does not move its date either, so the field understates recent edits | Emit per-URL modification dates from the content source: an edited page moves, the rest do not |
| G3 | Lattice | **P1** | 39 alternatives pages are reachable only through their tool page; no index exists | Add `/alternatives`, grouped by layer, linked from `/compare` and the footer |
| G4 | Walkcast | **P1** | `/lab` contained zero occurrences of "observability" while the plan lists "AI agent observability" as very high | Addressed today with an FAQ that distinguishes tracing from failure evidence (see §5) |
| G5 | Walkcast | **P2** | Homepage title carries no walkthrough query | Do not change yet. Get a Search Console baseline first; a title change on the only page with history is a bet, not a fix |
| G6 | Both | **P2** | No `google-site-verification` or `msvalidate.01` tag in the HTML | Confirms verification is DNS or file based. Check which method is active before assuming a tag is missing |
| G7 | Walkcast | **P3** | `/guides` is 448 words; `/compare/screen-recording` is 499 | Fine for a hub. Leave them |

Not defects, checked and cleared: Lattice sitemap priority distribution (165 URLs at 0.6, 66 at 0.7);
Lattice `Host:` directive (Yandex-only, harmless); Walkcast's missing `/compare` hub (comparisons are
linked from three places); 39 Lattice alternatives pages being "orphans" (they are linked from their tool
page — this was the first conclusion and it was wrong until the tool page was fetched).

### Status after the changes in §5

- **G1 — fixed.** `WORKLOADS` now carries an explicit `noun` per workload ("a RAG application", "an AI
  agent", "an LLM API"), written out rather than derived, because the article depends on pronunciation
  and lowercasing the label turned RAG, AI and LLM into words. All seven prerendered pages were checked
  in the build output.
- **G2 — reclassified, not a build artefact.** 270 of the 286 URLs share `2026-09-01` because that is the
  dataset's verification month (`datasetModified = ${AS_OF}-01`), not because the build stamps today. The
  real gap is narrower and still open: editing the copy of one page does not move its date, so a sitemap
  entry can understate when the page changed. Not fixed in this pass — it needs a per-entry date in the
  data, which is a larger change than a date format.
- **G3 — fixed.** `/alternatives` lists all 39 pages, grouped by stack section, and is linked from
  `/compare` and the footer. It is derived from the same predicate that drives `generateStaticParams`, so
  the index cannot advertise a page the build does not produce.
- **G4 — fixed on Walkcast, not deployed.** See §5.

## 5. Changes made

Two repositories. Lattice is `C:\decisionb engine` (`package.json` name `lattice`, remote
`KunjShah95/lattice`); Walkcast is `C:\browser-user`.

### Walkcast (`apps/web`)

1. **`apps/web/src/content.ts`** — added `Route.updated`, an optional per-page date, and set
   `updated: "2026-11-12"` on `/lab`. This is the fix recommended for Lattice in G2, applied here first
   so the pattern is proven.
2. **`apps/web/build.ts`** — `dateModified` in JSON-LD and `<lastmod>` in `sitemap.xml` now use
   `route.updated ?? UPDATED`, so editing one page no longer dates all fourteen.
3. **`apps/web/src/content.ts`** — added one Lab FAQ, "Is Walkcast Lab a browser agent observability
   tool?", answered honestly: it keeps browser state at the moment of failure and turns it into a cause
   and a fixture, and runs alongside tracing rather than replacing it. This puts the phrase on the page,
   in the `FAQPage` JSON-LD and in `llms.txt` without misdescribing the product.

Verified after the change:

- `npx tsc -p apps/web --noEmit` — clean
- `npm run web:build` — 14 pages built
- `npx tsx --test test/web-build.test.ts` — 8/8 pass
- `dist/web/sitemap.xml`: `/lab` is `2026-11-12`, the other 13 remain `2026-11-05`
- `dist/web/lab/index.html`: the observability FAQ is present in the page and the JSON-LD

Deploying is what makes these live, then `npm run web:indexnow` announces the changed URL to Bing,
Yandex, Seznam and Naver. IndexNow cannot force Google to recrawl; URL Inspection in Search Console is
the Google path.

### Lattice (`src`)

1. **G1 — `src/lib/stacks.ts`** — each workload profile gained a `noun` field written out in full
   ("a RAG application", "an AI agent", "a voice agent", "an LLM API", "a fine-tuned model"), plus a
   `capitalized()` helper. `src/app/stack/[workload]/page.tsx` now reads the H1, the meta description
   and the JSON-LD description from `meta.noun`; `opengraph-image.tsx` reads the card title from it.
   Nothing derives copy from the slug or lowers the case of an acronym any more.
2. **G1 regression test — `src/lib/stacks.test.ts`** — every workload must start with a or an, must
   contain its own label, and must not contain a lowercased acronym. This is the test that would have
   caught "A rag application stack.".
3. **G3 — `src/lib/alternatives.ts`** — `alternativesIndex()`, the 39 pages grouped by section, built
   from the same predicate as `generateStaticParams`.
4. **G3 — `src/app/alternatives/page.tsx`** — the hub: a `CollectionPage` with an `ItemList` of all 39,
   grouped by layer, each row naming the tools it would swap to and how many of its substitutes are
   adjacent rather than real. Plus `src/app/alternatives/opengraph-image.tsx` so the page does not fall
   back to the root card.
5. **G3 plumbing** — `/alternatives` added to `src/app/sitemap.ts` (priority 0.8), to
   `staticRoutes`/`SEGMENTS_WITH_CARDS`/`INDEX_ROUTES` in `src/lib/route-metadata.test.ts`, to the
   footer's Index column, and to `/compare` as the "already decided to leave something" path.
6. **Pre-existing bug, found while verifying `src/lib/comparisons.ts`** — the `fine-tuning-frameworks`
   comparison listed `retrieval-finetuning-prompting` in `related`, which is a comparison slug, not an
   essay slug. The page silently rendered two related essays instead of three. Replaced with
   `fix-the-ranking-not-the-prompt`, which exists and argues the retrieval side. The suite was failing
   on this before any of the above.
7. **Deploy blocker found by diffing the built sitemap against the live one, then fixed: the five essays
   exist again.** The checkout was behind production by five essays —
   `/blog/continuous-batching-from-first-principles`, `/blog/when-you-do-not-need-evals`,
   `/blog/when-not-to-use-an-agent-framework`, `/blog/do-you-need-an-ai-gateway`,
   `/blog/when-not-to-use-a-vector-database` — present live but absent from every branch (`git log --all`
   found no commit for them). Recovered from production: each page's HTML was fetched, the
   `div.prose-lattice` body was converted to MDX, and the metadata (title, description, dek, date,
   reading time, layer chips, related posts) was read out of the same HTML. The five files now live in
   `src/content/blog/`, are registered in `src/lib/posts.ts`, and the generated projections
   (`essay-text.generated.ts`, `corrections.generated.ts`) were regenerated with `npm run generate`.
   Verifying this against the real pipelines mattered twice: `headings.test.ts` and `mcp.test.ts` read
   the generated file, so a naive copy of the MDX would have failed until the projection was rebuilt;
   and a bare `next build` cannot catch a page whose frontmatter does not compile.
   After recovery the built sitemap is 287 URLs — exactly the live 286 plus `/alternatives`, verified by
   diffing the two sitemaps, and every internal link on the five recovered pages resolves to a route
   that exists. Note the recovery loses whatever MDX features the pages used beyond plain prose: no
   figures or custom components were in these five (verified by enumerating the elements in their
   bodies), and markdown tables match the rest of the repo, which also does not render them.

Verified after the change:

- `npx tsc --noEmit` — clean
- `npx vitest run` — 43 files, 1188/1188 pass
- `npm run lint` — 0 errors, 6 pre-existing `no-img-element` warnings
- `npm run next:build` — succeeds; `/alternatives` and its card are prerendered static
- built `/alternatives`: `<title>` present, one `<h1>` ("What to use instead."), 190-character
  description, 39 links to alternatives pages, `ItemList` with `numberOfItems: 39`, 8 layer sections
- built `/stack/*`: "A RAG application stack.", "An AI agent stack.", "An AI chatbot stack.", "A voice
  agent stack.", "An AI search stack.", "An LLM API stack.", "A fine-tuned model stack."
- built `sitemap.xml`: 287 URLs — exactly the live 286 plus `/alternatives` (verified by diffing the
  built sitemap against the live one), the five recovered essays among them
- `npm run generate` — wrote 16 essay bodies (was 11) and 10 corrections (was 9); `generate:check`
  passes
- the five recovered essays: titles, one `<h1>` each, and all internal links resolve to routes that
  exist; `/blog` lists all five

### What actually shipped, and what the tree looked like

The plan above assumed this checkout was the origin of `main`. It was not, and the difference
mattered. Two things corrected that:

1. **The five missing essays were already on `origin/main`** — merged via PRs #5–#11 in the two
   weeks before this pass (`dd570b4..c544b3c`). The local checkout sat on `da397da`, a commit from
   before them, and contained them in no branch. The copy recovered above was rebuilt from the
   live HTML; when the rebase onto `origin/main` happened, the authored source won and the
   reconstructed files were dropped in favour of `origin/main`'s versions.
2. **The local uncommitted redesign work (your `PageHero` `/start` path, the palette changes in
   `globals.css`, the stack pages, stack builder, review pages) conflicts with those PRs on the
   same lines, in a different direction.** Per your decision, `origin/main` was kept and the
   local versions were not carried into the commit. Nothing was deleted: the local work remains
   on branch `safety/f0875b3-seo-raw` in the Lattice checkout, exactly as it was.

Both repositories were committed and pushed to `main` on 12 November 2026:

- **Lattice** `a4d24d5` — G1 H1 fix, the `/alternatives` hub (+ its entry tests, sitemap, footer,
  `/compare` and `/llms.txt` links), the `comparisons.ts` related-essay fix, and the e2e specs
  restored to `origin/main`'s versions (the exception ratchet is now empty by design). One
  follow-up note: your pre-existing deletion of `e2e/a11y.spec.ts`, `e2e/a11y-exceptions.ts` and
  `e2e/interactions.spec.ts` is undone by this; the remote fix raised the contrast tokens, so the
  suite now runs clean. If you intended those files gone for another reason, redo the delete in its
  own commit.
- **Walkcast** `250005c` — the build now supports per-route `lastmod` (`route.updated ?? UPDATED`)
  and the `/lab` observability FAQ. A further commit `1f7f05c` (hydration fix on document pages)
  was made on top of it by someone else before this pass finished; it is included in `origin/main`.
- The untracked capture files (`lint.txt`, `out.txt`, `out2.txt`, `tsc.txt` in the Lattice checkout,
  `apps/desktop/gitfile.txt` in the Walkcast checkout) were left out of the commits deliberately.

Verification before push, on the merged tree:

- `npx tsc --noEmit` — clean (after `next typegen` regenerated the route table)
- `npx vitest run` — 51 files, 1287 tests pass
- `npm run lint` — 0 errors (6 pre-existing `no-img-element` warnings)
- `npm run generate:check` — in step (16 essay bodies, 11 corrections)
- `npm run test:submissions` / `npm run budget` — both pass
- `node scripts/audit-seo.mjs http://localhost:3111 --rewrite --strict` — exit 0; 287 sitemap URLs,
  0 non-200, 287 valid JSON-LD graphs, no duplicate titles/descriptions
- live-authentic diff: the built sitemap now contains everything the deployed site publishes, plus
  `/alternatives`

Lattice CI (`ci.yml`) runs on every push to `main`: lint, the full vitest suite, the submission
harness, `generate:check`, the Worker bundle smoke test, `next:build`, the client bundle budget, and
`audit-seo --strict` against the locally booted server. Walkcast CI runs the Playwright suite.

## 6. Thirty-day order of work

Ranked by expected effect per hour. Nothing here needs new content volume.

**Week 1 — fix what is broken, measure the baseline**

1. ~~Lattice G1~~ — done, §5. Highest ratio of snippet quality to effort on either site.
2. ~~Lattice G3~~ — done, §5. It gives 39 existing pages a crawl path and a reason to rank.
3. Export GSC for both properties: Pages → Indexing, Sitemaps, Performance (queries and pages), Core Web
   Vitals, Links. Then check URL Inspection on 20 Lattice tool pages and all 14 Walkcast URLs.
4. ~~Deploy both repositories~~ — done; both are on `main`. Walkcast's IndexNow runs via GitHub from
   the Vercel production deployment. Verify the live site serves `/alternatives` (Lattice) and the
   `/lab` date change (Walkcast) once deploys finish.

**Week 2 — improve the pages that already have intent**

5. Lattice G2: per-URL `lastmod`. The scope is now known: not a build artefact, but a date that does not
   move when a page is edited. The Walkcast `Route.updated` pattern is the shape of the fix.
6. Walkcast: add a real sample output to `/guides/product-demo-video` (the page with the strongest
   commercial query).
7. Walkcast: strengthen `/guides/website-tutorial-video` with the searched modifier "website tutorial
   video maker" in the H1 or first sentence.

**Week 3 — listings and citations**

8. Work `docs/directory-submissions.md` from the top. Do the existing-listing updates before new
   submissions; an improved listing ranks and converts better than a new stub.
9. Publish one engineering article per product, each with a reproducible artefact: Lattice → "vLLM vs
   llama.cpp, measured"; Walkcast → "a browser agent that said it succeeded and had not".
10. Open PRs to two awesome-lists that accept directory contributions, after reading their CONTRIBUTING.

**Week 4 — read the data, then decide**

11. Re-export GSC. Split the 286 Lattice URLs into indexed, crawled-not-indexed and discovered-not-indexed.
    Fix the largest bucket, not the loudest page.
12. Decide the homepage title experiment (G5) on evidence, with a 28-day window and one change at a time.
13. Only then consider new routes. A new page competes with the 286 that already exist.

## 7. What the exports need to contain

For each property, from Search Console:

- Performance → Search results → Queries (28 days and 3 months), with clicks, impressions, CTR, position
- Performance → Search results → Pages, same fields
- Page indexing → the full reason breakdown, exported
- Sitemaps → submitted vs discovered vs indexed counts
- Core Web Vitals → mobile and desktop
- Links → top linking sites and top linked pages

With those, the next pass can answer four questions this document cannot: which queries already produce
impressions without clicks, which pages are crawled but not indexed, whether the two Walkcast intents
cannibalise each other, and which ten URLs deserve the next hour.
