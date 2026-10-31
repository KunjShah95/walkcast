/**
 * Words the page and the crawler files share: the FAQ is rendered on the page and emitted as
 * FAQPage JSON-LD and in llms.txt, so every answer a search or answer engine quotes is visible on
 * the page too.
 */

export const NAME = "Walkcast";
/** The canonical origin. SITE_URL overrides it for a one-off build (tests, staging). */
export const SITE_ORIGIN = "https://walkcast.kunjshah.in";
/** Who builds it: named on every page and in the JSON-LD, so engines can attribute the answers. */
export const AUTHOR = { name: "Kunj Shah", url: "https://github.com/KunjShah95" };
/** When the page copy last changed in substance (dateModified, sitemap lastmod). */
export const UPDATED = "2026-10-22";

/** Every prerendered page: the landing page plus the documents engines can cite on their own. */
export interface Route {
  path: string;
  title: string;
  description: string;
  /** Breadcrumb label. */
  label: string;
  /** What kind of page this is. Drives the JSON-LD node type and the crawler files. */
  kind?: "landing" | "index" | "guide" | "compare" | "lab" | "faq" | "download" | "privacy" | "pricing";
  /** Questions answered on the page. Emitted as FAQPage schema and copied into llms.txt. */
  faq?: [string, string][];
  /** The section that answers the page's question in one paragraph, for `speakable`. */
  answerSelector?: string;
}export const ROUTES: Route[] = [
  {
    path: "/",
    label: "Home",
    kind: "landing",
    title: "Walkcast · Paste a link, get a video tour of your website",
    description:
      "A real browser signs in, clicks through your pages and records the whole visit. You get an MP4 with captions and a transcript. Free for Windows and Linux.",
    answerSelector: "#what .lede",
  },
  {
    path: "/guides",
    label: "Guides",
    kind: "index",
    title: "Walkcast guides: product demo videos, tutorials, agent tests",
    description:
      "Step-by-step guides: make a product demo video from your live site, record a website tutorial without a screen recorder, and test browser AI agents.",
    faq: [
      [
        "What do the Walkcast guides cover?",
        "They cover three jobs: turning a live website into a product demo video, turning a site into a narrated tutorial video without recording your screen, and turning a failed browser AI agent run into a regression test you can replay.",
      ],
      [
        "Do the guides need the Walkcast app?",
        "Most of them do. Walkcast is a free desktop app for Windows and Linux, and every guide ends with the same short path: paste a link, press Record, get an MP4 with captions and a transcript.",
      ],
    ],
  },
  {
    path: "/guides/narrated-website-walkthrough",
    label: "How to make a narrated website walkthrough",
    kind: "guide",
    title: "How to make a narrated website walkthrough (free) · Walkcast",
    description:
      "Step by step: turn a website link into a narrated MP4 with captions and a transcript, even behind a login. No microphone or screen recorder needed.",
  },
  {
    path: "/guides/product-demo-video",
    label: "How to make a product demo video",
    kind: "guide",
    title: "How to make a product demo video of your live app · Walkcast",
    description:
      "Make a product demo video from the real product: paste your app URL, get an MP4 with narration, captions and a transcript. You never record anything yourself.",
  },
  {
    path: "/guides/website-tutorial-video",
    label: "How to make a website tutorial video",
    kind: "guide",
    title: "How to make a website tutorial video · Walkcast",
    description:
      "Record a website tutorial video from the live site: narrated, captioned, and re-recordable after every change. Windows and Linux, free.",
  },
  {
    path: "/compare/screen-recording",
    label: "Walkcast vs screen recording",
    kind: "compare",
    title: "Walkcast vs screen recording (Loom, OBS) · Walkcast",
    description:
      "When a generated, narrated walkthrough beats recording your screen, and when it does not. A fair comparison of effort, consistency, captions, privacy and cost.",
  },
  {
    path: "/compare/loom",
    label: "Loom alternative",
    kind: "compare",
    title: "Loom alternative: a free video maker for Windows · Walkcast",
    description:
      "A free Loom alternative that records your website instead of your screen. Windows and Linux, nothing per seat, and you can re-record after each release.",
  },
  {
    path: "/compare/screen-studio",
    label: "Screen Studio alternative",
    kind: "compare",
    title: "Screen Studio alternative for Windows and Linux · Walkcast",
    description:
      "A Screen Studio alternative for Windows and Linux: compare price, platforms and what each tool actually records, fairly and with sources.",
  },
  {
    path: "/compare/scribe",
    label: "Scribe alternative",
    kind: "compare",
    title: "Scribe alternative: video instead of screenshots · Walkcast",
    description:
      "A Scribe alternative that outputs narrated video instead of screenshots. It is free and open source, runs on your own machine, and records pages behind a login.",
  },
  {
    path: "/lab",
    label: "Walkcast Lab",
    kind: "lab",
    title: "Walkcast Lab: browser agent tests from real failures",
    description:
      "Walkcast Lab turns a failed browser AI agent run into a cause, cited evidence and a replayable regression fixture you can rerun.",
  },
  {
    path: "/faq",
    label: "FAQ",
    kind: "faq",
    title: "Walkcast FAQ: logins, passwords, voices, files · Walkcast",
    description:
      "Answers about Walkcast: which PCs it runs on, recording pages behind a login, what happens to your password, CAPTCHAs, voices, output files and price.",
  },
  {
    path: "/pricing",
    label: "Pricing",
    kind: "pricing",
    title: "Walkcast pricing: free, MIT licensed, no seats · Walkcast",
    description:
      "Walkcast is free and MIT licensed: no paid tier and no per-seat pricing. The only cost is the recording itself.",
  },
  {
    path: "/download",
    label: "Download",
    kind: "download",
    title: "Download Walkcast for Windows and Linux · Walkcast",
    description:
      "Download Walkcast free: Windows .exe (no admin rights) or .msi, Linux AppImage or .deb. Requirements and first-run notes.",
  },
  {
    path: "/privacy",
    label: "Privacy",
    kind: "privacy",
    title: "Walkcast privacy: what stays on your PC · Walkcast",
    description:
      "Walkcast runs on your own PC. Recordings, the browser and your passwords stay there; the app has no analytics. Exactly which network requests it makes, and why.",
  },
];

