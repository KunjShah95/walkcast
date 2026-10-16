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
const SITE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "site");
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
@font-face{font-family:"Schibsted Grotesk";src:url(/assets/fonts/schibsted-grotesk.woff2) format("woff2");font-weight:400 900;font-display:swap}
@font-face{font-family:"JetBrains Mono";src:url(/assets/fonts/jetbrains-mono.woff2) format("woff2");font-weight:100 800;font-display:swap}`;

/*
  The app's case file, opened up for a visitor. White paper, ink, and the app's two signals:
  ochre for "record this" and for evidence (an EX tag, a cited line), red only for the record
  light, green only for a page that answered 200. Headlines run in two tones (the claim in ink, the
  consequence in the dim ink) with a drawn icon tile set in the line. The whole site is light: white
  paper, and the recorder window is a white panel in a soft grey ring. Schibsted Grotesk sets every size;
  JetBrains Mono is only for timecodes, file names, URLs and counts.
*/

const CSS = `${FONTS}
:root{--paper:#ffffff;--panel:#ffffff;--panel-2:#f5f4f1;--panel-3:#eae8e3;--ink:#1b1a17;--ink-2:#4c4841;--muted:#6b665d;--dim:#8a847a;--line:#e7e3db;--line-strong:#cfc9bd;--signal:#9c5700;--signal-strong:#874b00;--signal-soft:#f4e7d2;--on-signal:#ffffff;--exhibit:#f1dfbd;--exhibit-ink:#5c3400;--exhibit-soft:#f8efdf;--rec:#c0321c;--fail:#b2261c;--pass:#2c6a3d;--solid:#1b1a17;--on-solid:#ffffff;
--r:14px;--r-lg:22px;--r-sm:8px;--pill:999px;--ease:cubic-bezier(.22,1,.36,1);--sans:"Schibsted Grotesk",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;--mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;color-scheme:light}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;scroll-padding-top:84px}
::selection{background:var(--exhibit);color:var(--exhibit-ink)}
input,textarea{caret-color:var(--signal)}
::-webkit-scrollbar{width:11px;height:11px}::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--line-strong);border-radius:var(--pill);border:3px solid transparent;background-clip:padding-box}
*{scrollbar-color:var(--line-strong) transparent;scrollbar-width:thin}
:focus-visible{outline:2px solid var(--signal);outline-offset:3px;border-radius:4px}
body{margin:0;background:var(--paper);color:var(--ink);font:16.5px/1.6 var(--sans);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;font-feature-settings:"ss01"}
a{color:inherit;text-underline-offset:3px}img,video{max-width:100%;display:block}
.wrap{max-width:1240px;margin:0 auto;padding:0 max(20px,env(safe-area-inset-left))}
.narrow{max-width:860px}
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
.skip{position:fixed;left:12px;top:-60px;z-index:50;background:var(--solid);color:var(--on-solid);padding:10px 14px;border-radius:var(--pill);font-size:14px;text-decoration:none;transition:top .2s var(--ease)}
.skip:focus{top:12px}
.ic{flex:none}

