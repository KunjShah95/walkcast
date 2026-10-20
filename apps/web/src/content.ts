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
export const UPDATED = "2026-10-20";

/** Every prerendered page: the landing page plus the documents engines can cite on their own. */
export interface Route {
  path: string;
  title: string;
  description: string;
  /** Breadcrumb label. */
  label: string;
}
export const ROUTES: Route[] = [
  {
    path: "/",
    label: "Home",
    title: "Walkcast · Paste a link, get a video tour of your website",
    description:
      "Paste a link, get a video tour of your website. A real browser signs in, clicks through your pages and records it, with captions. Free for Windows, Mac, Linux.",
  },
  {
    path: "/guides/narrated-website-walkthrough",
    label: "How to make a narrated website walkthrough",
    title: "How to make a narrated video walkthrough of a website (free) · Walkcast",
    description:
      "Step by step: turn a website link into a narrated MP4 with captions and a transcript, even behind a login. No microphone, screen recorder or editing.",
  },
  {
    path: "/compare/screen-recording",
    label: "Walkcast vs screen recording",
    title: "Walkcast vs screen recording (Loom, OBS, Xbox Game Bar) · Walkcast",
    description:
      "When a generated, narrated walkthrough beats recording your screen, and when it does not. A fair comparison of effort, consistency, captions, privacy and cost.",
  },
  {
    path: "/faq",
    label: "FAQ",
    title: "Walkcast FAQ: logins, passwords, voices, output files · Walkcast",
    description:
      "Answers about Walkcast: which PCs it runs on, recording pages behind a login, what happens to your password, CAPTCHAs, voices, output files and price.",
  },
  {
    path: "/download",
    label: "Download",
    title: "Download Walkcast for Windows, Mac and Linux (free) · Walkcast",
    description:
      "Download Walkcast free: Windows .exe (no admin rights) or .msi, macOS .dmg for Apple Silicon, Linux AppImage or .deb. Requirements and first-run notes.",
  },
  {
    path: "/privacy",
    label: "Privacy",
    title: "Walkcast privacy: what stays on your PC · Walkcast",
    description:
      "Walkcast runs on your own PC. Recordings, the browser and your passwords stay there; the app has no analytics. Exactly which network requests it makes, and why.",
  },
];

/** Questions answered on /faq beyond the landing page's list. */
export const MORE_FAQ: [string, string][] = [
  [
    "What files does a recording produce?",
    "An MP4 (H.264 video with an embedded caption track), the raw WebM, WebVTT captions, a transcript, and a list of every page visited with its HTTP status. With a voice key you also get the narration in the MP4, a narrated WebM and the narration as a WAV file.",
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
    "No. Recordings are written to the app's folder on your PC and are not uploaded anywhere. You share the MP4 yourself.",
  ],
  [
    "Can it record internal tools or a local development site?",
    "Yes. Because it runs on your PC, it can record any site that PC can reach, including localhost and company intranets, as long as you may test it.",
  ],
];
export const TAGLINE = "Paste a link, get a video tour of your website";
export const DESCRIPTION =
  "Paste a link and get a video tour of your website. A real browser signs in, clicks through your pages like a first-time user and hands back the whole visit as an MP4 with captions and a transcript. Free desktop app for Windows, Mac and Linux.";
export const DEFINITION =
  "Walkcast is a free, open-source desktop app (Windows, macOS and Linux) that makes a video tour of your website from one link. From one link, a real browser signs in, visits up to 30 pages the way a first-time user would, and returns the complete recording as an MP4 with WebVTT captions and a transcript, plus a voice-over when you add a voice key. Every caption comes from what the browser actually did.";

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
    "An MP4 of the whole visit, WebVTT captions, a transcript, the page list with HTTP status, and a voice-over if you asked for one.",
  ],
];

/** What a recording is not: the three confusions a first-time visitor actually has. */
export const NOT: [string, string][] = [
  [
    "Not a screen recorder",
    "A screen recorder films your screen while you drive it. Walkcast drives its own browser, so there is no camera, no performance and no editing afterwards.",
  ],
  ["Not a mockup generator", "Every frame is your live site loaded in a real browser, not a picture of one."],
  [
    "Not a video editor",
    "It does not cut, splice or add motion graphics. It records one continuous visit and hands it over.",
  ],
];

export const FAQ: [string, string][] = [
  ["What is Walkcast?", DEFINITION],
  [
    "Is Walkcast a screen recorder?",
    "No. A screen recorder films what happens on your screen while you drive it. Walkcast drives its own browser: it opens your site, signs in and clicks through your pages on its own, so there is nothing to set up, nothing to perform and nothing to edit afterwards.",
  ],
  [
    "What is Walkcast Lab?",
    "The same recorder, used by teams that build browser AI agents. A failed agent run becomes a classified, reproducible regression test: you get the cause, the evidence it points at, and a fixture you can replay against the next agent version. It lives in the same app, under Lab in the sidebar.",
  ],
  [
    "Which computers does Walkcast run on?",
    "Windows 10 or 11 (64-bit), macOS 12 or later on Apple Silicon, and most 64-bit Linux distributions (AppImage or .deb). It is a desktop app because it runs a real browser on your computer; it does not run on phones.",
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
  ["Is Walkcast free?", "Yes. It is MIT licensed with no paid tier, seat limit or usage meter, and it runs on your own PC."],
];

/** The three steps of a recording: the page's install steps and the HowTo JSON-LD. */
export const HOWTO: [string, string][] = [
  ["Install Walkcast", "Download the Windows installer and run it. WebView2 is fetched automatically if the PC does not have it yet."],
  ["Paste the link and sign-in", "Paste the site's address and the username and password you use. Confirm you own the site or may test it."],
  ["Press Record", "A real browser signs in, visits up to 30 pages and returns the whole visit as an MP4 with captions and a transcript."],
];

/** The demo recording on the page, described for VideoObject and the video sitemap. */
export const DEMO = {
  title: "A Walkcast visit to Estate360, recorded end to end",
  description: "An unedited Walkcast recording: a browser visits Estate360, signs in, goes through six pages and narrates each one.",
  durationIso: "PT1M11S",
  uploadDate: "2026-10-14",
};