/**
 * The pages whose opening paragraph is the answer to the page's question. That paragraph is
 * what a voice assistant reads out, so the schema names it as speakable.
 */
export const ANSWER_PAGES = new Set([
  "/guides",
  "/guides/narrated-website-walkthrough",
  "/guides/product-demo-video",
  "/guides/website-tutorial-video",
  "/compare/screen-recording",
  "/compare/loom",
  "/compare/screen-studio",
  "/compare/scribe",
  "/lab",
  "/pricing",
  "/privacy",
]);

/** The guides, in the order the index lists them. */
export const GUIDES: { path: string; label: string; blurb: string; minutes: string }[] = [
  {
    path: "/guides/product-demo-video",
    label: "How to make a product demo video",
    blurb: "Turn your live app into a demo video with narration, captions and a transcript. Re-record it after every release instead of re-filming it.",
    minutes: "5 min",
  },
  {
    path: "/guides/website-tutorial-video",
    label: "How to make a website tutorial video",
    blurb: "Teach a flow that only exists behind a login: a guided tour of the real pages, captioned, narrated and safe to share.",
    minutes: "5 min",
  },
  {
    path: "/guides/narrated-website-walkthrough",
    label: "How to make a narrated website walkthrough",
    blurb: "The full walkthrough: what you need, the four steps, the files you get, and how to embed it with captions.",
    minutes: "6 min",
  },
];

/**
 * The questions each comparison page answers. Kept beside the page so the FAQ in the page,
 * the FAQPage schema and llms.txt never drift apart.
 */