/* Type: two tones in one headline, and a drawn tile set into the line. */
h1,h2,h3{font-family:var(--sans);font-weight:700;margin:0;text-wrap:balance;color:var(--ink)}
h1{font-size:clamp(46px,7.4vw,100px);line-height:.98;letter-spacing:-.04em}
h2{font-size:clamp(34px,4.9vw,64px);line-height:1.02;letter-spacing:-.04em}
h3{font-size:18px;line-height:1.3;letter-spacing:-.012em}
.dim{color:var(--dim)}
.tile{display:inline-grid;place-items:center;width:.86em;height:.86em;margin:0 .06em;border-radius:.24em;vertical-align:-.1em;transform:rotate(-5deg);color:#fff;background:var(--solid)}
.tile.tilt{transform:rotate(6deg)}
.tile svg{width:.52em;height:.52em}
.t-ink{background:#1b1a17;color:#fff}.t-signal{background:#9c5700;color:#fff}.t-rec{background:#c0321c;color:#fff}.t-pass{background:#2c6a3d;color:#fff}.t-exhibit{background:#f1dfbd;color:#5c3400}
.lede{font-size:clamp(17px,1.55vw,20px);line-height:1.55;color:var(--muted);max-width:50ch;margin:24px auto 0;text-wrap:pretty}
.center{text-align:center}
.center .lede{margin-left:auto;margin-right:auto;max-width:66ch}

/* Chrome. */
header.top{position:sticky;top:0;z-index:30;background:color-mix(in srgb,var(--paper) 88%,transparent);backdrop-filter:saturate(1.4) blur(14px);-webkit-backdrop-filter:saturate(1.4) blur(14px);border-bottom:1px solid var(--line)}
header.top .wrap{display:flex;align-items:center;gap:28px;height:64px}
.brand{display:flex;align-items:center;gap:9px;text-decoration:none;font:700 18px/1 var(--sans);letter-spacing:-.03em}
.brand svg{flex:none}
.nav-main{display:flex;gap:4px}
.nav-main a,.nav-end a:not(.pill){font-size:14.5px;text-decoration:none;color:var(--muted);padding:8px 10px;border-radius:var(--pill);transition:color .18s,background-color .18s}
.nav-main a:hover,.nav-end a:not(.pill):hover{color:var(--ink);background:var(--panel-2)}
.nav-main a[aria-current="page"],.nav-end a[aria-current="page"]:not(.pill){color:var(--ink)}
.nav-end{display:flex;align-items:center;gap:6px;margin-left:auto}

/* Buttons are pills. Solid ink for "go", ochre for the record action, grey for the rest. */
.pill{display:inline-flex;align-items:center;justify-content:center;gap:9px;border:0;border-radius:var(--pill);background:var(--panel-2);color:var(--ink);font:600 14.5px/1 var(--sans);padding:11px 18px;text-decoration:none;cursor:pointer;white-space:nowrap;transition:background-color .18s,transform .18s var(--ease),color .18s}
.pill:hover{background:var(--panel-3)}
.pill:active{transform:scale(.98)}
.pill.solid{background:var(--solid);color:var(--on-solid)}
.pill.solid:hover{background:color-mix(in srgb,var(--solid) 86%,var(--paper))}
.pill.rec{background:var(--signal);color:var(--on-signal)}
.pill.rec:hover{background:var(--signal-strong)}
.pill.rec::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--rec);box-shadow:0 0 0 2px color-mix(in srgb,var(--on-signal) 90%,transparent)}
.pill.big{font-size:16px;padding:15px 24px}
.pill.ghost{background:transparent;box-shadow:inset 0 0 0 1px var(--line-strong)}
.pill.ghost:hover{background:var(--panel-2)}
.pill[aria-disabled="true"]{opacity:.5;cursor:not-allowed}
.textlink{color:var(--ink);font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
.textlink:hover{color:var(--signal)}
.textlink .ic{transition:transform .2s var(--ease)}
.textlink:hover .ic{transform:translateX(3px)}

/* The link field: one pill holding the input and the record action. */
.urlform{display:flex;align-items:center;gap:6px;width:min(600px,100%);margin:34px auto 0;padding:6px 6px 6px 20px;background:var(--panel);border-radius:var(--pill);box-shadow:inset 0 0 0 1px var(--line-strong),0 1px 2px rgb(27 26 23/.04);transition:box-shadow .2s}
.urlform .ic{color:var(--dim)}
.urlform input{flex:1;min-width:0;border:0;background:transparent;font:15px var(--mono);color:var(--ink);padding:12px 4px;outline:none}
.urlform input::placeholder{color:var(--muted);opacity:1}
.urlform:focus-within{box-shadow:inset 0 0 0 2px var(--signal),0 0 0 5px var(--signal-soft)}
.fineprint{margin:16px 0 0;font-size:14px;color:var(--muted)}
.fineprint b{color:var(--ink);font-weight:600}

/* The recorder window: a white panel set in a soft grey ring, like a product shot. */
.frame{margin:clamp(48px,6vw,80px) auto 0;padding:clamp(8px,1.2vw,16px);border-radius:calc(var(--r-lg) + 12px);background:var(--panel-2);box-shadow:inset 0 0 0 1px var(--line),0 40px 80px -48px rgb(27 26 23/.45)}
.win{border-radius:var(--r-lg);overflow:hidden;background:var(--paper);color:var(--ink);box-shadow:inset 0 0 0 1px var(--line);text-align:left}
.win-bar{display:flex;align-items:center;gap:14px;height:46px;padding:0 16px;border-bottom:1px solid var(--line)}
.lights{display:flex;gap:7px}.lights i{width:11px;height:11px;border-radius:50%;background:var(--panel-3)}
.lights i:nth-child(1){background:#ef6a55}.lights i:nth-child(2){background:#e0a14a}.lights i:nth-child(3){background:#79c18c}
.win-title{font-size:12.5px;color:var(--muted)}
.win-meta{margin-left:auto;display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--muted)}
.live{display:inline-flex;align-items:center;gap:6px;font:700 11px/1 var(--sans);letter-spacing:.06em;color:#fff;background:#c0321c;padding:5px 8px;border-radius:6px}
.live::before{content:"";width:6px;height:6px;border-radius:50%;background:#fff}
.win-body{display:grid;grid-template-columns:minmax(0,1.62fr) minmax(0,1fr)}
.screen{margin:0;padding:14px;display:flex;flex-direction:column;gap:12px;border-right:1px solid var(--line);min-width:0}
.screen video{width:100%;aspect-ratio:16/10;background:#000;border-radius:10px}
.chapters{display:flex;gap:3px;height:22px;align-items:center}
.chapters button{flex:1 1 0;min-width:4px;height:100%;padding:0;border:0;background:transparent;cursor:pointer;position:relative}
.chapters button::after{content:"";position:absolute;left:0;right:0;top:50%;height:5px;margin-top:-2.5px;border-radius:3px;background:var(--panel-3);transition:background-color .2s,height .2s,margin .2s}
.chapters button:hover::after{height:9px;margin-top:-4.5px}
.chapters button.done::after{background:color-mix(in srgb,var(--signal) 55%,var(--panel-3))}
.chapters button.on::after{background:var(--signal)}
.screen-meta{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;font-size:12.5px;color:var(--muted)}
.screen-meta .mono{color:var(--ink-2)}
.screen-meta .ok{color:var(--pass)}
.transcript{display:flex;flex-direction:column;min-height:0;min-width:0}
.transcript header{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:16px 18px 10px}
.transcript header p{margin:0;font-size:15px;font-weight:700;letter-spacing:-.01em;line-height:1.3;color:var(--ink)}
.transcript header span{font-size:12.5px;color:var(--muted)}
.transcript ol{position:relative;list-style:none;margin:0;padding:0 8px 36px;overflow:auto;max-height:440px;flex:1;-webkit-mask-image:linear-gradient(#000 calc(100% - 56px),transparent);mask-image:linear-gradient(#000 calc(100% - 56px),transparent)}
.transcript li button>span{min-width:0;overflow-wrap:anywhere}
.transcript li button{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:baseline;width:100%;padding:8px 10px;border:0;border-radius:10px;background:transparent;color:var(--ink-2);font:14px/1.45 var(--sans);text-align:left;cursor:pointer;transition:background-color .2s,color .2s}
.transcript li button:hover{background:var(--panel-2);color:var(--ink)}
.transcript time{font:11.5px var(--mono);color:var(--muted)}
.tag{display:inline-block;font:600 11.5px/1 var(--mono);letter-spacing:.02em;padding:4px 6px;border-radius:5px;background:var(--panel-2);color:var(--muted);white-space:nowrap}
.transcript li.on button{background:var(--exhibit-soft);color:var(--ink)}
.transcript li.on .tag{background:var(--exhibit);color:var(--exhibit-ink)}
.transcript li.on time{color:var(--signal)}
.transcript li.spot button{animation:spot 1.8s var(--ease)}
@keyframes spot{0%{box-shadow:inset 0 0 0 2px var(--signal);background:var(--exhibit)}100%{box-shadow:inset 0 0 0 0 transparent}}
.win-foot{display:flex;align-items:center;gap:8px;padding:12px 40px 12px 14px;border-top:1px solid var(--line);overflow-x:auto;-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 48px),transparent);mask-image:linear-gradient(90deg,#000 calc(100% - 48px),transparent)}
.win-foot>span{font-size:12.5px;color:var(--muted);margin-right:4px;white-space:nowrap}
.pagechip{display:inline-flex;align-items:center;gap:8px;padding:7px 11px;border:0;border-radius:9px;background:var(--panel-2);color:var(--ink-2);font:12.5px var(--mono);cursor:pointer;white-space:nowrap;transition:background-color .18s,color .18s}
.pagechip:hover{background:var(--panel-3);color:var(--ink)}
.pagechip b{font-weight:500;color:var(--pass)}

/* Citations: a claim in the copy points at the line in the recording that proves it. */
.cite{display:inline-flex;align-items:center;gap:5px;vertical-align:1px;margin-left:3px;font:600 11px/1 var(--mono);text-decoration:none;color:var(--exhibit-ink);background:var(--exhibit);padding:4px 7px;border-radius:6px;white-space:nowrap;transition:background-color .18s,transform .18s var(--ease)}
.cite::before{content:"";width:5px;height:5px;border-radius:50%;background:currentColor;opacity:.55}
.cite:hover{background:color-mix(in srgb,var(--exhibit) 80%,var(--signal))}

/* Sections: generous air, one rhythm. */
.sec{padding:clamp(88px,11vw,152px) 0 0}
.sec.first{padding-top:clamp(56px,8vw,104px)}
.sec-head{max-width:900px}
.sec-head.center{max-width:none;text-align:center}
.sec-head .lede{margin-left:0;max-width:none}
.sec-head.center .lede{margin-left:auto}
.belt{display:flex;flex-wrap:wrap;justify-content:center;gap:12px 34px;margin:44px 0 0;padding:0;list-style:none}
.belt li{display:flex;align-items:center;gap:9px;font:500 15.5px var(--mono);color:var(--muted)}
.belt .ic{color:var(--ink-2)}
.belt li.sans{font-family:var(--sans)}
.chips{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin:30px 0 0;padding:0;list-style:none}
.chips li{display:inline-flex;align-items:center;gap:8px;font-size:14px;color:var(--ink-2);padding:9px 15px 9px 13px;border-radius:var(--pill);background:var(--panel-2)}
.feats{display:grid;grid-template-columns:repeat(var(--cols,3),minmax(0,1fr));gap:40px 32px;margin:clamp(48px,6vw,72px) 0 0;padding:0;list-style:none}
.feats li{padding-top:24px;border-top:1px solid var(--line)}
.feats .ic{color:var(--ink)}
.feats h3{margin:18px 0 8px}
.feats p{margin:0;font-size:15px;color:var(--muted);text-wrap:pretty}
.feats.on-panel li{border-color:var(--line-strong)}
.split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:clamp(40px,6vw,96px);align-items:center}
.split.top{align-items:start}
.split h2{font-size:clamp(32px,4vw,54px)}
.answer{font-size:clamp(18px,1.6vw,20px);line-height:1.55;color:var(--ink-2);margin:26px 0 0;max-width:52ch;text-wrap:pretty}
.meta{font-size:13.5px;color:var(--muted);margin:16px 0 0}
.panel{background:var(--panel-2);border-radius:var(--r-lg);padding:clamp(18px,2.4vw,28px)}
.card{background:var(--panel);border-radius:var(--r);box-shadow:inset 0 0 0 1px var(--line);padding:22px}

/* Specimens: each output file shown as itself. */
.specs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:clamp(48px,6vw,72px) 0 0;align-items:start}
.spec{display:flex;flex-direction:column;gap:18px;background:var(--panel-2);border-radius:var(--r-lg);padding:14px 14px 22px}
.spec .body{padding:0 8px}
.spec .file{display:inline-flex;align-items:center;gap:7px;font:500 12.5px var(--mono);color:var(--muted)}
.spec h3{margin:8px 0 6px}
.spec p{margin:0;font-size:15px;color:var(--muted)}
.spec .view{background:var(--panel);border-radius:var(--r);box-shadow:inset 0 0 0 1px var(--line);overflow:hidden}
.spec .poster{position:relative}
.spec .poster img{width:100%;height:auto;aspect-ratio:16/10;object-fit:cover;object-position:top}
.spec .poster span{position:absolute;left:12px;bottom:12px;font:500 12px var(--mono);color:#fff;background:rgb(0 0 0/.62);padding:5px 8px;border-radius:6px}
.vtt{margin:0;padding:16px;font:12.5px/1.65 var(--mono);color:var(--ink-2);white-space:pre-wrap;overflow-wrap:anywhere}
.vtt b{font-weight:500;color:var(--muted)}
.quote{padding:18px;font-size:15px;line-height:1.5;color:var(--ink)}
.quote small{display:block;margin-top:10px;font:12px var(--mono);color:var(--muted)}
.pages{list-style:none;margin:0;padding:6px 16px;font:13px var(--mono)}
.pages li{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--line);color:var(--ink-2)}
.pages li:first-child{border-top:0}
.pages b{font-weight:500;color:var(--pass)}

/* The lab ledger: measured counts, each with its own row of marks. */
.ledger{display:grid;gap:0;background:var(--panel);border-radius:var(--r);box-shadow:inset 0 0 0 1px var(--line);padding:4px 22px}
.statcell{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;padding:20px 0;border-top:1px solid var(--line)}
.statcell:first-child{border-top:0}
.stat{font:600 clamp(28px,3vw,38px)/1 var(--mono);letter-spacing:-.04em;color:var(--ink)}
.stat small{display:block;margin-top:10px;font:15px/1.5 var(--sans);letter-spacing:0;color:var(--muted);max-width:52ch}
.marks{display:flex;flex-wrap:wrap;gap:3px}
.ledger-note{margin:0;padding:16px 0 18px;border-top:1px solid var(--line);font-size:13.5px;color:var(--muted)}
.marks i{width:9px;height:9px;border-radius:2px;background:var(--panel-3)}
.marks.pass i.on{background:var(--pass)}
.marks.fail i.on{background:var(--fail)}

/* Tables, FAQ, sources. */
.tablewrap{margin-top:clamp(40px,5vw,60px);border-radius:var(--r-lg);background:var(--panel);box-shadow:inset 0 0 0 1px var(--line);overflow-x:auto}
.compare{width:100%;border-collapse:collapse;font-size:15px}
.compare caption{caption-side:bottom;text-align:left;font-size:13px;color:var(--muted);padding:14px 24px}
.compare th,.compare td{text-align:left;vertical-align:top;padding:18px 24px;border-top:1px solid var(--line)}
.compare thead th{font-size:13px;font-weight:600;color:var(--muted);border-top:0;background:var(--panel-2)}
.compare thead th:nth-child(2){color:var(--signal)}
.compare tbody th{font-weight:600;color:var(--ink);width:22%}
.compare td:nth-child(2){color:var(--ink)}
.compare td:nth-child(3){color:var(--muted)}
.faq-grid{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:clamp(32px,6vw,96px);align-items:start}
.faq-grid>div:first-child{position:sticky;top:96px}
.faq-grid .lede{margin:18px 0 0}
.help{margin-top:32px;background:var(--panel-2);border-radius:var(--r);padding:20px 22px}
.help h3{font-size:18px}
.help p{margin:6px 0 16px;font-size:14px;color:var(--muted)}
.faq{display:grid;gap:8px}
.faq details{background:var(--panel-2);border-radius:var(--r);transition:background-color .2s,box-shadow .2s}
.faq details[open]{background:var(--panel);box-shadow:inset 0 0 0 1px var(--line),0 12px 28px -20px rgb(27 26 23/.35)}
.faq summary{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:16px;padding:18px 20px;cursor:pointer;list-style:none}
.faq summary::-webkit-details-marker{display:none}
.faq summary h3{font-size:16.5px;font-weight:600;line-height:1.35;margin:0}
.faq summary .tog{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--panel);color:var(--ink);transition:transform .25s var(--ease),background-color .2s,color .2s}
.faq details[open] .tog{transform:rotate(45deg);background:var(--solid);color:var(--on-solid)}
.faq details p{margin:0;padding:0 64px 20px 20px;color:var(--muted);font-size:15.5px}
.sources{list-style:none;margin:20px 0 0;padding:0;display:grid;gap:0}
.sources li{padding:14px 0;border-top:1px solid var(--line);color:var(--muted);font-size:14.5px}
.sources a{color:var(--ink);font-weight:600;text-decoration-color:var(--line-strong)}
.sources a:hover{text-decoration-color:var(--signal)}
.src-block{margin-top:clamp(56px,7vw,88px)}
.src-block h2{font-size:28px;letter-spacing:-.03em}

/* Guides as a grid of jobs. */
.guide-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:clamp(32px,5vw,72px);margin-top:clamp(40px,5vw,60px)}
.guide-list a{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 20px;align-items:center;padding:22px 0;border-top:1px solid var(--line);text-decoration:none}
.guide-list a h3{font-size:19px;transition:color .18s}
.guide-list a p{grid-column:1;margin:0;font-size:15px;color:var(--muted);max-width:60ch;text-wrap:pretty}
.guide-list .more{grid-column:2;grid-row:1/span 2;display:inline-grid;place-items:center;width:36px;height:36px;border-radius:50%;background:var(--panel-2);color:var(--ink);font-size:0;transition:background-color .2s,color .2s,transform .25s var(--ease)}
.guide-list a:hover h3{color:var(--signal)}
.guide-list a:hover .more{background:var(--solid);color:var(--on-solid);transform:translateX(3px)}

/* Steps written out in order (how a recording runs, how the lab works). */
ol.howto{list-style:none;margin:0;padding:0;counter-reset:h;display:grid;gap:8px}
ol.howto li{counter-increment:h;display:grid;grid-template-columns:44px minmax(0,1fr);gap:4px 14px;padding:20px 22px;border-radius:var(--r);background:var(--panel-2);color:var(--muted)}
ol.howto li::before{content:counter(h);display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--panel);font:600 13px var(--mono);color:var(--ink);grid-row:span 2}
ol.howto strong{color:var(--ink);font-weight:600}

/* The close. */
.close{padding:clamp(104px,13vw,176px) 0 clamp(72px,9vw,120px);text-align:center}
.close .lede{max-width:66ch}
.close .actions{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:34px}

/* Footer: columns, then the name, very large and very quiet. */
.foot{margin-top:clamp(40px,5vw,72px);border-top:1px solid var(--line);overflow:hidden}
.foot-grid{display:grid;grid-template-columns:minmax(0,1.5fr) repeat(4,minmax(0,1fr));gap:36px 28px;padding:56px 0 48px}
.foot-brand p{margin:14px 0 20px;color:var(--muted);font-size:15px;max-width:30ch}
.foot-meta{display:block;margin-top:16px;font-size:13px;color:var(--muted)}
.foot-h{font-size:14px;font-weight:600;color:var(--ink);margin:0 0 14px}
.foot ul{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.foot ul a{font-size:14.5px;color:var(--muted);text-decoration:none}
.foot ul a:hover{color:var(--ink)}
.foot-base{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;padding:22px 0;border-top:1px solid var(--line);font-size:13.5px;color:var(--muted)}
.foot-base a{color:var(--muted)}
.wordmark{display:block;margin:8px 0 -.2em;font:800 clamp(96px,22vw,320px)/.8 var(--sans);letter-spacing:-.06em;text-align:center;color:var(--panel-3);-webkit-mask-image:linear-gradient(#000 20%,transparent 92%);mask-image:linear-gradient(#000 20%,transparent 92%);user-select:none}

/* Page heads for the inner pages. */
.page-head{padding:clamp(56px,8vw,112px) 0 0;text-align:center}
.page-head h1{font-size:clamp(42px,6.2vw,84px)}
.crumbs{display:flex;justify-content:center;flex-wrap:wrap;gap:6px;font-size:13.5px;color:var(--muted);margin:0 0 26px}
.crumbs a{color:var(--muted);text-decoration:none}
.crumbs a:hover{color:var(--ink)}
.page-head .pill{margin-top:34px}

/* Long-form guides. */
.article{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:clamp(40px,6vw,88px);padding:clamp(40px,5vw,72px) 0 0}
.article h1{font-size:clamp(36px,4.6vw,58px);max-width:20ch}
.article .crumbs{justify-content:flex-start}
.prose{max-width:70ch}
.prose .lede{margin:22px 0 0}
.prose h2{font-size:clamp(26px,2.6vw,34px);letter-spacing:-.03em;margin:60px 0 18px}
.prose p,.prose li{color:var(--ink-2);font-size:17px}
.prose li{margin:6px 0}
.prose strong{color:var(--ink);font-weight:600}
.prose table{border-collapse:collapse;width:100%;font-size:15.5px;background:var(--panel);border-radius:var(--r);box-shadow:inset 0 0 0 1px var(--line);overflow:hidden}
.prose td,.prose th{border-top:1px solid var(--line);padding:14px 18px;text-align:left;vertical-align:top}
.prose tr:first-child td,.prose tr:first-child th{border-top:0}
.prose th{width:12rem;font-weight:600;color:var(--ink);font-size:14.5px}
.side{position:sticky;top:96px;align-self:start;display:grid;gap:14px}
.side .card{background:var(--panel-2);box-shadow:none}
.side-h{font-size:15px;font-weight:700;color:var(--ink);margin:0 0 12px}
.side video{width:100%;border-radius:10px;background:#000}
.side .note{margin:10px 0 0;font-size:14px;color:var(--muted)}
.side ul{list-style:none;padding:0;margin:0}
.side li a{display:block;padding:7px 0;text-decoration:none;color:var(--ink-2);font-size:15px}
.side li a:hover{color:var(--signal)}

/* Auth. */
.auth{min-height:calc(100dvh - 65px);display:grid;place-items:center;padding:clamp(20px,4vw,48px) 0}
.auth>.wrap{width:100%;display:grid;justify-items:center}
.auth .pill{white-space:normal;text-align:center}
.auth-shell{width:min(820px,100%);min-width:0;display:grid;grid-template-columns:minmax(0,.92fr) minmax(0,1fr);gap:12px;align-items:start}
.auth-story{align-self:start;border-radius:var(--r-lg);background:var(--panel-2);color:var(--ink);padding:24px 22px;display:flex;flex-direction:column;gap:10px}
.auth-story .dh{color:var(--ink);font-weight:700;font-size:clamp(24px,2.6vw,30px);line-height:1.05;letter-spacing:-.035em;margin:0;max-width:14ch}
.auth-story p{color:var(--muted);margin:0;font-size:14.5px;max-width:34ch}
.auth-ex{list-style:none;margin:8px 0 0;padding:4px;display:grid;gap:1px;border-radius:var(--r);background:var(--panel)}
.auth-ex li{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:baseline;padding:7px 8px;border-radius:8px;font-size:13px;color:var(--ink-2)}
.auth-ex li:nth-child(2){background:var(--exhibit-soft);color:var(--ink)}
.auth-ex li:nth-child(2) .tag{background:var(--exhibit);color:var(--exhibit-ink)}
.auth-ex time{font:11.5px var(--mono);color:var(--muted)}
.auth-files{display:flex;flex-wrap:wrap;gap:5px;margin-top:4px!important;max-width:none!important}
.auth-files span{font:11.5px var(--mono);color:var(--ink-2);background:var(--panel);padding:4px 8px;border-radius:6px}
.auth-card{background:var(--panel);border-radius:var(--r-lg);box-shadow:inset 0 0 0 1px var(--line);padding:24px 24px 20px}
.auth h1{font-size:28px;letter-spacing:-.03em}
.auth .sub{margin:4px 0 0;color:var(--muted);font-size:14px}
.auth label{display:grid;gap:5px;margin-top:12px;font-size:13px;font-weight:500;color:var(--ink-2)}
.auth input{border:0;box-shadow:inset 0 0 0 1px var(--line-strong);background:var(--paper);color:var(--ink);border-radius:10px;padding:10px 12px;font:15px var(--sans);outline:none;transition:box-shadow .18s}
.auth input:focus{box-shadow:inset 0 0 0 2px var(--signal),0 0 0 4px var(--signal-soft)}
.auth .pill{width:100%;margin-top:8px;padding:10px 16px;font-size:14px}
.auth form .pill{margin-top:16px;padding:12px 16px;font-size:15px}
.auth .gbtn{margin-top:16px!important}
.or{display:flex;align-items:center;gap:12px;color:var(--muted);font-size:12.5px;margin:14px 0 0}
.or::before,.or::after{content:"";flex:1;height:1px;background:var(--line)}
.err{color:var(--fail);font-size:13.5px;min-height:0;margin:8px 0 0}
.err:empty{display:none}
.note{color:var(--muted);font-size:13.5px;margin:10px 0 0}
.gnote{font-size:12.5px;margin:6px 0 0}
.note a{color:var(--ink)}
.done{color:var(--ink);font-size:15.5px;line-height:1.5;margin-top:18px}

/* Motion: the recorder window is the only thing that moves on its own. */
@media (prefers-reduced-motion:reduce){:root{scroll-behavior:auto}*{transition:none!important;animation:none!important}}

@media (max-width:1020px){.foot-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.foot-brand{grid-column:1/-1}.specs{grid-template-columns:repeat(2,minmax(0,1fr))}.feats{--cols:2!important}}
@media (max-width:900px){.auth-card{order:-1}.auth-ex,.auth-files{display:none!important}.win-body{grid-template-columns:1fr}.screen{border-right:0;border-bottom:1px solid var(--line)}.transcript ol{max-height:280px}.split,.faq-grid,.article,.auth-shell{grid-template-columns:1fr}.faq-grid>div:first-child,.side{position:static}}
@media (max-width:760px){.nav-main{display:none}.hide-sm{display:none}}
@media (max-width:620px){.compare thead{display:none}.compare tr{display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;padding:18px;border-top:1px solid var(--line)}.compare tbody tr:first-child{border-top:0}.compare tbody th,.compare td{padding:0;border:0;width:auto}.compare tbody th{grid-column:1/-1;padding-bottom:4px}.compare td::before{content:attr(data-label);display:block;margin-bottom:4px;font-size:12.5px;font-weight:600;color:var(--muted)}.compare td:nth-child(2)::before{color:var(--signal)}.urlform{flex-direction:column;align-items:stretch;border-radius:22px;padding:8px}.urlform>.ic{display:none}.urlform input{padding:12px 12px}.urlform .pill{width:100%}.specs,.guide-list,.feats{grid-template-columns:1fr!important}.win-bar .win-title{display:none}.faq details p{padding:0 20px 20px}.faq summary{gap:12px;padding:16px}.auth-story,.auth-card{padding:26px 22px}.belt{gap:10px 22px}.belt li{font-size:14px}}`;

const MARK = `<svg width="28" height="28" viewBox="0 0 26 26" aria-hidden="true"><rect x=".5" y=".5" width="25" height="25" rx="7.5" fill="#874b00"/><path d="M10.2 8.4v9.2l7.2-4.6z" fill="#fff"/><circle cx="20.4" cy="5.6" r="2.6" fill="#c0321c" stroke="#ffffff" stroke-width="1.2"/></svg>`;

/** Drawn icons: one 24px grid, one stroke. */
const ICONS: Record<string, string> = {
  link: `<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>`,
  play: `<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>`,
  rec: `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4" fill="currentColor"/>`,
  captions: `<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10.6 10.3a2.2 2.2 0 1 0 0 3.4M16.8 10.3a2.2 2.2 0 1 0 0 3.4"/>`,
  wave: `<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/>`,
  lock: `<rect x="5" y="11" width="14" height="9.5" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>`,
  shield: `<path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z"/><path d="m9 12 2 2 4-4"/>`,
  stop: `<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5h5v5h-5z" fill="currentColor"/>`,
  eye: `<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>`,
  globe: `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>`,
  file: `<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>`,
  film: `<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>`,
  list: `<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.5" cy="6.5" r="1.1" fill="currentColor"/><circle cx="4.5" cy="12" r="1.1" fill="currentColor"/><circle cx="4.5" cy="17.5" r="1.1" fill="currentColor"/>`,
  flask: `<path d="M9 3h6M10 3v6L4.6 18.4A1.7 1.7 0 0 0 6.1 21h11.8a1.7 1.7 0 0 0 1.5-2.6L14 9V3"/><path d="M7.2 15h9.6"/>`,
  clock: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>`,
  replay: `<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/>`,
  mail: `<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/>`,
  arrow: `<path d="M5 12h14M13 6l6 6-6 6"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  quote: `<path d="M4 6h16M4 11h16M4 16h10"/>`,
  key: `<circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5M16 7l2.5 2.5M14 9l2 2"/>`,
  server: `<rect x="3.5" y="4" width="17" height="7" rx="2"/><rect x="3.5" y="13" width="17" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>`,
  laptop: `<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M3 19h18"/>`,
  check: `<path d="m5 12.5 4.5 4.5L19 7.5"/>`,
  target: `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>`,
  user: `<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>`,
};

function icon(name: string, size = 20): string {
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ""}</svg>`;
}

/** A drawn tile set into a headline. Decorative: the words carry the meaning. */
function tile(name: string, tone: "ink" | "signal" | "rec" | "pass" | "exhibit", tilt = false): string {
  return `<span class="tile t-${tone}${tilt ? " tilt" : ""}" aria-hidden="true">${icon(name)}</span>`;
}

/** Shared script: arm `.js` and nothing else. Pages add their own behaviour where they need it. */
const SCRIPT = `<script>document.documentElement.classList.add("js");</script>`;

function footer(): string {
  const col = (title: string, links: [string, string][]) =>
    `<div><p class="foot-h">${esc(title)}</p><ul>${links.map(([href, label]) => `<li><a href="${esc(href)}">${esc(label)}</a></li>`).join("")}</ul></div>`;
  return `<footer><div class="foot"><div class="wrap">
  <div class="foot-grid">
    <div class="foot-brand"><a class="brand" href="/" aria-label="${NAME} home">${MARK}<span>${NAME}</span></a><p>Narrated walkthroughs of any website, and regression tests for the agents that browse them.</p><a class="pill solid" href="/signup">Get started free</a><span class="foot-meta">MIT licensed · runs on Node.js 22, Chromium and ffmpeg</span></div>
    ${col("Product", [["/how", "How it works"], ["/lab", "Walkcast Lab"], ["/safety", "Safety"], ["/pricing", "Pricing"], ["/#faq", "FAQ"]])}
    ${col("Guides", GUIDES.slice(0, 6).map((g) => [`/guides/${g.slug}`, g.label] as [string, string]))}
    ${col("Compare", Object.values(COMPARE_CONFIGS).map((c) => [`/compare/${c.slug}`, `${NAME} vs ${c.other}`] as [string, string]))}
    ${col("Account", [["/login", "Sign in"], ["/signup", "Create an account"], ["/app", "Open the app"]])}
  </div>
  <div class="foot-base"><span>© ${new Date().getFullYear()} ${NAME} · <a href="https://opensource.org/licenses/MIT">MIT licensed</a></span><span>Every line narrated from what the browser did.</span></div>
</div><span class="wordmark" aria-hidden="true">walkcast</span></div></footer>`;
}

function layout(o: { siteUrl: string; path: string; title: string; description: string; body: string; head?: string; noindex?: boolean; user?: { email: string } | null; chrome?: "full" | "minimal" }): string {
  const url = `${o.siteUrl}${o.path}`;
  const here = (href: string) => (o.path === href || (href !== "/" && o.path.startsWith(`${href}/`)) ? ` aria-current="page"` : "");
  const end = o.user
    ? `<a href="/app#record" class="pill solid">Open the app</a>`
    : `<a href="/login" class="hide-sm"${here("/login")}>Sign in</a><a href="/signup" class="pill"${here("/signup")}>Get started</a>`;
  // Auth screens keep the navbar but skip the footer sitemap, so the form stays compact.
  const minimal = o.chrome === "minimal";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="${o.noindex ? "noindex, follow" : "index, follow, max-image-preview:large, max-video-preview:-1, max-snippet:-1"}">
<meta name="theme-color" content="#ffffff">
<meta name="color-scheme" content="light">
<link rel="manifest" href="/manifest.webmanifest">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${NAME}">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${o.siteUrl}/assets/og.png">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(`${NAME} — ${o.title}`)}">
<meta property="og:locale" content="en_US">
<meta name="twitter:site" content="@walkcast">
<meta property="og:video" content="${o.siteUrl}/assets/demo.mp4"><meta property="og:video:type" content="video/mp4">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(o.title)}">
<meta name="twitter:description" content="${esc(o.description)}">
<meta name="twitter:image" content="${o.siteUrl}/assets/og.png">
<meta name="twitter:image:alt" content="${esc(`${NAME} — ${o.title}`)}">
<link rel="sitemap" type="application/xml" href="/sitemap.xml">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="text/plain" href="${esc(o.siteUrl)}/llms.txt" title="LLM-readable summary">
<link rel="alternate" type="text/markdown" href="${esc(o.siteUrl)}/pricing.md" title="Pricing">
<link rel="preload" href="/assets/fonts/schibsted-grotesk.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/jetbrains-mono.woff2" as="font" type="font/woff2" crossorigin>
<style>${CSS}</style>
${o.head ?? ""}
<script>if("serviceWorker"in navigator)navigator.serviceWorker.register("/sw.js").catch(function(){});</script>
</head>
<body>
<a href="#main" class="skip">Skip to content</a>
<header class="top"><div class="wrap"><a class="brand" href="/" aria-label="${NAME} home">${MARK}<span>${NAME}</span></a><nav class="nav-main" aria-label="Main"><a href="/how"${here("/how")}>How it works</a><a href="/lab"${here("/lab")}>Lab</a><a href="/guides"${here("/guides")}>Guides</a><a href="/pricing"${here("/pricing")}>Pricing</a></nav><div class="nav-end">${end}</div></div></header>
<main id="main">${o.body}</main>
${minimal ? "" : footer()}
${SCRIPT}
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

/** One mark per trial, filled for the ones counted: the count drawn at its own scale. */
function marks(value: string, tone: "pass" | "fail"): string {
  const m = /^(\d+)\/(\d+)$/.exec(value);
  if (!m) return "";
  const k = Number(m[1]);
  const n = Number(m[2]);
  if (n < 1 || n > 80) return "";
  return `<span class="marks ${tone}" aria-hidden="true">${"<i class=\"on\"></i>".repeat(k)}${"<i></i>".repeat(n - k)}</span>`;
}

function labCards(facts: SiteFacts): string {
  const e = facts.experiment;
  const cards: [string, string, "pass" | "fail"][] = [];
  cards.push(
    e
      ? [`${e.detected.k}/${e.detected.n}`, `injected faults diagnosed with the right cause (${agentWord(e)}${interval(e.detected.k, e.detected.n)})`, "pass"]
      : [...LAB_FALLBACK.detected, "pass"],
  );
  cards.push(
    e
      ? [`${e.falseAlarms.k}/${e.falseAlarms.n}`, `false alarms on runs with no fault injected${interval(e.falseAlarms.k, e.falseAlarms.n)}`, "fail"]
      : [...LAB_FALLBACK.falseAlarms, "fail"],
  );
  if (e?.falseSuccess) {
    cards.push([
      `${e.falseSuccess.k}/${e.falseSuccess.n}`,
      `success claims the application's records disagreed with (${agentWord(e)}${interval(e.falseSuccess.k, e.falseSuccess.n)})`,
      "fail",
    ]);
  }
  const rows = cards.map(([value, note, tone]) => `<div class="statcell"><div class="stat">${value}<small>${note}</small></div>${marks(value, tone)}</div>`).join("\n    ");
  return `${rows}\n    <p class="ledger-note">Across ${facts.scenarios} scenarios (three CRM tasks with composable faults) and ${facts.providers} model providers through one gateway. One mark per trial.</p>`;
}

