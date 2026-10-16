/**
 * Words the page and the crawler files share: the FAQ is rendered on the page and emitted as
 * FAQPage JSON-LD and in llms.txt, so every answer a search or answer engine quotes is visible on
 * the page too.
 */

export const NAME = "Walkcast";
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