export const COMPARE_FAQ: Record<string, [string, string][]> = {
  "/compare/loom": [
    [
      "Is Walkcast really a free Loom alternative?",
      "Yes. Walkcast is MIT licensed and costs nothing, with no seat limit and no watermark. Loom's free Starter plan allows 25 videos of up to five minutes and does not let you download them; paid seats start at $18 per user per month.",
    ],
    [
      "Does Walkcast record my screen like Loom does?",
      "No. Loom films your screen while you drive it, so you need a camera, a microphone and an edit afterwards. Walkcast drives its own browser and films your website, so there is nothing to perform and nothing to cut.",
    ],
    [
      "Can Walkcast record pages behind a login?",
      "Yes. Give it a test account's username and password and it signs in, including two-step email-then-password forms, then records the pages only a signed-in visitor can see. The password is held in memory for the run and never written to disk.",
    ],
    [
      "Which runs on Windows and Linux?",
      "Both do. Walkcast is a desktop app for Windows 10 or 11 (64-bit) and 64-bit Linux through an AppImage or a .deb package.",
    ],
    [
      "Is Walkcast open source?",
      "Yes. The whole app is MIT licensed and the source is on GitHub, so you can check what it does with your password and your site.",
    ],
  ],
  "/compare/screen-studio": [
    [
      "What is the best Screen Studio alternative for Windows?",
      "Screen Studio only runs on macOS, so Windows and Linux users have no equivalent from its maker. Walkcast runs on both and records your website rather than your screen; OBS Studio is the better choice if you want free manual screen recording with full control.",
    ],
    [
      "How much does Screen Studio cost?",
      "Screen Studio is $29 per month, or $108 for the year ($9 per month billed yearly). New customers get a trial only, and the one-time licence is no longer sold. Figures checked on 20 October 2026.",
    ],
    [
      "Does Walkcast have automatic zoom like Screen Studio?",
      "Partly. Walkcast zooms the video in on each click and fill, eases back out, and draws a pointer that moves to the control. It does not smooth a screen cursor or frame the shot in 3D the way Screen Studio does. There is no screen cursor to smooth: the pointer is drawn from the browser's action log.",
    ],
    [
      "Can Walkcast record a desktop app?",
      "No. Walkcast records websites and web apps in its own browser. If you need to record a desktop application, a game or several apps at once, use a screen recorder instead.",
    ],
    [
      "Is Walkcast free?",
      "Yes, and it is MIT licensed, so there is no seat cost and no watermark. Screen Studio charges per year from the first month of use.",
    ],
  ],
  "/compare/scribe": [
    [
      "What is the best Scribe alternative?",
      "It depends on the output you need. Scribe produces an annotated screenshot guide you can edit, brand and share. Walkcast records the flow as a narrated video and also renders the same visit as a step-by-step guide, with a picture of each page and each click. If you need to edit every screenshot, translate steps and run approvals, Scribe is built for that. If you want the video and the written steps from one recording, Walkcast is.",
    ],
    [
      "Does Scribe produce video?",
      "No. Scribe produces step-by-step guides made of annotated screenshots; the output is a guide, not a narrated video. Walkcast records the flow as video and can also render the same visit as a written guide, so both come from one run.",
    ],
    [
      "How much does Scribe cost?",
      "Scribe has a free Basic tier. Pro Personal is $23 per user per month and the Team plan is $59 a month for five users, then $12 per additional user. Figures checked on 20 October 2026.",
    ],
    [
      "Can a Scribe alternative record pages behind a login?",
      "Walkcast can. It signs in with a test account you provide and records the pages behind the login, including two-step email-then-password forms, then scrubs the password from the trace and the files.",
    ],
    [
      "Is Walkcast open source and self-hosted?",
      "Yes. Walkcast is MIT licensed, runs entirely on your own machine and needs no account to record a site. The app uploads nothing. A share link, if you publish one, is served by the server you run.",
    ],
  ],
};

/** Questions answered on /faq beyond the landing page's list. */
export const MORE_FAQ: [string, string][] = [
  [
    "What files does a recording produce?",
    "An MP4 (H.264 video with an embedded caption track), the raw WebM, WebVTT captions, a transcript, and a list of every page visited with its HTTP status. The same visit also reads as a step-by-step guide (HTML or Markdown) with a picture of each page and each click. With a voice key you also get the narration in the MP4, a narrated WebM and the narration as a WAV file. The same visit also opens as a step-by-step guide, with a picture of each page and each click, and Studio can re-frame the MP4 as a 9:16 or 1:1 video with the captions burned in.",
  ],
  [
    "How long does a recording take?",
    "Usually a minute or two. A six-page site records and encodes in under a minute on an ordinary laptop; it scales with the number of pages, up to 30.",
  ],
  [
    "Does it add a voice-over?",
    "You choose before your first recording: a natural voice with your own ElevenLabs or OpenAI key, a basic offline voice that works with no key, or no voice at all. Change it any time in Settings, or replace the voice with your own recording in Studio. Nothing is sent to a speech service unless you add a key.",
  ],
  [
    "Can I edit the narration?",
    "Yes. In the app's Studio you can rewrite any line of the script and re-narrate the video, or replace the voice with your own recording.",
  ],
  [
    "Does Walkcast upload my recordings?",
    "Not by the app. Each recording is written to the app's own folder on your PC and is not sent to any third party. The one thing that puts a recording behind a URL is a share link, and that link is served by the server you run. You can stop it whenever you like.",
  ],
  [
    "Can it record internal tools or a local development site?",
    "Yes. Because it runs on your PC, it can record any site that PC can reach, including localhost and company intranets, as long as you may test it.",
  ],
];
export const TAGLINE = "Paste a link, get a video tour of your website";
export const DESCRIPTION =
  "Paste a link and get a video tour of your website. A real browser signs in, clicks through your pages like a first-time user and hands back the whole visit as an MP4 with captions and a transcript. Free desktop app for Windows and Linux.";
