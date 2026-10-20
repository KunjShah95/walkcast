# Walkcast — Google trends and autocomplete, raw dump

Pulled 2026-10-20 from Google.

This file is generated. The judgement about what to do with it lives in
`docs/SEO-KEYWORD-RESEARCH.md`; regenerate this with `node scripts/seo-report.mjs`.

## Method

Three free Google surfaces, no account and no API key:

- **Autocomplete** (`suggestqueries.google.com`) — for each seed query, the direct completions plus every
  `seed + a` … `seed + z` and `seed + 0` … `seed + 9` expansion. This is what people actually type, and it
  is the only honest source of long-tail demand available without a paid tool.
- **Trends** (`trends.google.com/trends/api`) — interest over time for keyword groups, so comparisons inside a
  group are valid (0–100 within the group, not absolute volume).
- **Related and rising queries** — the same endpoint, which returns what is climbing rather than what is big.

Volume is not available without a paid API, so this report ranks by **suggestion density** (how many seeds a
query surfaces under), **intent** and **trend**. That is a proxy for opportunity, not a search volume number.

Reproduce with `node scripts/seo-trends.mjs`; regenerate this file with `node scripts/seo-report.mjs`.

## What people search for, by seed

| Seed | Suggestions | Distinct new queries |
|---|---:|---:|
| website walkthrough video | 16 | 15 |
| product demo video | 108 | 107 |
| screen recording software | 241 | 240 |
| video from url | 249 | 248 |
| website video maker | 71 | 70 |
| record website behind login | 0 | 0 |
| narrated website walkthrough | 0 | 0 |
| automated website video | 5 | 5 |
| browser agent testing | 14 | 13 |
| ai agent testing tools | 6 | 5 |
| browser automation testing | 157 | 156 |
| ai browser agent | 147 | 146 |
| regression test fixture | 0 | 0 |
| stagehand | 276 | 275 |
| loom alternative | 82 | 82 |
| scribe alternative | 117 | 117 |
| screen studio alternative | 57 | 57 |
| tldv alternative | 8 | 7 |
| microsoft clipchamp | 301 | 300 |
| descript | 291 | 290 |
| vidyard demo | 3 | 2 |
| how to record a website walkthrough | 0 | 0 |
| create a product demo video | 12 | 11 |
| video for website onboarding | 0 | 0 |

## Keyword clusters

Grouped by the page that should win the query. *Seeds* is how many of the seed queries the phrase appeared
under — a phrase that shows up under many seeds is a demand signal, not a coincidence.

### `/compare/screen-recording` — 495 queries

| Query | Seeds | Intent |
|---|---:|---|
| 2 microsoft clipchamp | 1 | brand |
| bandicam screen recording software | 1 | category |
| best screen capture software high resolution | 1 | category |
| best screen capture software ubuntu | 1 | category |
| clipchamp features | 1 | brand |
| clipchamp for windows 7 | 1 | brand |
| clipchamp for windows 8 | 1 | brand |
| clipchamp microsoft 365 copilot | 1 | brand |
| clipchamp not working | 1 | brand |
| clipchamp windows 7 32 bit | 1 | brand |
| clipchamp windows 8.1 | 1 | brand |
| czy microsoft clipchamp jest darmowy | 1 | brand |
| descript | 1 | brand |
| descript account | 1 | brand |
| descript ai | 1 | brand |
| descript ai video | 1 | brand |
| descript ai video editor | 1 | brand |
| descript alternatives | 1 | alternative, brand |
| descript api | 1 | category, brand |
| descript app | 1 | category, brand |
| descript app for mac | 1 | category, brand |
| descript audio | 1 | brand |
| descript audio editing | 1 | brand |
| descript b roll | 1 | brand |
| descript background removal | 1 | brand |
| descript base64 | 1 | brand |
| descript billing | 1 | brand |
| descript blog | 1 | brand |
| descript blur background | 1 | brand |
| descript business plan | 1 | brand |
| descript cancel subscription | 1 | brand |
| descript careers | 1 | brand |
| descript charge on credit card | 1 | brand |
| descript company | 1 | brand |
| descript competitors | 1 | brand |
| descript cost | 1 | brand |
| descript coupon code | 1 | brand |
| descript creator | 1 | category, brand |
| descript customer service | 1 | category, brand |
| descript customer service number | 1 | category, brand |
| …and 455 more | | |

### `other` — 470 queries

