import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The public site: a server-rendered landing page (full content in the HTML, no client
 * rendering needed, so search engines and AI crawlers read everything), sign-up / sign-in pages,
 * and the crawler files (robots.txt, sitemap.xml, llms.txt). Every URL is absolute from siteUrl.
 */
export const SITE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "site");
const NAME = "Walkcast";
const TAGLINE = "Narrated video walkthroughs of any website, from a link";
const DESCRIPTION =
  "Paste your website's link and get a narrated video walkthrough: Walkcast signs in, browses your pages and returns an MP4 with a spoken voice-over, captions and a transcript. Free and open source.";

interface Demo {
  captions: { start: number; end: number; text: string }[];
  pages: { path: string; title: string; status: number | null }[];
  durationSeconds: number;
}

function demo(): Demo {
  const path = join(SITE_DIR, "static", "demo.json");
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Demo) : { captions: [], pages: [], durationSeconds: 0 };
}

const FAQ: [string, string][] = [
  [
    "What is a website video walkthrough?",
    "A screen recording that moves through a website page by page while a voice explains what is on screen. Teams use them for onboarding, product demos, support articles, QA evidence and handing a site over to a client.",
  ],
  [
    "How do I make a narrated video walkthrough of my website?",
    "Paste the site's link into Walkcast, add the username and password you normally sign in with, confirm you are allowed to test the site, and press Record. A browser signs in, visits up to 30 pages on the same site, and you get an MP4 with a spoken voice-over, a WebVTT caption file and a transcript.",
  ],
  [
    "Can it record pages behind a login?",
    "Yes. It finds the sign-in form (including two-step email-then-password forms), signs in with the credentials you give it, and then records the pages you only see when signed in.",
  ],
  [
    "Is my password stored?",
    "No. The password is held in memory for the recording only. Traces, captions and files on disk show a placeholder instead, and the narration says that a password was entered without ever reading it out.",
  ],
  [
    "What happens with CAPTCHAs or two-factor authentication?",
    "The recorder stops and tells you. It never tries to get past a CAPTCHA, bot check or second-factor prompt.",
  ],
  [
    "Will it change anything on my site?",
    "After signing in it only follows links on the same site with ordinary page loads. It submits no forms, skips sign-out, delete, cancel and unsubscribe links, and respects robots.txt.",
  ],
  [
    "What do I get at the end?",
    "An MP4 (H.264 video with AAC narration and an embedded caption track), a WebM copy, the narration as a WAV file, WebVTT captions, and a list of every page visited with its HTTP status.",
  ],
  [
    "Does the narration make things up?",
    "No. Every line is written from what the browser actually did: which page it opened, which field it typed into, what it clicked and what the site answered. Nothing is guessed or generated about intent.",
  ],
  [
    "What else does Walkcast do?",
    "It started as a lab for browser AI agents: it records an agent's run, diagnoses why it failed with deterministic rules, and turns the failure into a reproducible regression test.",
  ],
];

const HOW: [string, string][] = [
  ["Paste the link", "The address of the page you sign in on, or any page of the site."],
  ["Add your sign-in", "Username and password, held in memory only. Confirm you may test the site."],
  ["Get the video", "A narrated MP4 with captions and a transcript, ready to share or embed."],
];