export const DEFINITION =
  "Walkcast is a free, open-source desktop app (Windows and Linux) that makes a video tour of your website from one link. A real browser signs in, visits up to 30 pages the way a first-time user would (8 by default) and returns the complete recording as an MP4 with WebVTT captions and a transcript. A voice-over is included when you add a voice key. Every caption comes from what the browser actually did.";

/**
 * The plainest true sentence about the product, for the visitor who has no idea what this is.
 * Every other page writes around this; this one says it outright.
 */
export const PLAIN =
  "Walkcast opens your website in a real browser, signs in, clicks through your pages and records the whole visit as a video file you can share.";

/** The three steps of a recording, said without metaphors. */
export const STEPS: [string, string][] = [
  ["Paste a link", "Give it the address of a site you own or may test, and the sign-in details if the site needs one."],
  [
    "It signs in and walks the site",
    "A real Chromium browser opens the page, signs in like a first-time user, and visits up to 30 pages, scrolling each one. It never submits a form.",
  ],
  [
    "You get the files",
    "An MP4 of the whole visit, WebVTT captions, a transcript and the page list with HTTP status. A voice-over too, if you asked for one.",
  ],
];

/** What a recording is not: the three confusions a first-time visitor actually has. */
export const NOT: [string, string][] = [
  [
    "Not a screen recorder",
    "A screen recorder films your screen while you drive it. Walkcast drives its own browser, so there is nothing to perform.",
  ],
  ["Not a mockup generator", "Every frame is your live site loaded in a real browser, with the content your visitors actually see."],
  [
    "Not a video editor",
    "It records one continuous visit and hands it over as it is. There is no timeline to work in.",
  ],
];

export const FAQ: [string, string][] = [
  ["What is Walkcast?", DEFINITION],
  [
    "Is Walkcast a screen recorder?",
    "No. A screen recorder films what happens on your screen while you drive it. Walkcast drives its own browser: it opens your site, signs in and clicks through your pages on its own. One button starts it, and the finished visit is on disk when it ends.",
  ],
  [
    "What is Walkcast Lab?",
    "The same recorder, used by teams that build browser AI agents. A failed agent run becomes a classified, reproducible regression test: you get the cause, the evidence it points at, and a fixture you can replay against the next agent version. It lives in the same app, under Lab in the sidebar.",
  ],
  [
    "Which computers does Walkcast run on?",
    "Windows 10 or 11 (64-bit), or most 64-bit Linux distributions (AppImage or .deb). It is a desktop app because it runs a real browser on your computer; it does not run on phones.",
  ],
  [
    "How do I make a narrated video walkthrough of my website?",
    "Install Walkcast, paste the site's link, add the username and password you normally sign in with, confirm you may test the site, and press Record. You get an MP4 of the whole visit with a WebVTT caption file and a transcript, plus a voice-over if you added a voice key.",
  ],
  [
    "Can it record pages behind a login?",
    "Yes. It finds the sign-in form, including two-step email-then-password forms, signs in with the credentials you give it, and then records the pages you only see when signed in.",
  ],
  [
    "Is my password stored?",
    "No. It is held in memory for the recording only. Traces, captions and files on disk show a placeholder, and the narration never reads it out.",
  ],
  [
    "Will it change anything on my site?",
    "After signing in it only follows links on the same site with ordinary page loads. It submits no forms, skips sign-out, delete, cancel and unsubscribe links, and respects robots.txt.",
  ],
  [
    "What happens with CAPTCHAs or two-factor?",
    "The recorder stops and tells you. It never tries to get past a CAPTCHA, bot check or second-factor prompt.",
  ],
  [
    "Does the narration make things up?",
    "No. Every line is written from what the browser actually did: which page it opened, which field it typed into, what it clicked and what the site answered.",
  ],
  [
    "Can Walkcast record my site on a schedule?",
    "Yes. In Schedules, give it a URL and a cadence — every hour, every morning at nine, or a five-field cron expression. Each run is a normal recording in the Library, so the what-changed panel can line it up against an earlier visit. The app, or the server it runs on, has to be open.",
  ],
  [
    "Can it tell another tool when a recording finishes?",
    "Yes. Add a webhook URL under Webhooks and the server posts a job.completed event when a walkthrough or Lab run reaches a final state. Deliveries are retried, the app keeps a log of every attempt, and setting LAB_WEBHOOK_SECRET adds an HMAC-SHA256 signature the receiver can check.",
  ],
  ["Is Walkcast free?", "Yes. It is MIT licensed with no paid tier, and it runs on your own PC."],
];

/* ------------------------------------------------------------------ comparisons */