| Query | Seeds | Intent |
|---|---:|---|
| 0a description 0a 0a | 1 | brand |
| 2000s screen recording software | 1 | category |
| 3rd party screen recording software | 1 | category |
| 4k video maker website | 1 | category |
| 4k watch hours meaning | 1 | — |
| 5 examples of description | 1 | brand |
| 6 de 6000 | 1 | — |
| 7 of 84 | 1 | — |
| agent desk ai browser tools | 1 | category, brand |
| agent in ai definition | 1 | brand |
| ai agents examples | 1 | brand |
| ai automation jobs | 1 | brand |
| ai bot user agent list | 1 | brand |
| ai browser agents can assist with | 1 | brand |
| ai browser agents platform | 1 | category, brand |
| ai browser for agent | 1 | brand |
| ai browser user agent | 1 | brand |
| ai browser with agent | 1 | brand |
| ai browser with agent mode | 1 | brand |
| ai companies in san diego | 1 | — |
| ai hr companies | 1 | — |
| ai in hr examples | 1 | — |
| ai user agent list | 1 | brand |
| ai vs rpa | 1 | alternative |
| alternate alternative | 1 | alternative |
| apple studio screen alternative | 1 | alternative, brand |
| auto translate website video | 1 | — |
| automate examples | 1 | — |
| automation testing near me | 1 | — |
| best high quality screen recording software | 1 | category |
| best quality screen recording software | 1 | category |
| best screen recording app 2026 | 1 | category |
| best screen recording app kaun sa hai | 1 | category |
| best screen recording app reddit | 1 | category |
| best screen recording software 2025 | 1 | category |
| best screen recording software 2026 | 1 | category |
| best screen recording software for zoom | 1 | category |
| best screen recording software ubuntu | 1 | category |
| best video maker website | 1 | category |
| best web automation testing tools | 1 | category |
| …and 430 more | | |

### `/lab` — 420 queries

| Query | Seeds | Intent |
|---|---:|---|
| 1920s stagehand | 1 | brand |
| agent browser chrome for testing | 1 | brand |
| agent browser e2e test | 1 | brand |
| ai agent based browser | 1 | brand |
| ai agent browser access | 1 | brand |
| ai agent browser automation free | 1 | brand |
| ai agent browser automation github | 1 | brand |
| ai agent browser automation open source | 1 | brand |
| ai agent browser claude | 1 | brand |
| ai agent browser cli | 1 | brand |
| ai agent browser control | 1 | brand |
| ai agent browser firefox | 1 | brand |
| ai agent browser for linux | 1 | brand |
| ai agent browser for windows | 1 | brand |
| ai agent browser google | 1 | brand |
| ai agent browser linux | 1 | brand |
| ai agent browser mcp | 1 | brand |
| ai agent browser perplexity | 1 | brand |
| ai agent browser plugin | 1 | category, brand |
| ai agent browser skill | 1 | brand |
| ai agent browser tool | 1 | category, brand |
| ai agent browser use | 1 | brand |
| ai agent browser vercel | 1 | brand |
| ai agent control web browser | 1 | brand |
| ai agent for browser automation | 1 | brand |
| ai agent for browser tasks | 1 | brand |
| ai agent headless browser | 1 | brand |
| ai agent in browser | 1 | brand |
| ai agent in chrome browser | 1 | brand |
| ai agent in your browser | 1 | brand |
| ai agent meaning | 1 | brand |
| ai agent native browser | 1 | brand |
| ai agent on browser | 1 | brand |
| ai agent testing tools | 1 | category, brand |
| ai agent that can control browser | 1 | brand |
| ai agent to automate browser | 1 | brand |
| ai agent to control browser | 1 | brand |
| ai agent to use browser | 1 | brand |
| ai agent user agents | 1 | brand |
| ai agent user experience | 1 | brand |
| …and 380 more | | |

### `/guides/product-demo-video` — 110 queries

