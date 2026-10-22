import { Check, Minus, X } from "lucide-react";
import type { ReactNode } from "react";
import { FAQ, GUIDE_STEPS, MORE_FAQ } from "../content.ts";
import { LINUX_APPIMAGE_URL, LINUX_DEB_URL, RELEASES_URL, REPO_URL, VERSION, WINDOWS_EXE_URL, WINDOWS_MSI_URL } from "../site.ts";
import { AppleIcon, LinuxIcon, WindowsIcon } from "../ui.tsx";
import { Doc } from "./Doc.tsx";
import { GuidesIndexPage, ProductDemoPage, WebsiteTutorialPage } from "./Guides.tsx";
import { LoomComparePage, ScribeComparePage, ScreenStudioComparePage } from "./Compare.tsx";
import { LabPage } from "./Lab.tsx";
import { PricingPage } from "./Pricing.tsx";

/**
 * The documents beside the landing page. Each answers one question completely, in plain HTML
 * (prerendered), so a search or answer engine can cite the page on its own.
 */

export { Doc };

/* ------------------------------------------------------------------ guide */

export function GuidePage() {
  return (
    <Doc path="/guides/narrated-website-walkthrough" eyebrow="Guide">
      <h1>
        How to make a narrated video walkthrough of a website. <span className="dim">Free, in about five minutes.</span>
      </h1>
      <p className="answer">
        <strong>Short answer:</strong> install Walkcast, paste the site's link (and a sign-in if pages are behind a login) and confirm you may test the site.
        Press Record. A real browser walks up to 30 pages and returns an MP4 with a spoken voice-over, WebVTT captions and a transcript. You never record your
        screen and you never edit anything.
      </p>

      <h2>What you need</h2>
      <ul>
        <li>A Windows 10/11 PC (x64), a Mac (macOS 12+, Apple Silicon), or an x86_64 Linux machine. Or run Walkcast from source on any platform.</li>
        <li>The address of the site, and permission to test it (your own site, or a client's that asked you to).</li>
        <li>For pages behind a login: a username and password for a test account. Two-step email-then-password forms work.</li>
      </ul>

      <h2>Steps</h2>
      <ol className="steps">
        {GUIDE_STEPS["/guides/narrated-website-walkthrough"]!.map((s, i) => (
          <li key={s.title} id={`step-${i + 1}`}>
            <h3>
              {i + 1}. {s.title}
            </h3>
            <p>{s.text}</p>
          </li>
        ))}
      </ol>

      <h2>What you get</h2>
      <table>
        <thead>
          <tr>
            <th>File</th>
            <th>What it is</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><code>recording.mp4</code></td><td>H.264 video, AAC narration, embedded caption track. Plays everywhere.</td></tr>
          <tr><td><code>narrated.webm</code></td><td>The same narration over the original WebM video.</td></tr>
          <tr><td><code>captions.vtt</code></td><td>WebVTT captions, timed to the voice.</td></tr>
          <tr><td><code>narration.wav</code></td><td>The voice-over on its own.</td></tr>
          <tr><td>Page list</td><td>Every page visited, with its title and HTTP status.</td></tr>
          <tr><td>Notes</td><td>Your own notes, pinned to the second of the video they are about.</td></tr>
          <tr><td>Share link</td><td>A link that plays the walkthrough for whoever has it, until the day it names. Served by the server you run.</td></tr>
        </tbody>
      </table>

      <h2>Share it, or put it on your own site</h2>
      <p>
        A share link plays the walkthrough for whoever has it. There is no sign-in: whoever has the link can watch it in a browser. It stops working on the day you name, and you can stop it
        before then. Each link answers for itself, so one link can carry your notes and another can leave them private.
      </p>
      <p>
        A link needs somewhere to be served from: the server that ships with the desktop app, or your own. Point it at a host you control and the link is only as
        public as that host is.
      </p>
      <p>
        To put the walkthrough on your own site, copy the embed code from the Share panel. It is one line of HTML — an iframe with the video, its captions and a link
        back to the full page:
      </p>
      <pre className="code-block">
        <code>{`<iframe src="https://your-walkcast-host/share/<id>/<token>?embed=1"
        title="Walkthrough" width="960" height="600"
        style="border:0;border-radius:10px" allowfullscreen loading="lazy"></iframe>`}</code>
      </pre>
      <p>
        Notes you write while watching stay private until you put them on a link. The same walkthrough also comes out as one Markdown document — the pages, the
        narration, your notes and what the recorder found — to paste into a ticket or a README.
      </p>

      <h2>Embed it with captions</h2>
      <pre className="code-block">
        <code>{`<video controls playsinline preload="metadata">
  <source src="recording.mp4" type="video/mp4">
  <track kind="captions" src="captions.vtt" srclang="en" label="English" default>
</video>`}</code>
      </pre>

      <h2>Tips for a better walkthrough</h2>
      <ul>
        <li>Start from the page a new visitor would land on; Walkcast follows links on the same site from there.</li>
        <li>Use a test account with realistic data. The narration reads page titles and what the browser did, so clear page titles make clearer narration.</li>
        <li>Keep it short: 4 to 8 pages makes a walkthrough people finish. The maximum is 30.</li>
        <li>If the site asks for a CAPTCHA or a two-factor code, Walkcast stops and tells you. Use an account without 2FA for recording.</li>
      </ul>

      <h2>Why the narration is accurate</h2>
      <p>
        Every line is written from the browser's own trace: the page it opened, the field it typed into, what the site answered. Nothing is guessed about intent,
        so the voice only describes what is on screen. Passwords are typed but never spoken or saved; files show a placeholder.
      </p>
    </Doc>
  );
}

/* ------------------------------------------------------------------ comparison */

type Mark = "yes" | "no" | "some";
const ROWS: [string, Mark, Mark, string][] = [
  ["Needs you to speak or own a microphone", "no", "yes", "Walkcast speaks the narration itself."],
  ["Needs editing afterwards", "no", "some", "Screen recordings usually need trims and retakes."],
  ["Same result every time you re-record", "yes", "no", "Re-run after a redesign and the tour updates."],
  ["Captions and transcript included", "yes", "some", "Walkcast writes WebVTT captions timed to the voice."],
  ["Records pages behind a login", "yes", "yes", "Walkcast signs in with a test account you provide."],
  ["Shows your desktop, other tabs or notifications", "no", "yes", "Walkcast records its own browser only."],
  ["Explains why something happened", "no", "yes", "A human narrator can give reasons and opinions."],
  ["Records desktop apps", "no", "yes", "Walkcast is for websites and web apps."],
];

function MarkCell({ m }: { m: Mark }) {
  if (m === "yes") return <span className="mark yes"><Check size={15} /> Yes</span>;
  if (m === "no") return <span className="mark no"><X size={15} /> No</span>;
  return <span className="mark some"><Minus size={15} /> Often</span>;
}

export function ComparePage() {
  return (
    <Doc path="/compare/screen-recording" eyebrow="Compare">
      <h1>
        Walkcast vs screen recording. <span className="dim">When each one is the right tool.</span>
      </h1>
      <p className="answer">
        <strong>Short answer:</strong> use Walkcast when you want a consistent, captioned tour of a website that you can regenerate after every change, without
        speaking or editing. Use a screen recorder (Loom, OBS, Xbox Game Bar) when you need your own voice and opinions, a desktop app, or a one-off explanation.
      </p>

      <h2>Side by side</h2>
      <div className="table-scroll">
        <table className="compare">
          <thead>
            <tr>
              <th>Question</th>
              <th>Walkcast</th>
              <th>Screen recording</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([q, a, b, note]) => (
              <tr key={q}>
                <td>{q}</td>
                <td><MarkCell m={a} /></td>
                <td><MarkCell m={b} /></td>
                <td className="muted">{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Choose Walkcast when</h2>
      <ul>
        <li>You need the same product tour for onboarding, a help center or a sales page, and you want to refresh it after each release.</li>
        <li>You want captions and a transcript without doing them by hand.</li>
        <li>You are handing a site over to a client and want a walkthrough they can watch without a call.</li>
        <li>You need QA evidence: a recorded pass over the site with each page's HTTP status.</li>
      </ul>

      <h2>Choose a screen recorder when</h2>
      <ul>
        <li>The value is your commentary: feedback, a code review, a personal explanation.</li>
        <li>You are recording a desktop application, a game, or several apps at once.</li>
        <li>You need to show something Walkcast will not do, such as submitting a form. After signing in, Walkcast only follows links.</li>
      </ul>

      <h2>Cost</h2>
      <p>
        Walkcast is free and MIT licensed, with no seat limits or watermark. It runs on your PC, so the only cost is the few minutes of CPU a recording takes.
      </p>
    </Doc>
  );
}

/* ------------------------------------------------------------------ faq */

export function FaqPage() {
  const all = [...FAQ, ...MORE_FAQ];
  return (
    <Doc path="/faq" eyebrow="FAQ">
      <h1>
        Walkcast questions. <span className="dim">Every answer in one place.</span>
      </h1>
      <dl className="faq-list">
        {all.map(([q, a]) => (
          <div key={q} id={q.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}>
            <dt>
              <h2>{q}</h2>
            </dt>
            <dd>{a}</dd>
          </div>
        ))}
      </dl>
    </Doc>
  );
}

/* ------------------------------------------------------------------ download */

export function DownloadPage() {
  return (
    <Doc path="/download" eyebrow="Download">
      <h1>
        Download Walkcast. <span className="dim">Free, version {VERSION}.</span>
      </h1>
      <div className="dl-row">
        <a className="dl-tile" href={WINDOWS_EXE_URL}>
          <WindowsIcon width={22} height={22} />
          <span>
            <b>Windows installer (.exe)</b>
            <small>Recommended · installs for your account, no admin rights · about 56 MB</small>
          </span>
        </a>
        <a className="dl-tile" href={WINDOWS_MSI_URL}>
          <WindowsIcon width={22} height={22} />
          <span>
            <b>Windows package (.msi)</b>
            <small>For IT: installs for every user · about 87 MB</small>
          </span>
        </a>
        <a className="dl-tile" href={LINUX_APPIMAGE_URL}>
          <LinuxIcon width={22} height={22} />
          <span>
            <b>Linux AppImage</b>
            <small>Most x86_64 distributions, no install step · about 161 MB</small>
          </span>
        </a>
        <a className="dl-tile" href={LINUX_DEB_URL}>
          <LinuxIcon width={22} height={22} />
          <span>
            <b>Linux package (.deb)</b>
            <small>Debian, Ubuntu and derivatives · about 97 MB</small>
          </span>
        </a>
      </div>

      <h2>Requirements</h2>
      <ul>
        <li>Windows 10 or 11 (64-bit), macOS 12+ on Apple Silicon, or a 64-bit Linux distribution.</li>
        <li>About 600 MB of disk: the app, plus the recording browser (Chromium) it downloads once on first launch.</li>
        <li>An internet connection to reach the sites you record. Everything else runs locally; ffmpeg and the voices are included.</li>
      </ul>

      <h2>Windows SmartScreen</h2>
      <p>
        The installer is not code-signed yet, so Windows may show "Windows protected your PC". Choose <strong>More info</strong>, then <strong>Run anyway</strong>.
        The installers are built in public by GitHub Actions from the tagged source; every release and its build log is on{" "}
        <a href={RELEASES_URL}>GitHub Releases</a>.
      </p>

      <h2>Uninstall</h2>
      <p>Settings → Apps → Installed apps → Walkcast → Uninstall. Recordings in your app data folder are kept until you delete them.</p>

      <h2>macOS and Linux</h2>
      <p>
        The Mac build is not notarized yet, so macOS blocks the first launch. Right-click Walkcast in Applications and choose <strong>Open</strong>; on
        macOS 15 or later, open it once, then go to System Settings → Privacy &amp; Security and choose <strong>Open Anyway</strong>. On Linux, make the
        AppImage executable (<code>chmod +x</code>) and run it, or install the .deb. You can also run Walkcast from source with Node.js 22, Rust and
        ffmpeg: see the <a href={`${REPO_URL}#quick-start`}>README</a>.
      </p>
    </Doc>
  );
}

/* ------------------------------------------------------------------ privacy */

export function PrivacyPage() {
  return (
    <Doc path="/privacy" eyebrow="Privacy">
      <h1>
        What stays on your PC. <span className="dim">Nearly everything.</span>
      </h1>
      <p className="answer">
        <strong>Short answer:</strong> Walkcast runs on your own computer. Recordings, the recording browser and the passwords you type stay there. The app has no
        analytics and no telemetry. The desktop app never uploads a recording.
      </p>

      <h2>What never leaves your PC</h2>
      <ul>
        <li>Your recordings: video, narration, captions and traces are files in the app's folder.</li>
        <li>Passwords: held in memory for the run, then dropped. Files on disk show a placeholder; the narration never reads them out.</li>
        <li>The narration voice: spoken offline by ffmpeg's built-in voices, or by Windows SAPI on Windows.</li>
      </ul>

      <h2>The one thing that does leave your PC</h2>
      <p>
        A share link. If you publish one, the recording is served by the server you run — the desktop app bundles one, and a
        hosted install keeps its media in S3 — and it stays reachable at that link until you stop it. Nothing else about a
        recording leaves the machine, and the app never sends it anywhere on its own.
      </p>

      <h2>The network requests it does make</h2>
      <table>
        <thead>
          <tr>
            <th>To</th>
            <th>When</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>The site you record</td><td>During a recording</td><td>To load its pages, like any browser.</td></tr>
          <tr><td>Playwright's download servers</td><td>Once, on first launch</td><td>To fetch the recording browser (Chromium).</td></tr>
          <tr><td>Supabase</td><td>Only if you create an account or sign in</td><td>Accounts are optional; without one nothing is sent.</td></tr>
          <tr><td>GitHub</td><td>When you download an update</td><td>Installers are published as GitHub releases.</td></tr>
        </tbody>
      </table>

      <h2>This website</h2>
      <p>
        walkcast.kunjshah.in is a static page served by Vercel. It sets no cookies and loads no trackers; Vercel keeps standard server logs. Fonts load from Google
        Fonts.
      </p>

      <h2>Source</h2>
      <p>
        Every claim here can be checked: Walkcast is open source under the MIT license at <a href={REPO_URL}>github.com/KunjShah95/walkcast</a>.
      </p>
    </Doc>
  );
}

export const DOC_PAGES: Record<string, () => ReactNode> = {
  "/guides": GuidesIndexPage,
  "/guides/narrated-website-walkthrough": GuidePage,
  "/guides/product-demo-video": ProductDemoPage,
  "/guides/website-tutorial-video": WebsiteTutorialPage,
  "/compare/screen-recording": ComparePage,
  "/compare/loom": LoomComparePage,
  "/compare/screen-studio": ScreenStudioComparePage,
  "/compare/scribe": ScribeComparePage,
  "/lab": LabPage,
  "/pricing": PricingPage,
  "/faq": FaqPage,
  "/download": DownloadPage,
  "/privacy": PrivacyPage,
};