/** yes = does it, no = does not, some = partly or at a cost. */
export type Verdict = "yes" | "no" | "some";
/** question, Walkcast, them, the note beside it. */
export type CompareRow = [string, Verdict, Verdict, string];
export interface Compare {
  path: string;
  /** The competitor's name, as people search for it. */
  them: string;
  /** Their own site, for the price link and the fair-comparison source. */
  themUrl: string;
  /** One plain sentence on what they cost, with the date it was checked. */
  price: string;
  priceChecked: string;
  /** What the competitor is genuinely good at. Written to be true, not to flatter us. */
  theyAreGoodAt: string[];
  /** When to pick them instead. */
  chooseThem: string[];
  /** When to pick Walkcast instead. */
  chooseUs: string[];
  /** The table that carries the comparison. */
  rows: CompareRow[];
  /** Facts with a source, for engines and readers who want to check them. */
  facts: [string, string][];
}

export const COMPARES: Compare[] = [
  {
    path: "/compare/loom",
    them: "Loom",
    themUrl: "https://www.loom.com/pricing",
    price: "Loom's free Starter plan allows 25 videos of up to five minutes with no downloads; paid seats start at $18 per user per month.",
    priceChecked: "20 October 2026",
    theyAreGoodAt: [
      "Recording your screen and your face quickly, in the browser, with nothing to install.",
      "Async video messaging: comments, reactions and a share link that plays in the browser.",
      "Recording a meeting straight from Zoom or Meet without a separate recorder.",
    ],
    chooseThem: [
      "The value is your own commentary. Loom is built for a person explaining something out loud, and that is something a website recorder cannot do.",
      "You want to film a desktop app, a game, or several windows at once.",
      "You want to record a meeting and share it as a link people can comment on.",
      "You want your video to live on someone else's hosting and be playable in a browser without a file.",
    ],
    chooseUs: [
      "You want a tour of a website that is identical every time you re-record it, so you can refresh it after each release.",
      "The pages you need to show are behind a login and you would rather not screen-share your whole desktop to show them.",
      "You want captions and a transcript without hand-writing them.",
      "You are on Windows or Linux, or you want a tool with no seat cost.",
    ],
    rows: [
      ["Price", "yes", "some", "Walkcast is free and MIT licensed with no seats. Loom's paid plans start at $18 per user per month."],
      ["Needs a camera and microphone", "no", "yes", "Walkcast writes the narration and reads it aloud. Loom films you talking."],
      ["Needs editing afterwards", "no", "some", "Loom's paid tiers add trimming and stitching; the free tier does not."],
      ["Same result every time you re-record", "yes", "no", "Re-run after a redesign and the tour is the same again."],
      ["Records pages behind a login", "yes", "yes", "Walkcast signs in with a test account and never submits a form."],
      ["Shows your desktop, other tabs or notifications", "no", "yes", "Walkcast records only its own browser window."],
      ["Captions and a transcript", "yes", "yes", "Loom transcribes on the cloud; Walkcast writes WebVTT captions timed to the voice."],
      ["Runs on Windows and Linux", "yes", "yes", "Loom works in the browser and on desktop; Walkcast is a desktop app for both."],
      ["Files stay on your machine", "yes", "no", "Loom hosts your videos. Walkcast writes them to your own folder, and the app uploads nothing."],
      ["Hosting and sharing links", "some", "yes", "Walkcast makes a share link that plays in a browser and expires on the day you name, served by the server you run. Loom hosts the video for you and adds comments and reactions."],
      ["A written step-by-step guide", "yes", "no", "Walkcast turns the same visit into numbered steps with a picture per click. Loom gives you the video and its transcript."],
    ],
    facts: [
      ["Loom Starter is free with 25 videos of up to five minutes each, up to 720p, and no downloads.", "https://support.atlassian.com/loom/docs/available-loom-plans"],
      ["Loom Business is $18 per user per month and Business + AI is $24 per user per month.", "https://www.loom.com/pricing"],
      ["Walkcast is MIT licensed, with no paid tier and no seat limit.", "https://github.com/KunjShah95/walkcast"],
    ],
  },
  {
    path: "/compare/screen-studio",
    them: "Screen Studio",
    themUrl: "https://screen.studio/pricing",
    price: "Screen Studio is $29 per month, or $108 for the year ($9 per month billed yearly). There is no free plan for new customers.",
    priceChecked: "20 October 2026",
    theyAreGoodAt: [
      "Beautiful screencasts: automatic zoom on clicks, smoothed cursor movement and framed backgrounds with almost no effort.",
      "A real editing environment with titles, on-screen text, motion presets and 3D mockups.",
      "Exporting up to 4K at 60 fps, in 16:9, 1:1 or 9:16.",
    ],
    chooseThem: [
      "You make polished marketing screencasts and the polish is the point. Screen Studio's cursor smoothing, 3D framing and full timeline editor are not things Walkcast attempts.",
      "You record a desktop application rather than a website.",
      "You are on a Mac, you already pay for the subscription, and you want an editor with a timeline.",
    ],
    chooseUs: [
      "You are on Windows or Linux. Screen Studio ships for macOS only.",
      "You want to show a flow inside your website, including pages behind a login, without screen-sharing your whole desktop.",
      "You want the clicks to land without hand-editing: Walkcast zooms in on each control as it is used.",
      "You want a 9:16 or 1:1 cut for a feed from the same take, with the captions already burned in.",
      "You want the same tour after every release without re-performing it on camera.",
      "You would rather not pay a subscription for a recording tool.",
    ],
    rows: [
      ["Windows", "yes", "no", "Screen Studio is macOS only, so Windows and Linux users have no equivalent from its maker."],
      ["Linux", "yes", "no", "Walkcast ships an AppImage and a .deb."],
      ["Price", "yes", "no", "Walkcast is free and MIT licensed. Screen Studio has no free plan for new customers."],
      ["Automatic zoom on clicks", "some", "yes", "Walkcast zooms in on each click and fill from the browser's own action log. Screen Studio's zoom is editable and paired with cursor smoothing and 3D framing."],
      ["Smoothed cursor and 3D framing", "no", "yes", "Walkcast draws a pointer that moves to each control; it does not smooth a recorded cursor or frame the shot in 3D."],
      ["Records a website, not your screen", "yes", "no", "Walkcast drives its own browser and films your site."],
      ["Records pages behind a login", "yes", "no", "Walkcast signs in with a test account you provide."],
      ["Narration written for you", "yes", "no", "Walkcast writes the narration from the browser's own trace and reads it aloud."],
      ["A written step-by-step guide", "yes", "no", "Walkcast turns the same visit into numbered steps with a picture per action. Screen Studio exports video only."],
      ["Vertical and square exports (9:16, 1:1)", "yes", "yes", "Walkcast re-frames the finished MP4 for a feed with the captions burned in. Screen Studio exports all three shapes at up to 4K and 60 fps."],
      ["Timeline editor", "no", "yes", "Walkcast records one continuous visit and does not cut or splice."],
      ["Files stay on your machine", "yes", "no", "Walkcast writes a recording to your folder. The app uploads nothing."],
    ],
    facts: [
      ["Screen Studio is $29 per month or $108 per year, with no free plan and no one-time licence for new buyers.", "https://screen.studio/pricing"],
      ["Screen Studio requires macOS 13.1 or later; there is no Windows build.", "https://screen.studio/download"],
      ["Walkcast runs on Windows 10 or 11 (64-bit) and 64-bit Linux.", "https://github.com/KunjShah95/walkcast"],
    ],
  },
  {
    path: "/compare/scribe",
    them: "Scribe",
    themUrl: "https://scribe.com/pricing",
    price: "Scribe has a free Basic tier; Pro Personal is $23 per user per month and Team is $59 a month for five users, then $12 per additional user.",
    priceChecked: "20 October 2026",
    theyAreGoodAt: [
      "Turning a process into a step-by-step guide of annotated screenshots, straight from a browser extension.",
      "Editing steps, retaking them, adding company branding and translating a guide.",
      "Writing guides for internal tools your team already uses, with review and approval workflows.",
    ],
    chooseThem: [
      "You want written documentation made of annotated screenshots you can edit, brand and translate. Walkcast's guide is generated from the recording and has no editor or approval workflow.",
      "Your readers need to skim a page and scan a step, not watch a video.",
      "You want guide approval, SSO or redaction workflows for a whole company.",
    ],
    chooseUs: [
      "You need a video, and you would rather not capture the same flow a second time to get written steps.",
      "Your flow lives behind a login and you do not want to screen-share your desktop to show it.",
      "You want one artefact that plays in a browser, in a sales deck, or on a help centre page, with captions for people who cannot play audio.",
      "You want it free and open source, running on your own machine.",
    ],
    rows: [
      ["Output", "yes", "no", "Walkcast produces an MP4 with captions, a transcript and a step-by-step guide from the same visit. Scribe produces an annotated screenshot guide."],
      ["Video and written guide from one visit", "yes", "no", "Scribe is a guide tool: there is no video of the flow. Walkcast returns both."],
      ["Narration", "yes", "no", "Walkcast writes and reads the narration from what the browser actually did."],
      ["Captions and transcript", "yes", "no", "WebVTT captions and a plain-text transcript come with every recording."],
      ["Records pages behind a login", "yes", "some", "Walkcast signs in with a test account you give it and never submits a form."],
      ["Annotated step screenshots", "some", "yes", "Walkcast's guide has one picture per click and fill, taken from the recording, with the control ringed. Scribe's screenshots are annotated, editable and retakeable."],
      ["Browser extension capture", "no", "yes", "Scribe captures from your Chrome or Edge session; Walkcast drives its own browser."],
      ["Guide translation", "no", "yes", "Available on some Scribe Enterprise plans."],
      ["Approval workflow and SSO", "no", "yes", "Scribe Enterprise has them; Walkcast is a desktop app with no accounts at all."],
      ["Price", "yes", "some", "Walkcast is free and MIT licensed. Scribe's paid plans start at $23 per user per month."],
      ["Files stay on your machine", "yes", "no", "Walkcast writes to your folder. The app uploads nothing."],
    ],
    facts: [
      ["Scribe's Basic tier is free, Pro Personal is $23 per user per month, and Team is $59 a month including five users.", "https://scribe.com/pricing"],
      ["Scribe's guides are built from annotated screenshots captured by its Chrome and Edge extensions.", "https://scribe.com/pricing"],
      ["Walkcast records a browser session to MP4 and WebM, WebVTT captions, a transcript, a page list and a step-by-step guide.", "https://github.com/KunjShah95/walkcast"],
    ],
  },
];

