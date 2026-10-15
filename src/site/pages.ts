import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatInterval } from "../lab/stats.ts";
import { siteFacts, type ExperimentFacts, type SiteFacts } from "./facts.ts";
import { GUIDES, GUIDES_UPDATED, type Guide } from "./guides.ts";

/**
 * The public site: a server-rendered landing page (full content in the HTML, no client
 * rendering needed, so search engines and AI crawlers read everything), sign-up / sign-in pages,
 * and the crawler files (robots.txt, sitemap.xml, llms.txt). Every URL is absolute from siteUrl.
 */
export const SITE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "site");
/** Repo root: the pages read the published experiment from results/ under here. */
const REPO_ROOT = resolve(SITE_DIR, "..");
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
@font-face{font-family:"Fraunces";src:url(/assets/fonts/fraunces.woff2) format("woff2");font-weight:100 900;font-display:swap}
@font-face{font-family:"Fraunces";src:url(/assets/fonts/fraunces-italic.woff2) format("woff2");font-weight:100 900;font-style:italic;font-display:swap}`;

/*
  A screening room, not graph paper: warm paper (light) or a dim theatre (dark), a soft spotlight
  and film grain, Fraunces for headings, a red record light, and captions as the visual motif.
*/
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;
const DARK = `--paper:#121110;--panel:#1a1917;--panel-2:#23211e;--ink:#f3efe8;--ink-2:#b6afa4;--ink-3:#7f786e;--line:#2f2c28;--signal:#93a7ff;--ember:#ff8a5c;--rec:#ff6369;--caption:#ffd84a;--pass:#6fd39a;--fail:#ff7b72;--spot:rgb(255 170 110/.08);--grain:.07;--shadow:0 1px 0 rgb(0 0 0/.35),0 24px 48px -24px rgb(0 0 0/.9);color-scheme:dark`;