function startForm(id: string, label = "Make my walkthrough"): string {
  return `<form class="urlform" action="/start" method="get" role="search" aria-label="Start a walkthrough">
    ${icon("link", 18)}
    <label for="${id}" class="sr-only">Your website's link</label>
    <input id="${id}" name="url" type="url" inputmode="url" autocomplete="url" placeholder="https://your-app.com/login" required>
    <button class="pill rec" type="submit">${esc(label)}</button>
  </form>`;
}

function faqList(items: [string, string][], opts: { open?: number } = {}): string {
  const open = opts.open ?? 1;
  return `<div class="faq">${items
    .map(([q, a], i) => `<details${i < open ? " open" : ""}><summary><h3>${esc(q)}</h3><span class="tog">${icon("plus", 15)}</span></summary><p>${esc(a)}</p></details>`)
    .join("")}</div>`;
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
        name: "Example narrated website walkthrough (Estate360, a real-estate CRM)",
        description: "An unedited walkthrough recorded by Walkcast: it opens the Estate360 site, browses six of its pages and narrates each step.",
        thumbnailUrl: [`${siteUrl}/assets/demo-poster.jpg`],
        contentUrl: `${siteUrl}/assets/demo.mp4`,
        embedUrl: `${siteUrl}/#demo`,
        uploadDate: "2026-10-16T00:00:00Z",
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

  // Every exhibit on this page is a line or a file from the demo recording, so a claim can cite it.
  const at = (re: RegExp) => d.captions.findIndex((c) => re.test(c.text));
  const cite = (i: number) => (i >= 0 && d.captions[i] ? `<a class="cite" href="#demo" data-cite="${i}" title="${esc(`${clock(d.captions[i]!.start)} · ${d.captions[i]!.text}`)}">EX ${i + 1}</a>` : "");
  const exOpen = at(/^Opening/);
  const exPricing = at(/pricing page/i);
  const exScroll = at(/^Scrolling/);
  const exEnd = d.captions.length - 1;
  const closer = d.captions.at(-1)?.text ?? "";
  const vtt = d.captions
    .slice(0, 3)
    .map((c) => {
      const t = (s: number) => `00:${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(3).padStart(6, "0")}`;
      return `<b>${t(c.start)} --&gt; ${t(c.end)}</b>\n${esc(c.text)}`;
    })
    .join("\n\n");
  const pageChips = d.pages
    .map((pg) => {
      const i = d.captions.findIndex((c) => c.text.includes(pg.title));
      return `<button type="button" class="pagechip" ${i >= 0 ? `data-cite="${i}"` : "disabled"}>${esc(pg.path)} <b>${pg.status ?? "—"}</b></button>`;
    })
    .join("");
  const howCites = [cite(exOpen), "", cite(exEnd)];
  const howIcons = ["link", "lock", "film"];

  const body = `
<section class="sec first center"><div class="wrap">
  <h1>Paste a ${tile("link", "ink")} link.<br><span class="dim">Get it ${tile("play", "signal", true)} narrated.</span></h1>
  <p class="lede">A real browser signs in, walks your pages, and hands back an MP4 with a spoken voice-over, captions and a transcript. No script, no editor, no microphone.</p>
  ${startForm("url")}
  <p class="fineprint"><b>Free</b> and MIT licensed · works behind a login · the password is never saved</p>
  <div class="frame" id="demo">
    <div class="win">
      <div class="win-bar"><span class="lights" aria-hidden="true"><i></i><i></i><i></i></span><span class="win-title mono">Estate360 · real output, unedited</span><span class="win-meta"><span class="live">REC</span><span class="mono">${d.pages.length} pages · ${clock(d.durationSeconds)}</span></span></div>
      <div class="win-body">
        <figure class="screen">
          <video id="demo-video" controls playsinline preload="metadata" poster="/assets/demo-poster.jpg" aria-describedby="demo-transcript">
            <source src="/assets/demo.mp4" type="video/mp4">
            <source src="/assets/demo.webm" type="video/webm">
            <track kind="captions" src="/assets/demo.vtt" srclang="en" label="Narration" default>
          </video>
          <div class="chapters" aria-label="Narration lines">${d.captions.map((c, i) => `<button type="button" data-cite="${i}" style="flex-grow:${Math.max(c.end - c.start, 0.6).toFixed(2)}" aria-label="${esc(`EX ${i + 1} at ${clock(c.start)}: ${c.text}`)}"></button>`).join("")}</div>
          <figcaption class="screen-meta"><span class="mono">recording.mp4</span><span>Voice-over, captions on</span><span class="ok">${d.pages.filter((p) => p.status === 200).length} of ${d.pages.length} pages answered 200</span></figcaption>
        </figure>
        <aside class="transcript" aria-label="Transcript">
          <header><p>Walking a real-estate CRM</p><span>${d.captions.length} lines</span></header>
          <ol id="demo-transcript">${d.captions.map((c, i) => `<li data-t="${c.start}"><button type="button"><span class="tag">EX ${i + 1}</span><span>${esc(c.text)}</span><time datetime="${iso(c.start)}">${clock(c.start)}</time></button></li>`).join("")}</ol>
        </aside>
      </div>
      <div class="win-foot"><span>Pages</span>${pageChips}</div>
    </div>
  </div>
  <ul class="belt" aria-label="Files you get back">
    <li>${icon("film")}recording.mp4</li><li>${icon("film")}recording.webm</li><li>${icon("captions")}captions.vtt</li><li>${icon("wave")}narration.wav</li><li class="sans">${icon("list")}Page list</li>
  </ul>
</div></section>

<section class="sec" id="what-is"><div class="wrap split">
  <div>
    <h2>What is Walkcast? <span class="dim">A browser that ${tile("eye", "exhibit")} tells you what it did.</span></h2>
    <p class="answer">${esc(DEFINITION)}</p>
    <p class="meta">See it in the recording: the first page opened ${cite(exOpen)}, its content read out ${cite(exScroll)}, the pricing page reached ${cite(exPricing)}, the run closed ${cite(exEnd)}. Updated <time datetime="${GUIDES_UPDATED}">${GUIDES_UPDATED}</time>.</p>
  </div>
  <div class="panel">
    <div class="card" style="padding:0"><pre class="vtt">WEBVTT

${vtt}</pre></div>
    <p class="meta" style="padding:0 6px">captions.vtt, first three cues, exactly as written by the recorder.</p>
  </div>
</div></section>

<section class="sec" id="how"><div class="wrap">
  <div class="sec-head center"><h2>Three steps. <span class="dim">About two ${tile("clock", "ink", true)} minutes.</span></h2>
  <p class="lede">You don't write a script. A real browser does the walk, and every line comes from what it actually did.</p></div>
  <ul class="chips"><li>${icon("check", 16)}Free, MIT licensed</li><li>${icon("lock", 16)}Works behind a login</li><li>${icon("key", 16)}Password held in memory</li><li>${icon("stop", 16)}Stops at CAPTCHA and 2FA</li></ul>
  <ol class="feats">${HOW.map(([t, p], i) => `<li>${icon(howIcons[i]!, 22)}<h3>${esc(t)}</h3><p>${esc(p)} ${howCites[i] ?? ""}</p></li>`).join("")}</ol>
  <p class="center" style="margin-top:40px"><a class="textlink" href="/how">How a recording runs ${icon("arrow", 16)}</a></p>
</div></section>

<section class="sec" id="output"><div class="wrap">
  <div class="sec-head center"><h2>One video. <span class="dim">And every ${tile("file", "signal")} file around it.</span></h2>
  <p class="lede">Send the MP4. Keep the captions, the voice-over and the page list for the next cut.</p></div>
  <div class="specs">
    <article class="spec">
      <div class="view poster"><img src="/assets/demo-poster.jpg" alt="A frame from the demo walkthrough: the Estate360 home page hero" width="640" height="400" loading="lazy"><span>${clock(d.durationSeconds)} · unedited</span></div>
      <div class="body"><span class="file">${icon("film", 15)}recording.mp4</span><h3>Narrated video</h3><p>H.264 with a spoken voice-over and an embedded caption track. It plays anywhere, and it is the same file the browser produced.</p></div>
    </article>
    <div style="display:grid;gap:16px">
      <article class="spec">
        <div class="view"><pre class="vtt">${vtt.split("\n\n")[1] ?? vtt}</pre></div>
        <div class="body"><span class="file">${icon("captions", 15)}captions.vtt</span><h3>Captions</h3><p>WebVTT, timed to the speech, for accessible embeds and video hosts.</p></div>
      </article>
      <article class="spec">
        <div class="view quote">${esc(closer)}<small>last line of the narration ${cite(exEnd)}</small></div>
        <div class="body"><span class="file">${icon("wave", 15)}narration.wav</span><h3>Audio</h3><p>The voice-over on its own, to re-cut or re-voice.</p></div>
      </article>
    </div>
    <article class="spec">
      ${d.pages.length ? `<div class="view"><ul class="pages">${d.pages.map((pg) => `<li><span>${esc(pg.path)}</span><b>${pg.status ?? "—"}</b></li>`).join("")}</ul></div>` : ""}
      <div class="body"><span class="file">${icon("list", 15)}pages · status</span><h3>Page list</h3><p>Every page visited, its title and HTTP status, and the links skipped on purpose.</p></div>
    </article>
  </div>
</div></section>

<section class="sec" id="safety"><div class="wrap">
  <div class="sec-head"><h2>A careful visitor, <span class="dim">not a bot ${tile("shield", "pass")} let loose.</span></h2></div>
  <ul class="feats">
    <li>${icon("user", 22)}<h3>Only sites you may test</h3><p>Every recording needs your confirmation.</p></li>
    <li>${icon("key", 22)}<h3>Password stays in memory</h3><p>Files on disk show a placeholder.</p></li>
    <li>${icon("stop", 22)}<h3>Stops at CAPTCHA and 2FA</h3><p>It never tries to get past them.</p></li>
    <li>${icon("eye", 22)}<h3>Read-only after sign-in</h3><p>No forms submitted; sign-out and delete links skipped.</p></li>
    <li>${icon("globe", 22)}<h3>Same site only</h3><p>Follows links on your domain, respects robots.txt, paces requests.</p></li>
    <li>${icon("quote", 22)}<h3>Honest narration</h3><p>Written from recorded events, never invented. ${cite(exScroll)}</p></li>
  </ul>
  <p style="margin-top:40px"><a class="textlink" href="/safety">The rules, in full ${icon("arrow", 16)}</a></p>
</div></section>

<section class="sec" id="agents"><div class="wrap split">
  <div>
    <h2>When an agent fails, <span class="dim">keep the ${tile("flask", "ink", true)} test.</span></h2>
    <p class="answer">The same recorder powers Walkcast Lab. It captures a browser-agent run, names the cause from the app's real state, and saves a replayable regression. Intervals are 95% Wilson score intervals.</p>
    <p style="margin-top:28px"><a class="textlink" href="/lab">The lab, in full ${icon("arrow", 16)}</a></p>
  </div>
  <div class="panel"><div class="ledger">${labCards(facts)}
  </div></div>
</div></section>

<section class="sec" id="compare"><div class="wrap">
  <div class="sec-head center"><h2>Walkcast vs recording it yourself.</h2>
  <p class="lede">A screen recorder captures your display while you talk. Walkcast drives a browser from a link and writes the narration from what that browser did. They are for different videos.</p></div>
  <div class="tablewrap">
  <table class="compare">
    <caption>How the two ways of making a website walkthrough differ</caption>
    <thead><tr><th scope="col">Criterion</th><th scope="col">Walkcast</th><th scope="col">Screen recording</th></tr></thead>
    <tbody>${COMPARE.map((row) => `<tr><th scope="row">${esc(row.criterion)}</th><td data-label="Walkcast">${esc(row.walkcast)}</td><td data-label="Screen recording">${esc(row.manual)}</td></tr>`).join("")}</tbody>
  </table>
  </div>
  <p class="center" style="margin-top:28px"><a class="textlink" href="/guides/walkcast-vs-screen-recording">Full comparison, including when a screen recorder is the better tool ${icon("arrow", 16)}</a></p>
</div></section>

<section class="sec" id="guides"><div class="wrap">
  <div class="sec-head"><h2>Walkthroughs, <span class="dim">by the job.</span></h2>
  <p class="lede">What to show, how many pages, which account to use, and where the video goes afterwards.</p></div>
  <nav class="guide-list" aria-label="Guides">${GUIDES.map((g) => guideCard(g)).join("")}</nav>
</div></section>

<section class="sec" id="faq"><div class="wrap">
  <div class="faq-grid">
    <div>
      <h2>Questions.</h2>
      <p class="lede">Answered here, in the page, so you don't have to ask.</p>
      <div class="help"><h3>Still have a question?</h3><p>Write to us and we'll help you get the first recording made.</p><a class="pill solid" href="mailto:hello@walkcast.dev">${icon("mail", 16)} Email us</a></div>
    </div>
    ${faqList(FAQ)}
  </div>
  <div class="src-block">
    <h2 id="sources">Sources</h2>
    <p class="meta">Claims on this page rest on these. The lab counts are from the published Walkcast experiment with scripted agents, not from a survey of other tools.</p>
    <ol class="sources">${SOURCES.map((s) => `<li><a href="${esc(s.url)}">${esc(s.name)}</a> ${esc(s.detail)}</li>`).join("")}</ol>
  </div>
</div></section>

<section class="close"><div class="wrap">
  <h2>Your site, ${tile("rec", "rec")} walked. <span class="dim">And narrated.</span></h2>
  <p class="lede">Create a free account with Google or email and record the first one.</p>
  ${user ? `<div class="actions"><a class="pill solid big" href="/app#record">Open the app</a></div>` : startForm("url-close")}
</div></section>
<script>
(function(){var v=document.getElementById("demo-video");if(!v)return;
var calm=matchMedia("(prefers-reduced-motion: reduce)").matches,list=document.getElementById("demo-transcript"),lines=[].slice.call(list.querySelectorAll("li")),chs=[].slice.call(document.querySelectorAll(".chapters button")),cur=-1;
function seek(i,play){var li=lines[i];if(!li)return;v.currentTime=+li.dataset.t+.01;if(play){var p=v.play();if(p&&p.catch)p.catch(function(){})}}
lines.forEach(function(li,i){li.querySelector("button").addEventListener("click",function(){seek(i,true)})});
function sync(){var t=v.currentTime,on=-1;lines.forEach(function(li,i){if(+li.dataset.t<=t+.02)on=i});
chs.forEach(function(b,i){b.classList.toggle("done",i<on);b.classList.toggle("on",i===on)});
if(on===cur)return;if(lines[cur]){lines[cur].classList.remove("on");lines[cur].removeAttribute("aria-current")}cur=on;var li=lines[on];if(!li)return;li.classList.add("on");li.setAttribute("aria-current","true");
var top=li.offsetTop;if(top<list.scrollTop||top+li.offsetHeight>list.scrollTop+list.clientHeight)list.scrollTo({top:Math.max(0,top-list.clientHeight/3),behavior:calm?"auto":"smooth"})}
v.addEventListener("timeupdate",sync);v.addEventListener("seeked",sync);
document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("[data-cite]");if(!a)return;e.preventDefault();var i=+a.dataset.cite,inPlayer=!!a.closest("#demo");seek(i,inPlayer);
if(!inPlayer){var r=document.getElementById("demo").getBoundingClientRect();if(r.top<0||r.bottom>innerHeight)document.getElementById("demo").scrollIntoView({behavior:calm?"auto":"smooth",block:"center"})}
var li=lines[i];if(li){li.classList.remove("spot");void li.offsetWidth;li.classList.add("spot")}});
})();
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
  opts: { google: boolean; next: string; openrouter?: boolean; chatgpt?: boolean; url?: string; forgot?: boolean; provider?: "local" | "supabase"; notice?: string },
): string {
  const copy = {
    signup: { h1: "Start recording", lede: "Free. Record narrated walkthroughs of sites you own or may test.", button: "Create account", title: "Create an account" },
    login: { h1: "Sign in", lede: "Pick up where you left off.", button: "Sign in", title: "Sign in" },
    forgot: { h1: "Reset it by email", lede: "We'll email you a link to choose a new password.", button: "Send the link", title: "Reset your password" },
    reset: { h1: "Choose a new password", lede: "At least 8 characters.", button: "Save and sign in", title: "Choose a new password" },
  }[mode];
  const withEmail = mode !== "reset";
  const withPassword = mode !== "forgot";
  const showGoogle = mode === "signup" || mode === "login";
  const googleHint = opts.provider === "supabase" ? "Turn on the Google provider in your Supabase project (Authentication → Providers)." : "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server to enable.";
  const body = `
<section class="auth"><div class="wrap">
  <div class="auth-shell">
  <div class="auth-story">
    <p class="dh">Your site, walked and narrated.</p>
    <p>An MP4, captions and a transcript, from one link. The password stays in memory.</p>
    ${authExhibit()}
    <p class="auth-files"><span>recording.mp4</span><span>recording.webm</span><span>captions.vtt</span><span>narration.wav</span></p>
  </div>
  <div class="auth-card">
    <h1>${copy.h1}</h1>
    <p class="sub">${copy.lede}</p>
    ${opts.url ? `<p class="note mono" style="word-break:break-all">Next: ${esc(opts.url)}</p>` : ""}
    ${opts.notice ? `<p class="note" role="status" style="color:var(--ink)">${esc(opts.notice)}</p>` : ""}
    ${
      showGoogle
        ? `<a class="pill ghost gbtn" ${opts.google ? `href="/auth/google?next=${encodeURIComponent(opts.next)}"` : `aria-disabled="true" title="${esc(googleHint)}"`}>${GOOGLE_ICON} Continue with Google</a>
    ${opts.google ? "" : `<p class="note gnote">Google sign-in isn't turned on for this server yet; use email below.</p>`}
     ${opts.openrouter ? `<a class="pill rbtn" href="/auth/openrouter?next=${encodeURIComponent(opts.next)}">Continue with OpenRouter (uses your credits)</a>` : ""}
     ${opts.chatgpt ? `<a class="pill cbtn" href="/auth/chatgpt?next=${encodeURIComponent(opts.next)}">Continue with ChatGPT (uses your plan)</a>` : ""}
    <div class="or">or with email</div>`
        : ""
    }
    <form id="auth" novalidate>
      ${mode === "signup" ? `<label>Name <input name="name" autocomplete="name" maxlength="80"></label>` : ""}
      ${withEmail ? `<label>Email <input name="email" type="email" autocomplete="email" required></label>` : ""}
      ${withPassword ? `<label>${mode === "reset" ? "New password" : "Password"} <input name="password" type="password" autocomplete="${mode === "login" ? "current-password" : "new-password"}" minlength="${mode === "login" ? 1 : 8}" required></label>` : ""}
      <button class="pill solid" type="submit">${copy.button}</button>
      <p class="err" role="alert" id="err"></p>
    </form>
    <p class="done" id="done" role="status" hidden></p>
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
    chrome: "minimal",
  });
}

/** The opening lines of the demo recording, exactly as narrated. */
function authExhibit(): string {
  const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  const lines = demo()
    .captions.map((c, i) => ({ c, i }))
    .slice(0, 4);
  if (!lines.length) return "";
  return `<ol class="auth-ex" aria-label="From the demo recording">${lines.map(({ c, i }) => `<li><span class="tag">EX ${i + 1}</span><span>${esc(c.text)}</span><time>${clock(c.start)}</time></li>`).join("")}</ol>`;
}

// --------------------------------------------------------------------------------- guides

function guideCard(g: Guide): string {
  return `<a href="/guides/${g.slug}"><h3>${esc(g.label)}</h3><p>${esc(g.description)}</p><span class="more">Read the guide ${icon("arrow", 15)}</span></a>`;
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
<section class="page-head"><div class="wrap">
  ${crumb("Guides")}
  <h1>Walkthroughs, <span class="dim">by the ${tile("list", "signal")} job you need done.</span></h1>
  <p class="lede">${GUIDES.length} guides. Each one covers a single job end to end: what to record, the settings that work, and what to do with the video afterwards.</p>
</div></section>
<section class="sec" style="padding-top:clamp(40px,5vw,64px)"><div class="wrap">
  <nav class="guide-list" aria-label="Guides" style="margin-top:0">${GUIDES.map((g) => guideCard(g)).join("")}</nav>
</div></section>
${endCta(user, "Record one", "Paste your site's link. You get a narrated MP4, captions and a transcript in about two minutes.", { em: "now." })}`;
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
  <div class="article">
    <article class="prose">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/guides">Guides</a> / ${esc(g.label)}</nav>
      <h1>${esc(g.h1)}</h1>
      <p class="lede">${esc(g.description)}</p>
      <p class="meta">For ${esc(g.audience)} · Updated <time datetime="${GUIDES_UPDATED}">${GUIDES_UPDATED}</time> · <a href="/#sources">Sources</a></p>
      ${g.intro.map((p) => `<p>${esc(p)}</p>`).join("")}
      <h2>Step by step</h2>
      <ol class="howto">${g.steps.map(([t, d], i) => `<li id="step-${i + 1}"><strong>${esc(t)}.</strong> <span>${esc(d)}</span></li>`).join("")}</ol>
      <h2>Settings that work</h2>
      <table><tbody>${g.settings.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</tbody></table>
      <h2>After recording</h2>
      <ul>${g.afterwards.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
      <h2>Mistakes to avoid</h2>
      <ul>${g.pitfalls.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
      <h2>Questions</h2>
      ${faqList(g.faq, { open: g.faq.length })}
    </article>
    <aside class="side" aria-label="More guides">
      <div class="card"><p class="side-h">The example</p><video controls playsinline preload="none" poster="/assets/demo-poster.jpg"><source src="/assets/demo.mp4" type="video/mp4"><source src="/assets/demo.webm" type="video/webm"><track kind="captions" src="/assets/demo.vtt" srclang="en" label="Narration" default></video><p class="note">An unedited recording of a real-estate CRM.</p></div>
      <div class="card"><p class="side-h">Other guides</p><ul>${others.map((o) => `<li><a href="/guides/${o.slug}">${esc(o.label)}</a></li>`).join("")}</ul></div>
    </aside>
  </div>
</div>
${endCta(user, "Record one", "Paste your site's link. You get a narrated MP4, captions and a transcript in about two minutes.", { em: "now." })}`;
  return layout({ siteUrl, path: `/guides/${g.slug}`, title: g.title, description: g.description, body, head, user });
}

function breadcrumbs(siteUrl: string, trail: [string, string][]): unknown {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [["Home", "/"] as [string, string], ...trail].map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${siteUrl}${path}` })),
  };
}

