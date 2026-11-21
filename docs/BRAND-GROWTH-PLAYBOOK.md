# Walkcast brand growth and outreach playbook

**Written 21 November 2026.** How to grow the Walkcast brand through search, communities and direct
outreach without inventing anything. It sits on top of [`SEO-PRIORITY-MAP.md`](SEO-PRIORITY-MAP.md) (which
page owns which query) and [`directory-submissions.md`](directory-submissions.md) (where to list the
product), and adds the layer those two lack: why people choose, where to meet them, and what to say.

## 0. What is true today, and what is not known

| Known | Not known |
| --- | --- |
| 22 prerendered pages on `walkcast.kunjshah.in`, each with its own title, canonical and structured data | Search Console impressions, clicks or positions (nobody has exported them) |
| Free, MIT licensed, no account, no watermark, Windows and Linux | Monthly search volume for any phrase |
| No testimonials, customer logos or usage numbers exist (`PRODUCT.md`) | How many people have installed it |
| Real artefacts exist: an unedited demo recording, the Lab's experiment results in `results/`, and the source | Whether any AI assistant cites the site |

Everything below is built to work inside that table. Where a plan needs a number, it says to take the
baseline first, then set the target.

## 1. The market in one page (research, 21 November 2026)

Each point names its source and how much weight it can carry.