// --------------------------------------------------------------------------------- layout

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function jsonLd(value: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(value).replace(/</g, "\\u003c")}</script>`;
}

const FONTS = `
@font-face{font-family:"Geist";src:url(/assets/fonts/geist.woff2) format("woff2");font-weight:100 900;font-display:swap}
@font-face{font-family:"Geist Mono";src:url(/assets/fonts/geist-mono.woff2) format("woff2");font-weight:100 900;font-display:swap}
@font-face{font-family:"Plex Condensed";src:url(/assets/fonts/plex-condensed-600.woff2) format("woff2");font-weight:600;font-display:swap}`;

const CSS = `${FONTS}
:root{--paper:#f2f5f3;--panel:#fbfcfb;--panel-2:#eef2f0;--grid:rgb(19 70 78/.065);--ink:#13232b;--ink-2:#4f6369;--ink-3:#7d8f94;--line:#d3dcd9;--signal:#0e6b77;--signal-ink:#fff;--highlight:#ffe57a;--pass:#2c7a4c;--fail:#c2342c;--shadow:0 1px 0 rgb(19 35 43/.04),0 18px 40px -24px rgb(19 35 43/.35);
--display:"Plex Condensed","Arial Narrow",system-ui,sans-serif;--body:"Geist",ui-sans-serif,system-ui,sans-serif;--mono:"Geist Mono",ui-monospace,Menlo,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--paper:#0c1413;--panel:#111b19;--panel-2:#16221f;--grid:rgb(110 220 190/.045);--ink:#dbe6e2;--ink-2:#9db0aa;--ink-3:#6d8079;--line:#22302c;--signal:#62d0bd;--signal-ink:#06201c;--highlight:rgb(244 207 92/.28);--pass:#71d29b;--fail:#ff7b6f;--shadow:0 1px 0 rgb(0 0 0/.3),0 18px 40px -22px rgb(0 0 0/.8);color-scheme:dark}}
:root[data-theme="dark"]{--paper:#0c1413;--panel:#111b19;--panel-2:#16221f;--grid:rgb(110 220 190/.045);--ink:#dbe6e2;--ink-2:#9db0aa;--ink-3:#6d8079;--line:#22302c;--signal:#62d0bd;--signal-ink:#06201c;--highlight:rgb(244 207 92/.28);--pass:#71d29b;--fail:#ff7b6f;color-scheme:dark}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);background-size:24px 24px;color:var(--ink);font:16px/1.55 var(--body);text-rendering:optimizeLegibility}
a{color:inherit}img,video{max-width:100%;display:block}
.wrap{max-width:1180px;margin:0 auto;padding:0 max(16px,env(safe-area-inset-left))}
.mono{font-family:var(--mono)}.eyebrow{font:500 11.5px/1.2 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
h1,h2,h3{font-family:var(--display);font-weight:600;letter-spacing:-.015em;line-height:1.04;margin:0}
mark{background:linear-gradient(transparent 52%,var(--highlight) 52%,var(--highlight) 92%,transparent 92%);color:inherit;padding:0 .08em}
header.top{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--paper) 86%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
header.top .wrap{display:flex;align-items:center;gap:16px;height:60px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;font:600 19px var(--display)}
header nav{display:flex;gap:4px;margin-left:auto;align-items:center}
header nav a{font-size:14px;text-decoration:none;color:var(--ink-2);padding:7px 10px;border-radius:8px}header nav a:hover{color:var(--ink);background:var(--panel-2)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:10px;background:var(--ink);color:var(--paper);font:500 15px var(--body);padding:12px 18px;text-decoration:none;cursor:pointer;white-space:nowrap}
.btn:hover{filter:brightness(1.15)}.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}.btn.small{padding:7px 12px;font-size:14px}
.hero{padding:72px 0 40px}
.hero h1{font-size:clamp(40px,6.4vw,76px);max-width:15ch}
.hero .lede{font-size:clamp(17px,1.6vw,20px);color:var(--ink-2);max-width:60ch;margin:22px 0 28px}
.urlform{display:flex;gap:8px;max-width:640px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:6px;box-shadow:var(--shadow)}
.urlform input{flex:1;min-width:0;border:0;background:transparent;font:15px var(--mono);color:var(--ink);padding:10px 12px;outline:none}
.urlform:focus-within{border-color:var(--signal)}
.fine{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:14px;font-size:13.5px;color:var(--ink-3)}
.fine span::before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--pass);margin-right:7px;vertical-align:2px}
.stage{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,340px);gap:0;margin-top:56px;background:var(--panel);border:1px solid var(--line);border-radius:16px;overflow:hidden;box-shadow:var(--shadow)}
.stage figure{margin:0;background:#0b1214;position:relative}.stage video{width:100%;aspect-ratio:16/10;background:#0b1214}
.stage figcaption{position:absolute;right:12px;top:12px;font:500 11px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:#cfe;background:rgb(0 0 0/.55);padding:4px 8px;border-radius:6px}
.transcript{border-left:1px solid var(--line);display:flex;flex-direction:column;min-height:0}
.transcript header{padding:14px 16px;border-bottom:1px solid var(--line)}
.transcript ol{list-style:none;margin:0;padding:6px 0;overflow:auto;max-height:420px;flex:1}
.transcript li{display:grid;grid-template-columns:44px 1fr;gap:8px;padding:6px 16px;font-size:14px;cursor:pointer}
.transcript li:hover{background:var(--panel-2)}.transcript li.on{background:color-mix(in srgb,var(--highlight) 55%,transparent)}
.transcript time{font:12px var(--mono);color:var(--ink-3);padding-top:2px}
section.band{padding:72px 0;border-top:1px solid var(--line)}
section.band h2{font-size:clamp(30px,4vw,46px);max-width:22ch}
section.band .intro{color:var(--ink-2);max-width:62ch;margin:14px 0 0;font-size:17px}
.steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:36px;counter-reset:s;padding:0;list-style:none}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:20px;box-shadow:var(--shadow)}
.steps .card::before{counter-increment:s;content:"0" counter(s);font:500 12px var(--mono);color:var(--signal);display:block;margin-bottom:28px}
.card h3{font-size:22px;margin-bottom:6px}.card p{margin:0;color:var(--ink-2);font-size:15px}
.grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:36px}
.grid4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-top:36px}
.file{font:500 13px var(--mono);color:var(--signal);margin-bottom:14px;display:block}
.checks{list-style:none;padding:0;margin:28px 0 0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 28px}
.checks li{padding-left:26px;position:relative;color:var(--ink-2)}.checks li strong{color:var(--ink);font-weight:600}
.checks li::before{content:"";position:absolute;left:0;top:7px;width:14px;height:8px;border-left:2px solid var(--pass);border-bottom:2px solid var(--pass);transform:rotate(-45deg)}
.stat{font:600 44px/1 var(--display)}.stat small{font:13px var(--body);color:var(--ink-2);display:block;margin-top:8px}
.faq{margin-top:28px;border-top:1px solid var(--line)}
.faq details{border-bottom:1px solid var(--line);padding:16px 0}.faq summary{cursor:pointer;font:600 20px/1.25 var(--display);list-style:none;display:flex;justify-content:space-between;gap:16px}
.faq summary::after{content:"+";font:400 22px var(--mono);color:var(--ink-3)}.faq details[open] summary::after{content:"–"}
.faq p{color:var(--ink-2);margin:10px 0 0;max-width:72ch}
.cta{text-align:center;padding:84px 0}.cta h2{margin:0 auto;max-width:18ch;font-size:clamp(32px,4.4vw,52px)}.cta p{color:var(--ink-2)}
footer{border-top:1px solid var(--line);padding:28px 0 40px;color:var(--ink-3);font-size:14px}footer .wrap{display:flex;flex-wrap:wrap;gap:12px 24px;justify-content:space-between}
.auth{min-height:calc(100vh - 61px);display:grid;place-items:center;padding:40px 0}
.auth .card{width:min(420px,100%);padding:28px}.auth h1{font-size:34px;margin-bottom:6px}
.auth label{display:grid;gap:6px;margin-top:14px;font-size:14px;color:var(--ink-2)}
.auth input{border:1px solid var(--line);background:var(--paper);color:var(--ink);border-radius:10px;padding:11px 12px;font:15px var(--body);outline:none}.auth input:focus{border-color:var(--signal)}
.auth .btn{width:100%;margin-top:18px}.or{display:flex;align-items:center;gap:10px;color:var(--ink-3);font-size:13px;margin:18px 0 2px}.or::before,.or::after{content:"";flex:1;height:1px;background:var(--line)}
.gbtn{width:100%;background:var(--panel)!important;color:var(--ink)!important;border:1px solid var(--line)!important}
.gbtn[aria-disabled="true"]{opacity:.55;cursor:not-allowed}
.err{color:var(--fail);font-size:14px;min-height:1.4em;margin:12px 0 0}.card .note,.note{color:var(--ink-3);font-size:13px;margin-top:10px}
@media (max-width:900px){.stage{grid-template-columns:1fr}.transcript{border-left:0;border-top:1px solid var(--line)}.transcript ol{max-height:260px}.grid4{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:680px){.hero{padding-top:44px}.urlform{flex-direction:column}.urlform .btn{width:100%}.steps,.grid2,.checks{grid-template-columns:1fr}header nav a.hide-sm{display:none}}
@media (prefers-reduced-motion:no-preference){.hero h1,.hero .lede,.urlform{animation:rise .7s cubic-bezier(.2,.7,.2,1) both}.hero .lede{animation-delay:.08s}.urlform{animation-delay:.16s}@keyframes rise{from{opacity:0;transform:translateY(10px)}}}
:focus-visible{outline:2px solid var(--signal);outline-offset:2px}`;

const MARK = `<svg width="28" height="28" viewBox="0 0 26 26" aria-hidden="true"><rect x=".5" y=".5" width="25" height="25" rx="6" fill="currentColor"/><path d="M4 15h4l2-6 3 10 2-7 2 3h5" fill="none" stroke="var(--paper)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="15" cy="12" r="2.4" fill="#ffe57a" stroke="#13232b" stroke-width=".8"/></svg>`;

function layout(o: { siteUrl: string; path: string; title: string; description: string; body: string; head?: string; noindex?: boolean; user?: { email: string } | null }): string {
  const url = `${o.siteUrl}${o.path}`;
  const nav = o.user
    ? `<a href="/app#record" class="btn small">Open the app</a>`
    : `<a href="/#how" class="hide-sm">How it works</a><a href="/#faq" class="hide-sm">FAQ</a><a href="/login">Sign in</a><a href="/signup" class="btn small">Get started</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="${o.noindex ? "noindex, follow" : "index, follow, max-image-preview:large, max-video-preview:-1, max-snippet:-1"}">
<meta name="theme-color" content="#f2f5f3" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0c1413" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${NAME}">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${o.siteUrl}/assets/og.png">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:video" content="${o.siteUrl}/assets/demo.mp4"><meta property="og:video:type" content="video/mp4">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(o.title)}">
<meta name="twitter:description" content="${esc(o.description)}">
<meta name="twitter:image" content="${o.siteUrl}/assets/og.png">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="text/plain" href="/llms.txt" title="LLM-readable summary">
<link rel="preload" href="/assets/fonts/plex-condensed-600.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/geist.woff2" as="font" type="font/woff2" crossorigin>
<style>${CSS}</style>
${o.head ?? ""}
</head>
<body>
<a href="#main" class="eyebrow" style="position:absolute;left:-9999px">Skip to content</a>
<header class="top"><div class="wrap"><a class="brand" href="/" aria-label="${NAME} home">${MARK}<span>${NAME}</span></a><nav aria-label="Main">${nav}</nav></div></header>
<main id="main">${o.body}</main>
<footer><div class="wrap"><span>© ${new Date().getFullYear()} ${NAME} · MIT licensed</span><span><a href="/llms.txt">llms.txt</a> · <a href="/sitemap.xml">Sitemap</a> · <a href="/app">Dashboard</a></span></div></footer>
</body>
</html>`;
}

// --------------------------------------------------------------------------------- landing

export function landingPage(siteUrl: string, user: { email: string } | null): string {
  const d = demo();
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const iso = (s: number) => `PT${Math.floor(s / 60)}M${Math.round(s % 60)}S`;
  const transcriptText = d.captions.map((c) => c.text).join(" ");
  const title = "Website Video Walkthrough Generator: Narrated Videos From a Link | Walkcast";

  const structured = jsonLd({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": `${siteUrl}/#website`, url: `${siteUrl}/`, name: NAME, description: DESCRIPTION, inLanguage: "en" },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteUrl}/#app`,
        name: NAME,
        url: `${siteUrl}/`,
        description: DESCRIPTION,
        applicationCategory: "MultimediaApplication",
        applicationSubCategory: "Website video walkthrough generator",
        operatingSystem: "Web, macOS, Windows, Linux",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        featureList: [
          "Narrated MP4 video walkthrough of a website from a link",
          "Signs in to pages behind a login",
          "Spoken voice-over, WebVTT captions and transcript",
          "Stops at CAPTCHA and two-factor prompts",
          "Passwords never written to disk",
          "Regression tests for browser AI agents",
        ],
        screenshot: `${siteUrl}/assets/demo-poster.jpg`,
        license: "https://opensource.org/licenses/MIT",
      },
      {
        "@type": "VideoObject",
        "@id": `${siteUrl}/#demo`,
        name: "Example narrated website walkthrough (MiniCRM demo app)",
        description: "An unedited walkthrough recorded by Walkcast: it signs in to a demo CRM, browses its pages and narrates each step.",
        thumbnailUrl: [`${siteUrl}/assets/demo-poster.jpg`],
        contentUrl: `${siteUrl}/assets/demo.mp4`,
        embedUrl: `${siteUrl}/#demo`,
        uploadDate: "2026-10-15T00:00:00Z",
        duration: iso(d.durationSeconds),
        transcript: transcriptText,
        inLanguage: "en",
      },
      {
        "@type": "HowTo",
        "@id": `${siteUrl}/#how`,
        name: "How to make a narrated video walkthrough of a website",
        totalTime: "PT2M",
        tool: [{ "@type": "HowToTool", name: NAME }],
        step: HOW.map(([name, text], i) => ({ "@type": "HowToStep", position: i + 1, name, text, url: `${siteUrl}/#how` })),
      },
      {
        "@type": "FAQPage",
        "@id": `${siteUrl}/#faq`,
        mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
      },
    ],
  });

  const body = `
<section class="hero"><div class="wrap">
  <p class="eyebrow">Website video walkthroughs, narrated automatically</p>
  <h1>Paste a link. Get a <mark>narrated video walkthrough</mark> of your website.</h1>
  <p class="lede">${NAME} signs in to your site, browses its pages and hands back an MP4 with a spoken voice-over, captions and a page-by-page transcript. No screen recorder, no script, no editing.</p>
  <form class="urlform" action="/start" method="get" role="search" aria-label="Start a walkthrough">
    <label for="url" style="position:absolute;left:-9999px">Your website's link</label>
    <input id="url" name="url" type="url" inputmode="url" autocomplete="url" placeholder="https://your-app.com/login" required>
    <button class="btn" type="submit">Make my walkthrough</button>
  </form>
  <p class="fine"><span>Free and open source</span><span>Works behind a login</span><span>Password never saved</span><span>Stops at CAPTCHA and 2FA</span></p>

  <div class="stage" id="demo">
    <figure>
      <video id="demo-video" controls playsinline preload="metadata" poster="/assets/demo-poster.jpg" aria-describedby="demo-transcript">
        <source src="/assets/demo.mp4" type="video/mp4">
        <source src="/assets/demo.webm" type="video/webm">
        <track kind="captions" src="/assets/demo.vtt" srclang="en" label="Narration" default>
      </video>
      <figcaption>Real output · unedited · ${clock(d.durationSeconds)}</figcaption>
    </figure>
    <aside class="transcript" aria-label="Transcript">
      <header><p class="eyebrow">Transcript</p><h2 style="font-size:20px;margin-top:4px">Signing in to a demo CRM</h2></header>
      <ol id="demo-transcript">${d.captions.map((c) => `<li data-t="${c.start}"><time datetime="${iso(c.start)}">${clock(c.start)}</time><span>${esc(c.text)}</span></li>`).join("")}</ol>
    </aside>
  </div>
</div></section>

<section class="band" id="how"><div class="wrap">
  <p class="eyebrow">How it works</p>
  <h2>Three steps, about two minutes.</h2>
  <p class="intro">You don't write a script or click through the site yourself. A real browser does the walk, and every narrated line comes from what it actually did.</p>
  <ol class="steps">${HOW.map(([t, p]) => `<li class="card"><h3>${t}</h3><p>${p}</p></li>`).join("")}</ol>
</div></section>

<section class="band" id="output"><div class="wrap">
  <p class="eyebrow">What you get</p>
  <h2>A video you can send, plus everything to reuse it.</h2>
  <div class="grid4">
    <div class="card"><span class="file">recording.mp4</span><h3>Narrated video</h3><p>H.264 with a spoken voice-over and an embedded caption track. Plays everywhere.</p></div>
    <div class="card"><span class="file">captions.vtt</span><h3>Captions</h3><p>Timed to the speech, for accessible embeds and video hosts.</p></div>
    <div class="card"><span class="file">narration.wav</span><h3>Audio</h3><p>The voice-over on its own, to re-cut or re-voice.</p></div>
    <div class="card"><span class="file">pages · status</span><h3>Page list</h3><p>Every page visited, its title and HTTP status, and links skipped on purpose.</p></div>
  </div>
  <p class="intro">Good for onboarding videos, product tours, support articles, client handovers, QA evidence and release notes.</p>
</div></section>

<section class="band" id="safety"><div class="wrap">
  <p class="eyebrow">Safe by default</p>
  <h2>It behaves like a careful visitor, not a bot let loose.</h2>
  <ul class="checks">
    <li><strong>Only sites you may test.</strong> Every recording needs your confirmation.</li>
    <li><strong>Password stays in memory.</strong> Files on disk show a placeholder.</li>
    <li><strong>Stops at CAPTCHA and 2FA.</strong> It never tries to get past them.</li>
    <li><strong>Read-only after sign-in.</strong> No forms submitted; sign-out and delete links skipped.</li>
    <li><strong>Same site only.</strong> Follows links on your domain, respects robots.txt, paces requests.</li>
    <li><strong>Honest narration.</strong> Written from recorded events, never invented.</li>
  </ul>
</div></section>

<section class="band" id="agents"><div class="wrap">
  <p class="eyebrow">Walkcast Lab · for teams building browser agents</p>
  <h2>Turn an agent's failure into a regression test.</h2>
  <p class="intro">The same recorder powers a lab for browser AI agents: it captures a run, explains why it failed with deterministic rules checked against the app's real state, and saves the failure as a replayable test.</p>
  <div class="grid4">
    <div class="card"><div class="stat">39<small>scenarios across three CRM tasks and composable faults</small></div></div>
    <div class="card"><div class="stat">25/25<small>injected faults diagnosed with the right cause (scripted agents)</small></div></div>
    <div class="card"><div class="stat">0/15<small>false alarms on runs with no fault injected</small></div></div>
    <div class="card"><div class="stat">15<small>model providers through one gateway</small></div></div>
  </div>
</div></section>

<section class="band" id="faq"><div class="wrap">
  <p class="eyebrow">Questions</p>
  <h2>Frequently asked questions</h2>
  <div class="faq">${FAQ.map(([q, a], i) => `<details${i < 2 ? " open" : ""}><summary><h3 style="font:inherit;margin:0">${esc(q)}</h3></summary><p>${esc(a)}</p></details>`).join("")}</div>
</div></section>

<section class="cta"><div class="wrap">
  <h2>Your site, walked through and narrated.</h2>
  <p>Create a free account with Google or email and record your first walkthrough.</p>
  <p style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:22px"><a class="btn" href="${user ? "/app#record" : "/signup"}">${user ? "Open the app" : "Get started free"}</a><a class="btn ghost" href="#demo">Watch the example</a></p>
</div></section>
<script>
(function(){var v=document.getElementById("demo-video"),items=[].slice.call(document.querySelectorAll("#demo-transcript li"));if(!v)return;
items.forEach(function(li){li.addEventListener("click",function(){v.currentTime=+li.dataset.t;v.play()})});
v.addEventListener("timeupdate",function(){var t=v.currentTime,on=null;items.forEach(function(li){if(+li.dataset.t<=t)on=li;li.classList.remove("on")});if(on)on.classList.add("on")})})();
</script>`;
  return layout({ siteUrl, path: "/", title, description: DESCRIPTION, body, head: structured, user });
}