/** The lab: the second product on the same recorder. */
export const LAB_FACTS: [string, string][] = [
  ["A run", "One attempt by a browser agent at a task, with everything it did recorded as evidence."],
  ["A fixture", "A failed run frozen into something replayable: the task, the pages, and the point where it went wrong."],
  ["An experiment", "The same task run repeatedly against a base agent and a candidate, scored with 95% Wilson score intervals."],
  ["A cause", "Why the run failed, classified from the evidence. A cause the rules cannot explain stays marked unexplained rather than being guessed."],
  ["A comparison", "Base against candidate over repeated trials, so a fix that broke something else shows up as a regression."],
  ["Fault replay", "Re-running a recorded failure through the simulator to check whether a candidate agent still trips over it."],
];

export const LAB_FAQ: [string, string][] = [
  [
    "What is browser agent testing?",
    "It is testing an AI agent that drives a web browser: you give the agent a task such as 'sign in and open the invoices page', and you check whether it completed it, and if not, why. The hard part is the 'why'. An agent that fails usually cannot explain itself, so the failure has to be captured as evidence and classified.",
  ],
  [
    "What is browser agent regression testing?",
    "It is running the same browser agent task again after a change, and finding out whether the change fixed the task, did nothing, or broke a task that used to pass. It needs a recorded failure to replay against the new version — that record is the fixture, and classifying the cause is what turns a bug report into a test.",
  ],
  [
    "What is a regression fixture for a browser agent?",
    "A fixture is a failed agent run kept in a form you can replay: the task, the pages it visited, the state of the browser and the point where it went wrong. Replay it against the next version of the agent and you find out whether your fix worked, and whether it broke something that used to work.",
  ],
  [
    "How does Walkcast Lab compare two agent versions?",
    "With experiments. The same task is run repeatedly against a base agent and a candidate, and the results are compared using 95% Wilson score intervals, so a difference you can act on is separated from a difference that is only noise.",
  ],
  [
    "Does Walkcast Lab use an LLM to judge the agent's work?",
    "No. Every cause comes from the browser's own trace: which page was opened, what was typed, what was clicked and what the site answered. A cause the rules cannot explain is left marked unexplained instead of being guessed.",
  ],
  [
    "What is Stagehand and how does it compare?",
    "Stagehand is an open-source browser automation framework built on Playwright, used to drive web pages with a mix of code and natural-language instructions. It is a way to run an agent. Walkcast Lab is what you use after a run fails: it turns that failure into a cause, evidence and a replayable fixture, and compares agent versions over repeated trials.",
  ],
  [
    "Can Walkcast Lab test an agent that uses browser automation tools?",
    "Yes. The Lab reads from the recorder, so it works with any agent that drives a real browser, including agents built on Playwright, Stagehand or browser-use.",
  ],
];