const CSS = `${FONTS}
:root{--paper:#f7f3ec;--panel:#fffdf9;--panel-2:#f2ede4;--ink:#1c1917;--ink-2:#57534e;--ink-3:#8a837a;--line:#e7e0d4;--signal:#3150c9;--ember:#c2410c;--rec:#e5484d;--caption:#ffd84a;--pass:#24713f;--fail:#b42318;--spot:rgb(255 214 170/.5);--grain:.045;--shadow:0 1px 2px rgb(28 25 23/.05),0 24px 48px -28px rgb(28 25 23/.35);
--display:"Fraunces",Georgia,"Times New Roman",serif;--body:"Geist",ui-sans-serif,system-ui,sans-serif;--mono:"Geist Mono",ui-monospace,Menlo,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${DARK}}}
:root[data-theme="dark"]{${DARK}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper) radial-gradient(1400px 640px at 50% -200px,var(--spot),transparent 70%) no-repeat;color:var(--ink);font:16px/1.6 var(--body);text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased}
body::before{content:"";position:fixed;inset:0;pointer-events:none;opacity:var(--grain);background-image:${GRAIN};z-index:0}
body>*{position:relative;z-index:1}
a{color:inherit}img,video{max-width:100%;display:block}
.wrap{max-width:1160px;margin:0 auto;padding:0 max(20px,env(safe-area-inset-left))}
.mono{font-family:var(--mono)}
.eyebrow{display:inline-flex;align-items:center;gap:8px;max-width:100%;font:500 12px/1.2 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);margin:0}
.eyebrow::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--rec);box-shadow:0 0 0 3px color-mix(in srgb,var(--rec) 18%,transparent)}
h1,h2,h3{font-family:var(--display);font-weight:560;letter-spacing:-.022em;line-height:1.02;margin:0;font-optical-sizing:auto;text-wrap:balance}
h1 em,h2 em{font-style:italic;font-weight:480;color:var(--ember)}
header.top{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--paper) 82%,transparent);backdrop-filter:saturate(1.4) blur(12px)}
header.top::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1px;background:linear-gradient(90deg,transparent,var(--line) 20%,var(--line) 80%,transparent)}
header.top .wrap{display:flex;align-items:center;gap:16px;height:64px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;font:600 21px var(--display);letter-spacing:-.02em}
header nav{display:flex;gap:2px;margin-left:auto;align-items:center}
header nav a{font-size:14.5px;text-decoration:none;color:var(--ink-2);padding:8px 12px;border-radius:999px}header nav a:hover{color:var(--ink);background:var(--panel-2)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:999px;background:var(--ink);color:var(--paper);font:500 15px var(--body);padding:13px 22px;text-decoration:none;cursor:pointer;white-space:nowrap;transition:transform .15s,box-shadow .15s}
.btn:hover{transform:translateY(-1px);box-shadow:0 8px 20px -10px color-mix(in srgb,var(--ink) 60%,transparent)}
.btn.ghost{background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1px var(--line)}.btn.small{padding:8px 16px;font-size:14px}
.hero{padding:96px 0 48px;text-align:center;position:relative}
.hero::before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(60% 50% at 50% 30%,rgb(49 80 201/.10),transparent 70%);mix-blend-mode:screen}
.hero .btn{position:relative;overflow:hidden}
.hero .btn::after{content:"";position:absolute;inset:0;background:linear-gradient(120deg,transparent 30%,rgba(255,255,255,.35) 50%,transparent 70%);transform:translateX(-100%);animation:shimmer 3.2s ease-in-out infinite}
.hero .eyebrow{justify-content:center}
.hero h1{font-size:clamp(52px,8vw,104px);max-width:12ch;margin:22px auto 0;font-weight:700;letter-spacing:-0.03em;line-height:.95}
.hero h1 em{font-style:normal;background:linear-gradient(120deg,var(--signal),#8a5cff);-webkit-background-clip:text;background-clip:text;color:transparent}
.hero .lede{font-size:clamp(17px,1.7vw,21px);color:var(--ink-2);max-width:56ch;margin:26px auto 34px}
.urlform{display:flex;gap:6px;max-width:620px;margin:0 auto;background:var(--panel);border-radius:999px;padding:6px;box-shadow:var(--shadow),inset 0 0 0 1px var(--line);transition:box-shadow .2s}
.urlform input{flex:1;min-width:0;border:0;background:transparent;font:15px var(--mono);color:var(--ink);padding:10px 18px;outline:none}
.urlform:focus-within{box-shadow:var(--shadow),inset 0 0 0 2px var(--ember)}
.fine{display:flex;flex-wrap:wrap;justify-content:center;gap:6px 22px;margin-top:18px;font-size:14px;color:var(--ink-3)}
.fine span::before{content:"✓";color:var(--pass);margin-right:7px;font-weight:600}
.stage{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,340px);margin-top:64px;background:#0d0c0b;border-radius:22px;overflow:hidden;box-shadow:0 40px 80px -40px rgb(0 0 0/.55),0 0 0 1px rgb(255 255 255/.04);text-align:left;color:#f3efe8}
.stage figure{margin:0;position:relative;background:#0d0c0b}.stage video{width:100%;aspect-ratio:16/10;background:#0d0c0b}
.stage figcaption{position:absolute;right:14px;top:14px;display:flex;align-items:center;gap:8px;font:500 11.5px var(--mono);letter-spacing:.1em;text-transform:uppercase;color:#f3efe8;background:rgb(0 0 0/.55);backdrop-filter:blur(6px);padding:6px 10px;border-radius:999px}
.stage figcaption::before{content:"";width:8px;height:8px;border-radius:50%;background:#ff4d4f;animation:rec 1.6s ease-in-out infinite}
@keyframes rec{50%{opacity:.25}}
.transcript{display:flex;flex-direction:column;min-height:0;background:#161513;border-left:1px solid rgb(255 255 255/.06)}
.transcript header{padding:18px 20px 12px}.transcript header .eyebrow{color:#8f887d}
.transcript h2{color:#f3efe8}
.transcript ol{list-style:none;margin:0;padding:4px 10px 14px;overflow:auto;max-height:430px;flex:1}
.transcript li{display:grid;grid-template-columns:44px 1fr;gap:8px;padding:7px 10px;font-size:14px;cursor:pointer;border-radius:10px;color:#cfc8bd}
.transcript li:hover{background:rgb(255 255 255/.05)}
.transcript li.on{background:#000;color:var(--caption)}
.transcript li.on time{color:var(--caption)}
.transcript time{font:12px var(--mono);color:#8f887d;padding-top:2px}
section.band{padding:104px 0;text-align:center}
section.band h2{font-size:clamp(34px,4.6vw,56px);max-width:20ch;margin:16px auto 0}
section.band .intro{color:var(--ink-2);max-width:60ch;margin:18px auto 0;font-size:18px}
.steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin-top:44px;counter-reset:s;padding:0;list-style:none}
.card{background:var(--panel);border-radius:20px;padding:26px;box-shadow:var(--shadow),inset 0 0 0 1px var(--line);text-align:center}
.steps .card::before{counter-increment:s;content:counter(s,decimal-leading-zero);display:block;font:italic 480 44px/1 var(--display);color:var(--ember);margin-bottom:22px}
.card h3{font-size:24px;margin-bottom:8px}.card p{margin:0;color:var(--ink-2);font-size:15.5px}
.grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;margin-top:44px}
.gridstats{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:20px;margin-top:44px}
.file{display:inline-block;font:500 12.5px var(--mono);color:var(--paper);background:var(--ink);padding:4px 10px;border-radius:999px;margin-bottom:18px}
.checks{list-style:none;padding:0;margin:36px auto 0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 36px;max-width:820px;text-align:left}
.checks li{padding-left:30px;position:relative;color:var(--ink-2);font-size:16.5px}.checks li strong{color:var(--ink);font-weight:600}
.checks li::before{content:"✓";position:absolute;left:0;top:0;width:20px;height:20px;border-radius:50%;background:color-mix(in srgb,var(--pass) 14%,transparent);color:var(--pass);font:600 12px/20px var(--body);text-align:center}
.stat{font:560 clamp(34px,8vw,52px)/1 var(--display);letter-spacing:-.03em}.stat small{font:14px/1.45 var(--body);letter-spacing:0;color:var(--ink-2);display:block;margin-top:12px}
.faq{margin-top:36px;max-width:820px}
.faq details{border-bottom:1px solid var(--line);padding:20px 0}.faq summary{cursor:pointer;font:560 22px/1.25 var(--display);letter-spacing:-.01em;list-style:none;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:16px}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";font:300 26px/1 var(--body);color:var(--ink-3)}.faq details[open] summary::after{content:"−"}
.faq p{color:var(--ink-2);margin:12px 0 0;max-width:70ch}
.cta{text-align:center;padding:120px 0}.cta h2{margin:16px auto 0;max-width:16ch;font-size:clamp(38px,5.4vw,66px)}.cta p{color:var(--ink-2);font-size:18px}
.cta .eyebrow{justify-content:center}
footer{padding:36px 0 48px;color:var(--ink-3);font-size:14px}footer .wrap{display:flex;flex-wrap:wrap;gap:12px 24px;justify-content:space-between;border-top:1px solid var(--line);padding-top:28px}
.auth{min-height:calc(100vh - 65px);display:grid;place-items:center;padding:48px 0}
.auth .card{width:min(440px,100%);padding:34px}.auth h1{font-size:40px;margin:10px 0 6px}
.auth label{display:grid;gap:6px;margin-top:16px;font-size:14px;color:var(--ink-2)}
.auth input{border:0;box-shadow:inset 0 0 0 1px var(--line);background:var(--paper);color:var(--ink);border-radius:12px;padding:12px 14px;font:15px var(--body);outline:none}.auth input:focus{box-shadow:inset 0 0 0 2px var(--ember)}
.auth .btn{width:100%;margin-top:20px}.or{display:flex;align-items:center;gap:10px;color:var(--ink-3);font-size:13px;margin:20px 0 2px}.or::before,.or::after{content:"";flex:1;height:1px;background:var(--line)}
.gbtn{width:100%;background:var(--panel)!important;color:var(--ink)!important;box-shadow:inset 0 0 0 1px var(--line)!important}
.gbtn[aria-disabled="true"]{opacity:.55;cursor:not-allowed;transform:none!important}
.err{color:var(--fail);font-size:14px;min-height:1.4em;margin:12px 0 0}.card .note,.note{color:var(--ink-3);font-size:13.5px;margin-top:10px}
.crumbs{font:13px var(--mono);color:var(--ink-3);margin:40px 0 22px}.crumbs a{color:var(--ink-2);text-decoration:none}.crumbs a:hover{text-decoration:underline}
.article{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:64px;padding-bottom:72px}
.article h1{font-size:clamp(34px,5.4vw,64px);max-width:18ch;margin-top:14px;hyphens:auto}.article .lede{font-size:20px;color:var(--ink-2);margin:20px 0 8px;max-width:60ch}
.prose{max-width:68ch}.prose h2{font-size:32px;margin:52px 0 14px}.prose p,.prose li{color:var(--ink-2);font-size:17.5px}.prose li{margin:6px 0}.prose strong{color:var(--ink)}
.prose ol.howto{list-style:none;padding:0;counter-reset:h}.prose ol.howto li{counter-increment:h;position:relative;padding:16px 0 16px 58px;border-top:1px solid var(--line);margin:0}
.prose ol.howto li::before{content:counter(h,decimal-leading-zero);position:absolute;left:0;top:13px;font:italic 480 30px/1 var(--display);color:var(--ember)}
.prose table{border-collapse:collapse;width:100%;font-size:15.5px}.prose td,.prose th{border-top:1px solid var(--line);padding:12px 8px;text-align:left;vertical-align:top}.prose th{font:500 12px var(--mono);text-transform:uppercase;letter-spacing:.1em;color:var(--ink-3);width:9.5rem}
.meta{font:13px var(--mono);color:var(--ink-3)}
.side{position:sticky;top:88px;align-self:start;display:grid;gap:18px}.side ul{list-style:none;padding:0;margin:10px 0 0}.side li a{display:block;padding:7px 0;text-decoration:none;color:var(--ink-2);font-size:15px}.side li a:hover{color:var(--ink)}
.guide-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin-top:40px}
a.card{text-decoration:none;display:block;transition:transform .2s,box-shadow .2s}a.card:hover{transform:translateY(-3px);box-shadow:0 28px 56px -30px rgb(28 25 23/.45),inset 0 0 0 1px var(--line)}
a.card .more{font:500 13px var(--mono);color:var(--ember);margin-top:16px;display:block}
@media (max-width:900px){.stage{grid-template-columns:1fr}.transcript{border-left:0;border-top:1px solid rgb(255 255 255/.06)}.transcript ol{max-height:260px}.gridstats{grid-template-columns:repeat(2,minmax(0,1fr))}.article{grid-template-columns:minmax(0,1fr)}.side{position:static}.guide-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:680px){.hero{padding-top:56px}.urlform{flex-direction:column;border-radius:22px}.urlform .btn{width:100%}.steps,.grid2,.checks,.guide-grid{grid-template-columns:1fr}header nav a.hide-sm{display:none}section.band{padding:72px 0}}
@media (max-width:400px){header nav a:not(.btn){display:none}.brand{font-size:19px}.auth .card{padding:24px 20px}.auth h1{font-size:34px}}
@media (prefers-reduced-motion:no-preference){.hero h1,.hero .lede,.urlform{animation:rise .8s cubic-bezier(.2,.7,.2,1) both}.hero .lede{animation-delay:.08s}.urlform{animation-delay:.16s}@keyframes rise{from{opacity:0;transform:translateY(12px)}}} @keyframes shimmer{100%{transform:translateX(100%)}}
@media (prefers-reduced-motion:reduce){.stage figcaption::before{animation:none}}
:focus-visible{outline:2px solid var(--signal);outline-offset:2px}`;