function endCta(user: { email: string } | null, heading: string, text: string, opts?: { em?: string; ghostHref?: string; ghostLabel?: string }): string {
  const href = user ? "/app#record" : "/signup";
  const label = user ? "Open the app" : "Get started free";
  const h2 = opts?.em ? `${esc(heading)} <span class="dim">${esc(opts.em)}</span>` : esc(heading);
  const ghost = opts?.ghostHref ? `<a class="pill ghost big" href="${esc(opts.ghostHref)}">${esc(opts.ghostLabel ?? "Watch the example")}</a>` : "";
  return `<section class="close"><div class="wrap"><h2>${h2}</h2><p class="lede">${esc(text)}</p><div class="actions"><a class="pill solid big" href="${href}">${label}</a>${ghost}</div></div></section>`;
}

function crumb(here: string): string {
  return `<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / ${esc(here)}</nav>`;
}

const RECORD_STEPS: [string, string][] = [
  ["Find the start page", "The link you paste is where the browser opens. Use the sign-in page when the useful screens are behind a login."],
  ["Sign in, if you gave credentials", "It looks for an ordinary form, including email-then-password in two steps. The password stays in memory. A CAPTCHA or a second factor stops the recording."],
  ["Follow links on that site", "After sign-in it loads pages the way a visitor would, up to 30 of them, on the same site. It does not submit forms, and it skips sign-out, delete, cancel and unsubscribe links."],
  ["Write the narration from the trace", "Each line names a page opened, a field typed into, a click, or what the site answered. Nothing is added about why someone might do it."],
  ["Pack the files", "You get an MP4 with the voice-over and an embedded caption track, a WebM copy, the narration as WAV, WebVTT captions, and the page list with HTTP status."],
];

