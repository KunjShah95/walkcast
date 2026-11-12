# Directory submissions — tracker and copy

Two products, one rule: update an existing listing before creating a new one, and never pay for a link
that is presented as an editorial listing.

Nothing in this file is a claim that a submission has been made or accepted. `Status` starts at `todo`
for everything except the listings already known to exist.

## How to use this

1. Work top to bottom. Priority is about fit and effort, not fame.
2. Read the destination's submission rules before submitting. Several of these reject directory-style
   products outright, and a rejection costs more time than a skip.
3. Use the same name, tagline and URL everywhere. Consistency is what makes a brand entity legible to
   search engines; a different description on every site makes two products look like twenty.
4. Tag every outbound link so referral traffic is attributable: `?ref=producthunt`, `?ref=peerlist`,
   `?ref=devto`, `?ref=hn`. Without that, a listing that works looks identical to one that does not.
5. Record the resulting public URL in the tracker. A submission without a live URL is not a citation.

## Tracker

### Lattice

| # | Priority | Channel | Submit URL | Angle | Status |
|---|---|---|---|---|---|
| L1 | P0 | Hacker News (Show HN) | https://news.ycombinator.com/submit | "Show HN: I indexed 112 AI infrastructure tools by stack layer, with a skip-when for each" | todo |
| L2 | P0 | GitHub awesome-lists | Confirm each list's CONTRIBUTING first | Curated AI infrastructure resources, one PR per list, no bulk blasting | todo |
| L3 | P0 | DEV Community | https://dev.to/new | Technical article that uses the index as evidence, links the specific comparison page | todo |
| L4 | P1 | Peerlist | https://peerlist.io | Existing project listing: sharpen the description and the outbound link | **existing — update** |
| L5 | P1 | Product Hunt | https://www.producthunt.com | "A map of the AI infrastructure stack" — directory products are a hard sell here; lead with the problem | todo |
| L6 | P1 | Hashnode | https://hashnode.com | The same article as L3, rewritten for a different audience, canonical to the Lattice post | todo |
| L7 | P1 | r/LocalLLaMA | https://www.reddit.com/r/LocalLLaMA/ | Inference and serving discussion, not a link drop. Read the self-promotion rules first | todo |
| L8 | P2 | AlternativeTo | https://alternativeto.net | Only if a category genuinely fits; a directory is not an app alternative | todo |
| L9 | P2 | AgentIndex | **confirm the URL** | Developer-oriented AI infrastructure discovery — the best topical fit if the site is live | todo |
| L10 | P2 | AI For Developers | **confirm the URL** | Developer AI discovery | todo |
| L11 | P2 | r/MachineLearning | https://www.reddit.com/r/MachineLearning/ | Research-adjacent framing only; this subreddit rejects tool promotion | todo |
| L12 | P3 | Generic AI directories | — | Low editorial value, high volume. Skip unless a specific one sends referral traffic | skip |

### Walkcast

| # | Priority | Channel | Submit URL | Angle | Status |
|---|---|---|---|---|---|
| W1 | P0 | GitHub repository | https://github.com/KunjShah95/walkcast | Topics, description, README first screen, release notes. The repo is the landing page for developers | todo |
| W2 | P0 | DEV Community | https://dev.to/new | "A browser agent that reported success and had not" — reproducible failure, then the fixture | todo |
| W3 | P0 | Hacker News (Show HN) | https://news.ycombinator.com/submit | "Show HN: Turn a failed browser agent run into a replayable regression test" | todo |
| W4 | P1 | Product Hunt | https://www.producthunt.com | **Already launched.** Improve the existing listing; a duplicate launch is a rule violation | **existing — update** |
| W5 | P1 | Peerlist | https://peerlist.io | Developer tool listing, Lab as the lead capability | todo |
| W6 | P1 | r/QualityAssurance | https://www.reddit.com/r/QualityAssurance/ | Regression testing framing. Show the fixture format, not the marketing page | todo |
| W7 | P1 | Playwright / browser-automation communities | Confirm the current home of each community | Reproducible failures from real Playwright-driven agents | todo |
| W8 | P1 | Hashnode | https://hashnode.com | Lab walkthrough with the simulator output | todo |
| W9 | P2 | There's An AI For That | https://theresanaiforthat.com | Browser automation and AI testing categories | todo |
| W10 | P2 | Toolify | https://www.toolify.ai | Broad AI directory; expect little qualified traffic | todo |
| W11 | P2 | AgentFirst Directory | **confirm the URL** | Has Browser Automation and Agent Testing & QA categories — strongest fit if live | todo |
| W12 | P3 | Generic "AI tool" directories | — | Skip. They attract other submitters, not users | skip |