| Query | Seeds | Intent |
|---|---:|---|
| create product demo video using ai | 2 | how-to |
| demo video examples | 2 | — |
| how to make a product demo video | 2 | how-to, question |
| product demo video examples | 2 | — |
| 3d product demo video | 1 | — |
| ai product demo video generator | 1 | category |
| ai product demo video makers in india | 1 | — |
| b2b product demo video | 1 | — |
| best product demo video | 1 | — |
| best product demo video examples | 1 | — |
| best product demo video maker | 1 | category |
| best product demo video software | 1 | category |
| best product demo video tools | 1 | category |
| best saas product demo video software | 1 | category |
| canva product demo video template | 1 | brand |
| claude product demo video | 1 | brand |
| create a product demo video | 1 | how-to |
| create a product demo video with ai | 1 | how-to |
| create product demo video ai | 1 | how-to |
| create product demo video with ai | 1 | how-to |
| create saas product demo video | 1 | how-to |
| demo video for product | 1 | — |
| demo video meaning | 1 | — |
| demo video of product | 1 | — |
| digital product demo video | 1 | — |
| figma product demo video | 1 | — |
| higgsfield product demo video | 1 | — |
| how long should a product demo video be | 1 | question |
| how to create a product demo video | 1 | how-to, question |
| how to create a product demo video with ai | 1 | how-to, question |
| how to create a saas product demo video | 1 | how-to, question |
| how to create app product demo videos in canva | 1 | how-to, category, question, brand |
| how to create product demo video using ai | 1 | how-to, question |
| how to make a demo video | 1 | how-to, question |
| how to make product demo video | 1 | how-to, question |
| how to record product demo video | 1 | how-to, question |
| imc product demo video | 1 | — |
| interactive product demo video | 1 | — |
| jira product discovery demo video | 1 | — |
| modicare product demo youtube video | 1 | brand |
| …and 70 more | | |

### `/compare/loom` — 81 queries

| Query | Seeds | Intent |
|---|---:|---|
| alternative a loom | 1 | alternative, brand |
| alternative for loom | 1 | alternative, brand |
| alternative of loom | 1 | alternative, brand |
| alternative of loom free | 1 | alternative, brand |
| alternative of loom video | 1 | alternative, brand |
| alternative to loom | 1 | alternative, brand |
| alternative to loom bands | 1 | alternative, brand |
| alternative to loom for screen recording | 1 | alternative, brand |
| alternative to loom free | 1 | alternative, brand |
| alternative to loom recording | 1 | alternative, brand |
| alternative to loom reddit | 1 | alternative, brand |
| alternative to loom video | 1 | alternative, brand |
| alternative zu loom | 1 | alternative, brand |
| alternative zu loom bändern | 1 | alternative, brand |
| alternatives to loom | 1 | alternative, brand |
| atlassian loom alternative | 1 | alternative, brand |
| best free loom alternative reddit | 1 | alternative, brand |
| better loom alternative | 1 | alternative, brand |
| boom loom alternative | 1 | alternative, brand |
| clips loom alternative | 1 | alternative, brand |
| descript vs loom | 1 | alternative, brand |
| feather and loom down alternative comforter | 1 | alternative, brand |
| knitting loom hook alternative | 1 | alternative, brand |
| local loom alternative | 1 | alternative, brand |
| loom ai alternative | 1 | alternative, brand |
| loom alternative app | 1 | alternative, category, brand |
| loom alternative appsumo | 1 | alternative, brand |
| loom alternative cap | 1 | alternative, brand |
| loom alternative chrome extension | 1 | alternative, category, brand |
| loom alternative deutsch | 1 | alternative, brand |
| loom alternative for firefox | 1 | alternative, brand |
| loom alternative for free | 1 | alternative, brand |
| loom alternative for mac | 1 | alternative, brand |
| loom alternative for ubuntu | 1 | alternative, brand |
| loom alternative free | 1 | alternative, brand |
| loom alternative free mac | 1 | alternative, brand |
| loom alternative github | 1 | alternative, brand |
| loom alternative google | 1 | alternative, brand |
| loom alternative in microsoft | 1 | alternative, brand |
| loom alternative mac | 1 | alternative, brand |
| …and 41 more | | |

### `/compare/scribe` — 80 queries