/** How a recording actually runs, past the three steps on the home page. */
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
<section class="page-head"><div class="wrap">
  ${crumb("How")}
  <h1>A browser walks the site. <span class="dim">You get the ${tile("film", "signal")} video.</span></h1>
  <p class="lede">${esc(description)}</p>
  ${startForm("how-url")}
</div></section>
<section class="sec"><div class="wrap split top">
  <div class="sec-head"><h2>After you paste <span class="dim">the link.</span></h2><p class="lede">Five things happen, in this order, and each one leaves a file or a line you can check.</p></div>
  <ol class="howto">${RECORD_STEPS.map(([t, d], i) => `<li id="step-${i + 1}"><strong>${esc(t)}.</strong> <span>${esc(d)}</span></li>`).join("")}</ol>
</div></section>
<section class="sec"><div class="wrap">
  <div class="sec-head"><h2>What it will not do.</h2></div>
  <ul class="feats" style="--cols:4">
    <li>${icon("stop", 22)}<h3>No CAPTCHA or 2FA bypass</h3><p>The recording stops and tells you.</p></li>
    <li>${icon("globe", 22)}<h3>No other sites</h3><p>Links that leave your domain are not followed.</p></li>
    <li>${icon("eye", 22)}<h3>No writes after sign-in</h3><p>Forms stay unsubmitted.</p></li>
    <li>${icon("quote", 22)}<h3>No guessed narration</h3><p>If the trace doesn't contain it, the voice doesn't say it.</p></li>
  </ul>
  <p style="margin-top:40px"><a class="textlink" href="/safety">Safety rules ${icon("arrow", 16)}</a></p>
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
<section class="page-head"><div class="wrap">
  ${crumb("Lab")}
  <h1>When an agent fails, <span class="dim">keep the ${tile("flask", "ink", true)} test.</span></h1>
  <p class="lede">${esc(description)}</p>
  <a class="pill solid big" href="${user ? "/app" : "/signup"}">${user ? "Open the lab" : "Get started free"}</a>
