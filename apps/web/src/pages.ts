import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CSS, MARK, NAME, esc, fontPath, icon } from "../../../packages/brand/src/index.ts";
import { formatInterval } from "../../../packages/core/src/lab/stats.ts";
import { siteFacts, type ExperimentFacts, type SiteFacts } from "./facts.ts";
import { GUIDES, GUIDES_UPDATED, type Guide } from "./guides.ts";

/**
 * The public site: static marketing pages (full content in the HTML, no client rendering needed,
 * so search engines and AI crawlers read everything) and the crawler files (robots.txt,
 * sitemap.xml, llms.txt). Every URL is absolute from siteUrl. There are no accounts here: the
 * product is the desktop app, and every call to action points at /download.
 */
const WEB_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** Repo root: the pages read the published experiment from results/ under here. */
const REPO_ROOT = resolve(WEB_DIR, "..", "..");
/** Where the desktop installers are published. */
export const RELEASES_URL = "https://github.com/KunjShah95/browser-user/releases/latest";
const TAGLINE = "Narrated video walkthroughs of any website, from a link";
const DESCRIPTION =
  "Paste your website's link and get a narrated video walkthrough: Walkcast signs in, browses your pages and returns an MP4 with a spoken voice-over, captions and a transcript. Free and open source.";

interface Demo {
  captions: { start: number; end: number; text: string }[];
  pages: { path: string; title: string; status: number | null }[];
  durationSeconds: number;
}

function demo(): Demo {
  const path = join(WEB_DIR, "static", "demo.json");
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

function jsonLd(value: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(value).replace(/</g, "\\u003c")}</script>`;
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
    <div class="foot-brand"><a class="brand" href="/" aria-label="${NAME} home">${MARK}<span>${NAME}</span></a><p>Narrated walkthroughs of any website, and regression tests for the agents that browse them.</p><a class="pill solid" href="/download">Download the app</a><span class="foot-meta">MIT licensed · desktop app for Windows, macOS and Linux</span></div>
    ${col("Product", [["/how", "How it works"], ["/lab", "Walkcast Lab"], ["/safety", "Safety"], ["/pricing", "Pricing"], ["/#faq", "FAQ"]])}
    ${col("Guides", GUIDES.slice(0, 6).map((g) => [`/guides/${g.slug}`, g.label] as [string, string]))}
    ${col("Compare", Object.values(COMPARE_CONFIGS).map((c) => [`/compare/${c.slug}`, `${NAME} vs ${c.other}`] as [string, string]))}
    ${col("Get it", [["/download", "Download"], ["https://github.com/KunjShah95/browser-user", "Source on GitHub"]])}
  </div>
  <div class="foot-base"><span>© ${new Date().getFullYear()} ${NAME} · <a href="https://opensource.org/licenses/MIT">MIT licensed</a></span><span>Every line narrated from what the browser did.</span></div>
</div><span class="wordmark" aria-hidden="true">walkcast</span></div></footer>`;
}