const MARK = `<svg width="30" height="30" viewBox="0 0 26 26" aria-hidden="true"><rect x=".5" y=".5" width="25" height="25" rx="7" fill="currentColor"/><path d="M10 8.2v9.6l7.6-4.8z" fill="var(--paper)"/><circle cx="20.2" cy="5.8" r="2.7" fill="var(--rec)" stroke="var(--paper)" stroke-width="1"/></svg>`;

function layout(o: { siteUrl: string; path: string; title: string; description: string; body: string; head?: string; noindex?: boolean; user?: { email: string } | null }): string {
  const url = `${o.siteUrl}${o.path}`;
  const nav = o.user
    ? `<a href="/app#record" class="btn small">Open the app</a>`
    : `<a href="/guides" class="hide-sm">Guides</a><a href="/#faq" class="hide-sm">FAQ</a><a href="/login">Sign in</a><a href="/signup" class="btn small">Get started</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="${o.noindex ? "noindex, follow" : "index, follow, max-image-preview:large, max-video-preview:-1, max-snippet:-1"}">
<meta name="theme-color" content="#f7f3ec" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#121110" media="(prefers-color-scheme: dark)">
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
<link rel="preload" href="/assets/fonts/fraunces.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/geist.woff2" as="font" type="font/woff2" crossorigin>
<style>${CSS}</style>
${o.head ?? ""}
</head>
<body>
<a href="#main" class="eyebrow" style="position:absolute;left:-9999px">Skip to content</a>
<header class="top"><div class="wrap"><a class="brand" href="/" aria-label="${NAME} home">${MARK}<span>${NAME}</span></a><nav aria-label="Main">${nav}</nav></div></header>
<main id="main">${o.body}</main>
<footer><div class="wrap"><span>© ${new Date().getFullYear()} ${NAME} · MIT licensed</span><span><a href="/guides">Guides</a> · <a href="/llms.txt">llms.txt</a> · <a href="/sitemap.xml">Sitemap</a> · <a href="/app">Dashboard</a></span></div></footer>
</body>
</html>`;
}