</div></section>
<section class="sec"><div class="wrap split">
  <div class="sec-head"><h2>Measured, <span class="dim">with the interval.</span></h2><p class="lede">The intervals are 95% Wilson score intervals. The published experiment uses scripted agents. A number is only shown when the committed results contain it.</p></div>
  <div class="panel"><div class="ledger">${labCards(facts)}</div></div>
</div></section>
<section class="sec"><div class="wrap">
  <div class="sec-head center"><h2>Four moves, <span class="dim">then a ${tile("replay", "signal")} replay.</span></h2></div>
  <ol class="feats" style="--cols:4">
    <li>${icon("rec", 22)}<h3>Capture the run</h3><p>Every action records the application's state before and after, the target it aimed at, and the network and console around it.</p></li>
    <li>${icon("target", 22)}<h3>Check the app, not the claim</h3><p>A success toast is not proof. The oracle reads the application's records.</p></li>
    <li>${icon("quote", 22)}<h3>Name a cause, or don't</h3><p>Deterministic rules cite the steps. Anything they can't explain stays unexplained instead of being guessed.</p></li>
    <li>${icon("replay", 22)}<h3>Replay it</h3><p>The failure is saved as a fixture: task, fault, seed, timings and the original diagnosis. Replay it on the next agent version and see whether the bug is gone.</p></li>
  </ol>