// --------------------------------------------------------------------------------- auth pages

export function authPage(siteUrl: string, mode: "signup" | "login", opts: { google: boolean; next: string; url?: string }): string {
  const signup = mode === "signup";
  const body = `
<section class="auth"><div class="wrap" style="display:grid;place-items:center">
  <div class="card">
    <p class="eyebrow">${signup ? "Create your account" : "Welcome back"}</p>
    <h1>${signup ? "Start recording" : "Sign in"}</h1>
    <p class="note" style="margin-top:4px">${signup ? "Free. Record narrated walkthroughs of sites you own or may test." : "Pick up where you left off."}</p>
    ${opts.url ? `<p class="note mono" style="word-break:break-all">Next: ${esc(opts.url)}</p>` : ""}
    <a class="btn gbtn" style="margin-top:18px" ${opts.google ? `href="/auth/google?next=${encodeURIComponent(opts.next)}"` : `aria-disabled="true" title="Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server to enable"`}>
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
      Continue with Google</a>
    ${opts.google ? "" : `<p class="note">Google sign-in isn't configured on this server yet; use email below.</p>`}
    <div class="or">or with email</div>
    <form id="auth" novalidate>
      ${signup ? `<label>Name <input name="name" autocomplete="name" maxlength="80"></label>` : ""}
      <label>Email <input name="email" type="email" autocomplete="email" required></label>
      <label>Password <input name="password" type="password" autocomplete="${signup ? "new-password" : "current-password"}" minlength="${signup ? 8 : 1}" required></label>
      <button class="btn" type="submit">${signup ? "Create account" : "Sign in"}</button>
      <p class="err" role="alert" id="err"></p>
    </form>
    <p class="note">${signup ? `Already have an account? <a href="/login?next=${encodeURIComponent(opts.next)}">Sign in</a>` : `New here? <a href="/signup?next=${encodeURIComponent(opts.next)}">Create an account</a>`}</p>
  </div>
</div></section>
<script>
document.getElementById("auth").addEventListener("submit",function(e){e.preventDefault();var f=e.target,err=document.getElementById("err"),b=f.querySelector("button");err.textContent="";b.disabled=true;
fetch("/auth/${mode}",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.fromEntries(new FormData(f)))}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||"Something went wrong.");location.href=${JSON.stringify(opts.next)}})}).catch(function(x){err.textContent=x.message;b.disabled=false})});
</script>`;
  return layout({
    siteUrl,
    path: `/${mode}`,
    title: `${signup ? "Create an account" : "Sign in"} · ${NAME}`,
    description: signup ? `Create a free ${NAME} account to record narrated video walkthroughs of your website.` : `Sign in to ${NAME}.`,
    body,
    noindex: !signup,
    user: null,
  });
}

// --------------------------------------------------------------------------------- crawler files

/** Search engines and AI assistants are welcome on public pages; the app, API and auth are off-limits. */
export function robotsTxt(siteUrl: string): string {
  const bots = [
    "Googlebot", "Bingbot", "DuckDuckBot", "Applebot", "Applebot-Extended", "Google-Extended", "GPTBot", "OAI-SearchBot", "ChatGPT-User",
    "ClaudeBot", "Claude-User", "Claude-SearchBot", "PerplexityBot", "Perplexity-User", "CCBot", "Amazonbot", "meta-externalagent", "DuckAssistBot", "MistralAI-User", "YouBot",
  ];
  const rules = "Allow: /\nDisallow: /app\nDisallow: /api/\nDisallow: /auth/\nDisallow: /files/\nDisallow: /start\n";
  return `# ${NAME}: public pages are open to search engines and AI assistants.\n\n${bots.map((b) => `User-agent: ${b}\n${rules}`).join("\n")}\nUser-agent: *\n${rules}\nSitemap: ${siteUrl}/sitemap.xml\n`;
}