**Interactive demos against video is a vendor argument.** Arcade, Navattic, Storylane, Supademo and
Walnut each publish on it ([Arcade](https://www.arcade.software/post/video-vs-interactive-demo),
[Storylane](https://www.storylane.io/blog/interactive-demos-vs-product-videos),
[Navattic's 2026 report](https://www.navattic.com/report/state-of-the-interactive-product-demo-2026),
[Walnut](https://www.walnut.io/blog/product-demos/b2b-demo-platform-trends-2026/)), and all five sell demo
software. The figures are directional at best. *Implication:* an independent, plainly sourced page earns trust
by being the one that says so. That page is [`/guides/interactive-demo-vs-video`](../apps/web/src/pages/InteractiveVsVideo.tsx).

**"X alternatives" results are vendor-written.** The results for Guidde, Arcade, Supademo and Scribe
alternatives are mostly pages by competitors ([Supademo's Guidde alternatives](https://supademo.com/blog/guidde-alternatives),
[Arcade's own alternatives page](https://www.arcade.software/post/arcade-alternatives-2026),
[Guidejar](https://www.guidejar.com/alternatives/arcade)), and the prices they quote disagree with each other.
*Implication:* a free, open-source alternative with prices read from the vendor's own page and a date beside
them is a different and more credible result. Shipped: `/compare/guidde`, `/compare/supademo`, `/compare/storylane`
and the `/compare` index.

**AI answers pick few sources.** A 2026 line of research frames citation as head-to-head competition for a handful
of slots ([arXiv 2605.25517](https://arxiv.org/html/2605.25517)), separates being selected from being used in
the answer ([arXiv 2604.25707](https://arxiv.org/html/2604.25707)), and finds AI answers lean toward established
sources over fresh ones ([arXiv 2601.16858](https://arxiv.org/pdf/2601.16858)). Commercial analyses report that
ChatGPT leans on Wikipedia, Google's AI products on Reddit and Perplexity on review and expert sites
([Search Engine Land](https://searchengineland.com/how-to-get-cited-by-ai-seo-insights-from-8000-ai-citations-455284)).
These are correlations from a few engines, not a recipe. *Implication:* an answer-first opening paragraph on
every page (already the house style), claims with a source beside them, and presence in the places AI engines
read: the GitHub repo, real discussions, and independent review pages. Not tricks.

**Browser-agent testing is an active, under-served topic.** Browserbase documents its own regression evals
([Stagehand evals](https://docs.stagehand.dev/v3/basics/evals)) and names the core problem: websites change,
traffic gets blocked and tasks go out of date ([Browserbase](https://www.browserbase.com/blog/evaluating-browser-agents)).
Braintrust argues a failed run can mean an agent regression, a site change or an outdated success condition, and that
text-only checks miss browser failures ([Braintrust](https://www.braintrust.dev/articles/how-to-evaluate-web-agents)).
A 2026 post lists selector drift, login state, modal interruptions, rate limits and irreversible actions as the
failures benchmarks skip ([FutureAGI](https://futureagi.com/blog/evaluating-browser-use-agents-2026/), an opinion
piece). *Implication:* Lab's classified causes and "unexplained stays unexplained" rule answer exactly the question
these writers pose. The guides `/guides/stagehand-evals` and `/guides/how-browser-agents-fail` own it.

**Launching developer tools rewards substance.** Recurring advice across 2026 write-ups: a plain `Show HN:` title,
no signup wall before trying the product, the repository linked, the author present in the comments, a weekday
post, and a different angle for each launch. New accounts can be restricted from posting. Product Hunt is
contested as a channel for technical tools, and vote-gathering schemes are a weak bet. Most of this is anecdote
from people selling launch advice ([a typical list](https://dev.to/lightningdev123/beyond-product-hunt-a-technical-launch-guide-for-2026-i2j)).
*Implication:* Walkcast already has the two things Show HN readers reward, no account and an open repo. The work is a
launch post that is technical and specific.

## 2. Why people choose: the psychology, used honestly

These are well-established findings about how people decide. Each row says how it shapes Walkcast's pages and
messages, and the line it must not cross.

| Principle | What it means here | Do this | Never do this |
| --- | --- | --- | --- |
| **Effort aversion** (people avoid work, especially work they expect to be tedious) | Making a walkthrough is a chore people postpone | Lead every page with the shortest path: "Paste a link." Show the result before the steps | Hide the install step or the Windows/Linux limit to make it look effortless |
| **Loss aversion** (a loss weighs more than an equal gain) | A demo that is out of date quietly costs trust | Name the cost: "demo debt". Show a tour regenerated after a release | Invent a loss ("you're losing customers right now") |
| **Pratfall effect** (admitting a flaw can raise credibility if the person is competent) | Comparison pages that say where others win are believed more | Keep "Where Guidde is better" above the table; state what Walkcast cannot do | Rig the table so Walkcast wins every row |
| **Social proof, without fake numbers** | There are no testimonials or counts to cite | Use proof anyone can check: the open repo, dated releases, an unedited recording, real Lab results | Invent reviews, logos, download counts or "trusted by" claims |
| **Reciprocity** (a favour invites goodwill) | Value first makes an ask feel fair | Give a free tour, a dataset or a correction before asking for anything | Ask for a link or a share in the first message |
| **Authority through specificity** | Dates, sources and exact figures read as expertise | "Prices checked 20 November 2026, on the vendor's own page" | A statistic without a source for its exact context |
| **Commitment and consistency** (a small yes leads to a larger one) | The first recording is the hook | Get a person from download to a first recording of their own site fast; the next steps follow | A forced email wall before the download |
| **Identity** (developers pick tools that fit who they are) | "Free, MIT, runs on my machine, no account" is an identity signal for this audience | Say it plainly and early, with the licence link | Wrap it in marketing language, which this audience reads as a red flag |
| **Cognitive ease** | Plain words are believed more than clever ones | Short sentences, one idea per paragraph, no filler | Jargon to sound technical |

The common thread is that every lever above is also true. If a message only works because the reader is misled,
it is out of bounds here: it breaks the product's own principle that nothing is invented, and an audience of
developers and engineers finds it quickly.

## 3. Positioning

**Two audiences, one recorder** (`PRODUCT.md`): people who need a video of a website, and people who test browser
agents. Keep them on separate pages and separate outreach lists. A message to one that mentions the other reads as
unfocused.

| | Walkthrough makers | Agent engineers |
| --- | --- | --- |
| Job | Show a website without filming a screen | Know why an agent run failed and keep it as a test |
| Words they search | video tour of a website, product demo video, Loom alternative | browser agent testing, Stagehand evals, agent regression |
| What earns trust | A real unedited recording, prices with dates | A classified cause with trace evidence, "unexplained" kept honest |
| Proof available now | The demo recording, the comparison pages | `results/` experiment data, the open source repo |
| Where they are | Search, Product Hunt, founder communities, dev.to | GitHub, Hacker News, evals writers, Discord and Slack of agent frameworks |

One-line definitions to reuse everywhere: *"Paste a link, get a narrated video tour of your website."* and
*"Find out why a browser agent run failed, and keep it as a test."*

## 4. The content engine

Three clusters, each page owning one intent. Status as of 21 November 2026.

| Cluster | Page | Intent | Status |
| --- | --- | --- | --- |
| Make a video | `/guides/product-demo-video`, `/guides/website-tutorial-video`, `/guides/narrated-website-walkthrough` | how to make it | Shipped |
| Choose a tool | `/compare` and `/compare/{loom,screen-studio,scribe,guidde,supademo,storylane,screen-recording,open-source-alternatives}` | which tool | Shipped |
| Decide the format | `/guides/interactive-demo-vs-video` | interactive or video | Shipped |
| Agent reliability | `/lab`, `/guides/stagehand-evals`, `/guides/how-browser-agents-fail` | why a run failed | Shipped |
| **Next: arcade** | `/compare/arcade` | Arcade alternative | Blocked: published sources disagree on Arcade's prices. Read the vendor's page first, then write it |
| **Next: tella** | `/compare/tella` | Tella alternative | Data exists in the roundup; write when the roundup's dates are refreshed |
| **Next: data** | `/lab/results` | the numbers behind the failures | Build from `results/`; publish the method, the scripted-agent caveat and a CSV |
| **Next: use cases** | `/guides/release-notes-video`, `/guides/onboarding-tour-video` | per-job how-to | Write after the Search Console baseline shows which phrase is real |

Rules the existing pages already follow, kept: one intent per URL, the answer in the first paragraph, a dated
source beside every third-party fact, and no keyword stuffing. Add a page only when Search Console shows demand
for its phrase or when it is the only honest answer to a question people ask.

### Link-worthy assets, in order of effort

1. **The Lab dataset** (`/lab/results`). Original data is the one thing other writers have to cite you for. It
   needs a method section and the caveat that the agents are scripted. Do not publish it without both.
2. **Free tours of open-source documentation.** Record a tour of a project's docs site and offer it to its
   maintainers. Only for sites whose owners say yes (Walkcast records sites you own or are authorised to test), so
   the offer comes first and the recording second.
3. **A correction-friendly comparison policy.** A visible line on `/compare`: "If a fact about your product is
   wrong, tell us and we will fix it within seven days." It invites the vendor's own staff to link back.

## 5. Outreach

Principles for every message: one reader, one reason, one small ask, a way out. Value goes in the first lines. No
tracking pixels. No attachments. Two follow-ups at most, a week apart. Real name, real address.

| Segment | Why they would care | The offer | The ask |
| --- | --- | --- | --- |
| Maintainers of open-source projects | Their docs have no video tour | A finished tour of their docs, free, once they say yes | Feedback, never a link |
| Browser-agent and eval writers | They already write about why agents fail | The failure taxonomy and the dataset, with method | Whether the classification matches what they see |
| Authors of "Loom/Guidde/Scribe alternatives" lists | Their reader wants options | A factual two-line entry with dated prices and a licence link | Inclusion if it fits, and corrections if it does not |
| Founders and PMs shipping weekly | Their demos go stale | A regenerated tour of their public site, once they confirm they own it | A reply with what was wrong or missing |
| Newsletter and podcast hosts for developer tools | Their audience likes a tool with a clear point of view | A short brief and the repo | Nothing beyond reading it |

Templates are in [`outreach/templates.md`](outreach/templates.md). The tracker is
[`outreach/outreach-tracker.csv`](outreach/outreach-tracker.csv).

**Channel rules.** Prefer public, welcome places over private inboxes: a GitHub discussion where the project invites
them, a community thread whose rules allow it. Read each community's self-promotion rules before posting and follow
them, including any account-age requirement. Cold email to a named person is the last resort. Where it is used,
identify the sender, say why this person, and make opting out one reply. Email law differs by country, so check it
before any bulk send; this file is not legal advice.

## 6. Launch sequence

Do these in order. Each step needs the one before it.

| Phase | Do | Finished when |
| --- | --- | --- |
| **0. Baseline** | Export 90 days of Search Console queries and pages. Connect Bing Webmaster Tools. Note which site analytics events exist (`demo_play`, `demo_complete`, downloads). Run the AI-citation sample (section 7) once | The baseline sheet exists, with dates |
| **1. Foundations** | Submit to the directories in `directory-submissions.md`. Request recrawl for the seven new URLs. Publish the correction policy line | Each submission has a date and a status in the tracker |
| **2. Show HN** | A plain `Show HN: Walkcast, paste a link and get a narrated video tour of your site (free, MIT)` post on a weekday. The first comment explains how it works, what it cannot do (no click-through demos, desktop capture) and links the repo. The author stays in the thread | Every technical question in the thread has an answer |
| **3. Data** | Publish `/lab/results` with its method and caveat. Post it where agent-reliability work is discussed, as a result, with the repo | At least three writers in the segment have been sent it |
| **4. Partnerships** | Offer the open-source documentation tours (section 4), one per week | Each maintainer who said yes has their tour |
| **5. Review** | Compare Search Console against the baseline. Keep what moved, drop what did not | A one-page review, with the next quarter's choices |

Product Hunt is optional. If used, launch once, with a different angle from Show HN, and answer every comment. Do
not organise votes.

## 7. Measuring it

**Search.** Search Console export by query and page: impressions, clicks, CTR, average position. Weekly for the new
`/compare/*` pages for the first six weeks, then monthly.

**AI citations.** Monthly, by hand. Twenty fixed queries (the eight in `SEO-PRIORITY-MAP.md`, plus "interactive demo
vs video", "Guidde alternative", "Supademo alternative", "Storylane alternative", "browser agent testing" and so on),
asked in each assistant you care about. Record the date, the engine, the query, whether Walkcast was named, and the
URL cited. Sample in the same way each month so changes mean something.

**Outreach.** Every link carries `?utm_source=<segment>&utm_medium=outreach&utm_campaign=<yyyy-mm>`. The tracker
holds one row per contact: segment, date sent, what was offered, reply, outcome. Reply rate is the measure, and
links earned come second. A message that earns a thoughtful "no" has done its job.

**Product.** Downloads, first recording completed, and a second recording within a week. That last number says
whether the product earned the click, and it is the one to protect.

Set a target for any of these only after the baseline exists.

## 8. What not to do

- Invent reviews, ratings, logos, user counts, quotes or benchmark figures.
- Buy or organise votes, upvotes, stars or comments.
- Post as a fake customer, or ask staff to praise the product without saying who they are.
- Use a competitor's name in a way that implies endorsement. Comparison pages use names to describe, state
  facts with a source and a date, and offer corrections.
- Send the same message to a hundred people. A smaller list written one at a time beats it.
- Quote a statistic that cannot be traced to a page whose method was read.

## 9. Weekly rhythm

- **Monday.** Read last week's Search Console movement and the tracker. Pick one page to improve or one segment to write to.
- **Midweek.** Write and send at most five personal outreach messages. Reply to every response within a day.
- **Friday.** Update prices or facts on one comparison page, with the date. Log what shipped in `SEO-PRIORITY-MAP.md`.
- **Monthly.** The AI-citation sample, the product measures and a one-page note on what to stop doing.
