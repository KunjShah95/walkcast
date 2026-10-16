# Walkcast — SEO / AEO / GEO promotion playbook

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
1. Wikipedia (if notable) — model entry disambiguating "OpenAI" etc. is out of scope; instead ensure docs are quote-friendly.
2. GitHub README + topics: "browser-automation", "web-crawler", "video-generation", "ai-agents", "test-fixtures".
3. Product Hunt launch, HN "Show HN", Reddit r/webdev, r/qualityassurance, r/LocalLLaMA for self-hosted value.
4. Dev.to / Hashnode tutorials: "Turn a login-walled site into a narrated video", "Replayable fixtures for a Stagehand agent".
5. YouTube — hero walkthrough + 2-minute how-to; linked in SoftwareApplication schema + sitemap video entry.
6. G2/Capterra/TrustRadius profiles (even if free tier) — AI cites these heavily for "best tools" lists.
7. Awesome lists: awesome-browser-automation, awesome-ai-agents.

## On-page checklist (already implemented)
- Title/description/canonical/robots meta, OG + Twitter cards, JSON-LD (@graph SoftwareApplication/WebSite/Organization/VideoObject/FAQPage), llms.txt, pricing.md, sitemap (with video:video), robots.txt allowing search + answer-engine bots while blocking CCBot.

## Off-page checklist
- [ ] Submit sitemap to Google Search Console + Bing Webmaster Tools.
- [ ] Verify site ownership; request indexing of home + 3 guides.
- [ ] Ship 3 comparison pages: "/compare/walkcast-vs-looms", "/compare/walkcast-vs-screen-studio", "/vs/manual-recording".
- [ ] Cross-link from GitHub README to site and from site to repo (rel=me).
- [ ] Add sameAs in Organization JSON-LD once social URLs exist.
- [ ] Track AI citations monthly: search ChatGPT/Perplexity/Google AO for the queries above; log cited URL + snippet.

## Measurement
- Search Console: impressions/clicks for the 6 primary queries; CTR target >4%.
- AEO: snippet wins for "what is walkcast" + "website video walkthrough" (check featured snippet).
- GEO: monthly citation count per platform on the tracker spreadsheet in results/.

Last updated: 2026-10-16