/* ------------------------------------------------------------------ pricing */

export const PRICING_FAQ: [string, string][] = [
  [
    "Is Walkcast really free?",
    "Yes. Walkcast is MIT licensed and free in full. There is no paid tier, and the video carries no watermark.",
  ],
  [
    "Are there any limits on the free version?",
    "A recording visits up to 30 pages on one site, and the app runs one job at a time. Those are limits of what a walkthrough is, not of a subscription.",
  ],
  [
    "Do I need an account?",
    "No. Accounts are optional. Without one, nothing about your recording is sent anywhere and the app has no analytics.",
  ],
  [
    "What does it cost to run?",
    "Your own CPU for the few minutes a recording takes, and about 600 MB of disk. There is no per-minute charge and no network cost beyond visiting the site you are recording.",
  ],
  [
    "Is there a paid version coming?",
    "There is no plan for one. The repository is MIT licensed and the project has no commercial tier.",
  ],
];

/** The three steps of a recording: the page's install steps and the HowTo JSON-LD. */
export const HOWTO: [string, string][] = [
  ["Install Walkcast", "Download the Windows installer and run it. WebView2 is fetched automatically if the PC does not have it yet."],
  ["Paste the link and sign-in", "Paste the site's address and the username and password you use. Confirm you own the site or may test it."],
  ["Press Record", "A real browser signs in, visits up to 30 pages and returns the whole visit as an MP4 with captions and a transcript."],
];