// --------------------------------------------------------------------------------- landing

/**
 * The lab numbers the public pages quote. With a published experiment they come from data —
 * `results/<id>/summary.json`, with Wilson 95% intervals; without one (a fresh checkout, a
 * trimmed image) the committed copy below stands in.
 */
const LAB_FALLBACK: { detected: [string, string]; falseAlarms: [string, string] } = {
  detected: ["25/25", "injected faults diagnosed with the right cause (scripted agents)"],
  falseAlarms: ["0/15", "false alarms on runs with no fault injected"],
};

function agentWord(e: ExperimentFacts): string {
  return e.scripted ? "scripted agents" : `agents ${e.agents.join(", ")}`;
}

/** `; 95% CI 87–100%`, or nothing when there are no trials to put an interval on. */
function interval(k: number, n: number): string {
  const ci = formatInterval(k, n);
  return ci ? `; ${ci}` : "";
}

function labCards(facts: SiteFacts): string {
  const e = facts.experiment;
  const cards: [string, string][] = [[String(facts.scenarios), "scenarios across three CRM tasks and composable faults"]];
  cards.push(
    e
      ? [`${e.detected.k}/${e.detected.n}`, `injected faults diagnosed with the right cause (${agentWord(e)}${interval(e.detected.k, e.detected.n)})`]
      : LAB_FALLBACK.detected,
  );
  cards.push(
    e
      ? [`${e.falseAlarms.k}/${e.falseAlarms.n}`, `false alarms on runs with no fault injected${interval(e.falseAlarms.k, e.falseAlarms.n)}`]
      : LAB_FALLBACK.falseAlarms,
  );
  if (e?.falseSuccess) {
    cards.push([
      `${e.falseSuccess.k}/${e.falseSuccess.n}`,
      `success claims the application's records disagreed with (${agentWord(e)}${interval(e.falseSuccess.k, e.falseSuccess.n)})`,
    ]);
  }
  cards.push([String(facts.providers), "model providers through one gateway"]);
  return cards.map(([value, note]) => `<div class="card"><div class="stat">${value}<small>${note}</small></div></div>`).join("\n    ");
}