</div></section>
${endCta(user, "Open a run.", "The lab lives in the same app as the recorder.", { em: "Keep the failure." })}`;
  return layout({ siteUrl, path: "/lab", title: `${title} | ${NAME}`, description, body, head, user });
}

const SAFETY: [string, string, string][] = [
  ["You confirm the site", "Every recording asks you to say you own the site or may test it. That confirmation is part of the job, not a footnote.", "user"],
  ["The password stays in memory", "It is used for the sign-in and then dropped. Traces, captions and files on disk show a placeholder. The narration says a password was entered and does not read it out.", "key"],
  ["CAPTCHA and two-factor stop it", "The recorder does not try to solve a CAPTCHA, a bot check or a second-factor prompt. It stops and tells you.", "stop"],
  ["Read-only after sign-in", "It follows links with ordinary page loads. It does not submit forms. Sign-out, delete, cancel and unsubscribe links are skipped.", "eye"],
  ["Same site, paced, robots.txt", "It stays on the site you named, respects robots.txt, and does not hammer the server.", "globe"],
  ["Narration from the trace", "Lines come from pages opened, fields typed into, clicks and the site's responses. Intent is not invented.", "quote"],
];

/** The recording rules, written out past the six on the home page. */
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
<section class="page-head"><div class="wrap">
  ${crumb("Safety")}
  <h1>A careful visitor, <span class="dim">not a bot ${tile("shield", "pass")} let loose.</span></h1>
  <p class="lede">${esc(description)}</p>
  ${startForm("safety-url")}
</div></section>
<section class="sec"><div class="wrap">
  <div class="sec-head"><h2>The rules, <span class="dim">before you record.</span></h2>
  <p class="lede">Internal tools are recorded by running Walkcast on a machine that can already reach them. A publicly hosted recorder refuses private and local addresses.</p></div>
  <ul class="feats">${SAFETY.map(([t, d, ic]) => `<li>${icon(ic, 22)}<h3>${esc(t)}</h3><p>${esc(d)}</p></li>`).join("")}</ul>
</div></section>
${endCta(user, "Record a site you may test.", "The confirmation is required before a recording starts.", { em: "Then press record." })}`;
  return layout({ siteUrl, path: "/safety", title: `${title} | ${NAME}`, description, body, head, user });
}

/*
  Pricing, page-scoped styles. Two plans for where Walkcast runs (both $0), a billing toggle that
  only proves the point, and the whole thing itemised as a receipt.
*/
const PRICING_CSS = `
.pr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:56px auto 0;padding:10px;list-style:none;max-width:920px;border-radius:calc(var(--r-lg) + 10px);background:var(--panel-2);text-align:left}
.pr-grid>li{display:flex}
.pr-card{display:flex;flex-direction:column;width:100%;border-radius:var(--r-lg);background:var(--panel);box-shadow:inset 0 0 0 1px var(--line)}
.pr-card.hi{background:var(--paper);box-shadow:none}
.pr-top{padding:28px 28px 24px}
.pr-card h2{font-size:22px;letter-spacing:-.025em;display:flex;align-items:center;gap:10px}
.pr-for{margin:6px 0 0;font-size:15px;color:var(--muted)}
.pr-amt{display:flex;align-items:baseline;gap:8px;margin:26px 0 0}
.pr-amt strong{font:700 clamp(56px,6vw,72px)/.9 var(--sans);letter-spacing:-.05em;font-variant-numeric:tabular-nums}
.pr-amt>span{font:500 14.5px var(--sans);color:var(--muted)}
.pr-feats{list-style:none;margin:0;padding:22px 28px 26px;display:grid;align-content:start;gap:12px;font-size:15px;color:var(--ink-2);flex:1;border-top:1px solid var(--line)}
.pr-feats li{display:grid;grid-template-columns:20px 1fr;gap:10px;align-items:start}
.pr-feats li .ic{color:var(--pass);margin-top:2px}
.pr-tip{position:relative;cursor:help;border-bottom:1px dashed var(--line-strong);outline-offset:3px}
.pr-tip span{position:absolute;left:0;bottom:calc(100% + 9px);z-index:3;width:max-content;max-width:250px;padding:9px 11px;border-radius:10px;background:var(--solid);color:var(--on-solid);font:13px/1.45 var(--sans);opacity:0;transform:translateY(4px);pointer-events:none;transition:opacity .15s,transform .15s}
.pr-tip:hover span,.pr-tip:focus span{opacity:1;transform:none}
.pr-foot{padding:0 28px 28px}
.pr-foot .pill{width:100%}
.pr-aside{margin:28px auto 0;max-width:64ch;font-size:15px;color:var(--muted)}
.pr-aside a{color:var(--ink)}
.ticket{display:grid;grid-template-columns:minmax(0,1fr) 78px;background:var(--panel);border-radius:var(--r-lg);box-shadow:inset 0 0 0 1px var(--line);-webkit-mask:radial-gradient(circle 11px at calc(100% - 78px) 0,#0000 98%,#000) top/100% 51% no-repeat,radial-gradient(circle 11px at calc(100% - 78px) 100%,#0000 98%,#000) bottom/100% 51% no-repeat;mask:radial-gradient(circle 11px at calc(100% - 78px) 0,#0000 98%,#000) top/100% 51% no-repeat,radial-gradient(circle 11px at calc(100% - 78px) 100%,#0000 98%,#000) bottom/100% 51% no-repeat}
.ticket-body{padding:28px 30px}
.ticket-hd{display:flex;justify-content:space-between;gap:12px;font:500 12px var(--mono);color:var(--muted);padding-bottom:14px;border-bottom:1px dashed var(--line-strong)}
.ticket ul{list-style:none;margin:0;padding:10px 0 0}
.ticket li{display:flex;align-items:baseline;gap:10px;padding:9px 0;font:13.5px var(--mono);color:var(--ink-2)}
.ticket li::after{content:"";order:1;flex:1;border-bottom:1px dotted var(--line-strong);transform:translateY(-4px)}
.ticket li b{order:2;font-weight:500;color:var(--ink)}
.ticket-total{display:flex;justify-content:space-between;align-items:baseline;margin-top:12px;padding-top:16px;border-top:1px solid var(--ink);font:700 32px/1 var(--sans);letter-spacing:-.03em}
.ticket-total small{font:500 12px var(--mono);color:var(--muted)}
.ticket-stub{display:grid;place-items:center;border-left:2px dashed var(--line-strong);background:var(--signal-soft);border-radius:0 var(--r-lg) var(--r-lg) 0}
.ticket-stub span{writing-mode:vertical-rl;transform:rotate(180deg);font:600 14px var(--sans);letter-spacing:.01em;color:var(--signal)}
@media (max-width:820px){.pr-grid{grid-template-columns:1fr;max-width:520px}}
@media (max-width:480px){.ticket{grid-template-columns:minmax(0,1fr);-webkit-mask:none;mask:none}.ticket-body{padding:22px 18px}.ticket li{font-size:12.5px}.ticket-stub{display:none}.pr-top,.pr-feats,.pr-foot{padding-left:20px;padding-right:20px}}`;

type PricingFeature = string | { text: string; tip: string };