| Query | Seeds | Intent |
|---|---:|---|
| alternative of scribe | 1 | alternative, brand |
| alternative to happy scribe | 1 | alternative, brand |
| alternative to scribe | 1 | alternative, brand |
| alternative to scribe free | 1 | alternative, brand |
| alternative to scribe software | 1 | alternative, category, brand |
| alternative zu scribe | 1 | alternative, brand |
| amazon scribe alternative reddit | 1 | alternative, brand |
| best scribe alternative | 1 | alternative, brand |
| difference between scribe and transcribe | 1 | brand |
| do you need a scribe | 1 | question, brand |
| express scribe alternative | 1 | alternative, brand |
| express scribe free alternative | 1 | alternative, brand |
| free scribe alternative reddit | 1 | alternative, brand |
| groove scribe alternative | 1 | alternative, brand |
| happy scribe alternative free | 1 | alternative, brand |
| how to become a scribe | 1 | how-to, question, brand |
| how to make a homemade scribe | 1 | how-to, question, brand |
| how to make a scribe tool | 1 | how-to, category, question, brand |
| how to use a scribe | 1 | how-to, question, brand |
| how to use a scribe tool | 1 | how-to, category, question, brand |
| how to use scribe | 1 | how-to, question, brand |
| kobo scribe alternative | 1 | alternative, brand |
| logitech scribe alternative | 1 | alternative, brand |
| plastic scribe alternative | 1 | alternative, brand |
| scribe ai alternative | 1 | alternative, brand |
| scribe ai alternative free | 1 | alternative, brand |
| scribe ai documentation alternative | 1 | alternative, brand |
| scribe alternative for desktop | 1 | alternative, brand |
| scribe alternative free | 1 | alternative, brand |
| scribe alternative github | 1 | alternative, brand |
| scribe alternative in microsoft | 1 | alternative, brand |
| scribe alternative microsoft | 1 | alternative, brand |
| scribe alternative open source | 1 | alternative, brand |
| scribe alternative reddit | 1 | alternative, brand |
| scribe alternative software | 1 | alternative, category, brand |
| scribe alternative words | 1 | alternative, brand |
| scribe alternatives | 1 | alternative, brand |
| scribe alternatives for desktop | 1 | alternative, brand |
| scribe alternatives free | 1 | alternative, brand |
| scribe alternatives microsoft | 1 | alternative, brand |
| …and 40 more | | |

### `/pricing` — 39 queries

| Query | Seeds | Intent |
|---|---:|---|
| ai video maker website free | 1 | category |
| ai website video editing free | 1 | — |
| best free screen recording software 2026 | 1 | category |
| best free screen recording software 2026 with no watermarks | 1 | category |
| free screen recording software extension | 1 | category |
| free screen recording software for ubuntu | 1 | category |
| free screen recording software for zoom | 1 | category |
| free screen recording software reddit | 1 | category |
| free screen recording software unlimited time | 1 | category |
| free screen recording software windows 7 | 1 | category |
| free video from url downloader | 1 | — |
| free website video editing software | 1 | category |
| high quality screen recording software free | 1 | category |
| how much do stagehands make | 1 | how-to, question, brand |
| online website video editor free | 1 | — |
| screen recorder software price | 1 | category |
| screen recording app android free | 1 | category |
| screen recording app pc free | 1 | category |
| screen recording app windows 11 free | 1 | category |
| screen recording best app free | 1 | category |
| screen recording software best free | 1 | category |
| screen recording software free | 1 | category |
| screen recording software mac free | 1 | category |
| screen recording software online free | 1 | category |
| screen recording software pc free | 1 | category |
| screen recording software windows 10 free | 1 | category |
| screen recording software windows 11 free | 1 | category |
| screen recording software windows free | 1 | category |
| screen recording software with audio free | 1 | category |
| scribd alternative free | 1 | alternative |
| studio background screen price | 1 | — |
| video from link free | 1 | — |
| video from url free | 1 | — |
| video from website free | 1 | — |
| video maker website free | 1 | category |
| video url generator free | 1 | category |
| video url generator free online | 1 | category |
| video url maker free | 1 | category |
| website video editor free | 1 | — |

### `/compare/screen-studio` — 32 queries

| Query | Seeds | Intent |
|---|---:|---|
| alternative of screen studio | 1 | alternative, brand |
| alternative to screen studio | 1 | alternative, brand |
| alternative to screen studio for windows | 1 | alternative, brand |
| alternative to screen studio free | 1 | alternative, brand |
| best free alternative to screen studio | 1 | alternative, brand |
| best screen studio alternative | 1 | alternative, brand |
| best screen studio alternative for windows | 1 | alternative, brand |
| screen studio alternative chrome extension | 1 | alternative, category, brand |
| screen studio alternative for free | 1 | alternative, brand |
| screen studio alternative for linux | 1 | alternative, brand |
| screen studio alternative for mac | 1 | alternative, brand |
| screen studio alternative for windows | 1 | alternative, brand |
| screen studio alternative for windows free | 1 | alternative, brand |
| screen studio alternative for windows reddit | 1 | alternative, brand |
| screen studio alternative free | 1 | alternative, brand |
| screen studio alternative free mac | 1 | alternative, brand |
| screen studio alternative free reddit | 1 | alternative, brand |
| screen studio alternative github | 1 | alternative, brand |
| screen studio alternative linux | 1 | alternative, brand |
| screen studio alternative mac | 1 | alternative, brand |
| screen studio alternative mac free | 1 | alternative, brand |
| screen studio alternative macos | 1 | alternative, brand |
| screen studio alternative open source | 1 | alternative, brand |
| screen studio alternative reddit | 1 | alternative, brand |
| screen studio alternative windows | 1 | alternative, brand |
| screen studio alternatives | 1 | alternative, brand |
| screen studio cheaper alternative | 1 | alternative, brand |
| screen studio free alternative for mac | 1 | alternative, brand |
| screen studio free alternative github | 1 | alternative, brand |
| screen studio free alternative reddit | 1 | alternative, brand |
| screen studio oss alternative | 1 | alternative, brand |
| screen studio windows alternative reddit | 1 | alternative, brand |

