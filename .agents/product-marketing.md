# Product marketing context

Read this before writing or changing any copy for Walkcast. It is the brief the `copywriting` skill
checks for, so an agent that only has the skill still starts from the facts rather than from blank
page.

## The product

Walkcast is a free, MIT-licensed desktop app (Windows, Linux) that turns
one URL into a video tour of a website. A real Chromium browser signs in, follows links across the
site, scrolls each page, and hands back the whole visit as an MP4 with WebVTT captions, a plain-text
transcript, a page list with HTTP status, and an optional voice-over.

The second product, **Walkcast Lab**, is the same recorder aimed at teams building browser AI
agents: a failed run becomes a cause, the evidence behind it, and a replayable regression fixture.

## Audiences

Two, equally weighted. Neither is secondary.

- **Walkthrough makers** — founders, marketers, PMs. They paste a link and want something shareable
  without writing a script, filming themselves, or booking a slot to re-record after a release.
- **Agent engineers** — teams shipping browser AI agents. They want to know why a run failed, and
  whether the next version of the agent fixed it or broke something else.

## The one idea

Every line of narration and every failure cause comes from what the browser actually did and the
application's real state. Not from a script, not from the agent's claim, not from an LLM judge.
Causes the rules cannot explain stay marked `unexplained` rather than being guessed.

Two jobs, one recorder. One URL to a result.

## The offer

Price is zero and it stays zero. MIT licensed, no paid tier, no seat limit, no usage meter, no
watermark, no trial that expires. The only costs are the download, about 600 MB of disk, and the CPU
for the minute or two a recording takes.

## Proof that exists

- A real end-to-end demo recording: `apps/web/public/assets/demo.{mp4,webm,vtt}` plus a poster.
- Real experiment results in `results/`, read by `siteFacts()` in `apps/web/build.ts`.
- The source, public: github.com/KunjShah95/walkcast.
- Competitor prices with the date they were checked, in `COMPARES` (`apps/web/src/content.ts`).

## Proof that does not exist

**No testimonials, no customer logos, no usage numbers, no conversion data.** Never invent them. If
a line needs a number we do not have, write the mechanism instead: "a six-page site records and
encodes in under a minute on an ordinary laptop" is supportable; "10,000 teams use Walkcast" is not.

## Claims you may not make without new evidence

- That the tool is faster, cheaper or better than a competitor by a quantified margin. We publish
  competitor prices with a checked-on date; we do not publish our own performance claims.
- That a recording can bypass a CAPTCHA or a second-factor prompt. It stops and tells the user.
- That Walkcast records desktop applications, games, or multiple windows at once. It records
  websites and web apps, in its own browser.
- That Walkcast submits forms. It never does, after sign-in it only follows ordinary links.
- Any claim about "AI-powered" narration quality, accuracy percentages, or time saved. The
  narration is derived from the trace; that is the claim, and it is enough.

## Voice

Plain, declarative, specific. Short sentences that can be proven. The house style is closer to a
good README than to a landing page.

- Use the product's own nouns: **the visit**, **the walkthrough**, **the recorder**, **the
  narration**, **the trace**, **the fixture**. They are not interchangeable.
- Address the reader's real doubt in their words ("Can it record pages behind a login?").
- Name the mechanism when a claim needs backing: "held in memory for the run, then dropped".
- British spelling, full stops, no exclamation marks.
- One idea per paragraph. One punchy line per section, not one per sentence.
- **The author's own voice is written down.** `docs/launch/source/voiceover.py` holds the launch
  film's narration, and it is the most human copy in the repo: "Every launch needs a walkthrough.
  Nobody enjoys making it." "It never bypasses a captcha. It stops, and says so." "Real browser.
  Real state. Real evidence." When a line on the site needs to sound like a person rather than a
  product page, write from that file instead of inventing a tone.