export function landingPage(siteUrl: string, user: { email: string } | null, facts: SiteFacts = siteFacts(REPO_ROOT)): string {
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
  <h1>Paste a link. Get a <em>narrated video walkthrough</em> of your website.</h1>
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
  <div class="gridstats">${labCards(facts)}
  </div>
</div></section>

<section class="band" id="guides"><div class="wrap">
  <p class="eyebrow">Guides</p>
  <h2>What people make walkthroughs for</h2>
  <p class="intro">Practical guides for each use case: what to show, how many pages, which account to use and where to put the video afterwards.</p>
  <div class="guide-grid">${GUIDES.map(guideCard).join("")}</div>
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

export type AuthMode = "signup" | "login" | "forgot" | "reset";

const GOOGLE_ICON = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

/**
 * Sign-up, sign-in, forgot-password and set-new-password pages. The form posts JSON to
 * /auth/<mode>; the answer is either a place to go next or a message to show (e.g. "check your
 * email") in place of the form.
 */
export function authPage(
  siteUrl: string,
  mode: AuthMode,
  opts: { google: boolean; next: string; url?: string; forgot?: boolean; provider?: "local" | "supabase"; notice?: string },
): string {
  const copy = {
    signup: { eyebrow: "Create your account", h1: "Start recording", lede: "Free. Record narrated walkthroughs of sites you own or may test.", button: "Create account", title: "Create an account" },
    login: { eyebrow: "Welcome back", h1: "Sign in", lede: "Pick up where you left off.", button: "Sign in", title: "Sign in" },
    forgot: { eyebrow: "Forgot your password", h1: "Reset it by email", lede: "We'll email you a link to choose a new password.", button: "Send the link", title: "Reset your password" },
    reset: { eyebrow: "Almost done", h1: "Choose a new password", lede: "At least 8 characters.", button: "Save and sign in", title: "Choose a new password" },
  }[mode];
  const withEmail = mode !== "reset";
  const withPassword = mode !== "forgot";
  const showGoogle = mode === "signup" || mode === "login";
  const googleHint = opts.provider === "supabase" ? "Turn on the Google provider in your Supabase project (Authentication → Providers)." : "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server to enable.";
  const body = `
<section class="auth"><div class="wrap" style="display:grid;place-items:center">
  <div class="card">
    <p class="eyebrow">${copy.eyebrow}</p>
    <h1>${copy.h1}</h1>
    <p class="note" style="margin-top:4px">${copy.lede}</p>
    ${opts.url ? `<p class="note mono" style="word-break:break-all">Next: ${esc(opts.url)}</p>` : ""}
    ${opts.notice ? `<p class="note" role="status" style="color:var(--ink)">${esc(opts.notice)}</p>` : ""}
    ${
      showGoogle
        ? `<a class="btn gbtn" style="margin-top:18px" ${opts.google ? `href="/auth/google?next=${encodeURIComponent(opts.next)}"` : `aria-disabled="true" title="${esc(googleHint)}"`}>${GOOGLE_ICON} Continue with Google</a>
    ${opts.google ? "" : `<p class="note gnote">Google sign-in isn't turned on for this server yet; use email below.</p>`}
    <div class="or">or with email</div>`
        : ""
    }
    <form id="auth" novalidate>
      ${mode === "signup" ? `<label>Name <input name="name" autocomplete="name" maxlength="80"></label>` : ""}
      ${withEmail ? `<label>Email <input name="email" type="email" autocomplete="email" required></label>` : ""}
      ${withPassword ? `<label>${mode === "reset" ? "New password" : "Password"} <input name="password" type="password" autocomplete="${mode === "login" ? "current-password" : "new-password"}" minlength="${mode === "login" ? 1 : 8}" required></label>` : ""}
      <button class="btn" type="submit">${copy.button}</button>
      <p class="err" role="alert" id="err"></p>
    </form>
    <p class="note" id="done" role="status" hidden style="color:var(--ink);font-size:15px;line-height:1.5;margin-top:18px"></p>
    <p class="note">${
      mode === "signup"
        ? `Already have an account? <a href="/login?next=${encodeURIComponent(opts.next)}">Sign in</a>`
        : mode === "login"
          ? `New here? <a href="/signup?next=${encodeURIComponent(opts.next)}">Create an account</a>${opts.forgot ? ` · <a href="/forgot">Forgot your password?</a>` : ""}`
          : `<a href="/login">Back to sign in</a>`
    }</p>
  </div>
</div></section>
<script>
document.getElementById("auth").addEventListener("submit",function(e){e.preventDefault();var f=e.target,err=document.getElementById("err"),done=document.getElementById("done"),b=f.querySelector("button");err.textContent="";b.disabled=true;
var body=Object.fromEntries(new FormData(f));body.next=${JSON.stringify(opts.next).replace(/</g, "\\u003c")};
fetch("/auth/${mode}",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||"Something went wrong.");
if(j.message){f.hidden=true;document.querySelectorAll(".gbtn,.or,.gnote").forEach(function(x){x.style.display="none"});done.textContent=j.message;done.hidden=false;return}location.href=j.next||${JSON.stringify(opts.next).replace(/</g, "\\u003c")}})}).catch(function(x){err.textContent=x.message;b.disabled=false})});
</script>`;
  return layout({
    siteUrl,
    path: `/${mode}`,
    title: `${copy.title} · ${NAME}`,
    description: mode === "signup" ? `Create a free ${NAME} account to record narrated video walkthroughs of your website.` : `${copy.title} · ${NAME}.`,
    body,
    noindex: mode !== "signup",
    user: null,
  });
}

// --------------------------------------------------------------------------------- guides

function guideCard(g: Guide): string {
  return `<a class="card" href="/guides/${g.slug}"><h3>${esc(g.label)}</h3><p>${esc(g.description)}</p><span class="more">Read the guide →</span></a>`;
}

export function guidesIndexPage(siteUrl: string, user: { email: string } | null): string {
  const title = "Website Video Walkthrough Guides by Use Case | Walkcast";
  const description = "Guides to making narrated website walkthrough videos for product demos, onboarding, client handovers, QA evidence, help centers and internal training.";
  const head = jsonLd({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${siteUrl}/guides#page`,
        url: `${siteUrl}/guides`,
        name: "Website video walkthrough guides",
        description,
        hasPart: GUIDES.map((g) => ({ "@type": "Article", headline: g.h1, url: `${siteUrl}/guides/${g.slug}` })),
      },
      breadcrumbs(siteUrl, [["Guides", "/guides"]]),
    ],
  });
  const body = `
<div class="wrap" style="text-align:center">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / Guides</nav>
  <p class="eyebrow">Guides</p>
  <h1 style="font-size:clamp(36px,5vw,58px);max-width:18ch">Website video walkthroughs, by use case</h1>
  <p class="lede" style="font-size:19px;color:var(--ink-2);max-width:62ch">${esc(description)}</p>
  <div class="guide-grid" style="margin-bottom:72px">${GUIDES.map(guideCard).join("")}</div>
</div>`;
  return layout({ siteUrl, path: "/guides", title, description, body, head, user });
}

