/**
 * Use-case guides: one page per job people make website walkthrough videos for. Each page is
 * written to answer that job's questions on its own (no shared filler), with HowTo, FAQPage,
 * Article and BreadcrumbList structured data, and links to the other guides.
 */
export interface Guide {
  slug: string;
  /** <title>, ~60 characters. */
  title: string;
  h1: string;
  description: string;
  /** Short label for cards and breadcrumbs. */
  label: string;
  audience: string;
  intro: string[];
  steps: [string, string][];
  settings: [string, string][];
  afterwards: string[];
  pitfalls: string[];
  faq: [string, string][];
}

export const GUIDES_UPDATED = "2026-10-15";

export const GUIDES: Guide[] = [
  {
    slug: "website-video-walkthrough",
    label: "Website video walkthroughs",
    title: "How to Make a Website Video Walkthrough (With Narration)",
    h1: "How to make a narrated video walkthrough of a website",
    description:
      "A step-by-step guide to recording a website video walkthrough with a voice-over and captions: what to show, how long it should be, and how to do it from a link in about two minutes.",
    audience: "Anyone who needs to show a website to someone who can't click through it with you.",
    intro: [
      "A website video walkthrough is a screen recording that moves through a site page by page while a voice says what is on screen. It replaces the meeting where you share your screen and click around, and it can be watched again, paused and linked to.",
      "The usual way to make one is to open a screen recorder, click through the site while talking, then cut out the mistakes. That takes an hour for a five-minute video and has to be redone every time the site changes. A walkthrough recorded from a link takes a couple of minutes and can be re-recorded after every release.",
    ],
    steps: [
      ["Pick the starting page", "Use the sign-in page if the interesting parts are behind a login, otherwise the home page. The recorder follows links from there, so start where a new visitor would."],
      ["Add the sign-in you would use", "A demo or test account is best: it shows realistic data without exposing real customers. The password is held in memory only."],
      ["Choose how many pages", "Six to ten pages makes a two-to-four-minute video, which is about as long as people watch. Use more for documentation, fewer for a teaser."],
      ["Record and review", "The result is an MP4 with a voice-over, captions timed to the speech and a transcript. Watch it once at 1.5× and check the page list for anything you didn't want shown."],
    ],
    settings: [
      ["Length", "2 to 4 minutes for sharing, longer only for reference material."],
      ["Account", "A dedicated demo account with tidy sample data."],
      ["Start page", "The sign-in page or the page a new user lands on."],
    ],
    afterwards: [
      "Embed the MP4 on a page with the VTT file as its caption track, and paste the transcript underneath: search engines read the text, viewers who can't play sound read the captions.",
      "Keep the recording settings and re-record after each release so the video never drifts from the product.",
    ],
    pitfalls: [
      "Recording with a real customer's account. Use test data.",
      "One long video for everything. Several short ones are easier to watch and to keep current.",
      "Sites behind CAPTCHA or two-factor sign-in: the recorder stops at those by design. Use a test account without them, or a staging environment.",
    ],
    faq: [
      ["How long should a website walkthrough video be?", "Two to four minutes for a video you send to someone. People stop watching long screen recordings; split anything longer into several videos by task."],
      ["Do I need a microphone or a script?", "No. The narration is generated from what the browser does, so there is nothing to write or record. If you want your own voice, use the transcript as a script and record over the video."],
      ["Can it record pages that need a login?", "Yes. Give it the sign-in you would use. It stops at CAPTCHA and two-factor prompts rather than trying to get past them."],
    ],
  },
  {
    slug: "walkcast-vs-screen-recording",
    label: "Walkcast vs screen recording",
    title: "Walkcast vs Screen Recording for Website Walkthroughs",
    h1: "Walkcast versus recording a website walkthrough yourself",
    description:
      "When to use Walkcast and when to record a website walkthrough yourself: login, captions, re-recording after a release, and what each method actually produces.",
    audience: "People choosing between a URL-based walkthrough and a screen recorder such as Loom, OBS, or the one built into their OS.",
    intro: [
      "A website video walkthrough is a recording that moves through a site while a voice explains the screen. Walkcast makes that from a link: a browser signs in, visits up to 30 pages on the same site, and returns an MP4, WebVTT captions and a transcript. A screen recorder captures whatever is on your display while you click and talk.",
      "Use Walkcast when the subject is a website you may test and the narration should describe what the browser did. Use a screen recorder when the video has to include a meeting, a desktop app, a mobile device, or commentary only you can give.",
    ],
    steps: [
      ["Name the subject", "If it is a website you can open in a browser, Walkcast can record it. If it is a desktop app, a phone, or a live call, use a screen recorder."],
      ["Decide who speaks", "Walkcast writes each line from recorded events: the page opened, the field filled, the control clicked. A screen recorder uses your voice, so you need a script or the confidence to improvise."],
      ["Check the sign-in", "Walkcast signs in with a username and password you provide, then stops at CAPTCHA and two-factor prompts. A screen recorder has you sign in yourself, including those prompts."],
      ["Plan the next release", "Walkcast re-records from the same link. A screen recording has to be clicked through again, or it goes stale."],
    ],
    settings: [
      ["Walkcast", "A URL, an optional demo login, about two minutes. Output: MP4 with voice-over, WebVTT captions, WAV narration, page list."],
      ["Screen recorder", "You drive the site and talk. Output: a video file. Captions and a transcript are a separate job, if you make them."],
      ["Choose Walkcast", "Product tours, onboarding, handover, QA evidence and help articles for a website."],
      ["Choose a screen recorder", "Desktop software, live meetings, mobile apps, or a video that needs your judgement in the voice-over."],
    ],
    afterwards: [
      "If you used Walkcast, embed the MP4 with the VTT caption track and paste the transcript under it so the page is readable without pressing play.",
      "If you used a screen recorder, add captions before you publish. A video with no text is invisible to search and to anyone who cannot hear it.",
    ],
    pitfalls: [
      "Treating the tools as rivals for every video. They record different things.",
      "Using a production account in either tool. Use a demo account with sample data.",
      "Publishing a screen recording of a site that changes every week and never re-recording it.",
    ],
    faq: [
      ["Is Walkcast a replacement for Loom or OBS?", "For a narrated tour of a website, yes, it replaces the record-and-talk step. For a meeting, a desktop app, or a video that needs your own commentary, keep the screen recorder."],
      ["Which one is better for a product demo of a web app?", "Walkcast, when the demo is the product itself and you want it re-recorded after each release. A screen recorder is better when a person has to explain a judgement the browser cannot see."],
      ["Can I add my own voice to a Walkcast video?", "Yes. Use the transcript as the script and record over the MP4, or replace the narration WAV. The captions stay timed to the original speech, so re-time them if the new voice has a different pace."],
    ],
  },
  {
    slug: "product-demo-video",
    label: "Product demo videos",
    title: "How to Make a Product Demo Video of Your Web App",
    h1: "How to make a product demo video of your web app",
    description:
      "Record a narrated product demo of a SaaS or web app from its URL: which screens to show, how to keep the demo current after every release, and where to use it.",
    audience: "Founders, product marketers and sales engineers who need a demo that is always up to date.",
    intro: [
      "A product demo video shows what your app does by walking through it, not by describing it. The demos that work show the product with believable data, in the order a new customer would meet it: sign in, the main screen, the one thing they came for.",
      "The hard part isn't recording the first demo, it's keeping it current. Every redesign makes the old video wrong. Recording from a link means the demo is a repeatable job, not a production.",
    ],
    steps: [
      ["Prepare a demo account", "Fill it with realistic sample data: real-looking company names, a few months of activity, no lorem ipsum. Empty states make a product look unused."],
      ["Start from the sign-in page", "Showing the sign-in tells viewers this is the real product, not a mock-up."],
      ["Limit it to the core flow", "Five to eight pages. A demo that shows every settings screen buries the point."],
      ["Record, then cut a teaser", "Use the full MP4 for sales follow-ups and the first 30 seconds as a teaser for the homepage or a social post."],
    ],
    settings: [
      ["Pages", "5 to 8."],
      ["Account", "A demo workspace with curated sample data."],
      ["Where to start", "The sign-in page, then let it land on the main dashboard."],
    ],
    afterwards: [
      "Put the video above the fold on your pricing or product page with captions on: most autoplayed video is watched muted.",
      "Send the MP4 after a sales call so the buyer can show it to colleagues who weren't there.",
      "Re-record after each release that changes the main screens.",
    ],
    pitfalls: [
      "Demo data with personal information. Generate it.",
      "Starting on a settings or billing page: start where the value is.",
      "Leaving destructive actions on the demo account. The recorder skips delete and sign-out links and submits no forms, but your demo data should still be disposable.",
    ],
    faq: [
      ["What should a SaaS product demo video include?", "Sign-in, the main dashboard and the one workflow customers buy the product for, with realistic data. Keep it under three minutes; offer a longer one on request."],
      ["How do I keep a product demo video up to date?", "Make recording repeatable: same demo account, same start page, same number of pages. Then re-record after each release that changes what the demo shows."],
      ["Can I use the demo on my website?", "Yes. The MP4 plays in every browser and comes with a WebVTT caption file you can attach as a caption track."],
    ],
  },
  {
    slug: "customer-onboarding-video",
    label: "Customer onboarding videos",
    title: "Customer Onboarding Videos: Record a Walkthrough of Your App",
    h1: "How to make customer onboarding videos for your web app",
    description:
      "Make narrated onboarding walkthroughs that show new users around your app, with captions and a transcript for your help center and welcome emails.",
    audience: "Customer success and support teams onboarding new users.",
    intro: [
      "New users decide in the first few sessions whether they understand your product. An onboarding video answers \"where is everything?\" before they have to ask, and it works at 2 a.m. in any time zone.",
      "Onboarding videos go stale quickly because they show navigation, the part of an app that changes most. Recording them from a link means you can refresh the whole set after a release in minutes.",
    ],
    steps: [
      ["Use a fresh account", "Sign up a brand-new account, or reset a test one, so the video shows exactly what a new customer sees, including empty states and setup prompts."],
      ["Record one video per first task", "\"Find your way around\", \"Invite your team\", \"Set up your first project\". Short, separate videos beat one long tour."],
      ["Keep each to a few pages", "Three to six pages per video, so each one is under two minutes."],
      ["Publish with captions", "Attach the VTT captions and paste the transcript under the video in your help center."],
    ],
    settings: [
      ["Pages", "3 to 6 per video."],
      ["Account", "A new, empty account like a customer's first day."],
      ["Where to start", "The sign-in page."],
    ],
    afterwards: [
      "Link the first video from your welcome email and the in-app empty state.",
      "Put the transcript text on the help-center page: it makes the page searchable and helps people who skim.",
      "Re-record the set whenever navigation changes.",
    ],
    pitfalls: [
      "Recording with an admin account full of data: new users won't recognise what they see.",
      "A single 15-minute tour. Split it by task.",
    ],
    faq: [
      ["How long should onboarding videos be?", "Under two minutes each, one task per video. Users come looking for one answer."],
      ["Should onboarding videos have captions?", "Yes. Many people watch with the sound off at work, and captions make the video usable for deaf and hard-of-hearing users. Walkcast produces a WebVTT caption file with every recording."],
      ["Where should I put onboarding videos?", "In the welcome email, on empty states inside the app, and on the matching help-center article with the transcript underneath."],
    ],
  },
  {
    slug: "client-website-handover-video",
    label: "Client handover videos",
    title: "Client Website Handover Video: Walk Clients Through Their Site",
    h1: "How to record a website handover video for a client",
    description:
      "Agencies and freelancers: hand a finished site over with a narrated walkthrough of its pages and admin area, plus a page list with HTTP status codes as a delivery record.",
    audience: "Web agencies and freelancers delivering a site to a client.",
    intro: [
      "At handover a client needs two things: to see what they're getting, and to know how to find their way around the admin area after you've gone. A walkthrough video does both, and the client can forward it to colleagues who missed the meeting.",
      "It also doubles as a delivery record. Each recording lists every page it visited with the HTTP status the site returned, so there's a dated record that the pages worked when the site was handed over.",
    ],
    steps: [
      ["Record the public site", "Start from the home page without credentials. Ten to fifteen pages covers most brochure sites."],
      ["Record the admin area separately", "Start from the CMS sign-in page with the client's editor account (not your developer account), so they see their own view."],
      ["Check the page list", "Any page with a 4xx or 5xx status is something to fix before you send the video."],
      ["Send both videos and the page list", "The MP4s for watching, the page list as the record of what was live at handover."],
    ],
    settings: [
      ["Pages", "10 to 15 for the public site, 5 to 8 for the admin area."],
      ["Account", "The client's own editor role."],
      ["Where to start", "Home page, then the CMS sign-in page."],
    ],
    afterwards: [
      "Store the recordings with the project files: if a client later says a page never worked, the dated video and status list show what was delivered.",
      "Re-record after the snagging round so the final handover reflects the fixes.",
    ],
    pitfalls: [
      "Recording with your developer or super-admin account: the client will see menus they don't have.",
      "Forgetting robots.txt rules on a staging site: the recorder respects them, so pages blocked from robots won't be visited.",
    ],
    faq: [
      ["What should a website handover include?", "The live site, admin access for the client, a walkthrough of both the public pages and the editing area, and a record of what was delivered. A narrated video plus a page list covers the last two."],
      ["Can I record a site that isn't live yet?", "Yes, if you can reach it from the machine running the recorder, such as a staging URL. A publicly hosted recorder refuses private network addresses, so run it locally for internal staging hosts."],
      ["Will recording change anything on the client's site?", "No. After signing in it only opens pages: it submits no forms and skips sign-out, delete, cancel and unsubscribe links."],
    ],
  },
  {
    slug: "qa-release-walkthrough",
    label: "QA and release checks",
    title: "QA Video Walkthrough: Record Evidence for Every Release",
    h1: "How to record a QA walkthrough of every release",
    description:
      "Use narrated walkthrough recordings as release evidence for QA and UAT: a video of the signed-in app, the HTTP status of every page and a step trace, repeatable after each deploy.",
    audience: "QA engineers, release managers and teams doing user-acceptance testing.",
    intro: [
      "After a deploy someone usually clicks through the main pages to check nothing is obviously broken. It works, but it leaves nothing behind. A recorded walkthrough does the same check and keeps the evidence: a video, the status code of every page and a timestamped trace of every step.",
      "This is a smoke check, not a test suite. It tells you that pages load behind the login and what they looked like, which is the evidence UAT sign-off and incident reviews usually ask for.",
    ],
    steps: [
      ["Use a dedicated test account", "One per environment, with stable data, so recordings from different releases are comparable."],
      ["Record right after the deploy", "Same start page, same number of pages each time."],
      ["Read the page list first", "Any page that returned 4xx or 5xx, or a sign-in that failed, is the first thing to look at. A rejected sign-in is reported with the site's own error message."],
      ["Attach it to the release", "Link the video and page list from the release ticket or changelog."],
    ],
    settings: [
      ["Pages", "The pages your smoke checklist covers, usually 8 to 20."],
      ["Account", "A test account per environment."],
      ["Where to start", "The sign-in page."],
    ],
    afterwards: [
      "Keep one recording per release: when a bug report says \"this used to work\", you can see when it changed.",
      "For browser AI agents, Walkcast Lab goes further: it diagnoses why an agent's run failed and turns it into a replayable regression test.",
    ],
    pitfalls: [
      "Treating it as a full test: it checks that pages load and shows them, it doesn't check business logic.",
      "Environments behind two-factor sign-in: the recorder stops there by design. Use a test account exempt from 2FA on staging.",
    ],
    faq: [
      ["What is UAT evidence?", "A record that the acceptance checks were carried out and what the system did. A dated video of the signed-in walkthrough plus the status of each page is a simple, reviewable form of it."],
      ["Can this replace automated end-to-end tests?", "No. It's a quick, visual smoke check and an evidence trail. Keep your automated tests for business logic."],
      ["Does it work on staging environments?", "Yes, from a machine that can reach staging. A publicly hosted recorder refuses private network addresses, so run it locally for internal hosts."],
    ],
  },
  {
    slug: "help-center-video-tutorials",
    label: "Help center video tutorials",
    title: "Help Center Video Tutorials With Captions and Transcripts",
    h1: "How to add video tutorials to your help center",
    description:
      "Turn help-center articles into narrated video tutorials with captions and a transcript, recorded from your app's URL and refreshed when the UI changes.",
    audience: "Support and documentation teams running a knowledge base.",
    intro: [
      "Help articles with a short video get fewer \"I can't find it\" tickets, because the reader sees exactly where to click. The catch is upkeep: screenshots and videos go stale every time the interface moves.",
      "A recorded walkthrough comes with its transcript and captions, which is what makes a video useful in documentation: readers can skim the text, search engines can index it, and the video is accessible without sound.",
    ],
    steps: [
      ["Pick the articles with the most views", "Start with the ten articles that get the most traffic or tickets."],
      ["Record one short video per article", "Start from the page where the task begins and keep it to the few pages the task needs."],
      ["Publish video, captions and transcript together", "Embed the MP4 with the VTT captions, and put the transcript under it as text."],
      ["Re-record on UI changes", "Keep a list of which videos show which pages, and refresh those after a release."],
    ],
    settings: [
      ["Pages", "2 to 5 per tutorial."],
      ["Account", "A support demo account with typical customer data."],
      ["Where to start", "The page where the task begins (after sign-in)."],
    ],
    afterwards: [
      "Use the transcript as the first draft of the written steps; edit it into instructions.",
      "Most help-center tools accept an MP4 upload and a caption file, or an embed from your video host.",
    ],
    pitfalls: [
      "Video-only articles: always keep the text steps. The transcript is a good start.",
      "Long videos covering several tasks. One task per video.",
    ],
    faq: [
      ["Do help center videos reduce support tickets?", "They help most on navigation questions (\"where do I find…\"), because the viewer sees the exact clicks. Measure it: compare tickets on an article's topic before and after adding the video."],
      ["What format do help center videos need?", "MP4 with H.264 video and AAC audio plays everywhere; add a WebVTT file for captions. Both come with every Walkcast recording."],
      ["Can I change the voice?", "The built-in voice is a plain synthetic voice. You also get the narration on its own and the transcript, so you can re-voice it or record your own over the video."],
    ],
  },
  {
    slug: "internal-tool-training-video",
    label: "Internal tool training",
    title: "Training Videos for Internal Tools and Admin Panels",
    h1: "How to make training videos for internal tools",
    description:
      "Record narrated training walkthroughs of internal tools and admin panels for new hires, with a transcript they can search, without booking screen-share sessions.",
    audience: "Ops, engineering and team leads training people on internal tools.",
    intro: [
      "Internal tools rarely have documentation, so training happens one screen-share at a time and is repeated for every new hire. A walkthrough video of the tool, recorded with a training account, is something new people can watch on day one and come back to.",
      "Because the transcript is plain text, it can go straight into your wiki next to the video, where it's searchable.",
    ],
    steps: [
      ["Create a training account", "Limited permissions and sample data, so the video shows what a new person will actually see."],
      ["Record from the sign-in page", "Include the sign-in so people know where the tool lives and how to get in."],
      ["One video per area", "\"Finding a customer\", \"Handling a refund request\": short videos people can find again."],
      ["Put them in the wiki", "Video plus transcript on the page for each area."],
    ],
    settings: [
      ["Pages", "4 to 8 per area."],
      ["Account", "A training role with sample data."],
      ["Where to start", "The tool's sign-in page."],
    ],
    afterwards: [
      "Run the recorder on your own machine for tools on the internal network: a publicly hosted recorder refuses private addresses on purpose.",
      "Re-record when the tool changes; the same settings give the same tour.",
    ],
    pitfalls: [
      "Recording with production data that includes customer information. Use a training account with sample data.",
      "Tools behind single sign-on with two-factor prompts: the recorder stops at second-factor prompts. Use a training account that can sign in with a password.",
    ],
    faq: [
      ["Can it record tools on our internal network?", "Yes, when you run Walkcast on a machine inside the network. A publicly hosted instance refuses private and local addresses so it can't be used to probe networks."],
      ["Is the password stored anywhere?", "No. It's held in memory during the recording only; traces and captions on disk show a placeholder."],
      ["Can new hires search the videos?", "Each video comes with a transcript and captions as text, so putting the transcript next to the video in your wiki makes it searchable."],
    ],
  },
  {
    slug: "video-walkthrough-behind-login",
    label: "Recording behind a login",
    title: "Record a Narrated Video Walkthrough Behind a Login",
    h1: "Recording behind a login",
    description: "How Walkcast signs in, records the pages behind authentication, and how credentials are kept out of the artifacts.",
    audience: "Anyone recording an app, admin panel or staging site that requires authentication.",
    intro: ["Most walkthroughs start at a login. If the tool can't authenticate, it can't reach the pages that matter.", "Walkcast signs in during the recording, records the authenticated session, and never saves the password in the trace."],
    steps: [
      ["Prepare a test account", "Use a dedicated demo or editor account with the permissions a viewer should see."],
      ["Start the recording", "Paste the URL, enter username and password when prompted, then recording begins after login."],
      ["Verify coverage", "Check the page list for protected routes and revisit any that need fresh interactions."],
    ],
    settings: [
      ["Redact credentials", "Secrets longer than 3 characters are scrubbed from traces, captions and logs."],
      ["Separate worker", "For multi-user hosting, seal credentials with LAB_SECRET_KEY rather than a per-process key."],
    ],
    afterwards: ["Share the link or revoke it.", "Spot-check the transcript for sensitive text."],
    pitfalls: [
      "Recording with an admin account exposes menus real users never see.",
      "Pasting a password in a bug report or fixture leaks it.",
    ],
    faq: [
      ["Are credentials stored?", "Site passwords are sealed with AES-GCM and cleared when the job ends."],
      ["Can it pass 2FA?", "No. CAPTCHA and two-factor prompts are respected, not bypassed."],
    ],
  },
];

export function guideBySlug(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
