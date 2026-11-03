---
workflow: product-launch-video
flow: automation
storyboard: yes
message: "Paste a link. Get a narrated video walkthrough of your site — free, no filming, nothing to edit."
destination: youtube
aspect: 1920x1080
language: en
audience: "developers and product people who need a demo/walkthrough video and don't want to film or edit one"
length: 45-60s
angle: "problem to solution to proof to CTA: manual walkthroughs are a pain, paste a link instead, watch a real recording happen (narration + captions), free download close"
narration: yes
---

## Intent

A launch/promo video for Walkcast — a free desktop app (Windows/Linux) that records a narrated
video walkthrough of any website: a real headless browser signs in, clicks through pages, and the
result is an MP4 with captions, a transcript, and a spoken voice-over. Sell the product, not a
site tour: the audience is developers and product folks who currently film and edit these
walkthroughs by hand and would rather not. Tone: confident, a little playful, fast-paced — closer
to how Claude/Anthropic's own product launch videos feel (clean, modern, software-forward,
no stock-photo aesthetic) than a corporate explainer.

## Assets

- https://walkcast.kunjshah.in — capture this for brand tokens, fonts, colors, and real product
  screenshots/UI.
- apps/web/public/assets/demo.mp4 / demo.webm / demo.vtt — the real recorded demo clip and its
  captions already used on the marketing site; the video's "proof" beat should use real footage
  from this, not an invented recreation.
- apps/web/public/assets/logo.png — brand mark.

## Customizations

- Narration voice: HeyGen TTS (signed in, free OAuth usage), confident/clear tone matching the
  product's own copy voice.
- Close on the free-download CTA (Windows + Linux, MIT licensed, no watermark) — matches the
  site's own hero trust row.

## Notes

- No stock-photo aesthetic. Typographic, software-forward, dark-first if the captured brand tokens
  support it.
- The real demo recording (`demo.mp4`) is the actual product in action — prefer it over a
  recreated/mocked UI for the proof beat, for honesty and because it's real footage already
  available.
