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

const DEFINITION =
  "Walkcast is a free, open-source tool that makes a narrated video walkthrough from a website link. A browser signs in, visits up to 30 pages on that site, and returns an MP4 with a spoken voice-over, WebVTT captions and a transcript. Every line comes from what the browser actually did.";

/** Cited on the public pages. Only sources the page's claims actually rest on. */
const SOURCES: { name: string; detail: string; url: string }[] = [
  {
    name: "WebVTT: The Web Video Text Tracks Format",
    detail: "W3C Recommendation. The caption file Walkcast writes is WebVTT.",
    url: "https://www.w3.org/TR/webvtt1/",
  },
  {
    name: "Wilson, E. B. (1927). Probable inference, the law of succession, and statistical inference.",
    detail: "Journal of the American Statistical Association, 22(158), 209–212. The 95% intervals on the lab numbers are Wilson score intervals.",
    url: "https://doi.org/10.1080/01621459.1927.10502953",
  },
  {
    name: "The MIT License",
    detail: "Walkcast is free software under the MIT license. There is no paid tier in the software.",
    url: "https://opensource.org/licenses/MIT",
  },
];

const COMPARE: { criterion: string; walkcast: string; manual: string }[] = [
  { criterion: "Starting point", walkcast: "A link to the site.", manual: "You open the site and a screen recorder." },
  { criterion: "Who narrates", walkcast: "Lines written from recorded browser events.", manual: "You talk, or you write a script and record it." },
  { criterion: "Pages behind a login", walkcast: "Signs in with a username and password held in memory. Stops at CAPTCHA and two-factor prompts.", manual: "You sign in yourself, including those prompts." },
  { criterion: "What you get", walkcast: "MP4 with voice-over, WebVTT captions, a WAV of the narration, and a page list with HTTP status.", manual: "A video file. Captions and a transcript are a separate job." },
  { criterion: "After the site changes", walkcast: "Run the same link again.", manual: "Click through and talk again, or leave the old video up." },
  { criterion: "Price", walkcast: "Free. MIT license. You run it.", manual: "Your time, plus whatever the recorder charges." },
];