### `/guides/website-tutorial-video` — 15 queries

| Query | Seeds | Intent |
|---|---:|---|
| website tutorial video maker | 2 | how-to, category |
| website walkthrough video maker | 2 | category |
| create website walkthrough video | 1 | how-to |
| how to make a walkthrough video | 1 | how-to, question |
| video walkthrough of website | 1 | — |
| web tutorial video | 1 | how-to |
| website guide video | 1 | how-to |
| website presentation video maker | 1 | category |
| website preview video maker | 1 | category |
| website showcase video maker | 1 | category |
| website tutorial video | 1 | how-to |
| website tutorial video template | 1 | how-to |
| website walkthrough video | 1 | — |
| website walkthrough video examples | 1 | — |
| website walkthrough video template | 1 | — |

### `/download` — 10 queries

| Query | Seeds | Intent |
|---|---:|---|
| best screen recording software for windows 7 | 1 | category |
| free screen recording software for windows 10 64 bit | 1 | category |
| screen recording software for linux | 1 | category |
| screen recording software for mac | 1 | category |
| screen recording software for windows | 1 | category |
| screen recording software for windows 10 | 1 | category |
| screen recording software for windows 11 | 1 | category |
| screen recording software for windows 8 | 1 | category |
| screen recording software for windows free | 1 | category |
| top 5 free screen recording software for windows | 1 | category |

### `/faq` — 5 queries

| Query | Seeds | Intent |
|---|---:|---|
| can i embed youtube videos on my website | 1 | question, brand |
| what 9*9 | 1 | question |
| what do stagehands do | 1 | question, brand |
| what video maker do youtubers use | 1 | category, question, brand |
| why automation testing | 1 | question |

### `/guides/narrated-website-walkthrough` — 2 queries

| Query | Seeds | Intent |
|---|---:|---|
| auto caption website video | 1 | — |
| screen recording software with voice over | 1 | category |

## Trend interest

Indices are relative inside each group (0–100 is the group's peak). A group is only comparable with itself.

_Captured from trends.google.com on 2026-10-20, before the IP was rate-limited (HTTP 429) by the Trends data endpoints. Indices are relative within each group: 0-100 is that group's own peak, so only groups are comparable with groups._

### walkthrough-video

| Keyword | Average interest | Peak | Last point | 12-month total |
|---|---:|---:|---:|---:|
| loom | 71.5 | 100 | — | 3789 |
| scribe | 34.8 | 50 | — | 1847 |
| screen recording software | 1.3 | 2 | — | 68 |
| product demo video | 0.9 | 2 | — | 48 |
| website walkthrough video | 0 | 0 | — | 0 |

### walkthrough-howto

| Keyword | Average interest | Peak | Last point | 12-month total |
|---|---:|---:|---:|---:|
| how to record website | 31.9 | 100 | — | 1693 |
| explainer video | 23.4 | 35 | — | 1239 |
| website tutorial video | 12.5 | 58 | — | 665 |
| create product demo video | 0.2 | 1 | — | 9 |

### agent-testing

| Keyword | Average interest | Peak | Last point | 12-month total |
|---|---:|---:|---:|---:|
| playwright | 60.5 | 100 | — | 3209 |
| test automation | 14.5 | 33 | — | 768 |
| regression testing | 4.4 | 8 | — | 235 |
| ai agent testing | 2.4 | 5 | — | 129 |
| browser agent testing | 0 | 1 | — | 2 |

**Not captured in this run:**

- browser-agents (browser agent, ai agent, browser automation, ai browser, stagehand)
- video-tools (loom, descript, vidyard, screen studio, tldv)
- video-tools-2 (clipchamp, obs studio, screenflow, veed, kapwing)
- related and rising queries for every seed

## Related and rising queries