- The user language to write in is measured, not guessed: `docs/SEO-KEYWORD-RESEARCH.md` holds
  2,161 real Google autocomplete suggestions. The pages and section headings are already aimed at
  the modifiers people actually type ("how to make a product demo video", "loom alternative for
  windows"), so use those words rather than the ones a marketer would choose.

## Where copy lives, and the constraint that governs it

`apps/web/src/content.ts` is the single source of truth for everything that also has to exist as
data: route titles and meta descriptions, the FAQ answers, the guide steps, the comparison tables
and the facts-with-sources. The same strings render on the page, emit as JSON-LD (`FAQPage`,
`HowTo`, `speakable`), and are copied into `llms.txt`, `llms-full.txt` and `pricing.md` at build
time.

The landing page's own section copy lives in the section components under `apps/web/src/sections/`
(`Hero.tsx`, `Plain.tsx`, `Proof.tsx`, `Switch.tsx`, `Story.tsx`, `More.tsx`), one file per group of
sections. `apps/web/src/pages/` holds the document pages.

Consequences, all of them real:

- **Editing an FAQ answer changes the structured data and the machine-readable files with it.** They
  are meant to drift together, never apart.
- **A page title and its meta description are usually the only thing a search engine shows.** Write
  them for the query, then read them as a sentence.
- **The `description` fields on `ROUTES` are not decoration.** They are the ad copy for the
  search result.
- After changing copy, bump `UPDATED` in `content.ts`. It drives `dateModified` and the sitemap's
  `lastmod`.
- Keep competitor prices and their `priceChecked` dates current. They are published as sources and
  a stale date is a credibility problem.

## Copy rules for this repo

The `copywriting` skill's anti-AI-tell list applies here, with these repo-specific readings:

- **No stacked negations.** "No camera, no microphone, no editing" is out. One absence is fine
  ("Nothing to film"); a list of them reads as machine-written. State what happens instead.
- **No contrast reveals.** "Everything a walkthrough needs. Nothing it doesn't." is out. Say what
  the thing is.
- **The "Not a ..." list on the landing page is allowed to keep its negative labels.** They name
  the reader's misconception, which is their job, and the section only works as disambiguation
  because it sits between two positive lists. Its *bodies* must state the positive directly.
- **No em dashes in headlines, subheads, ledes or meta descriptions.** They are fine in body copy
  and in tables.
- **No colon reveals** ("The result? 3x faster"). "Short answer:" on the document pages is a
  deliberate label for answer engines and stays.
- **Swap test.** If Loom, Screen Studio or Scribe could publish the line unchanged, rewrite it or
  find the differentiator. Example of a line that passes: "The narration is written from what the
  browser did, so it cannot invent a feature."

## Learnings

Decisions already made, so they are not re-proposed as new ideas:

- **2026-10-21 — The hero's third line is "Nothing to film."** It replaced "No camera. No editing.",
  which was a stacked negation. It also cannot be written by a competitor that is a filming tool.
- **2026-10-21 — The bento headline's second line is "Recorded in one run, on your own machine."**
  It replaced "Nothing it doesn't.", which was a contrast reveal.
- **2026-10-21 — Free is stated as "MIT licensed, one price, every feature."** Enumerating what
  the free tier lacks ("no paid tier, no seat limit, no usage meter") read like a contract's
  exclusion list and lost the point.
- **2026-10-21 — The pricing page's short answer leads with "one download, every feature, no trial
  that expires."** The table immediately below it already answers seats, recordings per day, pages,
  watermark and disk, so the paragraph stopped repeating them.
- **2026-10-21 — Two audiences, one page, and neither is a section for the other.** The Lab gets
  its own section and its own card, and the recorder card stays addressed to makers. Do not merge
  them into one generic "for teams" pitch.
- **2026-10-21 — The pricing page's h1 is "Walkcast pricing. The price is zero."** "Free. MIT
  licensed. No paid tier." was three stacked fragments; "the price is zero" is the house line
  (PRODUCT.md, the README) and reads as one.
- **2026-10-21 — Meta descriptions and page titles have a hard budget.** `test/web-build.test.ts`
  fails a title over 60 characters and a description over 160. Write to the budget, and run
  `npm run web:build` before calling a route done.
- **2026-10-21 — `npm run copy:check` is the standing guardrail.** It reads the built site and
  flags the same banned patterns the skill lists: contrast reveals, negation lists, colon reveals,
  puffery, hype punctuation and em dashes in short copy. Run it after any copy change.
- **2026-10-21 — `npm run copy:read [path]` prints a built page's copy in reading order.** Use it
  to read the page as a page before deciding a line is wrong. A line can pass every pattern check
  and still be the wrong sentence in the paragraph above it.
- **2026-10-22 — The hero's lede opens with the shared pain, not the mechanism.** "Every launch
  needs a walkthrough. Nobody enjoys making it." comes straight from the launch film's narration.
  The page had the how and the what, but never said why anyone would want it.
- **2026-10-22 — The landing page carries a "The old way" aside.** "Write the script, record the
  screen, retake it, record the voice, sync the captions. Then you ship one update, and it is
  already out of date." It sits under the "How it works" heading, quiet, as a hairline-ruled aside
  rather than a card, so it reads as commentary and not as a fourth step.
- **2026-10-22 — The landing page says the installers are not code-signed, before anyone
  downloads.** The hero's button goes straight to the .exe, so a warning that only lives on
  `/download` never reaches the person who needs it. Windows SmartScreen and the macOS first-launch
  block are expected, not a sign of something wrong.
- **2026-10-22 — The closing names the author and asks for the reader's context.** "Built by Kunj
  Shah. If it does not do what you need, open an issue and tell us what you were trying to do." One
  person made this, and the last thing on the page should say so.
- **2026-10-22 — The hero's trust row states facts instead of stacking absences.** It was "Free,
  MIT licensed / No account / No watermark / No seat fees". It is now "Free, MIT licensed / No
  account needed / No watermark on the video / Every seat included". A badge row still answers four
  separate questions, but it stops reading as a list of things that are missing.

## Rules that are specific to this site

- **The site's own free tier is the product.** "Free" is not a discount to mention in passing; it
  is the answer to "why should I try this?". Say what you get, then say it costs nothing.
- **Comparison pages must stay honest.** They say what the competitor is genuinely good at, price
  it with the date it was checked, and link the source. A flattering comparison gets discounted by
  engines and distrusted by readers. Do not make one look better than it is.
- **A share link is the one thing that leaves the machine.** Privacy copy must say so plainly
  rather than claiming nothing ever leaves the PC.