/** One step of a guide. The page renders these and the HowTo schema is built from the same list. */
export interface GuideStep {
  title: string;
  text: string;
}

/**
 * The steps of every guide, in one place. The page and the `HowTo` JSON-LD are both built from
 * this, so a step can never be visible on the page and missing from the schema, or the reverse.
 */
export const GUIDE_STEPS: Record<string, GuideStep[]> = {
  "/guides/narrated-website-walkthrough": [
    { title: "Install Walkcast", text: "Download the Windows installer and run it. WebView2 is fetched automatically if the PC does not have it yet." },
    { title: "Paste the link and sign-in", text: "Paste the site's address and the username and password you use. Confirm you own the site or may test it." },
    { title: "Press Record", text: "A real browser signs in, visits up to 30 pages and returns the whole visit as an MP4 with captions and a transcript." },
    {
      title: "Review, edit, share",
      text: "Play the result in the app. Rewrite any line of the script and re-narrate, or swap in your own voice. Then share recording.mp4, or embed it with its captions.",
    },
  ],
  "/guides/product-demo-video": [
    {
      title: "Install and open Walkcast",
      text: "Download the installer for your platform and start the app. It downloads the recording browser (Chromium) once, on first launch, and then works offline apart from the site being recorded.",
    },
    {
      title: "Paste the URL of the page you want to start from",
      text: "Give it the address of the page a new visitor would land on. Walkcast follows links on the same site from there, so you do not have to list the pages you want. Sign-out, delete, cancel and unsubscribe links are skipped automatically.",
    },
    {
      title: "Add the sign-in, if there is one",
      text: "Fill in the username and password of your test account. Walkcast finds the sign-in form, signs in, and then continues through the site as an authenticated visitor. The password is held in memory for the run only: traces, captions and files on disk show a placeholder, and the narration never reads it out.",
    },
    {
      title: "Press Record",
      text: "A real Chromium browser opens the page, signs in like a first-time user, and visits up to 30 pages, scrolling each one. It never submits a form. If the site presents a CAPTCHA or a second-factor prompt, the recorder stops and tells you rather than trying to get past it.",
    },
    {
      title: "Review, re-record, share",
      text: "Play the result in the app. Rewrite any line of the narration and re-narrate it, or replace the voice with your own recording. Then share recording.mp4, or embed it with its captions on your site.",
    },
  ],
  "/guides/website-tutorial-video": [
    {
      title: "Install Walkcast",
      text: "Grab the installer for your platform. It is MIT licensed, free, and needs no account. The app downloads its recording browser once, on first launch.",
    },
    {
      title: "Paste the link where the tutorial begins",
      text: "Start at the page your viewer needs to be on. Walkcast follows links on the same site from there, so the tutorial is a real navigation of your product rather than a list of pages you typed in by hand.",
    },
    {
      title: "Add the sign-in details, if the flow needs them",
      text: "Most tutorials are about something that only exists when you are signed in: a settings page, an invoice, an admin panel. Give Walkcast the test account and it signs in first, then records. The password stays in memory for the run and never reaches the files.",
    },
    {
      title: "Press Record",
      text: "The browser signs in, visits up to 30 pages, scrolls each one, and records the whole visit. It never submits a form, so a tutorial cannot accidentally create a customer or send an email.",
    },
    {
      title: "Edit the words, not the video",
      text: "The narration is a script. Rewrite any line in Studio and re-narrate, or replace the voice with your own recording. There is no timeline to cut and no footage to re-shoot.",
    },
  ],
};

/** The demo recording on the page, described for VideoObject and the video sitemap. */
export const DEMO = {
  title: "A Walkcast visit to Estate360, recorded end to end",
  description: "An unedited Walkcast recording: a browser visits Estate360, signs in, goes through six pages and narrates each one.",
  durationIso: "PT1M11S",
  uploadDate: "2026-10-14",
};