const FAQ: [string, string][] = [
  [
    "What is Walkcast?",
    DEFINITION,
  ],
  [
    "What is a website video walkthrough?",
    "A screen recording that moves through a website page by page while a voice explains what is on screen. Teams use them for onboarding, product demos, support articles, QA evidence and handing a site over to a client.",
  ],
  [
    "How is Walkcast different from a screen recording?",
    "A screen recorder captures your display while you click and talk. Walkcast drives a browser from a link, signs in, and writes the narration from the actions it recorded. Use a screen recorder for meetings, desktop apps and commentary only you can give. The full comparison is on the Walkcast versus screen recording guide.",
  ],
  [
    "Is Walkcast free?",
    "Yes. The software is MIT licensed and has no paid tier, seat limit or usage meter. You run it yourself (Node.js 22 or newer, Playwright's Chromium, and ffmpeg with the flite voice for the narration audio). Machine-readable pricing is at /pricing.md.",
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
::selection{background:color-mix(in srgb,var(--signal) 30%,transparent);color:var(--ink)}
::-webkit-scrollbar{width:10px;height:10px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--ink-3) 35%,transparent);border-radius:999px;border:2px solid var(--paper)}::-webkit-scrollbar-thumb:hover{background:color-mix(in srgb,var(--ink-3) 55%,transparent)}
:focus-visible{outline:2px solid var(--signal);outline-offset:2px;border-radius:6px}
body{margin:0;background:radial-gradient(820px 420px at 0% -8%,color-mix(in srgb,var(--ember) 28%,transparent),transparent 62%),radial-gradient(640px 380px at 100% 0%,color-mix(in srgb,var(--caption) 42%,transparent),transparent 58%),var(--paper);color:var(--ink);font:16px/1.6 var(--body);text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased}
body::before{content:"";position:fixed;inset:0;pointer-events:none;opacity:var(--grain);background-image:${GRAIN};z-index:0}
body>*{position:relative;z-index:1}
a{color:inherit}img,video{max-width:100%;display:block}
.wrap{max-width:1160px;margin:0 auto;padding:0 max(20px,env(safe-area-inset-left))}
.mono{font-family:var(--mono)}
.eyebrow{display:inline-flex;align-items:center;gap:8px;max-width:100%;font:500 12px/1.2 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);margin:0}
.eyebrow::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--rec);box-shadow:0 0 0 3px color-mix(in srgb,var(--rec) 18%,transparent)}
h1,h2,h3{font-family:var(--display);font-weight:560;letter-spacing:-.022em;line-height:1.02;margin:0;font-optical-sizing:auto;text-wrap:balance}
h1 em,h2 em{font-style:italic;font-weight:480;color:var(--ember);padding-bottom:.08em}
header.top{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--paper) 74%,transparent);backdrop-filter:saturate(1.6) blur(16px);-webkit-backdrop-filter:saturate(1.6) blur(16px)}
header.top::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1px;background:linear-gradient(90deg,transparent,var(--line) 20%,var(--line) 80%,transparent)}
header.top .wrap{display:flex;align-items:center;gap:16px;height:64px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;font:600 21px var(--display);letter-spacing:-.02em}
header nav{display:flex;gap:2px;margin-left:auto;align-items:center}
header nav a{font-size:14.5px;text-decoration:none;color:var(--ink-2);padding:8px 12px;border-radius:999px}header nav a:hover{color:var(--ink);background:var(--panel-2)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:999px;background:var(--ink);color:var(--paper);font:500 15px var(--body);padding:13px 22px;text-decoration:none;cursor:pointer;white-space:nowrap;transition:transform .16s cubic-bezier(.22,1,.36,1),box-shadow .2s cubic-bezier(.22,1,.36,1),background-color .2s,border-color .2s}
.btn:hover{transform:translateY(-2px);box-shadow:0 10px 26px -12px color-mix(in srgb,var(--ink) 65%,transparent)}
.btn:active{transform:translateY(0) scale(.98)}
.btn.ghost{background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1px var(--line)}
.btn.ghost:active{box-shadow:inset 0 0 0 2px var(--line)}
.btn.small{padding:8px 16px;font-size:14px}
.hero{padding:36px 0 8px}
.hero-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(260px,.85fr);gap:36px 48px;align-items:end}
.hero h1{font-size:clamp(40px,4.6vw,60px);margin:14px 0 0;font-weight:560;letter-spacing:-.03em;line-height:1.08}
.hero .lede{font-size:clamp(17px,1.5vw,19px);color:var(--ink-2);max-width:36ch;margin:18px 0 26px}
.urlform{display:flex;gap:6px;max-width:540px;margin:0;background:var(--panel);border-radius:999px;padding:6px;box-shadow:var(--shadow),inset 0 0 0 1px var(--line);transition:box-shadow .2s,transform .15s}
.urlform input{flex:1;min-width:0;border:0;background:transparent;font:15px var(--mono);color:var(--ink);padding:10px 18px;outline:none}
.urlform input::placeholder{color:var(--ink-2)}
.urlform:focus-within{box-shadow:var(--shadow),inset 0 0 0 2px var(--ember)}
.urlform:hover{transform:translateY(-1px)}
.reel{background:#161513;color:#f3efe8;border-radius:22px;padding:18px 18px 8px;box-shadow:0 30px 60px -36px rgb(0 0 0/.55),inset 0 1px 0 rgb(255 255 255/.08);min-height:280px}
.reel-top{display:flex;align-items:center;gap:8px;font:500 11px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:#cfc8bd}
.reel-top i{width:8px;height:8px;border-radius:50%;background:#ff4d4f;display:block}
.reel ol{list-style:none;margin:16px 0 0;padding:0}
.reel li{display:grid;grid-template-columns:42px 1fr;gap:10px;padding:11px 0;border-top:1px solid rgb(255 255 255/.08);font-size:14.5px;color:#f3efe8}
.reel time{font:12px var(--mono);color:var(--caption);padding-top:3px}
.trust{border-top:1px solid var(--line);margin-top:36px}
.trust ul{list-style:none;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;margin:0;padding:0}
.trust{display:grid;place-items:center}
.trust ul{list-style:none;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;margin:0;padding:0}
.trust li{padding:18px 18px 18px 0;color:var(--ink-2);font-size:14.5px;transition:color .2s}
.trust li:hover{color:var(--ink)}
.trust strong{display:block;color:var(--ink);font-weight:600;font-size:15px}
.stage-band{padding:28px 0 12px}
.stage{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,340px);background:#0d0c0b;border-radius:28px;overflow:hidden;box-shadow:0 40px 80px -40px rgb(0 0 0/.55),0 0 0 1px rgb(255 255 255/.06);text-align:left;color:#f3efe8}
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
section.band{padding:88px 0}
section.band h2{font-size:clamp(34px,4.4vw,56px);max-width:18ch;margin:0}
section.band .intro{color:var(--ink-2);max-width:46ch;margin:14px 0 0;font-size:18px}
.wash{background:color-mix(in srgb,var(--panel-2) 72%,var(--paper))}
.flow{display:grid;grid-template-columns:1.25fr 1fr;grid-template-rows:auto auto;gap:14px;margin:36px 0 0;padding:0;list-style:none;counter-reset:s}
.flow li{background:var(--panel);border-radius:22px;padding:26px 26px 28px;box-shadow:inset 0 1px 0 rgb(255 255 255/.65),inset 0 0 0 1px var(--line);counter-increment:s}
.flow li:first-child{grid-row:1 / span 2;background:#161513;color:#f3efe8;display:flex;flex-direction:column;justify-content:space-between;min-height:320px}
.flow li:first-child::before{margin-bottom:0}
.flow li:first-child p{color:#cfc8bd}
.flow li::before{content:counter(s,decimal-leading-zero);display:block;font:italic 480 40px/1 var(--display);color:var(--ember);margin-bottom:28px}
.card{background:var(--panel);border-radius:20px;padding:26px;box-shadow:var(--shadow),inset 0 0 0 1px var(--line);text-align:left}
.card h3{font-size:24px;margin-bottom:8px}.card p{margin:0;color:var(--ink-2);font-size:15.5px}
.bento{display:grid;grid-template-columns:1.35fr 1fr .9fr;grid-template-rows:auto auto;gap:14px;margin-top:36px}
.tile{border-radius:22px;padding:26px;background:var(--panel);box-shadow:inset 0 1px 0 rgb(255 255 255/.7),inset 0 0 0 1px var(--line);min-height:180px;transition:transform .22s cubic-bezier(.22,1,.36,1),box-shadow .22s cubic-bezier(.22,1,.36,1)}
.tile:hover{transform:translateY(-2px);box-shadow:inset 0 1px 0 rgb(255 255 255/.7),inset 0 0 0 1px var(--line),0 18px 36px -24px color-mix(in srgb,var(--ink) 45%,transparent)}
.tile h3{font-size:26px;margin:8px 0}.tile p{margin:0;color:var(--ink-2);font-size:15.5px;max-width:36ch}
.tile-mp4{grid-column:1 / span 2;background:#161513;color:#f3efe8;min-height:240px;display:flex;flex-direction:column;justify-content:flex-end}
.tile-mp4 p{color:#cfc8bd}
.tile-mp4 .file{background:var(--caption);color:#3d3000}
.tile-pages{grid-column:3;grid-row:1 / span 2;background:color-mix(in srgb,var(--ember) 14%,var(--panel));min-height:100%}
.tile-vtt{background:color-mix(in srgb,var(--caption) 38%,var(--panel))}
.rail{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-top:36px;border-top:1px solid var(--line)}
.statcell{padding:26px 22px 4px 0}
.statcell + .statcell{box-shadow:inset 1px 0 0 var(--line);padding-left:22px}
.file{display:inline-block;font:500 12.5px var(--mono);color:var(--paper);background:var(--ink);padding:4px 10px;border-radius:999px;margin-bottom:18px}
.inkband{background:#0d0c0b;color:#f3efe8;padding:88px 0;box-shadow:inset 0 1px 0 rgb(255 255 255/.06),inset 0 -1px 0 rgb(255 255 255/.06)}
.inkband h2{color:#f3efe8}
.inkband .intro{color:#cfc8bd;margin-top:14px}
.inkband a{color:var(--caption)}
.price{font:560 clamp(64px,10vw,104px)/.9 var(--display);letter-spacing:-.04em;margin:18px 0 0;color:#f3efe8}
.price span{display:block;margin-top:12px;font:15.5px/1.45 var(--body);letter-spacing:0;color:#cfc8bd;max-width:28ch}
.plan{list-style:none;margin:18px 0 4px;padding:0}
.plan li{padding:11px 0;border-top:1px solid rgb(255 255 255/.08);font-size:14.5px;color:#f3efe8}
.plan strong{font-weight:600}
.safety{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:48px;align-items:end}
.checks{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 28px}
.checks li{padding-left:30px;position:relative;color:#cfc8bd;font-size:16px}.checks li strong{color:#f3efe8;font-weight:600}
.checks li::before{content:"✓";position:absolute;left:0;top:0;width:20px;height:20px;border-radius:50%;background:color-mix(in srgb,var(--pass) 14%,transparent);color:var(--pass);font:600 12px/20px var(--body);text-align:center}
.stat{font:560 clamp(34px,8vw,52px)/1 var(--display);letter-spacing:-.03em}.stat small{font:14px/1.45 var(--body);letter-spacing:0;color:var(--ink-2);display:block;margin-top:12px}
.faq{margin-top:28px;max-width:760px}
.faq details{border-bottom:1px solid var(--line);padding:20px 0}.faq summary{cursor:pointer;font:560 22px/1.25 var(--display);letter-spacing:-.01em;list-style:none;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:16px}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";font:300 26px/1 var(--body);color:var(--ink-3)}.faq details[open] summary::after{content:"−"}
.faq p{color:var(--ink-2);margin:12px 0 0;max-width:70ch}
.answer{max-width:68ch;font-size:18.5px;margin:14px 0 0;color:var(--ink)}
.compare{width:100%;border-collapse:collapse;margin-top:28px;font-size:15.5px}
.compare caption{text-align:left;font:500 12px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);margin-bottom:8px}
.compare th,.compare td{text-align:left;vertical-align:top;padding:14px 16px 14px 0;border-top:1px solid var(--line)}
.compare thead th{font:500 12px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);border-top:0}
.sources{list-style:none;margin:20px 0 0;padding:0;max-width:760px}
.sources li{padding:14px 0;border-top:1px solid var(--line);color:var(--ink-2);font-size:15.5px}
.sources a{color:var(--signal)}
.cta{padding:28px 0 88px}
.cta-panel{display:grid;grid-template-columns:minmax(0,1.4fr) auto;gap:28px 40px;align-items:end;background:radial-gradient(60% 80% at 0% 0%,color-mix(in srgb,var(--ember) 32%,transparent),transparent 60%),#161513;color:#f3efe8;border-radius:28px;padding:56px 48px;box-shadow:0 40px 80px -40px rgb(0 0 0/.65),0 0 0 1px rgb(255 255 255/.06)}
.cta-panel h2{max-width:14ch;font-size:clamp(36px,4.8vw,60px);color:#f3efe8}
.cta-panel p{color:#cfc8bd;font-size:17px;margin:12px 0 0;max-width:42ch}
.cta-panel .actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end}
.cta-panel .btn{background:var(--caption);color:#3d3000}
.cta-panel .btn.ghost{background:transparent;color:#f3efe8;box-shadow:inset 0 0 0 1px rgb(255 255 255/.28)}
footer{padding:36px 0 48px;color:var(--ink-3);font-size:14px}footer .wrap{display:flex;flex-wrap:wrap;gap:12px 24px;justify-content:space-between;border-top:1px solid var(--line);padding-top:28px}
.auth{min-height:calc(100dvh - 65px);display:grid;place-items:start center;padding:36px 0 64px}
.auth-shell{width:min(960px,100%);display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);background:var(--panel);border-radius:28px;overflow:hidden;box-shadow:var(--shadow),inset 0 0 0 1px var(--line)}
.auth-story{background:#161513;color:#f3efe8;padding:36px 32px;display:flex;flex-direction:column;justify-content:flex-start;min-height:100%}
.auth-story p{color:#cfc8bd;margin:12px 0 0;max-width:28ch}
.auth-story .kicker{font:500 12px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--caption);margin:0}
.auth .card{box-shadow:none;border-radius:0;padding:34px 32px}.auth h1{font-size:40px;margin:10px 0 6px}
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
.page-head{padding:28px 0 8px}.page-head h1{font-size:clamp(40px,5vw,64px);max-width:16ch;margin-top:8px}
.page-head .lede{font-size:19px;color:var(--ink-2);max-width:46ch;margin:16px 0 8px}
.guide-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:36px}
a.card{text-decoration:none;display:flex;flex-direction:column;min-height:210px;transition:transform .2s,box-shadow .2s}a.card:hover{transform:translateY(-3px);box-shadow:0 28px 56px -30px rgb(28 25 23/.45),inset 0 0 0 1px var(--line)}
a.card p{flex:1}a.card .more{font:500 13px var(--mono);color:var(--ember);margin-top:18px}
a.card.tone-ink{background:#161513;color:#f3efe8}a.card.tone-ink p{color:#cfc8bd}a.card.tone-ink .more{color:var(--caption)}
a.card.tone-sun{background:color-mix(in srgb,var(--caption) 46%,var(--panel))}
a.card.tone-ember{background:color-mix(in srgb,var(--ember) 16%,var(--panel))}
@media (max-width:900px){.hero-grid,.safety,.auth-shell,.cta-panel,.bento{grid-template-columns:1fr}.tile-mp4,.tile-pages{grid-column:auto;grid-row:auto}.flow{grid-template-columns:1fr}.flow li:first-child{grid-row:auto;min-height:0}.flow li:first-child::before{margin-bottom:22px}.stage{grid-template-columns:1fr}.transcript{border-left:0;border-top:1px solid rgb(255 255 255/.06)}.transcript ol{max-height:260px}.trust ul{grid-template-columns:1fr 1fr}.article{grid-template-columns:minmax(0,1fr)}.side{position:static}.guide-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.statcell + .statcell{box-shadow:none;padding-left:0}}
@media (max-width:680px){.hero{padding-top:20px}.urlform{flex-direction:column;border-radius:22px}.urlform .btn{width:100%}.checks,.guide-grid,.trust ul{grid-template-columns:1fr}header nav a.hide-sm{display:none}section.band,.inkband{padding:64px 0}.cta-panel{padding:32px 22px}.cta-panel .actions{justify-content:flex-start}.auth-story{min-height:0;padding:28px 22px}}
@media (max-width:400px){header nav a:not(.btn){display:none}.brand{font-size:19px}.auth .card{padding:24px 20px}.auth h1{font-size:34px}}
@media (prefers-reduced-motion:no-preference){.hero h1,.hero .lede,.urlform,.reel{animation:rise .8s cubic-bezier(.2,.7,.2,1) both}.hero .lede{animation-delay:.08s}.urlform{animation-delay:.14s}.reel{animation-delay:.2s}@keyframes rise{from{opacity:0;transform:translateY(12px)}}}
@media (prefers-reduced-motion:reduce){.stage figcaption::before{animation:none}}
:focus-visible{outline:2px solid var(--signal);outline-offset:2px}`;

const MARK = `<svg width="30" height="30" viewBox="0 0 26 26" aria-hidden="true"><rect x=".5" y=".5" width="25" height="25" rx="7" fill="currentColor"/><path d="M10 8.2v9.6l7.6-4.8z" fill="var(--paper)"/><circle cx="20.2" cy="5.8" r="2.7" fill="var(--rec)" stroke="var(--paper)" stroke-width="1"/></svg>`;

function layout(o: { siteUrl: string; path: string; title: string; description: string; body: string; head?: string; noindex?: boolean; user?: { email: string } | null }): string {
  const url = `${o.siteUrl}${o.path}`;
  const nav = o.user
    ? `<a href="/app#record" class="btn small">Open the app</a>`
    : `<a href="/how" class="hide-sm">How</a><a href="/lab" class="hide-sm">Lab</a><a href="/guides" class="hide-sm">Guides</a><a href="/pricing">Pricing</a><a href="/login">Sign in</a><a href="/signup" class="btn small">Get started</a>`;
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
<meta property="og:locale" content="en_US">
<meta name="twitter:site" content="@walkcast">
<meta property="og:video" content="${o.siteUrl}/assets/demo.mp4"><meta property="og:video:type" content="video/mp4">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(o.title)}">
<meta name="twitter:description" content="${esc(o.description)}">
<meta name="twitter:image" content="${o.siteUrl}/assets/og.png">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="text/plain" href="${esc(o.siteUrl)}/llms.txt" title="LLM-readable summary">
<link rel="alternate" type="text/markdown" href="${esc(o.siteUrl)}/pricing.md" title="Pricing">
<link rel="preload" href="/assets/fonts/fraunces.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/geist.woff2" as="font" type="font/woff2" crossorigin>
<style>${CSS}</style>
${o.head ?? ""}
</head>
<body>
<a href="#main" class="eyebrow" style="position:absolute;left:-9999px">Skip to content</a>
<header class="top"><div class="wrap"><a class="brand" href="/" aria-label="${NAME} home">${MARK}<span>${NAME}</span></a><nav aria-label="Main">${nav}</nav></div></header>
<main id="main">${o.body}</main>
<footer><div class="wrap"><span>© ${new Date().getFullYear()} ${NAME} · <a href="https://opensource.org/licenses/MIT">MIT licensed</a></span><span><a href="/how">How</a> · <a href="/lab">Lab</a> · <a href="/safety">Safety</a> · <a href="/guides">Guides</a> · <a href="/pricing">Pricing</a> · <a href="/llms.txt">llms.txt</a> · <a href="/sitemap.xml">Sitemap</a></span></div></footer>
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
  return cards.map(([value, note]) => `<div class="statcell"><div class="stat">${value}<small>${note}</small></div></div>`).join("\n    ");
}

/**
 * A red light that travels a box's border, like a record light circling the frame. The element
 * goes inside a `position:relative` parent with a border radius; it is hidden where `offset-path:
 * rect()` is unsupported and holds still for reduced motion.
 */
function trailCss(sel: string, size: number, seconds: number): string {
  return `${sel}{display:none}
@supports (offset-path:rect(0 auto auto 0)){
  ${sel}{display:block;position:absolute;inset:0;border-radius:inherit;border:1.5px solid transparent;pointer-events:none;overflow:hidden;-webkit-mask:linear-gradient(transparent,transparent) padding-box,linear-gradient(#000,#000) border-box;mask:linear-gradient(transparent,transparent) padding-box,linear-gradient(#000,#000) border-box;-webkit-mask-composite:source-in;mask-composite:intersect}
  ${sel} i{position:absolute;width:${size}px;aspect-ratio:1;background:radial-gradient(closest-side,#ff6369,rgb(255 99 105/.35) 45%,transparent);offset-path:rect(0 auto auto 0 round ${size}px);animation:trail ${seconds}s linear infinite}
}
@keyframes trail{to{offset-distance:100%}}
@media (prefers-reduced-motion:reduce){${sel} i{animation:none;offset-distance:12%}}`;
}

/*
  Home page, page-scoped styles. The demo is the hero: a headline over the real recording, framed
  like a screen with the record light running round it. Steps read as scenes, lab numbers as a
  scoreboard, the rules as a grid on the dark band.
*/
const LANDING_CSS = `
.ld-hero{padding:56px 0 8px;text-align:center}
.ld-hero .eyebrow{justify-content:center}
.ld-hero h1{font-size:clamp(48px,7.6vw,104px);letter-spacing:-.04em;line-height:.96;margin:18px auto 0;max-width:11ch}
.ld-hero .lede{font-size:clamp(17px,1.6vw,20px);color:var(--ink-2);max-width:40ch;margin:22px auto 0}
.ld-hero .urlform{margin:30px auto 0}
.ld-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;list-style:none;padding:0;margin:20px 0 0}
.ld-chips li{font-size:13.5px;color:var(--ink-2);padding:7px 13px;border-radius:999px;background:color-mix(in srgb,var(--panel) 70%,transparent);box-shadow:inset 0 0 0 1px var(--line)}
.ld-chips strong{color:var(--ink);font-weight:600}
.ld-screen{position:relative;margin:52px auto 0;border-radius:34px;padding:8px;background:color-mix(in srgb,var(--ink) 5%,transparent);box-shadow:inset 0 0 0 1px var(--line);text-align:left}
.ld-screen .stage{border-radius:26px}
${trailCss(".ld-trail", 180, 9)}
.ld-what{display:grid;grid-template-columns:minmax(0,.7fr) minmax(0,1.3fr);gap:20px 64px;align-items:start;padding:80px 0 16px}
.ld-what h2{font-size:clamp(30px,3.2vw,40px)}
#what-is .answer{font:400 clamp(21px,2.2vw,28px)/1.38 var(--display);letter-spacing:-.01em;margin:0;max-width:36ch}
.ld-what .meta{grid-column:2;margin:0}
.ld-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:end;gap:14px 40px}
.ld-head h2{max-width:16ch}
.ld-head .intro{margin:0!important;max-width:40ch!important}
.ld-scenes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;list-style:none;padding:0;margin:40px 0 0}
.ld-scenes li{border-radius:22px;background:var(--panel);box-shadow:var(--shadow),inset 0 0 0 1px var(--line);overflow:hidden;display:flex;flex-direction:column}
.ld-scenes li::before{content:"";height:16px;background:repeating-linear-gradient(-55deg,var(--ink) 0 14px,var(--panel) 14px 28px);border-bottom:1px solid var(--line)}
.ld-scenes li:nth-child(2){transform:translateY(18px)}
.ld-scenes li:nth-child(3){transform:translateY(36px)}
.ld-scene{padding:22px 24px 26px}
.ld-no{display:flex;justify-content:space-between;font:500 11.5px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);margin-bottom:26px}
.ld-no b{font-weight:500;color:var(--rec)}
.ld-scene h3{font-size:26px}.ld-scene p{margin:10px 0 0;color:var(--ink-2);font-size:15.5px}
#how{padding-bottom:124px}
.ld-files{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:14px;margin-top:40px}
.ld-mp4{position:relative;display:flex;flex-direction:column;justify-content:space-between;gap:48px;min-height:360px;padding:28px;border-radius:24px;color:#f3efe8;background:radial-gradient(70% 90% at 100% 0%,color-mix(in srgb,var(--ember) 30%,transparent),transparent 60%),#161513;box-shadow:0 34px 70px -40px rgb(0 0 0/.7)}
.ld-mp4 h3{font-size:clamp(30px,3.4vw,44px)}.ld-mp4 p{color:#cfc8bd;margin:10px 0 0;max-width:34ch}
.ld-play{width:64px;height:64px;border-radius:50%;display:grid;place-items:center;background:var(--caption);color:#3d3000}
.ld-filelist{display:grid;gap:14px;list-style:none;margin:0;padding:0}
.ld-filelist li{display:grid;grid-template-columns:150px minmax(0,1fr);gap:18px;align-items:center;padding:22px 24px;border-radius:20px;background:var(--panel);box-shadow:inset 0 0 0 1px var(--line);transition:transform .22s cubic-bezier(.22,1,.36,1)}
.ld-filelist li:hover{transform:translateX(4px)}
.ld-filelist .file{margin:0;justify-self:start}
.ld-filelist h3{font-size:21px}.ld-filelist p{margin:4px 0 0;color:var(--ink-2);font-size:15px}
.ld-rules{list-style:none;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;margin:40px 0 0;padding:0;border-radius:22px;overflow:hidden;background:rgb(255 255 255/.09);box-shadow:0 0 0 1px rgb(255 255 255/.09)}
.ld-rules li{background:#0d0c0b;padding:26px 26px 30px;color:#cfc8bd;font-size:15.5px}
.ld-rules strong{display:block;margin-bottom:8px;font:560 22px/1.15 var(--display);letter-spacing:-.01em;color:#f3efe8}
.ld-rules li::before{content:"";display:block;width:8px;height:8px;border-radius:50%;background:var(--pass);box-shadow:0 0 0 4px rgb(111 211 154/.15);margin-bottom:22px}
#safety h2{font-size:clamp(34px,4.4vw,56px);max-width:16ch}
#agents .rail{gap:14px;border-top:0}
#agents .statcell{padding:26px 24px 28px;border-radius:22px;background:#161513;box-shadow:inset 0 0 0 1px rgb(255 255 255/.06)}
#agents .statcell + .statcell{padding-left:24px;box-shadow:inset 0 0 0 1px rgb(255 255 255/.06)}
#agents .stat{color:var(--caption);font-family:var(--mono);font-weight:500;letter-spacing:-.04em}
#agents .stat small{color:#cfc8bd;font-size:14px}
.ld-table{margin-top:32px;padding:4px 24px 8px;border-radius:22px;background:var(--panel);box-shadow:var(--shadow),inset 0 0 0 1px var(--line);overflow-x:auto}
.ld-table .compare{margin-top:14px}
.ld-table .compare td:nth-child(2){color:var(--ink);font-weight:500}
.ld-table .compare td:nth-child(3){color:var(--ink-2)}
.ld-table thead th:nth-child(2){color:var(--ink)}
.ld-table thead th:nth-child(2)::before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--rec);margin-right:8px;vertical-align:1px}
.ld-faq{display:grid;grid-template-columns:minmax(0,.75fr) minmax(0,1.25fr);gap:24px 64px;align-items:start}
.ld-faq>div:first-child{position:sticky;top:96px}
.ld-faq .faq{margin-top:0}
.ld-sources{margin-top:72px;padding-top:40px;border-top:1px solid var(--line)}
.ld-sources .sources{max-width:none;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.ld-sources .sources li{border:0;padding:20px;border-radius:18px;background:var(--panel);box-shadow:inset 0 0 0 1px var(--line);font-size:14.5px}
.ld-sources .sources a{display:block;margin-bottom:6px;font-weight:500}
.cta-panel{position:relative}
${trailCss(".ld-cta-trail", 160, 10)}
@media (max-width:900px){.ld-what,.ld-files,.ld-faq{grid-template-columns:1fr}.ld-what .meta{grid-column:auto}.ld-scenes,.ld-rules,.ld-sources .sources{grid-template-columns:1fr}.ld-scenes li:nth-child(n){transform:none}#how{padding-bottom:88px}.ld-faq>div:first-child{position:static}.ld-mp4{min-height:280px}}
@media (max-width:520px){.ld-hero{padding-top:28px}.ld-screen{padding:5px;border-radius:24px;margin-top:36px}.ld-screen .stage{border-radius:20px}.ld-filelist li{grid-template-columns:1fr;gap:10px}.ld-table{padding:4px 16px 8px}.ld-table .compare tr{display:grid;grid-template-columns:1fr 1fr;column-gap:14px;border-top:1px solid var(--line)}.ld-table .compare thead tr{border-top:0}.ld-table .compare th,.ld-table .compare td{border-top:0;padding:10px 0}.ld-table .compare th[scope=row],.ld-table thead th:first-child{grid-column:1/-1;padding-bottom:0}.ld-table thead th:first-child{display:none}}
@media (prefers-reduced-motion:no-preference){.ld-hero .eyebrow,.ld-hero h1,.ld-hero .lede,.ld-hero .urlform,.ld-chips,.ld-screen{animation:rise .8s cubic-bezier(.2,.7,.2,1) both}.ld-hero h1{animation-delay:.04s}.ld-hero .lede{animation-delay:.1s}.ld-hero .urlform{animation-delay:.16s}.ld-chips{animation-delay:.22s}.ld-screen{animation-delay:.3s}@keyframes rise{from{opacity:0;transform:translateY(14px)}}}`;

export function landingPage(siteUrl: string, user: { email: string } | null, facts: SiteFacts = siteFacts(REPO_ROOT)): string {
  const d = demo();
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const iso = (s: number) => `PT${Math.floor(s / 60)}M${Math.round(s % 60)}S`;
  const transcriptText = d.captions.map((c) => c.text).join(" ");
  const title = "Website Video Walkthrough Generator: Narrated Videos From a Link | Walkcast";

  const structured = jsonLd({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#org`,
        name: NAME,
        url: `${siteUrl}/`,
        logo: `${siteUrl}/favicon.svg`,
        description: DESCRIPTION,
        license: "https://opensource.org/licenses/MIT",
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: `${siteUrl}/`,
        name: NAME,
        description: DESCRIPTION,
        inLanguage: "en",
        publisher: { "@id": `${siteUrl}/#org` },
      },
      {
        "@type": "WebPage",
        "@id": `${siteUrl}/#webpage`,
        url: `${siteUrl}/`,
        name: title,
        description: DESCRIPTION,
        isPartOf: { "@id": `${siteUrl}/#website` },
        about: { "@id": `${siteUrl}/#app` },
        dateModified: `${GUIDES_UPDATED}T00:00:00Z`,
        inLanguage: "en",
        speakable: { "@type": "SpeakableSpecification", cssSelector: ["#what-is .answer"] },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${siteUrl}/#app`,
        name: NAME,
        url: `${siteUrl}/`,
        description: DEFINITION,
        applicationCategory: "MultimediaApplication",
        applicationSubCategory: "Website video walkthrough generator",
        operatingSystem: "Web, macOS, Windows, Linux",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Free, MIT licensed. No paid tier." },
        author: { "@id": `${siteUrl}/#org` },
        citation: SOURCES.map((s) => ({ "@type": "CreativeWork", name: s.name, url: s.url })),
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
        "@type": "ItemList",
        "@id": `${siteUrl}/#compare`,
        name: "Walkcast versus recording a website walkthrough yourself",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Walkcast",
            description: "A browser records the site from a link and narrates from the actions it took. Free, MIT licensed.",
            url: `${siteUrl}/guides/walkcast-vs-screen-recording`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Screen recording by hand",
            description: "You click through the site and talk. Right for meetings, desktop apps and commentary the browser cannot see.",
          },
        ],
      },
      {
        "@type": "FAQPage",
        "@id": `${siteUrl}/#faq`,
        mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
      },
    ],
  });

  const body = `
<section class="ld-hero"><div class="wrap">
  <p class="eyebrow">Narrated website walkthroughs</p>
  <h1>Paste a link. Get it <em>narrated.</em></h1>
  <p class="lede">A browser signs in, walks the pages, and returns an MP4 with voice-over, captions and a transcript.</p>
  <form class="urlform" action="/start" method="get" role="search" aria-label="Start a walkthrough">
    <label for="url" style="position:absolute;left:-9999px">Your website's link</label>
    <input id="url" name="url" type="url" inputmode="url" autocomplete="url" placeholder="https://your-app.com/login" required>
    <button class="btn" type="submit">Make my walkthrough</button>
  </form>
  <ul class="ld-chips">
    <li><strong>Free</strong> · MIT licensed</li>
    <li><strong>Works behind a login</strong></li>
    <li><strong>Password never saved</strong></li>
    <li><strong>Stops at CAPTCHA and 2FA</strong></li>
  </ul>
  <div class="ld-screen" id="demo">
    <span class="ld-trail" aria-hidden="true"><i></i></span>
    <div class="stage">
      <figure>
        <video id="demo-video" controls playsinline preload="metadata" poster="/assets/demo-poster.jpg" aria-describedby="demo-transcript">
          <source src="/assets/demo.mp4" type="video/mp4">
          <source src="/assets/demo.webm" type="video/webm">
          <track kind="captions" src="/assets/demo.vtt" srclang="en" label="Narration" default>
        </video>
        <figcaption>Real output · unedited · ${clock(d.durationSeconds)}</figcaption>
      </figure>
      <aside class="transcript" aria-label="Transcript">
        <header><p class="eyebrow">Transcript</p><h2 style="font-size:22px;margin-top:6px">Signing in to a demo CRM</h2></header>
        <ol id="demo-transcript">${d.captions.map((c) => `<li data-t="${c.start}"><time datetime="${iso(c.start)}">${clock(c.start)}</time><span>${esc(c.text)}</span></li>`).join("")}</ol>
      </aside>
    </div>
  </div>
</div></section>

<section id="what-is"><div class="wrap ld-what">
  <h2>What is Walkcast?</h2>
  <p class="answer">${esc(DEFINITION)}</p>
  <p class="meta">Updated <time datetime="${GUIDES_UPDATED}">${GUIDES_UPDATED}</time></p>
</div></section>

<section class="band" id="how"><div class="wrap">
  <div class="ld-head">
    <h2>Three steps. About two <em>minutes.</em></h2>
    <p class="intro">You don't write a script. A real browser does the walk, and every line comes from what it actually did. <a href="/how">How a recording runs</a></p>
  </div>
  <ol class="ld-scenes">${HOW.map(([t, p], i) => `<li><div class="ld-scene"><span class="ld-no">Scene ${String(i + 1).padStart(2, "0")}<b>●</b></span><h3>${t}</h3><p>${p}</p></div></li>`).join("")}</ol>
</div></section>

<section class="band wash" id="output"><div class="wrap">
  <div class="ld-head">
    <h2>One video, and the files around it.</h2>
    <p class="intro">Send the MP4. Keep the captions, the voice-over and the page list for the next cut.</p>
  </div>
  <div class="ld-files">
    <article class="ld-mp4">
      <span class="ld-play" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg></span>
      <div><span class="file" style="background:var(--caption);color:#3d3000">recording.mp4</span><h3>Narrated video</h3><p>H.264 with a spoken voice-over and an embedded caption track. Plays everywhere.</p></div>
    </article>
    <ul class="ld-filelist">
      <li><span class="file">captions.vtt</span><div><h3>Captions</h3><p>Timed to the speech, for accessible embeds and video hosts.</p></div></li>
      <li><span class="file">narration.wav</span><div><h3>Audio</h3><p>The voice-over on its own, to re-cut or re-voice.</p></div></li>
      <li><span class="file">pages · status</span><div><h3>Page list</h3><p>Every page visited, its title and HTTP status, and the links skipped on purpose.</p></div></li>
    </ul>
  </div>
</div></section>

<section class="inkband" id="safety"><div class="wrap">
  <div class="ld-head">
    <h2>A careful visitor, not a bot let loose.</h2>
    <p class="intro"><a href="/safety">The rules, in full</a></p>
  </div>
  <ul class="ld-rules">
    <li><strong>Only sites you may test.</strong> Every recording needs your confirmation.</li>
    <li><strong>Password stays in memory.</strong> Files on disk show a placeholder.</li>
    <li><strong>Stops at CAPTCHA and 2FA.</strong> It never tries to get past them.</li>
    <li><strong>Read-only after sign-in.</strong> No forms submitted; sign-out and delete links skipped.</li>
    <li><strong>Same site only.</strong> Follows links on your domain, respects robots.txt, paces requests.</li>
    <li><strong>Honest narration.</strong> Written from recorded events, never invented.</li>
  </ul>
</div></section>

<section class="band" id="agents"><div class="wrap">
  <div class="ld-head">
    <h2>When an agent fails, keep the test.</h2>
    <p class="intro">The same recorder powers Walkcast Lab. It captures a browser-agent run, names the cause from the app's real state, and saves a replayable regression. Intervals are 95% Wilson score intervals. <a href="/lab">The lab, in full</a></p>
  </div>
  <div class="rail">${labCards(facts)}
  </div>
</div></section>

<section class="band wash" id="compare"><div class="wrap">
  <div class="ld-head">
    <h2>Walkcast vs recording it yourself.</h2>
    <p class="intro">A screen recorder captures your display while you talk. Walkcast drives a browser from a link and writes the narration from what that browser did. They are for different videos.</p>
  </div>
  <div class="ld-table">
  <table class="compare">
    <caption>How the two ways of making a website walkthrough differ</caption>
    <thead><tr><th scope="col">Criterion</th><th scope="col">Walkcast</th><th scope="col">Screen recording</th></tr></thead>
    <tbody>${COMPARE.map((row) => `<tr><th scope="row">${esc(row.criterion)}</th><td>${esc(row.walkcast)}</td><td>${esc(row.manual)}</td></tr>`).join("")}    </tbody>
  </table>
  </div>
  <p class="intro" style="margin-top:18px"><a href="/guides/walkcast-vs-screen-recording">Full comparison, including when a screen recorder is the better tool</a></p>
</div></section>

<section class="band" id="guides"><div class="wrap">
  <div class="ld-head">
    <h2>Walkthroughs, by the job.</h2>
    <p class="intro">What to show, how many pages, which account to use, and where the video goes afterwards.</p>
  </div>
  <div class="guide-grid">${GUIDES.map((g, i) => guideCard(g, i)).join("")}</div>
</div></section>

<section class="band wash" id="faq"><div class="wrap">
  <div class="ld-faq">
    <div><p class="eyebrow">FAQ</p><h2 style="margin-top:14px">Questions, answered in the page.</h2></div>
    <div class="faq">${FAQ.map(([q, a], i) => `<details${i < 2 ? " open" : ""}><summary><h3 style="font:inherit;margin:0">${esc(q)}</h3></summary><p>${esc(a)}</p></details>`).join("")}</div>
  </div>
  <div class="ld-sources">
    <h2 id="sources">Sources</h2>
    <p class="intro">Claims on this page rest on these. The lab counts are from the published Walkcast experiment with scripted agents, not from a survey of other tools.</p>
    <ol class="sources">${SOURCES.map((s) => `<li><a href="${esc(s.url)}">${esc(s.name)}</a> ${esc(s.detail)}</li>`).join("")}</ol>
  </div>
</div></section>

<section class="cta"><div class="wrap">
  <div class="cta-panel">
    <span class="ld-cta-trail" aria-hidden="true"><i></i></span>
    <div>
      <h2>Your site, walked and <em>narrated.</em></h2>
      <p>Create a free account with Google or email and record the first one.</p>
    </div>
    <div class="actions"><a class="btn" href="${user ? "/app#record" : "/signup"}">${user ? "Open the app" : "Get started"}</a><a class="btn ghost" href="#demo">Watch the example</a></div>
  </div>
</div></section>
<script>
(function(){var v=document.getElementById("demo-video"),items=[].slice.call(document.querySelectorAll("#demo-transcript li"));if(!v)return;
items.forEach(function(li){li.addEventListener("click",function(){v.currentTime=+li.dataset.t;v.play()})});
v.addEventListener("timeupdate",function(){var t=v.currentTime,on=null;items.forEach(function(li){if(+li.dataset.t<=t)on=li;li.classList.remove("on")});if(on)on.classList.add("on")})})();
</script>`;
  return layout({ siteUrl, path: "/", title, description: DESCRIPTION, body, head: `${structured}\n<style>${LANDING_CSS}</style>`, user });
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
  opts: { google: boolean; next: string; openrouter?: boolean; chatgpt?: boolean; url?: string; forgot?: boolean; provider?: "local" | "supabase"; notice?: string },
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
  <div class="auth-shell">
  <div class="auth-story">
    <p class="kicker">Walkcast</p>
    <h2 style="font-size:clamp(32px,4vw,46px);max-width:12ch">Your site, walked and narrated.</h2>
    <p>An MP4, captions and a transcript. The password stays in memory.</p>
  </div>
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
     ${opts.openrouter ? `<a class="btn rbtn" style="margin-top:10px" href="/auth/openrouter?next=${encodeURIComponent(opts.next)}">Continue with OpenRouter (uses your credits)</a>` : ""}
     ${opts.chatgpt ? `<a class="btn cbtn" style="margin-top:10px" href="/auth/chatgpt?next=${encodeURIComponent(opts.next)}">Continue with ChatGPT (uses your plan)</a>` : ""}
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

function guideCard(g: Guide, i = 0): string {
  const tone = i === 0 ? " tone-ink" : i === 1 ? " tone-sun" : i === 3 ? " tone-ember" : "";
  return `<a class="card${tone}" href="/guides/${g.slug}"><h3>${esc(g.label)}</h3><p>${esc(g.description)}</p><span class="more">Read the guide</span></a>`;
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
<div class="wrap page-head">
  <nav class="crumbs" aria-label="Breadcrumb" style="margin-top:8px"><a href="/">Home</a> / Guides</nav>
  <h1>Walkthroughs, by the job you need done.</h1>
  <p class="lede">${esc(description)}</p>
  <div class="guide-grid" style="margin-bottom:72px">${GUIDES.map((g, i) => guideCard(g, i)).join("")}</div>
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
      <p class="meta">For: ${esc(g.audience)} · Updated <time datetime="${GUIDES_UPDATED}">${GUIDES_UPDATED}</time> · <a href="/#sources">Sources</a></p>
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

function startForm(id: string): string {
  return `<form class="urlform" action="/start" method="get" aria-label="Start a walkthrough">
    <label for="${id}" style="position:absolute;left:-9999px">Your website's link</label>
    <input id="${id}" name="url" type="url" inputmode="url" autocomplete="url" placeholder="https://your-app.com/login" required>
    <button class="btn" type="submit">Make my walkthrough</button>
  </form>`;
}

function endCta(user: { email: string } | null, heading: string, text: string, opts?: { em?: string; ghostHref?: string; ghostLabel?: string }): string {
  const href = user ? "/app#record" : "/signup";
  const label = user ? "Open the app" : "Get started";
  const h2 = opts?.em ? `${esc(heading)} <em>${esc(opts.em)}</em>` : esc(heading);
  const ghost = opts?.ghostHref ? `<a class="btn ghost" href="${esc(opts.ghostHref)}">${esc(opts.ghostLabel ?? "Watch the example")}</a>` : "";
  return `<section class="cta"><div class="wrap"><div class="cta-panel"><div><h2>${h2}</h2><p>${esc(text)}</p></div><div class="actions"><a class="btn" href="${href}">${label}</a>${ghost}</div></div></div></section>`;
}

function crumb(here: string): string {
  return `<nav class="crumbs" aria-label="Breadcrumb" style="margin-top:8px"><a href="/">Home</a> / ${esc(here)}</nav>`;
}

const RECORD_STEPS: [string, string][] = [
  ["Find the start page", "The link you paste is where the browser opens. Use the sign-in page when the useful screens are behind a login."],
  ["Sign in, if you gave credentials", "It looks for an ordinary form, including email-then-password in two steps. The password stays in memory. A CAPTCHA or a second factor stops the recording."],
  ["Follow links on that site", "After sign-in it loads pages the way a visitor would, up to 30 of them, on the same site. It does not submit forms, and it skips sign-out, delete, cancel and unsubscribe links."],
  ["Write the narration from the trace", "Each line names a page opened, a field typed into, a click, or what the site answered. Nothing is added about why someone might do it."],
  ["Pack the files", "You get an MP4 with the voice-over and an embedded caption track, a WebM copy, the narration as WAV, WebVTT captions, and the page list with HTTP status."],
];

/** How a recording actually runs, past the three cards on the home page. */
export function howPage(siteUrl: string, user: { email: string } | null): string {
  const title = "How Walkcast Records a Website Walkthrough";
  const description = "What happens after you paste a link: sign-in, up to 30 pages on the same site, narration written from the browser's actions, and the files you get back.";
  const head = jsonLd({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": `${siteUrl}/how#page`, url: `${siteUrl}/how`, name: title, description },
      {
        "@type": "HowTo",
        name: "How Walkcast records a narrated website walkthrough",
        totalTime: "PT2M",
        tool: [{ "@type": "HowToTool", name: NAME }],
        step: RECORD_STEPS.map(([name, text], i) => ({ "@type": "HowToStep", position: i + 1, name, text, url: `${siteUrl}/how#step-${i + 1}` })),
      },
      breadcrumbs(siteUrl, [["How", "/how"]]),
    ],
  });
  const body = `
<section class="hero"><div class="wrap">
  ${crumb("How")}
  <p class="eyebrow">How a recording runs</p>
  <h1>A browser walks the site.<br>You get the <em>video.</em></h1>
  <p class="lede">${esc(description)}</p>
  ${startForm("how-url")}
</div></section>
<section class="band wash" style="padding-top:48px"><div class="wrap prose">
  <h2>What happens after you paste the link.</h2>
  <ol class="howto">${RECORD_STEPS.map(([t, d], i) => `<li id="step-${i + 1}"><strong>${esc(t)}.</strong> ${esc(d)}</li>`).join("")}</ol>
</div></section>
<section class="inkband"><div class="wrap">
  <h2>What it will not do.</h2>
  <ul class="checks">
    <li><strong>No CAPTCHA or 2FA bypass.</strong> The recording stops and tells you.</li>
    <li><strong>No other sites.</strong> Links that leave your domain are not followed.</li>
    <li><strong>No writes after sign-in.</strong> Forms stay unsubmitted.</li>
    <li><strong>No guessed narration.</strong> If the trace doesn't contain it, the voice doesn't say it.</li>
  </ul>
  <p class="intro"><a href="/safety">Safety rules</a></p>
</div></section>
${endCta(user, "Paste a link.", "About two minutes for a short site. The password is not written to disk.", { em: "Get the video.", ghostHref: "/#demo", ghostLabel: "Watch the example" })}`;
  return layout({ siteUrl, path: "/how", title: `${title} | ${NAME}`, description, body, head, user });
}

/** Walkcast Lab: the same recorder, used on browser-agent failures. */
export function labPage(siteUrl: string, user: { email: string } | null, facts: SiteFacts = siteFacts(REPO_ROOT)): string {
  const title = "Walkcast Lab: Browser Agent Failures as Regression Tests";
  const description = "Record a browser-agent run, name why it failed from the application's real state, and replay that failure as a regression test.";
  const head = jsonLd({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": `${siteUrl}/lab#page`, url: `${siteUrl}/lab`, name: title, description },
      breadcrumbs(siteUrl, [["Lab", "/lab"]]),
    ],
  });
  const body = `
<section class="hero"><div class="wrap">
  ${crumb("Lab")}
  <p class="eyebrow">Walkcast Lab</p>
  <h1>When an agent fails,<br>keep the <em>test.</em></h1>
  <p class="lede">${esc(description)}</p>
  <a class="btn" href="${user ? "/app" : "/signup"}">${user ? "Open the lab" : "Get started"}</a>
</div></section>
<section class="band" style="padding-top:36px"><div class="wrap">
  <div class="rail">${labCards(facts)}</div>
  <p class="intro">The intervals are 95% Wilson score intervals. The published experiment uses scripted agents. A number is only shown when the committed results contain it.</p>
</div></section>
<section class="band wash"><div class="wrap">
  <h2>Four moves, then a replay.</h2>
  <ol class="flow">
    <li><div><h3>Capture the run</h3><p>Every action records the application's state before and after, the target it aimed at, and the network and console around it.</p></div></li>
    <li><div><h3>Check the app, not the claim</h3><p>A success toast is not proof. The oracle reads the application's records.</p></div></li>
    <li><div><h3>Name a cause, or don't</h3><p>Deterministic rules cite the steps. Anything they can't explain stays unexplained instead of being guessed.</p></div></li>
  </ol>
  <div class="card" style="margin-top:14px"><h3>Replay it</h3><p>The failure is saved as a fixture: task, fault, seed, timings and the original diagnosis. Replay it on the next agent version and see whether the bug is gone.</p></div>
</div></section>
${endCta(user, "Open a run.", "The lab lives in the same app as the recorder.", { em: "Keep the failure." })}`;
  return layout({ siteUrl, path: "/lab", title: `${title} | ${NAME}`, description, body, head, user });
}

const SAFETY: [string, string][] = [
  ["You confirm the site", "Every recording asks you to say you own the site or may test it. That confirmation is part of the job, not a footnote."],
  ["The password stays in memory", "It is used for the sign-in and then dropped. Traces, captions and files on disk show a placeholder. The narration says a password was entered and does not read it out."],
  ["CAPTCHA and two-factor stop it", "The recorder does not try to solve a CAPTCHA, a bot check or a second-factor prompt. It stops and tells you."],
  ["Read-only after sign-in", "It follows links with ordinary page loads. It does not submit forms. Sign-out, delete, cancel and unsubscribe links are skipped."],
  ["Same site, paced, robots.txt", "It stays on the site you named, respects robots.txt, and does not hammer the server."],
  ["Narration from the trace", "Lines come from pages opened, fields typed into, clicks and the site's responses. Intent is not invented."],
];

/** The recording rules, written out past the six checks on the home page. */
export function safetyPage(siteUrl: string, user: { email: string } | null): string {
  const title = "How a Walkcast Recording Stays Careful";
  const description = "Walkcast signs in only with credentials you give it, stops at CAPTCHA and two-factor prompts, and does not submit forms or leave your site after sign-in.";
  const head = jsonLd({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": `${siteUrl}/safety#page`, url: `${siteUrl}/safety`, name: title, description },
      breadcrumbs(siteUrl, [["Safety", "/safety"]]),
    ],
  });
  const body = `
<section class="hero"><div class="wrap">
  ${crumb("Safety")}
  <p class="eyebrow">Safety</p>
  <h1>A careful visitor,<br>not a bot <em>let loose.</em></h1>
  <p class="lede">${esc(description)}</p>
  ${startForm("safety-url")}
</div></section>
<section class="inkband"><div class="wrap safety">
  <div>
    <h2>The rules, before you record.</h2>
    <p class="intro">Internal tools are recorded by running Walkcast on a machine that can already reach them. A publicly hosted recorder refuses private and local addresses.</p>
  </div>
  <ul class="checks">${SAFETY.map(([t, d]) => `<li><strong>${esc(t)}.</strong> ${esc(d)}</li>`).join("")}</ul>
</div></section>
${endCta(user, "Record a site you may test.", "The confirmation is required before a recording starts.", { em: "Then press record." })}`;
  return layout({ siteUrl, path: "/safety", title: `${title} | ${NAME}`, description, body, head, user });
}

/*
  Pricing, page-scoped styles. Three cards for where Walkcast runs (two at $0, one plan that is
  not sold), a billing toggle that only proves the point, and the whole thing itemised as a ticket.
*/
const PRICING_CSS = `
.pr-head{text-align:center;padding:44px 0 6px}
.pr-head .crumbs{text-align:left}
.pr-head .eyebrow{justify-content:center}
.pr-head h1{font-size:clamp(46px,7vw,92px);letter-spacing:-.035em;line-height:.98;margin:16px auto 0;max-width:12ch}
.pr-head .lede{font-size:clamp(17px,1.6vw,19.5px);color:var(--ink-2);max-width:44ch;margin:20px auto 0}
.pr-toggle{display:inline-flex;gap:2px;margin:30px auto 0;padding:4px;border-radius:999px;background:var(--panel);box-shadow:inset 0 0 0 1px var(--line)}
.pr-toggle button{position:relative;border:0;background:transparent;color:var(--ink-2);font:500 14px var(--body);padding:8px 18px;border-radius:999px;cursor:pointer;transition:color .2s,background-color .25s cubic-bezier(.22,1,.36,1)}
.pr-toggle button:hover{color:var(--ink)}
.pr-toggle button[aria-checked="true"]{background:var(--ink);color:var(--paper)}
.pr-note{min-height:1.6em;margin:12px 0 0;font:13px var(--mono);color:var(--ink-3)}
.pr-note span{display:none}.pr-yearly .pr-note span{display:inline}
.pr-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:34px 0 0;padding:0;list-style:none;align-items:stretch}
.pr-grid>li{display:flex}
.pr-card{position:relative;display:flex;flex-direction:column;width:100%;border-radius:22px;background:var(--panel);box-shadow:var(--shadow),inset 0 0 0 1px var(--line);text-align:left}
.pr-card.hi{background:#161513;color:#f3efe8;box-shadow:0 34px 70px -38px rgb(0 0 0/.7),inset 0 0 0 1px rgb(255 255 255/.08)}
.pr-card.off{background:transparent;box-shadow:none;outline:1.5px dashed color-mix(in srgb,var(--ink-3) 55%,transparent);outline-offset:-1.5px}
.pr-top{padding:24px 24px 22px;border-bottom:1px solid var(--line)}
.hi .pr-top{border-color:rgb(255 255 255/.08)}
.pr-badges{display:flex;flex-wrap:wrap;gap:6px;min-height:23px;margin:-6px 0 12px}
.pr-badge{font:500 11px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;padding:6px 9px;border-radius:999px;background:var(--panel-2);color:var(--ink-2)}
.hi .pr-badge{background:rgb(255 255 255/.08);color:#f3efe8}
.pr-badge.rec{display:inline-flex;align-items:center;gap:6px}.pr-badge.rec::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--rec)}
.pr-badge.save{display:none;background:var(--caption);color:#3d3000}.pr-yearly .pr-badge.save{display:inline-block}
.pr-card h2{font-size:24px;letter-spacing:-.015em}
.pr-for{margin:6px 0 0;font-size:14.5px;color:var(--ink-2)}.hi .pr-for{color:#cfc8bd}
.pr-amt{display:flex;align-items:baseline;gap:6px;margin:22px 0 0}
.pr-amt strong{font:560 64px/.9 var(--display);letter-spacing:-.045em;font-variant-numeric:tabular-nums}
.pr-amt>span{font:14px var(--mono);color:var(--ink-3)}.hi .pr-amt>span{color:#8f887d}
.off .pr-amt strong{color:var(--ink-3);font-weight:400}
.pr-feats{list-style:none;margin:0;padding:22px 24px 26px;display:grid;align-content:start;gap:13px;font-size:14.5px;color:var(--ink-2);flex:1}
.hi .pr-feats{color:#cfc8bd}
.pr-feats li{display:grid;grid-template-columns:18px 1fr;gap:10px;align-items:start}
.pr-feats li::before{content:"";width:16px;height:16px;margin-top:3px;border-radius:50%;background:color-mix(in srgb,var(--pass) 16%,transparent) no-repeat center/10px url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 6.2 5 8.5l4.5-5' fill='none' stroke='%2324713f' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")}
.hi .pr-feats li::before{background-color:rgb(111 211 154/.16);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 6.2 5 8.5l4.5-5' fill='none' stroke='%236fd39a' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")}
.off .pr-feats li::before{background:none;content:"—";color:var(--ink-3);font:14px/1 var(--mono);margin-top:4px}
.pr-tip{position:relative;cursor:help;border-bottom:1px dashed currentColor;outline-offset:3px}
.pr-tip span{position:absolute;left:0;bottom:calc(100% + 8px);z-index:3;width:max-content;max-width:240px;padding:8px 11px;border-radius:10px;background:var(--ink);color:var(--paper);font:13px/1.45 var(--body);box-shadow:var(--shadow);opacity:0;transform:translateY(4px);pointer-events:none;transition:opacity .15s,transform .15s}
.hi .pr-tip span{background:#f3efe8;color:#1c1917}
.pr-tip:hover span,.pr-tip:focus span{opacity:1;transform:none}
.pr-foot{padding:0 24px 24px}
.pr-foot .btn{width:100%}
.pr-card:not(.hi) .pr-foot .btn{background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1px var(--line)}
.hi .pr-foot .btn{background:var(--caption);color:#3d3000}
${trailCss(".pr-trail", 140, 7)}
.pr-ticket-band{padding:96px 0 88px}
#limits h2{font-size:clamp(34px,4.4vw,56px);max-width:12ch}
.pr-ticket-grid{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:40px 64px;align-items:center}
.pr-ticket-grid h2{font-size:clamp(34px,4.4vw,56px);max-width:12ch;margin-top:14px}
.pr-ticket-grid .intro{color:var(--ink-2);font-size:18px;max-width:38ch;margin:14px 0 0}
.ticket{display:grid;grid-template-columns:minmax(0,1fr) 92px;background:var(--panel);border-radius:18px;box-shadow:var(--shadow),inset 0 0 0 1px var(--line);transform:rotate(-1.2deg);-webkit-mask:radial-gradient(circle 11px at calc(100% - 92px) 0,#0000 98%,#000) top/100% 51% no-repeat,radial-gradient(circle 11px at calc(100% - 92px) 100%,#0000 98%,#000) bottom/100% 51% no-repeat;mask:radial-gradient(circle 11px at calc(100% - 92px) 0,#0000 98%,#000) top/100% 51% no-repeat,radial-gradient(circle 11px at calc(100% - 92px) 100%,#0000 98%,#000) bottom/100% 51% no-repeat}
.ticket-body{padding:26px 28px}
.ticket-hd{display:flex;justify-content:space-between;gap:12px;font:500 11.5px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3);padding-bottom:14px;border-bottom:1px dashed var(--line)}
.ticket ul{list-style:none;margin:0;padding:8px 0 0}
.ticket li{display:flex;align-items:baseline;gap:10px;padding:8px 0;font:14px var(--mono);color:var(--ink-2)}
.ticket li::after{content:"";order:1;flex:1;border-bottom:1px dotted color-mix(in srgb,var(--ink-3) 60%,transparent);transform:translateY(-4px)}
.ticket li b{order:2;font-weight:500;color:var(--ink)}
.ticket-total{display:flex;justify-content:space-between;align-items:baseline;margin-top:10px;padding-top:16px;border-top:2px solid var(--ink);font:560 30px/1 var(--display);letter-spacing:-.02em}
.ticket-total small{font:500 11.5px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)}
.ticket-stub{display:grid;place-items:center;border-left:2px dashed var(--line);background:color-mix(in srgb,var(--caption) 34%,var(--panel));border-radius:0 18px 18px 0}
.ticket-stub span{writing-mode:vertical-rl;transform:rotate(180deg);font:600 13px var(--mono);letter-spacing:.32em;text-transform:uppercase;color:var(--ink)}
.pr-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;margin:36px 0 0;padding:0;list-style:none;counter-reset:s;border-top:1px solid var(--line)}
.pr-steps li{counter-increment:s;padding:26px 26px 6px 0}
.pr-steps li + li{padding-left:26px;box-shadow:inset 1px 0 0 var(--line)}
.pr-steps li::before{content:counter(s,decimal-leading-zero);display:block;font:italic 480 36px/1 var(--display);color:var(--ember);margin-bottom:18px}
.pr-steps h3{font-size:24px}.pr-steps p{margin:8px 0 0;color:var(--ink-2);font-size:15.5px;max-width:30ch}
@media (max-width:900px){.pr-grid{grid-template-columns:1fr;max-width:520px;margin-left:auto;margin-right:auto}.pr-ticket-grid{grid-template-columns:1fr}.ticket{transform:none}.pr-steps{grid-template-columns:1fr}.pr-steps li + li{padding-left:0;box-shadow:inset 0 1px 0 var(--line)}}
@media (max-width:480px){.ticket{grid-template-columns:minmax(0,1fr) 54px;-webkit-mask:none;mask:none}.ticket-body{padding:22px 18px}.ticket li{font-size:13px}.pr-amt strong{font-size:56px}}
@media (prefers-reduced-motion:no-preference){.pr-head .eyebrow,.pr-head h1,.pr-head .lede,.pr-card{animation:rise .7s cubic-bezier(.2,.7,.2,1) both}.pr-grid>li:nth-child(2) .pr-card{animation-delay:.08s}.pr-grid>li:nth-child(3) .pr-card{animation-delay:.16s}@keyframes rise{from{opacity:0;transform:translateY(12px)}}}`;

type PricingFeature = string | { text: string; tip: string };

function pricingCard(o: { name: string; who: string; amount: string; per: boolean; feats: PricingFeature[]; cta: [string, string]; tone?: "hi" | "off"; badge?: string }): string {
  const feats = o.feats
    .map((f) => (typeof f === "string" ? `<li><span>${esc(f)}</span></li>` : `<li><span class="pr-tip" tabindex="0">${esc(f.text)}<span role="tooltip">${esc(f.tip)}</span></span></li>`))
    .join("");
  const badges = (o.badge ? `<span class="pr-badge rec">${esc(o.badge)}</span>` : "") + (o.per ? `<span class="pr-badge save">0% off</span>` : "");
  return `<li><article class="pr-card${o.tone ? ` ${o.tone}` : ""}">
    ${o.tone === "hi" ? `<span class="pr-trail" aria-hidden="true"><i></i></span>` : ""}
    <div class="pr-top">
      <div class="pr-badges">${badges}</div>
      <h2>${esc(o.name)}</h2>
      <p class="pr-for">${esc(o.who)}</p>
      <p class="pr-amt"><strong>${esc(o.amount)}</strong><span>${o.per ? `/ <span data-per>month</span>` : "not sold"}</span></p>
    </div>
    <ul class="pr-feats">${feats}</ul>
    <div class="pr-foot"><a class="btn" href="${esc(o.cta[1])}">${esc(o.cta[0])}</a></div>
  </article></li>`;
}

const PRICING_TICKET: [string, string][] = [
  ["recording.mp4 + voice-over", "$0"],
  ["recording.webm", "$0"],
  ["captions.vtt", "$0"],
  ["narration.wav", "$0"],
  ["Page list, HTTP status", "$0"],
  ["Seats", "$0"],
  ["Re-records after a release", "$0"],
];

/** Human pricing page. The markdown twin at /pricing.md is the machine-readable copy. */
export function pricingPage(siteUrl: string, user: { email: string } | null): string {
  const title = "Walkcast Pricing";
  const description = "Walkcast is free. MIT licensed, with no paid tier, seat limit or usage meter. You run it on your own machine.";
  const start: [string, string] = user ? ["Open the app", "/app#record"] : ["Get started free", "/signup"];
  const head = `${jsonLd({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": `${siteUrl}/pricing#page`, url: `${siteUrl}/pricing`, name: title, description },
      { "@type": "Offer", price: "0", priceCurrency: "USD", url: `${siteUrl}/pricing`, availability: "https://schema.org/InStock", description: "Free software under the MIT license. No paid tier." },
      breadcrumbs(siteUrl, [["Pricing", "/pricing"]]),
    ],
  })}
<style>${PRICING_CSS}</style>`;
  const body = `
<section class="pr-head" id="plans"><div class="wrap">
  ${crumb("Pricing")}
  <p class="eyebrow">Pricing</p>
  <h1>One price. It's <em>zero.</em></h1>
  <p class="lede">Walkcast is MIT licensed. Run it on a laptop or on your team's server. Neither has seats, a usage meter or a plan to upgrade to.</p>
  <div class="pr-toggle" role="radiogroup" aria-label="Billing period">
    <button type="button" role="radio" aria-checked="true" data-period="month">Monthly</button>
    <button type="button" role="radio" aria-checked="false" data-period="year" tabindex="-1">Yearly</button>
  </div>
  <p class="pr-note" aria-live="polite"><span>Paying yearly saves you 0%. It was already free.</span></p>
  <ul class="pr-grid">
    ${pricingCard({
      name: "On your laptop",
      who: "One person, one machine.",
      amount: "$0",
      per: true,
      feats: [
        "Narrated MP4 with captions",
        { text: "Sign-in to ordinary logins", tip: "The password is held in memory for the recording only. Files on disk show a placeholder." },
        "Up to 30 pages per walkthrough",
        { text: "No account needed", tip: "Local use can run with LAB_AUTH=off." },
        "Walkcast Lab for browser-agent regressions",
      ],
      cta: ["See what to install", "#install"],
    })}
    ${pricingCard({
      name: "On your team's server",
      who: "Shared recordings, one place.",
      amount: "$0",
      per: true,
      tone: "hi",
      badge: "Most teams",
      feats: [
        "Everything on the laptop",
        "Accounts with Google or email",
        "Recordings kept on your server",
        { text: "Internal tools on your network", tip: "A publicly hosted copy refuses private and local addresses. On your own network you decide." },
        "No seat count. Add the whole team.",
      ],
      cta: start,
    })}
    ${pricingCard({
      name: "Cloud subscription",
      who: "The plan this page would usually upsell.",
      amount: "—",
      per: false,
      tone: "off",
      feats: ["Not offered by this repository", "No enterprise tier held back", "No features behind a paywall"],
      cta: ["Read the MIT license", "https://opensource.org/licenses/MIT"],
    })}
  </ul>
</div></section>

<section class="pr-ticket-band"><div class="wrap pr-ticket-grid">
  <div>
    <p class="eyebrow">The receipt</p>
    <h2>Every file, <em>itemised.</em></h2>
    <p class="intro">One walkthrough hands you all of this. The total doesn't change on the second one, or the hundredth.</p>
  </div>
  <div class="ticket" role="group" aria-label="What one walkthrough costs">
    <div class="ticket-body">
      <div class="ticket-hd"><span>Walkcast · one walkthrough</span><span>MIT</span></div>
      <ul>${PRICING_TICKET.map(([k, v]) => `<li>${esc(k)}<b>${esc(v)}</b></li>`).join("")}</ul>
      <div class="ticket-total"><small>Total</small><span>$0.00</span></div>
    </div>
    <div class="ticket-stub" aria-hidden="true"><span>Admit all</span></div>
  </div>
</div></section>

<section class="inkband" id="limits"><div class="wrap safety">
  <div>
    <h2>Limits, not a paid tier.</h2>
    <p class="intro">These are how a recording behaves. There is no plan that buys your way out of them.</p>
  </div>
  <ul class="checks">
    <li><strong>Up to 30 pages.</strong> Same site, ordinary page loads, paced.</li>
    <li><strong>Stops at CAPTCHA and 2FA.</strong> It never tries to get past them.</li>
    <li><strong>Read-only after sign-in.</strong> No forms submitted. Sign-out and delete links skipped.</li>
    <li><strong>Private networks stay local.</strong> A public copy refuses private and local addresses.</li>
  </ul>
</div></section>

<section class="band" id="install"><div class="wrap">
  <h2>What you install.</h2>
  <p class="intro">Three things on the machine that runs it. Then paste the link.</p>
  <ol class="pr-steps">
    <li><h3>Node.js 22</h3><p>Or anything newer. This is the recorder.</p></li>
    <li><h3>Chromium</h3><p>Playwright's browser. The one that signs in and walks the pages.</p></li>
    <li><h3>ffmpeg with flite</h3><p>The spoken narration. Without it you still get the silent recording and the transcript.</p></li>
  </ol>
  <p class="meta" style="margin-top:22px">Machine-readable copy for agents: <a href="/pricing.md">pricing.md</a></p>
</div></section>

<section class="band wash" id="pricing-faq"><div class="wrap">
  <h2>Price questions.</h2>
  <div class="faq">
    <details open><summary><h3 style="font:inherit;margin:0">Is Walkcast really free?</h3></summary><p>Yes. The software is MIT licensed. There is no paid plan, seat price, or usage meter in it.</p></details>
    <details><summary><h3 style="font:inherit;margin:0">Do I pay for an account?</h3></summary><p>No. An account on a server you run is free. It keeps your recordings with you. The price of the software stays zero.</p></details>
    <details><summary><h3 style="font:inherit;margin:0">Is there an enterprise tier?</h3></summary><p>No. The same build records a public site and, on your own network, an internal tool. Nothing is held back for a higher plan.</p></details>
    <details><summary><h3 style="font:inherit;margin:0">What does running it cost me?</h3></summary><p>The machine it runs on. A recording is a browser, a few minutes of CPU and the files it writes. Walkcast itself charges nothing.</p></details>
  </div>
</div></section>
${endCta(user, "Your site, walked and", "Create a free account with Google or email and record the first one.", { em: "narrated.", ghostHref: "/#demo", ghostLabel: "Watch the example" })}
<script>
(() => {
  const group = document.querySelector(".pr-toggle");
  if (!group) return;
  const radios = [...group.querySelectorAll("[role=radio]")];
  const pick = (btn, focus) => {
    for (const r of radios) { const on = r === btn; r.setAttribute("aria-checked", String(on)); r.tabIndex = on ? 0 : -1; }
    const period = btn.dataset.period;
    for (const el of document.querySelectorAll("[data-per]")) el.textContent = period;
    document.body.classList.toggle("pr-yearly", period === "year");
    if (focus) btn.focus();
  };
  group.addEventListener("click", (e) => { const b = e.target.closest("[role=radio]"); if (b) pick(b); });
  group.addEventListener("keydown", (e) => {
    const i = radios.indexOf(document.activeElement);
    if (i < 0 || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    pick(radios[(i + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? radios.length - 1 : 1)) % radios.length], true);
  });
})();
</script>`;
  return layout({ siteUrl, path: "/pricing", title: `${title} | ${NAME}`, description, body, head, user });
}

// --------------------------------------------------------------------------------- crawler files

/** Search engines and AI assistants are welcome on public pages; the app, API and auth are off-limits. */
export function robotsTxt(siteUrl: string): string {
  const bots = [
    "Googlebot", "Bingbot", "DuckDuckBot", "Applebot", "Applebot-Extended", "Google-Extended", "GoogleOther", "GPTBot", "OAI-SearchBot", "ChatGPT-User",
    "ClaudeBot", "Claude-User", "Claude-SearchBot", "anthropic-ai", "PerplexityBot", "Perplexity-User", "Amazonbot", "meta-externalagent", "DuckAssistBot", "MistralAI-User", "YouBot",
  ];
  const rules = "Allow: /\nDisallow: /app\nDisallow: /api/\nDisallow: /auth/\nDisallow: /files/\nDisallow: /start\n";
  const training = "User-agent: CCBot\nDisallow: /\n\n";
  return `# ${NAME}: public pages are open to search engines and to AI assistants that cite sources.\n# CCBot (Common Crawl training) is blocked. Search and answer-engine crawlers are allowed.\n\n${bots.map((b) => `User-agent: ${b}\n${rules}`).join("\n")}\n${training}User-agent: *\n${rules}\nSitemap: ${siteUrl}/sitemap.xml\n`;
}

export function sitemapXml(siteUrl: string): string {
  const d = demo();
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
  <url>
    <loc>${siteUrl}/</loc>
    <lastmod>${GUIDES_UPDATED}</lastmod>
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
  <url><loc>${siteUrl}/how</loc><lastmod>${GUIDES_UPDATED}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>${siteUrl}/lab</loc><lastmod>${GUIDES_UPDATED}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>
  <url><loc>${siteUrl}/safety</loc><lastmod>${GUIDES_UPDATED}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>
  <url><loc>${siteUrl}/pricing</loc><lastmod>${GUIDES_UPDATED}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>
${Object.keys(COMPARE_CONFIGS).map((s) => `  <url><loc>${siteUrl}/compare/${s}</loc><lastmod>${GUIDES_UPDATED}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`).join("\n")}
${GUIDES.map((g) => `  <url><loc>${siteUrl}/guides/${g.slug}</loc><lastmod>${GUIDES_UPDATED}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`).join("\n")}
  <url><loc>${siteUrl}/signup</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>
  <url><loc>${siteUrl}/pricing.md</loc><lastmod>${GUIDES_UPDATED}</lastmod><changefreq>monthly</changefreq><priority>0.4</priority></url>
  <url><loc>${siteUrl}/llms.txt</loc><lastmod>${GUIDES_UPDATED}</lastmod><changefreq>weekly</changefreq><priority>0.3</priority></url>
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

## Pricing

Free. MIT licensed. No paid tier, seat limit or usage meter in the software. Machine-readable pricing: ${siteUrl}/pricing.md

## Compared with a screen recording

Walkcast drives a browser from a link and writes narration from recorded events. A screen recorder captures your display while you talk. Use the screen recorder for meetings, desktop apps and commentary the browser cannot see. Full comparison: ${siteUrl}/guides/walkcast-vs-screen-recording

| | Walkcast | Screen recording |
| --- | --- | --- |
${COMPARE.map((row) => `| ${row.criterion} | ${row.walkcast} | ${row.manual} |`).join("\n")}

## Sources

${SOURCES.map((s) => `- [${s.name}](${s.url}): ${s.detail}`).join("\n")}

## Links

- [Home](${siteUrl}/): what it does, an example walkthrough with transcript, FAQ
- [How a recording runs](${siteUrl}/how)
- [Safety rules](${siteUrl}/safety)
- [Walkcast Lab](${siteUrl}/lab)
- [Pricing](${siteUrl}/pricing) and [pricing.md](${siteUrl}/pricing.md)
- [Guides by use case](${siteUrl}/guides)
${GUIDES.map((g) => `- [${g.label}](${siteUrl}/guides/${g.slug}): ${g.description}`).join("\n")}
- [Create an account](${siteUrl}/signup): sign up with Google or email and password
- [Example video](${siteUrl}/assets/demo.mp4): an unedited narrated walkthrough of a demo CRM
- [Example captions](${siteUrl}/assets/demo.vtt)

## FAQ

${FAQ.map(([q, a]) => `### ${q}\n\n${a}`).join("\n\n")}
`;
}

/** Machine-readable pricing (llmstxt.org companion). No JavaScript, no login wall. */
export function pricingMd(siteUrl: string): string {
  return `# Pricing — ${NAME}

${NAME} is free and open source under the MIT License. The software has no paid plan, no per-seat price and no usage meter.

## Self-hosted

- Price: $0
- License: MIT — https://opensource.org/licenses/MIT
- Limits: one walkthrough visits up to 30 pages on the same site
- Requirements: Node.js 22 or newer, Playwright's Chromium, ffmpeg with the flite voice for narration audio
- Accounts: optional. A shared server can require sign-up. Local use can run with LAB_AUTH=off
- Output of one walkthrough: recording.mp4 (H.264, AAC voice-over, embedded captions), recording.webm, narration.wav, captions.vtt (WebVTT), page list with HTTP status

## Hosted copy of this software

- Price: $0 to create an account, on a server you or the operator run
- This repository does not sell a cloud subscription

## Not included

- Walkcast does not bypass CAPTCHA or two-factor prompts
- A publicly hosted copy refuses private and local network addresses

Canonical page: ${siteUrl}/pricing
Machine-readable summary: ${siteUrl}/llms.txt
`;
}

export const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26"><rect x=".5" y=".5" width="25" height="25" rx="7" fill="#1c1917"/><path d="M10 8.2v9.6l7.6-4.8z" fill="#f7f3ec"/><circle cx="20.2" cy="5.8" r="2.7" fill="#e5484d" stroke="#f7f3ec" stroke-width="1"/></svg>`;

/** Static files under /assets/: the demo media, the social image and self-hosted fonts. */
// --------------------------------------------------------------------------------- comparisons (AI-cited "X vs Y" pages)

interface CompareConfig {
  slug: string;
  title: string;
  description: string;
  other: string;
  intro: string;
  rows: [string, string, string][];
  walkcastWins: string[];
  otherWins: string[];
  faq: [string, string][];
}

const COMPARE_CONFIGS: Record<string, CompareConfig> = {
  "walkcast-vs-loom": {
    slug: "walkcast-vs-loom",
    title: "Walkcast vs Loom: automated website walkthroughs vs manual screen recording",
    description: "A fair comparison: Loom records your screen while you talk; Walkcast drives a real browser through a site (signing in if needed) and writes the narration for you. Free, MIT-licensed.",
    other: "Loom",
    intro: "Loom is the gold standard for a human recording their own screen with a face bubble and a voice-over. Walkcast is the opposite: it drives a real browser through a site, including pages behind a login, and writes the narration from what it clicks. Neither is a superset of the other.",
    rows: [
      ["Who records", "A script drives a real browser", "You, by hand, with optional AI"],
      ["Behind a login", "Yes — signs in with credentials held in memory", "Yes — you record it yourself"],
      ["Narration", "Written from each action by an LLM", "You speak, or Loom's AI cleans up your script"],
      ["Captions / transcript", "WebVTT + transcript, word-accurate", "Auto-captions, human-correctable"],
      ["Face bubble / webcam", "No", "Yes (signature feature)"],
      ["Editing after recording", "Re-run the walker, or re-record", "Trim, splice, stitch in the editor"],
      ["Output", "MP4, WebM, captions, transcript", "MP4 link hosted by Loom"],
      ["Cost", "Free, MIT, self-hostable", "Free tier + paid plans"],
    ],
    walkcastWins: [
      "Document a site you do not know well — the walker learns the flow as it clicks.",
      "Regression evidence: the same run becomes a reproducible test fixture.",
      "No microphone, no retakes, no stale screenshots six months later.",
    ],
    otherWins: [
      "A human explaining their own judgment (demos, sales calls, onboarding) is faster in Loom.",
      "Editing by hand: trim, cut, and stitching beats re-running a walker.",
      "Webcam plus screen communicates trust the way a robot cannot.",
    ],
    faq: [
      ["Is Walkcast a Loom replacement?", "For documenting a web app or website, sometimes. For a sales or onboarding video where a person teaches, no — use Loom."],
      ["Can Walkcast sign in to my app?", "Yes, with a username and password held in memory only; it stops at CAPTCHA and two-factor."],
      ["Does Walkcast cost money?", "No. It is MIT-licensed and runs on your own machine."],
    ],
  },
  "walkcast-vs-screen-studio": {
    slug: "walkcast-vs-screen-studio",
    title: "Walkcast vs Screen Studio: polished screen recordings vs automated walkthroughs",
    description: "Screen Studio produces cinematic hand-recorded screen captures with zooms. Walkcast produces a narrated walkthrough of an entire site from a link. Different jobs, honest comparison.",
    other: "Screen Studio",
    intro: "Screen Studio makes individual screen recordings look cinematic: auto-zoom, cursor smoothing, looped GIFs. Walkcast produces a narrated walkthrough of a whole site from a single link. They rarely compete for the same minute of work.",
    rows: [
      ["Scope per run", "An entire site, up to 30 pages", "One recording, one screen"],
      ["Authoring", "Link (plus optional login)", "Manual capture, then style"],
      ["Narration", "Auto-generated from actions", "You add it, or none"],
      ["Visual polish", "Plain browser capture, captions", "Auto-zoom, cursor polish, GIF export"],
      ["Loop export", "No", "Yes — product loops are Screen Studio's strong suit"],
      ["Cost", "Free, MIT", "Paid, macOS only"],
    ],
    walkcastWins: [
      "You need a tour of 15 pages, not one polished 8-second loop.",
      "You need evidence that a bug or flow exists, reproducible from a cassette.",
    ],
    otherWins: [
      "Marketing pages and product GIFs need the cinematic auto-zoom Screen Studio does best.",
      "Precise manual timing of a single moment favors capture-by-hand.",
    ],
    faq: [
      ["Should I use both?", "Yes — Screen Studio for marketing loops, Walkcast for product documentation and regression fixtures."],
      ["Does Walkcast run on macOS?", "Yes; any browser runtime the box can reach works."],
      ["Is Walkcast free?", "Yes, MIT-licensed."],
    ],
  },
  "manual-recording": {
    slug: "manual-recording",
    title: "Walkcast vs manual screen recording: why teams automate walkthroughs",
    description: "Manual recordings rot the week the UI changes. Walkcast re-runs from a link and regenerates the narration, keeping the walkthrough honest.",
    other: "Manual recording",
    intro: "A manual recording is a video of a person clicking through a product while talking. It is the fastest way to make one video and the slowest way to keep a library current.",
    rows: [
      ["Time to first video", "Minutes (link + wait)", "Minutes (record + edit)"],
      ["Time to keep it current", "Re-run the run", "Re-record and re-edit by hand"],
      ["Behind a login", "Signs in with credentials held in memory", "You record it yourself"],
      ["Captions and transcript", "Automatic, word-accurate", "Manual, or auto with cleanup"],
      ["Drift detection", "Replay cassettes flag changed steps", "None — rotting is silent"],
      ["Cost", "Free (you pay for the LLM)", "Your time"],
    ],
    walkcastWins: [
      "The walkthrough is a side-effect of the claim that the flow still works.",
      "Regenerating is one command, not a calendar invite.",
    ],
    otherWins: [
      "A founder explaining why a feature exists carries meaning a robot cannot.",
      "Polish, pacing and brand tone still need a human for a marketing video.",
    ],
    faq: [
      ["What breaks when the UI changes?", "The navigator reports the locator-not-found or locator-renamed step and, in live mode, re-runs the flow rather than silently reusing stale footage."],
      ["Can I still edit the result?", "Yes — the MP4, captions and transcript are plain files; splice or caption them as you would any other video."],
      ["Is it free?", "Yes, MIT-licensed."],
    ],
  },
};

export function comparePage(siteUrl: string, slug: string, user: { email: string } | null): string | null {
  const cfg = COMPARE_CONFIGS[slug];
  if (!cfg) return null;
  const title = cfg.title;
  const description = cfg.description;
  const head = `${jsonLd({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": `${siteUrl}/compare/${cfg.slug}#page`, url: `${siteUrl}/compare/${cfg.slug}`, name: title, description, dateModified: `${GUIDES_UPDATED}T00:00:00Z` },
      { "@type": "Article", "@id": `${siteUrl}/compare/${cfg.slug}#article`, headline: title, description, author: { "@type": "Organization", name: NAME }, publisher: { "@type": "Organization", name: NAME }, dateModified: `${GUIDES_UPDATED}T00:00:00Z` },
      breadcrumbs(siteUrl, [["Compare", "/compare"], [cfg.other, ""]]),
      { "@type": "FAQPage", "@id": `${siteUrl}/compare/${cfg.slug}#faq`, mainEntity: cfg.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    ],
  })}`;
  const body = `
<section class="band"><div class="wrap">
  ${crumb ? crumb("Compare") : ""}
  <p class="eyebrow">Comparison</p>
  <h1>${esc(title.split(":")[0] ?? title)}</h1>
  <p class="lede">${esc(cfg.intro)}</p>
</div></section>
<section class="band wash"><div class="wrap">
  <h2 style="font-size:30px;margin-bottom:14px">Head to head</h2>
  <table style="width:100%;border-collapse:collapse">
    <thead><tr><th style="text-align:left;padding:10px;border-bottom:1px solid var(--line)">Capability</th><th style="text-align:left;padding:10px;border-bottom:1px solid var(--line)">Walkcast</th><th style="text-align:left;padding:10px;border-bottom:1px solid var(--line)">${esc(cfg.other)}</th></tr></thead>
    <tbody>${cfg.rows.map(([c, w, o]) => `<tr><td style="padding:10px;border-bottom:1px solid var(--line)"><strong>${esc(c)}</strong></td><td style="padding:10px;border-bottom:1px solid var(--line)">${esc(w)}</td><td style="padding:10px;border-bottom:1px solid var(--line)">${esc(o)}</td></tr>`).join("")}</tbody>
  </table>
</div></section>
<section class="band"><div class="wrap" style="display:grid;grid-template-columns:1fr 1fr;gap:48px">
  <div>
    <p class="eyebrow">Where Walkcast wins</p>
    <ul class="checks">${cfg.walkcastWins.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
  </div>
  <div>
    <p class="eyebrow">Where ${esc(cfg.other)} wins</p>
    <ul class="checks">${cfg.otherWins.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
  </div>
</div></section>
<section class="band wash" id="faq"><div class="wrap">
  <h2>Questions</h2>
  <div class="faq" style="margin-top:8px">${cfg.faq.map(([q, a]) => `<details open><summary><h3 style="font:inherit;margin:0">${esc(q)}</h3></summary><p>${esc(a)}</p></details>`).join("")}</div>
  <p style="margin-top:24px"><a class="btn" href="/signup">Try Walkcast free →</a> <a class="btn small" href="/pricing">Pricing (it's zero)</a></p>
</div></section>`;
  return layout({ siteUrl, path: `/compare/${cfg.slug}`, title, description, body, head, user });
}

export function compareSlugs(): string[] { return Object.keys(COMPARE_CONFIGS); }

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