function layout(o: { siteUrl: string; path: string; title: string; description: string; body: string; head?: string; noindex?: boolean }): string {
  const url = `${o.siteUrl}${o.path}`;
  const here = (href: string) => (o.path === href || (href !== "/" && o.path.startsWith(`${href}/`)) ? ` aria-current="page"` : "");
  const end = `<a href="/download" class="pill"${here("/download")}>Download</a>`;
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
</head>
<body>
<a href="#main" class="skip">Skip to content</a>
<header class="top"><div class="wrap"><a class="brand" href="/" aria-label="${NAME} home">${MARK}<span>${NAME}</span></a><nav class="nav-main" aria-label="Main"><a href="/how"${here("/how")}>How it works</a><a href="/lab"${here("/lab")}>Lab</a><a href="/guides"${here("/guides")}>Guides</a><a href="/pricing"${here("/pricing")}>Pricing</a></nav><div class="nav-end">${end}</div></div></header>
<main id="main">${o.body}</main>
${footer()}
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

/** The primary call to action: recording happens in the desktop app, so every page points there. */
function downloadCta(label = "Download the app"): string {
  return `<div class="actions"><a class="pill rec big" href="/download">${esc(label)}</a><a class="pill ghost big" href="https://github.com/KunjShah95/browser-user">View the source</a></div>`;
}

function faqList(items: [string, string][], opts: { open?: number } = {}): string {
  const open = opts.open ?? 1;
  return `<div class="faq">${items
    .map(([q, a], i) => `<details${i < open ? " open" : ""}><summary><h3>${esc(q)}</h3><span class="tog">${icon("plus", 15)}</span></summary><p>${esc(a)}</p></details>`)
    .join("")}</div>`;
}

export function landingPage(siteUrl: string, facts: SiteFacts = siteFacts(REPO_ROOT)): string {
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
  ${downloadCta()}
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
  <p class="lede">Download the free desktop app and record the first one.</p>
  ${downloadCta()}
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
  return layout({ siteUrl, path: "/", title, description: DESCRIPTION, body, head: structured });
}

// --------------------------------------------------------------------------------- guides

function guideCard(g: Guide): string {
  return `<a href="/guides/${g.slug}"><h3>${esc(g.label)}</h3><p>${esc(g.description)}</p><span class="more">Read the guide ${icon("arrow", 15)}</span></a>`;
}

export function guidesIndexPage(siteUrl: string): string {
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
${endCta("Record one", "Paste your site's link. You get a narrated MP4, captions and a transcript in about two minutes.", { em: "now." })}`;
  return layout({ siteUrl, path: "/guides", title, description, body, head });
}

export function guidePage(siteUrl: string, g: Guide): string {
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
${endCta("Record one", "Paste your site's link. You get a narrated MP4, captions and a transcript in about two minutes.", { em: "now." })}`;
  return layout({ siteUrl, path: `/guides/${g.slug}`, title: g.title, description: g.description, body, head });
}

function breadcrumbs(siteUrl: string, trail: [string, string][]): unknown {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [["Home", "/"] as [string, string], ...trail].map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${siteUrl}${path}` })),
  };
}

function endCta(heading: string, text: string, opts?: { em?: string; ghostHref?: string; ghostLabel?: string }): string {
  const href = "/download";
  const label = "Download the app";
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
export function howPage(siteUrl: string): string {
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
  ${downloadCta()}
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
${endCta("Paste a link.", "About two minutes for a short site. The password is not written to disk.", { em: "Get the video.", ghostHref: "/#demo", ghostLabel: "Watch the example" })}`;
  return layout({ siteUrl, path: "/how", title: `${title} | ${NAME}`, description, body, head });
}

/** Walkcast Lab: the same recorder, used on browser-agent failures. */
export function labPage(siteUrl: string, facts: SiteFacts = siteFacts(REPO_ROOT)): string {
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
  <a class="pill solid big" href="/download">Download the app</a>
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
${endCta("Open a run.", "The lab lives in the same app as the recorder.", { em: "Keep the failure." })}`;
  return layout({ siteUrl, path: "/lab", title: `${title} | ${NAME}`, description, body, head });
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
export function safetyPage(siteUrl: string): string {
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
  ${downloadCta()}
</div></section>
<section class="sec"><div class="wrap">
  <div class="sec-head"><h2>The rules, <span class="dim">before you record.</span></h2>
  <p class="lede">Internal tools are recorded by running Walkcast on a machine that can already reach them. A publicly hosted recorder refuses private and local addresses.</p></div>
  <ul class="feats">${SAFETY.map(([t, d, ic]) => `<li>${icon(ic, 22)}<h3>${esc(t)}</h3><p>${esc(d)}</p></li>`).join("")}</ul>
</div></section>
${endCta("Record a site you may test.", "The confirmation is required before a recording starts.", { em: "Then press record." })}`;
  return layout({ siteUrl, path: "/safety", title: `${title} | ${NAME}`, description, body, head });
}

const PLATFORMS: [string, string, string][] = [
  ["Windows", "The .msi or .exe installer. Windows 10 or 11, 64-bit.", "laptop"],
  ["macOS", "The .dmg. Apple silicon and Intel.", "laptop"],
  ["Linux", "The .AppImage, .deb or .rpm.", "server"],
];

const INSTALL_FROM_SOURCE = `git clone https://github.com/KunjShah95/browser-user.git walkcast
cd walkcast
npm install
npm run desktop:dev`;

/** The one place every call to action on the site leads: the desktop installers. */
export function downloadPage(siteUrl: string): string {
  const title = "Download Walkcast";
  const description = "Walkcast is a free desktop app for Windows, macOS and Linux. Recordings, the browser and your passwords stay on your machine.";
  const head = jsonLd({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "@id": `${siteUrl}/download#app`,
        name: NAME,
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Windows, macOS, Linux",
        downloadUrl: RELEASES_URL,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        license: "https://opensource.org/licenses/MIT",
      },
      breadcrumbs(siteUrl, [["Download", "/download"]]),
    ],
  });
  const body = `
<section class="page-head"><div class="wrap">
  ${crumb("Download")}
  <h1>Get the app. <span class="dim">Record on ${tile("laptop", "ink")} your machine.</span></h1>
  <p class="lede">${esc(description)}</p>
  <div class="actions"><a class="pill rec big" href="${RELEASES_URL}">Download the latest release</a><a class="pill ghost big" href="https://github.com/KunjShah95/browser-user">View the source</a></div>
</div></section>
<section class="sec"><div class="wrap">
  <div class="sec-head"><h2>Pick your system. <span class="dim">Every installer is on the release page.</span></h2></div>
  <ul class="feats">${PLATFORMS.map(([t, d, ic]) => `<li>${icon(ic, 22)}<h3>${esc(t)}</h3><p>${esc(d)}</p></li>`).join("")}</ul>
</div></section>
<section class="sec"><div class="wrap">
  <div class="sec-head"><h2>Or run it from source.</h2><p class="lede">Needs Node.js 22, Rust for the desktop shell, and ffmpeg for narration audio.</p></div>
  <pre class="code"><code>${esc(INSTALL_FROM_SOURCE)}</code></pre>
</div></section>`;
  return layout({ siteUrl, path: "/download", title: `${title} | ${NAME}`, description, body, head });
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
export function pricingPage(siteUrl: string): string {
  const title = "Walkcast Pricing";
  const description = "Walkcast is free. MIT licensed, with no paid tier, seat limit or usage meter. You run it on your own machine.";
  const start: [string, string] = ["Download the app", "/download"];
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
${endCta("Your site, walked and", "Download the free desktop app and record the first one.", { em: "narrated.", ghostHref: "/#demo", ghostLabel: "Watch the example" })}
`;
  return layout({ siteUrl, path: "/pricing", title: `${title} | ${NAME}`, description, body, head });
}

// --------------------------------------------------------------------------------- crawler files

/** Search engines and AI assistants are welcome on every page: the site is public documents only. */
export function robotsTxt(siteUrl: string): string {
  const bots = [
    "Googlebot", "Bingbot", "DuckDuckBot", "Applebot", "Applebot-Extended", "Google-Extended", "GoogleOther", "GPTBot", "OAI-SearchBot", "ChatGPT-User",
    "ClaudeBot", "Claude-User", "Claude-SearchBot", "anthropic-ai", "PerplexityBot", "Perplexity-User", "Amazonbot", "meta-externalagent", "DuckAssistBot", "MistralAI-User", "YouBot",
  ];
  const rules = "Allow: /\n";
  return `# ${NAME}: every page is open to every crawler - search, answer engines and AI training bots.\n# The app itself is a desktop download; nothing on this site is private.\n\n${bots.map((b) => `User-agent: ${b}\n${rules}`).join("\n")}\nUser-agent: CCBot\n${rules}\nUser-agent: *\n${rules}\nSitemap: ${siteUrl}/sitemap.xml\n`;
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
  <url><loc>${siteUrl}/download</loc><lastmod>${GUIDES_UPDATED}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>
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
- [Download](${siteUrl}/download): the desktop app for Windows, macOS and Linux
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

export function comparePage(siteUrl: string, slug: string): string | null {
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
${endCta("Judge it", "Free and MIT licensed. Paste a link and record the first walkthrough.", { em: "on your own site.", ghostHref: "/pricing", ghostLabel: "Pricing (it's zero)" })}`;
  return layout({ siteUrl, path: `/compare/${cfg.slug}`, title, description, body, head });
}

export function compareSlugs(): string[] { return Object.keys(COMPARE_CONFIGS); }

/** Static files under /assets/: the demo media, the social image and the self-hosted fonts. */
export function assetPath(name: string): { path: string; type: string } | null {
  const types: Record<string, string> = { ".mp4": "video/mp4", ".webm": "video/webm", ".vtt": "text/vtt; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2" };
  const rel = fontPath(name) ?? (/^[a-z0-9-]+\.(mp4|webm|vtt|jpg|png)$/.test(name) ? join(WEB_DIR, "static", name) : null);
  if (!rel || !existsSync(rel)) return null;
  return { path: rel, type: types[rel.slice(rel.lastIndexOf("."))] ?? "application/octet-stream" };
}