export function guidePage(siteUrl: string, g: Guide, user: { email: string } | null): string {
  const url = `${siteUrl}/guides/${g.slug}`;
  const head = jsonLd({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${url}#article`,
        headline: g.h1,
        description: g.description,
        url,
        mainEntityOfPage: url,
        datePublished: GUIDES_UPDATED,
        dateModified: GUIDES_UPDATED,
        image: `${siteUrl}/assets/og.png`,
        author: { "@type": "Organization", name: NAME, url: `${siteUrl}/` },
        publisher: { "@type": "Organization", name: NAME, url: `${siteUrl}/`, logo: { "@type": "ImageObject", url: `${siteUrl}/favicon.svg` } },
        about: g.label,
        audience: { "@type": "Audience", audienceType: g.audience },
      },
      {
        "@type": "HowTo",
        "@id": `${url}#howto`,
        name: g.h1,
        description: g.description,
        tool: [{ "@type": "HowToTool", name: NAME }],
        step: g.steps.map(([name, text], i) => ({ "@type": "HowToStep", position: i + 1, name, text, url: `${url}#step-${i + 1}` })),
      },
      { "@type": "FAQPage", "@id": `${url}#faq`, mainEntity: g.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
      breadcrumbs(siteUrl, [["Guides", "/guides"], [g.label, `/guides/${g.slug}`]]),
    ],
  });
  const others = GUIDES.filter((o) => o.slug !== g.slug);
  const body = `
<div class="wrap">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/guides">Guides</a> / ${esc(g.label)}</nav>
  <div class="article">
    <article class="prose">
      <p class="eyebrow">Guide · ${esc(g.label)}</p>
      <h1>${esc(g.h1)}</h1>
      <p class="lede">${esc(g.description)}</p>
      <p class="meta">For: ${esc(g.audience)} · Updated <time datetime="${GUIDES_UPDATED}">${GUIDES_UPDATED}</time></p>
      ${g.intro.map((p) => `<p>${esc(p)}</p>`).join("")}
      <h2>Step by step</h2>
      <ol class="howto">${g.steps.map(([t, d], i) => `<li id="step-${i + 1}"><strong>${esc(t)}.</strong> ${esc(d)}</li>`).join("")}</ol>
      <h2>Settings that work</h2>
      <table><tbody>${g.settings.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</tbody></table>
      <h2>After recording</h2>
      <ul>${g.afterwards.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
      <h2>Mistakes to avoid</h2>
      <ul>${g.pitfalls.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
      <h2>Questions</h2>
      <div class="faq" style="margin-top:8px">${g.faq.map(([q, a]) => `<details open><summary><h3 style="font:inherit;margin:0">${esc(q)}</h3></summary><p>${esc(a)}</p></details>`).join("")}</div>
      <div class="card" style="margin-top:40px">
        <h3>Record one now</h3>
        <p>Paste your site's link. You get a narrated MP4, captions and a transcript in about two minutes.</p>
        <form class="urlform" action="/start" method="get" style="margin-top:14px;box-shadow:none">
          <label for="guide-url" style="position:absolute;left:-9999px">Your website's link</label>
          <input id="guide-url" name="url" type="url" inputmode="url" placeholder="https://your-app.com/login" required>
          <button class="btn" type="submit">Make my walkthrough</button>
        </form>
      </div>
    </article>
    <aside class="side" aria-label="More guides">
      <div class="card"><p class="eyebrow">Example</p><video controls playsinline preload="none" poster="/assets/demo-poster.jpg" style="margin-top:10px;border-radius:8px;width:100%"><source src="/assets/demo.mp4" type="video/mp4"><source src="/assets/demo.webm" type="video/webm"><track kind="captions" src="/assets/demo.vtt" srclang="en" label="Narration" default></video><p style="margin-top:8px;font-size:13.5px">An unedited recording of a demo CRM.</p></div>
      <div class="card"><p class="eyebrow">Other guides</p><ul>${others.map((o) => `<li><a href="/guides/${o.slug}">${esc(o.label)}</a></li>`).join("")}</ul></div>
    </aside>
  </div>
</div>`;
  return layout({ siteUrl, path: `/guides/${g.slug}`, title: g.title, description: g.description, body, head, user });
}