export function sitemapXml(siteUrl: string): string {
  const d = demo();
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
  <url>
    <loc>${siteUrl}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
    <video:video>
      <video:thumbnail_loc>${siteUrl}/assets/demo-poster.jpg</video:thumbnail_loc>
      <video:title>Example narrated website walkthrough</video:title>
      <video:description>An unedited website video walkthrough recorded by ${NAME}: it signs in, browses the pages and narrates each step.</video:description>
      <video:content_loc>${siteUrl}/assets/demo.mp4</video:content_loc>
      <video:duration>${Math.round(d.durationSeconds)}</video:duration>
      <video:family_friendly>yes</video:family_friendly>
    </video:video>
  </url>
  <url><loc>${siteUrl}/signup</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>
  <url><loc>${siteUrl}/llms.txt</loc><changefreq>weekly</changefreq><priority>0.3</priority></url>
</urlset>
`;
}

/** llms.txt (llmstxt.org): a plain-language summary that AI assistants can quote accurately. */
export function llmsTxt(siteUrl: string): string {
  return `# ${NAME}

> ${TAGLINE}. ${DESCRIPTION}

${NAME} makes narrated video walkthroughs of websites. You paste a link, optionally give the username and password you sign in with, and confirm you own the site or may test it. A real browser signs in, visits up to 30 pages on the same site, and returns:

- recording.mp4: H.264 video with a spoken voice-over (AAC) and an embedded caption track
- captions.vtt: WebVTT captions timed to the speech
- narration.wav: the voice-over on its own
- a list of every page visited with its title and HTTP status

## How it behaves

- Signs in through ordinary login forms, including two-step email-then-password forms.
- Stops at CAPTCHA, bot checks and two-factor prompts; it never bypasses them.
- After sign-in it only follows same-site links with ordinary page loads. It submits no forms and skips sign-out, delete, cancel and unsubscribe links. It respects robots.txt.
- Passwords are held in memory only; files on disk show a placeholder.
- Narration is written from the recorded browser events (pages opened, fields typed into, buttons clicked, the site's responses), not generated or guessed.

## Also

${NAME} began as a lab for browser AI agents: it records an agent's run, diagnoses why it failed with deterministic rules checked against the application's real state, and saves the failure as a replayable regression test. Its benchmark has 39 scenarios across three CRM tasks; in its validation experiment with scripted agents it named the right cause for 25 of 25 injected faults and raised 0 false alarms on 15 fault-free runs.

## Links

- [Home](${siteUrl}/): what it does, an example walkthrough with transcript, FAQ
- [Create an account](${siteUrl}/signup): sign up with Google or email and password
- [Example video](${siteUrl}/assets/demo.mp4): an unedited narrated walkthrough of a demo CRM
- [Example captions](${siteUrl}/assets/demo.vtt)

## FAQ

${FAQ.map(([q, a]) => `### ${q}\n\n${a}`).join("\n\n")}
`;
}

export const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26"><rect x=".5" y=".5" width="25" height="25" rx="6" fill="#13232b"/><path d="M4 15h4l2-6 3 10 2-7 2 3h5" fill="none" stroke="#f2f5f3" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="15" cy="12" r="2.4" fill="#ffe57a" stroke="#13232b" stroke-width=".8"/></svg>`;

/** Static files under /assets/: the demo media, the social image and self-hosted fonts. */
export function assetPath(name: string): { path: string; type: string } | null {
  const fonts: Record<string, string> = {
    "fonts/geist.woff2": "node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2",
    "fonts/geist-mono.woff2": "node_modules/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2",
    "fonts/plex-condensed-600.woff2": "node_modules/@fontsource/ibm-plex-sans-condensed/files/ibm-plex-sans-condensed-latin-600-normal.woff2",
  };
  const types: Record<string, string> = { ".mp4": "video/mp4", ".webm": "video/webm", ".vtt": "text/vtt; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2" };
  const rel = fonts[name] ? resolve(SITE_DIR, "..", fonts[name]) : /^[a-z0-9-]+\.(mp4|webm|vtt|jpg|png)$/.test(name) ? join(SITE_DIR, "static", name) : null;
  if (!rel || !existsSync(rel)) return null;
  return { path: rel, type: types[rel.slice(rel.lastIndexOf("."))] ?? "application/octet-stream" };
}
