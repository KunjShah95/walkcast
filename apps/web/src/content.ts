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
export const UPDATED = "2026-10-17";

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
    title: "Walkcast · Narrated video walkthroughs of any website",
    description:
      "Paste a site link, get a narrated video walkthrough: an MP4 with voice-over, captions and transcript. Walkcast signs in and walks the pages. Free for Windows.",
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
    title: "Download Walkcast for Windows (free) · Walkcast",
    description:
      "Download Walkcast free for Windows 10 and 11: the .exe installer (no admin rights) or the .msi package. Requirements, SmartScreen and running from source.",
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
    "An MP4 (H.264 video, AAC narration and an embedded caption track), a WebM copy with the narration, the narration as a WAV file, WebVTT captions, and a list of every page visited with its HTTP status.",
  ],
  [
    "How long does a recording take?",
    "Usually a minute or two. A six-page site records, narrates and encodes in under a minute on an ordinary laptop; it scales with the number of pages, up to 30.",
  ],
  [
    "Which voices does it use?",
    "On Windows the narration is spoken by the voices built into Windows (a female or a male voice). When run from source on Linux or macOS it uses ffmpeg's flite voices. Nothing is sent to a speech service unless you configure one.",
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
export const TAGLINE = "Narrated video walkthroughs of any website, from a link";
export const DESCRIPTION =
  "Paste your website's link and get a narrated video walkthrough. Walkcast signs in, walks your pages and hands back an MP4 with a spoken voice-over, captions and a transcript. Free desktop app for Windows.";
export const DEFINITION =
  "Walkcast is a free, open-source Windows app that makes a narrated video walkthrough from a website link. A real browser signs in, visits up to 30 pages on that site, and returns an MP4 with a spoken voice-over, WebVTT captions and a transcript. Every line of narration comes from what the browser actually did.";

export const FAQ: [string, string][] = [
  ["What is Walkcast?", DEFINITION],
  [
    "Which computers does Walkcast run on?",
    "The desktop app installs on Windows 10 or 11, 64-bit. On macOS and Linux you can run it from source with Node.js 22, Rust and ffmpeg.",
  ],
  [
    "How do I make a narrated video walkthrough of my website?",
    "Install Walkcast, paste the site's link, add the username and password you normally sign in with, confirm you may test the site, and press Record. You get an MP4 with a spoken voice-over, a WebVTT caption file and a transcript.",
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
  ["Press Record", "A browser signs in, walks up to 30 pages and returns a narrated MP4 with captions and a transcript."],
];

/** The demo recording on the page, described for VideoObject and the video sitemap. */
export const DEMO = {
  title: "Estate360 walkthrough, narrated by Walkcast",
  description: "An unedited Walkcast recording: a browser opens Estate360, walks six pages and narrates each one.",
  durationIso: "PT1M11S",
  uploadDate: "2026-10-14",
};