function breadcrumbs(siteUrl: string, trail: [string, string][]): unknown {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [["Home", "/"] as [string, string], ...trail].map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${siteUrl}${path}` })),
  };
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
  <url><loc>${siteUrl}/guides</loc><lastmod>${GUIDES_UPDATED}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>
${GUIDES.map((g) => `  <url><loc>${siteUrl}/guides/${g.slug}</loc><lastmod>${GUIDES_UPDATED}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`).join("\n")}
  <url><loc>${siteUrl}/signup</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>
  <url><loc>${siteUrl}/llms.txt</loc><changefreq>weekly</changefreq><priority>0.3</priority></url>
</urlset>
`;
}

/** The lab numbers in prose, for llms.txt: measured with intervals, or the committed copy. */
function labSummarySentence(facts: SiteFacts): string {
  const e = facts.experiment;
  if (!e) {
    return `Its benchmark has ${facts.scenarios} scenarios across three CRM tasks; in its validation experiment with scripted agents it named the right cause for 25 of 25 injected faults and raised 0 false alarms on 15 fault-free runs.`;
  }
  const ci = (k: number, n: number) => {
    const text = formatInterval(k, n);
    return text ? ` (${text})` : "";
  };
  let sentence =
    `Its benchmark has ${facts.scenarios} scenarios across three CRM tasks; in its validation experiment with ${agentWord(e)}${e.at ? ` (${e.at})` : ""} ` +
    `it named the right cause for ${e.detected.k} of ${e.detected.n} injected faults${ci(e.detected.k, e.detected.n)} ` +
    `and raised ${e.falseAlarms.k} false alarms on ${e.falseAlarms.n} fault-free runs${ci(e.falseAlarms.k, e.falseAlarms.n)}.`;
  if (e.falseSuccess) {
    sentence +=
      ` Of the runs that claimed success, ${e.falseSuccess.k} of ${e.falseSuccess.n} were false: ` +
      `the agent reported the task worked while the application's records disagreed${ci(e.falseSuccess.k, e.falseSuccess.n)}.`;
  }
  return sentence;
}