function pricingCard(o: { name: string; who: string; amount: string; per: boolean; feats: PricingFeature[]; cta: [string, string]; tone?: "hi"; badge?: string; icon: string }): string {
  const tick = icon("check", 17);
  const feats = o.feats
    .map((f) => (typeof f === "string" ? `<li>${tick}<span>${esc(f)}</span></li>` : `<li>${tick}<span><span class="pr-tip" tabindex="0">${esc(f.text)}<span role="tooltip">${esc(f.tip)}</span></span></span></li>`))
    .join("");
  return `<li><article class="pr-card${o.tone ? ` ${o.tone}` : ""}">
    <div class="pr-top">
      <h2>${icon(o.icon, 22)}${esc(o.name)}</h2>
      <p class="pr-for">${esc(o.who)}</p>
      <p class="pr-amt"><strong>${esc(o.amount)}</strong><span>${o.per ? "no subscription" : "not sold"}</span></p>
    </div>
    <ul class="pr-feats">${feats}</ul>
    <div class="pr-foot"><a class="pill big${o.tone === "hi" ? " solid" : ""}" href="${esc(o.cta[1])}">${esc(o.cta[0])}</a></div>
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

const PRICING_FAQ: [string, string][] = [
  ["Is Walkcast really free?", "Yes. The software is MIT licensed. There is no paid plan, seat price, or usage meter in it."],
  ["Do I pay for an account?", "No. An account on a server you run is free. It keeps your recordings with you. The price of the software stays zero."],
  ["Is there an enterprise tier?", "No. The same build records a public site and, on your own network, an internal tool. Nothing is held back for a higher plan."],
  ["What does running it cost me?", "The machine it runs on. A recording is a browser, a few minutes of CPU and the files it writes. Walkcast itself charges nothing."],
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
<section class="page-head" id="plans"><div class="wrap">
  ${crumb("Pricing")}
  <h1>One price. <span class="dim">It's ${tile("check", "pass", true)} zero.</span></h1>
  <p class="lede">Walkcast is MIT licensed. Run it on a laptop or on your team's server. Neither has seats, a usage meter or a plan to upgrade to.</p>
  <ul class="pr-grid">
    ${pricingCard({
      name: "On your laptop",
      who: "One person, one machine.",
      amount: "$0",
      per: true,
      icon: "laptop",
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
      icon: "server",
      feats: [
        "Everything on the laptop",
        "Accounts with Google or email",
        "Recordings kept on your server",
        { text: "Internal tools on your network", tip: "A publicly hosted copy refuses private and local addresses. On your own network you decide." },
        "No seat count. Add the whole team.",
      ],
      cta: start,
    })}
  </ul>
  <p class="pr-aside">There is no cloud subscription or enterprise tier in this repository. If you need a hosted plan, <a href="mailto:hello@walkcast.dev">contact us</a> or run Walkcast yourself under the <a href="https://opensource.org/licenses/MIT">MIT license</a>.</p>
</div></section>

<section class="sec"><div class="wrap split">
  <div class="sec-head">
    <h2>Every file, <span class="dim">itemised.</span></h2>
    <p class="lede">One walkthrough hands you all of this. The total doesn't change on the second one, or the hundredth.</p>
  </div>
  <div class="ticket" role="group" aria-label="What one walkthrough costs">
    <div class="ticket-body">
      <div class="ticket-hd"><span>Walkcast · one walkthrough</span><span>MIT licensed</span></div>
      <ul>${PRICING_TICKET.map(([k, v]) => `<li>${esc(k)}<b>${esc(v)}</b></li>`).join("")}</ul>
      <div class="ticket-total"><small>Total</small><span>$0.00</span></div>
    </div>
    <div class="ticket-stub" aria-hidden="true"><span>Free forever</span></div>
  </div>
</div></section>

<section class="sec" id="limits"><div class="wrap">
  <div class="sec-head"><h2>Limits, <span class="dim">not a paid tier.</span></h2><p class="lede">These are how a recording behaves. There is no plan that buys your way out of them.</p></div>
  <ul class="feats" style="--cols:4">
    <li>${icon("list", 22)}<h3>Up to 30 pages</h3><p>Same site, ordinary page loads, paced.</p></li>
    <li>${icon("stop", 22)}<h3>Stops at CAPTCHA and 2FA</h3><p>It never tries to get past them.</p></li>
    <li>${icon("eye", 22)}<h3>Read-only after sign-in</h3><p>No forms submitted. Sign-out and delete links skipped.</p></li>
    <li>${icon("lock", 22)}<h3>Private networks stay local</h3><p>A public copy refuses private and local addresses.</p></li>
  </ul>
</div></section>

<section class="sec" id="install"><div class="wrap">
  <div class="sec-head"><h2>What you install.</h2><p class="lede">Three things on the machine that runs it. Then paste the link.</p></div>
  <ol class="feats">
    <li><span class="mono" style="font-size:13px;color:var(--muted)">node --version ≥ 22</span><h3>Node.js 22</h3><p>Or anything newer. This is the recorder.</p></li>
    <li><span class="mono" style="font-size:13px;color:var(--muted)">npx playwright install chromium</span><h3>Chromium</h3><p>Playwright's browser. The one that signs in and walks the pages.</p></li>
    <li><span class="mono" style="font-size:13px;color:var(--muted)">ffmpeg -filters | grep flite</span><h3>ffmpeg with flite</h3><p>The spoken narration. Without it you still get the silent recording and the transcript.</p></li>
  </ol>
</div></section>

<section class="sec" id="pricing-faq"><div class="wrap faq-grid">
  <div><h2>Price questions.</h2><p class="lede">Short answers. The long one is the license.</p></div>
  ${faqList(PRICING_FAQ)}
</div></section>
${endCta(user, "Your site, walked and", "Create a free account with Google or email and record the first one.", { em: "narrated.", ghostHref: "/#demo", ghostLabel: "Watch the example" })}
`;
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
  return `# ${NAME}: public pages are open to every crawler - search, answer engines and AI training bots.\n# Only private app pages (/app, /api, /auth, /files, /start) are off limits.\n\n${bots.map((b) => `User-agent: ${b}\n${rules}`).join("\n")}\nUser-agent: CCBot\n${rules}\nUser-agent: *\n${rules}\nSitemap: ${siteUrl}/sitemap.xml\n`;
}

/**
 * 404. Real HTTP 404 (soft-404s are a ranking risk), `noindex` on both the meta robots tag and the
 * `X-Robots-Tag` header the server sends, and internal links back into the site so a visitor who
 * lands here keeps moving instead of bouncing.
 */
export function notFoundPage(siteUrl: string): string {
  const title = "Page not found";
  const links: [string, string, string][] = [
    ["/", "Home", "Paste a link, get a narrated walkthrough"],
    ["/how", "How it works", "Sign-in, 30 pages, the files you get back"],
    ["/guides", "Guides", "Walkthroughs by the job you need done"],
    ["/lab", "Lab", "Keep the test when a browser agent fails"],
    ["/pricing", "Pricing", "One price, and it is zero"],
  ];
  const body = `
<section class="page-head"><div class="wrap">
  <h1>This page <span class="dim">isn't ${tile("stop", "rec")} here.</span></h1>
  <p class="lede">The link may be old, or the page may have moved. Everything below still works.</p>
</div></section>
<section class="sec" style="padding-top:clamp(40px,5vw,64px)"><div class="wrap">
  <nav class="guide-list" aria-label="Where to go instead" style="margin-top:0">
    ${links.map(([href, label, note]) => `<a href="${href}"><h3>${esc(label)}</h3><p>${esc(note)}</p><span class="more">Go ${icon("arrow", 15)}</span></a>`).join("")}
  </nav>
</div></section>`;
  return layout({ siteUrl, path: "/404", title: `${title} · ${NAME}`, description: "That page is not here. Links to the Walkcast home page, guides and pricing.", body, noindex: true });
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
      <video:description>An unedited website video walkthrough recorded by ${NAME}: it opens the site, browses its pages and narrates each step.</video:description>
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
- [Example video](${siteUrl}/assets/demo.mp4): an unedited narrated walkthrough of a real-estate CRM (Estate360)
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

export const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26"><rect x=".5" y=".5" width="25" height="25" rx="7" fill="#874b00"/><path d="M10.2 8.4v9.2l7.2-4.6z" fill="#fff"/><circle cx="20.4" cy="5.6" r="2.6" fill="#c0321c" stroke="#ffffff" stroke-width="1.2"/></svg>`;

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
<section class="page-head"><div class="wrap">
  ${crumb("Compare")}
  <h1>${esc(NAME)} <span class="dim">vs ${esc(cfg.other)}.</span></h1>
  <p class="lede">${esc(cfg.intro)}</p>
</div></section>
<section class="sec" style="padding-top:clamp(40px,5vw,64px)"><div class="wrap">
  <div class="tablewrap" style="margin-top:0">
    <table class="compare">
      <caption>Walkcast next to ${esc(cfg.other)}, on the things people ask about</caption>
      <thead><tr><th scope="col">Capability</th><th scope="col">Walkcast</th><th scope="col">${esc(cfg.other)}</th></tr></thead>
      <tbody>${cfg.rows.map(([c, w, o]) => `<tr><th scope="row">${esc(c)}</th><td data-label="Walkcast">${esc(w)}</td><td data-label="${esc(cfg.other)}">${esc(o)}</td></tr>`).join("")}</tbody>
    </table>
  </div>
</div></section>
<section class="sec"><div class="wrap split top">
  <div class="panel"><h2 style="font-size:24px;letter-spacing:-.025em">Where Walkcast wins</h2><ul class="feats on-panel" style="--cols:1;margin-top:24px;gap:20px">${cfg.walkcastWins.map((w) => `<li>${icon("check", 20)}<p style="margin-top:10px;color:var(--ink-2)">${esc(w)}</p></li>`).join("")}</ul></div>
  <div class="panel"><h2 style="font-size:24px;letter-spacing:-.025em">Where ${esc(cfg.other)} wins</h2><ul class="feats on-panel" style="--cols:1;margin-top:24px;gap:20px">${cfg.otherWins.map((w) => `<li>${icon("check", 20)}<p style="margin-top:10px;color:var(--ink-2)">${esc(w)}</p></li>`).join("")}</ul></div>
</div></section>
<section class="sec" id="faq"><div class="wrap faq-grid">
  <div><h2>Questions.</h2></div>
  ${faqList(cfg.faq, { open: cfg.faq.length })}
</div></section>
${endCta(user, "Judge it", "Free and MIT licensed. Paste a link and record the first walkthrough.", { em: "on your own site.", ghostHref: "/pricing", ghostLabel: "Pricing (it's zero)" })}`;
  return layout({ siteUrl, path: `/compare/${cfg.slug}`, title, description, body, head, user });
}

export function compareSlugs(): string[] { return Object.keys(COMPARE_CONFIGS); }

export function assetPath(name: string): { path: string; type: string } | null {
  const fonts: Record<string, string> = {
    "fonts/schibsted-grotesk.woff2": "node_modules/@fontsource-variable/schibsted-grotesk/files/schibsted-grotesk-latin-wght-normal.woff2",
    "fonts/jetbrains-mono.woff2": "node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
  };
  const types: Record<string, string> = { ".mp4": "video/mp4", ".webm": "video/webm", ".vtt": "text/vtt; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2" };
  const rel = fonts[name] ? resolve(SITE_DIR, "..", fonts[name]) : /^[a-z0-9-]+\.(mp4|webm|vtt|jpg|png)$/.test(name) ? join(SITE_DIR, "static", name) : null;
  if (!rel || !existsSync(rel)) return null;
  return { path: rel, type: types[rel.slice(rel.lastIndexOf("."))] ?? "application/octet-stream" };
}
