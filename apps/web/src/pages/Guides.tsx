import { AUTHOR, GUIDE_STEPS, GUIDES, ROUTES, UPDATED } from "../content.ts";
import { DownloadButton } from "../ui.tsx";
import { Doc } from "./Doc.tsx";

/**
 * The guides index. It exists so that every guide has one parent: a hub for readers, and a
 * `CollectionPage` with an `ItemList` for engines that want the whole set in one structure.
 */
export function GuidesIndexPage() {
  const route = ROUTES.find((r) => r.path === "/guides")!;
  return (
    <article className="doc">
      <div className="wrap doc-wrap">
        <nav className="crumbs" aria-label="Breadcrumb">
          <a href="/">Walkcast</a>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{route.label}</span>
        </nav>
        <p className="eyebrow">
          <span className="eyebrow-n">Guides</span>
          Updated <time dateTime={UPDATED}>{new Date(UPDATED + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</time> · by{" "}
          <a href={AUTHOR.url} target="_blank" rel="noopener">{AUTHOR.name}</a>
        </p>

        <h1>
          Walkcast guides. <span className="dim">Three jobs, done the same way.</span>
        </h1>
        <p className="answer">
          <strong>Short answer:</strong> every guide ends the same way. Install Walkcast, paste the link of a site you
          own or may test and press Record. You get an MP4 with a spoken voice-over, WebVTT captions and a transcript. The
          guide tells you which of the three jobs you are doing and what to press.
        </p>

        <h2>Guides</h2>
        <ul className="guide-list">
          {GUIDES.map((g) => (
            <li key={g.path}>
              <a href={g.path}>
                <b>{g.label}</b>
                <span className="muted"> · {g.minutes}</span>
              </a>
              <p>{g.blurb}</p>
            </li>
          ))}
        </ul>

        <h2>Which one do I want?</h2>
        <table>
          <thead>
            <tr>
              <th>If you want to…</th>
              <th>Read</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Show a customer how your product works, from the real product</td>
              <td><a href="/guides/product-demo-video">How to make a product demo video</a></td>
            </tr>
            <tr>
              <td>Teach a flow that only works when you are signed in</td>
              <td><a href="/guides/website-tutorial-video">How to make a website tutorial video</a></td>
            </tr>
            <tr>
              <td>Put a walkthrough on a help centre page and keep it current</td>
              <td><a href="/guides/narrated-website-walkthrough">How to make a narrated website walkthrough</a></td>
            </tr>
            <tr>
              <td>Find out why your browser AI agent keeps failing</td>
              <td><a href="/lab">Walkcast Lab</a></td>
            </tr>
          </tbody>
        </table>

        <h2>What every guide assumes</h2>
        <ul>
          <li>
            A Windows 10 or 11 PC (64-bit) or a 64-bit Linux machine.
          </li>
          <li>The address of a site you own, or one whose owner asked you to test it. Walkcast asks you to confirm this.</li>
          <li>For pages behind a login: a username and password for a test account. Two-step email-then-password forms work.</li>
        </ul>

        <aside className="doc-cta">
          <div>
            <b>Make your first walkthrough</b>
            <p>Free for Windows and Linux. No account needed.</p>
          </div>
          <DownloadButton />
        </aside>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ product demo */

/**
 * The guide for the largest head term the data showed: "product demo video". The angle is
 * that the demo is the real product, not a mockup, and that it can be re-recorded after a release.
 */
export function ProductDemoPage() {
  return (
    <Doc path="/guides/product-demo-video" eyebrow="Guide">
      <h1>
        How to make a product demo video. <span className="dim">From your live app, in about five minutes.</span>
      </h1>
      <p className="answer">
        <strong>Short answer:</strong> install Walkcast, paste the URL of your app and add the sign-in details if your
        product needs one. Confirm you may test it, then press Record. A real browser signs in, walks up to 30 pages the
        way a new user would and hands back the whole visit as an MP4 with a spoken voice-over, WebVTT captions and a
        transcript. Your part is the link and the Record button; the browser does the walking and the talking.
      </p>

      <h2>What a product demo video needs to be</h2>
      <p>
        Most product demo videos fail for the same reason: they show a mockup. A viewer can tell, and a viewer who
        spots the seam stops trusting the rest of the video. The other common failure is that the demo is a recording,
        which means it is out of date the moment the interface changes and somebody has to book a slot to re-record it.
      </p>
      <p>
        A demo built from the running product avoids both. It is the actual interface, and it can be regenerated on
        demand. That is the whole idea behind Walkcast: the video is a by-product of the browser doing its job, not a
        performance.
      </p>

      <h2>What you need</h2>
      <ul>
        <li>Windows 10 or 11 (64-bit), or a 64-bit Linux machine.</li>
        <li>The address of your app, and permission to record it. Walkcast asks you to confirm you own it or are authorised to test it.</li>
        <li>If your app needs a login: a username and password for a test account. Two-step email-then-password forms work.</li>
        <li>A test account with realistic data. Empty states and placeholder rows make a dull demo.</li>
      </ul>

      <h2>Steps</h2>
      <ol className="steps">
        {GUIDE_STEPS["/guides/product-demo-video"]!.map((s, i) => (
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
          <tr><td><code>transcript.txt</code></td><td>The narration as plain text.</td></tr>
          <tr><td>Page list</td><td>Every page visited, with its title and HTTP status.</td></tr>
        </tbody>
      </table>

      <h2>How long should a product demo video be?</h2>
      <p>
        Long enough to show the value and short enough to be finished. For most products, four to eight pages is the
        sweet spot: long enough to prove the thing works, short enough that a prospect on a sales call will watch it
        through. The maximum is 30 pages. If your product needs more than that, record the flow twice rather than making
        one long video: two focused videos are easier to share and easier to re-record than one.
      </p>

      <h2>Make it look like your product, not a template</h2>
      <ul>
        <li>
          <b>Start from the landing page.</b> The first page a viewer sees sets the expectation for the rest.
        </li>
        <li>
          <b>Use a test account with real-looking data.</b> The narration reads page titles and what the browser did, so
          clear page titles produce clear narration.
        </li>
        <li>
          <b>Use your own voice if the brand needs it.</b> Record it in the browser, or add a voice key and pick from
          natural voices with a spoken sample.
        </li>
        <li>
          <b>Do not script the narration by hand.</b> It is written from the browser's own trace: the page it opened, the
          field it typed into, what it clicked and what the site answered. That is why it cannot describe a feature that
          is not on screen.
        </li>
      </ul>

      <h2>Where to put the video</h2>
      <p>
        A product demo earns its keep in three places: your pricing page, your onboarding email, and a sales deck. All
        three take the same MP4. Embed it with its captions so people who cannot play audio can still follow it:
      </p>
      <pre className="code-block">
        <code>{`<video controls playsinline preload="metadata">
  <source src="recording.mp4" type="video/mp4">
  <track kind="captions" src="captions.vtt" srclang="en" label="English" default>
</video>`}</code>
      </pre>

      <h2>Compare the alternatives</h2>
      <ul>
        <li><a href="/compare/loom">Loom alternative</a>: if you have been recording your screen instead of your site.</li>
        <li><a href="/compare/screen-studio">Screen Studio alternative</a>: if you want the polished screencast look, and you are on a Mac.</li>
        <li><a href="/compare/scribe">Scribe alternative</a>: if you want screenshots and steps rather than a video.</li>
      </ul>
    </Doc>
  );
}

/* ------------------------------------------------------------------ website tutorial */

/** The guide for "website tutorial video maker" and the walkthrough-shaped long tail. */
export function WebsiteTutorialPage() {
  return (
    <Doc path="/guides/website-tutorial-video" eyebrow="Guide">
      <h1>
        How to make a website tutorial video. <span className="dim">Without a screen recorder.</span>
      </h1>
      <p className="answer">
        <strong>Short answer:</strong> install Walkcast, paste the link of the page the tutorial starts on and add the
        sign-in if the flow is behind a login. Press Record. You get an MP4 of the real pages with a spoken voice-over,
        WebVTT captions and a transcript. It keeps itself current, because you can re-record it in a minute after every
        change.
      </p>

      <h2>Why record the site and not the screen</h2>
      <p>
        A screen-recorded tutorial shows your desktop: your tabs, your notifications, your bookmarks bar, and whatever
        else you happened to have open. The viewer is watching your workspace, not your product. Worse, the recording
        rots. The page you explained has moved on, the wording has changed, and now the tutorial is wrong in a way
        nobody notices until a customer reports it.
      </p>
      <p>
        Recording the site itself removes both problems. The viewer sees the product. And because the video is produced
        by browsing rather than by filming, regenerating it after a redesign is a single command.
      </p>

      <h2>What you need</h2>
      <ul>
        <li>Windows 10 or 11 (64-bit), or a 64-bit Linux machine.</li>
        <li>The address of the site, and permission to record it.</li>
        <li>For a tutorial behind a login: a test account. Two-step email-then-password forms work.</li>
      </ul>

      <h2>Steps</h2>
      <ol className="steps">
        {GUIDE_STEPS["/guides/website-tutorial-video"]!.map((s, i) => (
          <li key={s.title} id={`step-${i + 1}`}>
            <h3>
              {i + 1}. {s.title}
            </h3>
            <p>{s.text}</p>
          </li>
        ))}
      </ol>

      <h2>Where people put website tutorials</h2>
      <table>
        <thead>
          <tr>
            <th>Place</th>
            <th>What it needs</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Help centre article</td><td>Captions, a transcript, and an MP4 that plays in the page.</td></tr>
          <tr><td>Onboarding email</td><td>A short tour of the first session, under two minutes.</td></tr>
          <tr><td>Sales or handover call</td><td>A link to watch instead of a live walk-through.</td></tr>
          <tr><td>Internal handover</td><td>A recording of the app as the new person will meet it, not as it was designed.</td></tr>
        </tbody>
      </table>

      <h2>Tips for a tutorial people finish</h2>
      <ul>
        <li>Start from the page a new visitor would land on, so the video has a beginning.</li>
        <li>Four to eight pages. A tutorial that outstays its welcome is a tutorial nobody finishes.</li>
        <li>Give the pages clear titles. The narration reads them, and a vague title produces a vague sentence.</li>
        <li>If the site asks for a CAPTCHA or a two-factor code, Walkcast stops and tells you. Use an account without 2FA for recording.</li>
      </ul>

      <h2>Embed it with captions</h2>
      <pre className="code-block">
        <code>{`<video controls playsinline preload="metadata">
  <source src="recording.mp4" type="video/mp4">
  <track kind="captions" src="captions.vtt" srclang="en" label="English" default>
</video>`}</code>
      </pre>

      <h2>Related</h2>
      <ul>
        <li><a href="/guides/narrated-website-walkthrough">The full narrated walkthrough guide</a>: the files, the embed, and why the narration is accurate.</li>
        <li><a href="/compare/screen-recording">Walkcast vs screen recording</a>: when a screen recorder is still the right call.</li>
        <li><a href="/faq">The FAQ</a>: platforms, logins, CAPTCHAs and output files.</li>
      </ul>
    </Doc>
  );
}