/** llms.txt (llmstxt.org): a plain-language summary that AI assistants can quote accurately. */
export function llmsTxt(siteUrl: string, facts: SiteFacts = siteFacts(REPO_ROOT)): string {
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

${NAME} began as a lab for browser AI agents: it records an agent's run, diagnoses why it failed with deterministic rules checked against the application's real state, and saves the failure as a replayable regression test. ${labSummarySentence(facts)}

## Links

- [Home](${siteUrl}/): what it does, an example walkthrough with transcript, FAQ
- [Guides by use case](${siteUrl}/guides)
${GUIDES.map((g) => `- [${g.label}](${siteUrl}/guides/${g.slug}): ${g.description}`).join("\n")}
- [Create an account](${siteUrl}/signup): sign up with Google or email and password
- [Example video](${siteUrl}/assets/demo.mp4): an unedited narrated walkthrough of a demo CRM
- [Example captions](${siteUrl}/assets/demo.vtt)

## FAQ

${FAQ.map(([q, a]) => `### ${q}\n\n${a}`).join("\n\n")}
`;
}

export const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26"><rect x=".5" y=".5" width="25" height="25" rx="7" fill="#1c1917"/><path d="M10 8.2v9.6l7.6-4.8z" fill="#f7f3ec"/><circle cx="20.2" cy="5.8" r="2.7" fill="#e5484d" stroke="#f7f3ec" stroke-width="1"/></svg>`;

/** Static files under /assets/: the demo media, the social image and self-hosted fonts. */
export function assetPath(name: string): { path: string; type: string } | null {
  const fonts: Record<string, string> = {
    "fonts/geist.woff2": "node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2",
    "fonts/geist-mono.woff2": "node_modules/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2",
    "fonts/fraunces.woff2": "node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2",
    "fonts/fraunces-italic.woff2": "node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-italic.woff2",
  };
  const types: Record<string, string> = { ".mp4": "video/mp4", ".webm": "video/webm", ".vtt": "text/vtt; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2" };
  const rel = fonts[name] ? resolve(SITE_DIR, "..", fonts[name]) : /^[a-z0-9-]+\.(mp4|webm|vtt|jpg|png)$/.test(name) ? join(SITE_DIR, "static", name) : null;
  if (!rel || !existsSync(rel)) return null;
  return { path: rel, type: types[rel.slice(rel.lastIndexOf("."))] ?? "application/octet-stream" };
}