## Submission copy

### Lattice — short

> **Lattice — AI Infrastructure Index**
> A curated index of the infrastructure behind production AI systems: 112 tools across 10 stack layers,
> each with when to use it and when to skip it.

### Lattice — long

> Lattice is a curated index of the infrastructure behind production AI systems.
>
> 112 tools are organised by the layer they occupy — inference and serving, routing and gateways,
> retrieval and vector stores, fine-tuning, agent frameworks, orchestration, guardrails, prompting,
> evaluation and observability. Each entry states what the tool is, when to use it, when to skip it, its
> licence, its cost model and its alternatives.
>
> Beyond the list: 16 engineering comparisons, workload stacks for RAG, agents, chatbots, voice and
> search, symptom-first troubleshooting pages, and a stack builder that recommends one pick per layer for
> a described system.
>
> The index is independent, not affiliated with Lattice the HR software company or Lattice Semiconductor,
> and publishes its inclusion rules and its known errors.
>
> Website: https://lattice.kunjshah.in
> Source: https://github.com/KunjShah95/lattice

### Walkcast — short

> **Walkcast — website walkthroughs and browser-agent regression tests**
> Paste a link and a real browser visits your site, records the visit and returns a narrated MP4 with
> captions and a transcript. The same recorder powers Lab, which turns a failed browser agent run into a
> classified cause and a replayable fixture.

### Walkcast — long

> Walkcast is a free, MIT-licensed desktop app for Windows and Linux that makes a video tour of a website
> from a single link.
>
> A real Chromium browser opens the page, signs in the way a first-time user would, visits up to 30 pages
> and records the visit. The output is one MP4 with a spoken voice-over, WebVTT captions, a transcript,
> the narration as a WAV file, and a list of every page visited with its HTTP status. Sign-in pages are
> supported with a test account you provide; the password is never written to disk.
>
> Walkcast Lab is the second half, built on the same recorder. It takes a failed browser-agent run,
> classifies why it failed from the browser's own trace — the page, the click, what the site answered —
> and freezes it into a fixture you can replay. Repeated trials compare a base agent against a candidate
> with 95% Wilson score intervals, so a real regression is separated from noise. It works with agents
> built on Playwright, Stagehand or browser-use.
>
> Walkcast records your website, not your screen, and does not edit video. There is no paid tier.
>
> Website: https://walkcast.kunjshah.in
> Source: https://github.com/KunjShah95/walkcast

## Rules that keep this worth doing

- **No paid links presented as editorial.** Paid placement is advertising; label it or skip it.
- **No duplicate launches.** One Product Hunt launch per product. Improving a live listing is allowed and
  usually outperforms a new one.
- **No review fabrication.** No invented user counts, ratings, testimonials or "trusted by" claims. Every
  published number must be reproducible from the product or its source.
- **One submission per list, read the rules first.** Awesome-list PRs that ignore CONTRIBUTING get closed
  and burn the account's credibility with that maintainer.
- **Measure referral traffic, not link count.** Ten listings that send nobody are worse than two that send
  a hundred developers, because the ten cost the same hours.

## After the submission

For each live listing, record in the tracker: the public URL, the date, the tagged link used, and the
referral sessions and sign-ups it produced in the first 28 days. A listing with no referral traffic after
a month should be rewritten once, then dropped from the plan.
