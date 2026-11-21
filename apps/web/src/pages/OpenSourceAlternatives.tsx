import { ALTERNATIVE_TOOLS, ALTERNATIVES_CHECKED } from "../content.ts";

/** The tools in this roundup that also have a page of their own. */
const COMPARISON_PAGES: Record<string, string> = { Guidde: "/compare/guidde", Supademo: "/compare/supademo", Storylane: "/compare/storylane" };
import { REPO_URL } from "../site.ts";
import { Doc } from "./Doc.tsx";

/**
 * One honest page for four small "open source alternative" searches. The four tools do not do
 * the same job: two record and edit a screen, two build click-through demos, and Walkcast records
 * a live site to video. The page says that before it compares anything, because a reader who
 * needs a clickable demo should not be sold a video.
 */
export function OpenSourceAlternativesPage() {
  return (
    <Doc path="/compare/open-source-alternatives" eyebrow="Compare">
      <h1>
        Open source alternatives to Guidde, Tella, Storylane and Supademo.
      </h1>
      <p className="answer" id="compare-answer">
        <strong>Short answer:</strong> Walkcast is the open-source option in this group: MIT licensed, free and running
        on your own PC. It is not a like-for-like swap. Guidde and Tella record and edit a video of a person's screen;
        Storylane and Supademo build click-through demos a visitor drives. Walkcast drives your live website in a
        browser and returns a narrated MP4, captions, a transcript and a written guide. Pick it for a product tour, a
        tutorial or documentation. Pick the others when you need a clickable demo, a talking-head video or a timeline
        editor.
      </p>

      <h2>What each tool actually produces</h2>
      <p>
        The four names get grouped together because they all help explain software, but the outputs are different
        artefacts. Decide which artefact you need first; the tool choice follows from it.
      </p>
      <div className="table-scroll">
        <table className="compare">
          <thead>
            <tr>
              <th>Tool</th>
              <th>What it produces</th>
              <th>Free plan</th>
              <th>Paid entry price</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><b>Walkcast</b></td>
              <td>A narrated MP4 of a live website, plus captions, a transcript and a written guide.</td>
              <td>Free forever: MIT licensed, no seats, no watermark.</td>
              <td>None. There is no paid tier.</td>
            </tr>
            {ALTERNATIVE_TOOLS.map((t) => (
              <tr key={t.name}>
                <td><b>{t.name}</b></td>
                <td>{t.what}</td>
                <td>{t.free}</td>
                <td>{t.paid}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">
        Prices read from each vendor's own pricing page on {ALTERNATIVES_CHECKED}. They are list prices, per creator or
        per user where the vendor says so, and they change; follow the link before you buy.
      </p>

      {ALTERNATIVE_TOOLS.map((t) => (
        <section key={t.name} aria-labelledby={`tool-${t.name.toLowerCase()}`}>
          <h2 id={`tool-${t.name.toLowerCase()}`}>{t.name}, and where it is the better choice</h2>
          <p>
            {t.what} {t.goodAt} Prices and plan limits are on{" "}
            <a href={t.url} rel="nofollow noopener" target="_blank">
              {t.name}'s pricing page
            </a>
            .
          </p>
          <p>
            {COMPARISON_PAGES[t.name] && (
              <>
                <a href={COMPARISON_PAGES[t.name]}>Read the full {t.name} comparison</a>.{" "}
              </>
            )}
            Choose {t.name} when that output is what you need. Do not choose it expecting an open-source licence, a
            local-only workflow or no per-seat cost: none of those is what it sells.
          </p>
        </section>
      ))}

      <h2>Where Walkcast fits</h2>
      <p>
        Walkcast is a desktop app that opens your site in its own browser, signs in with a test account, visits the
        pages and records the visit. The narration is written from the browser's own trace, so it describes what
        happened on screen rather than a script someone hoped would happen.
      </p>
      <ul>
        <li>
          <b>A video tour of a live site.</b> An MP4 with an embedded caption track, a WebVTT file, a transcript and a
          list of every page with its HTTP status.
        </li>
        <li>
          <b>Pages behind a login.</b> It signs in with a test account you provide, holds the password in memory only
          and stops at CAPTCHA and two-factor prompts.
        </li>
        <li>
          <b>A written guide from the same visit.</b> The same recording renders as numbered steps with a picture of
          each page and click, which is the part that overlaps with Guidde and Scribe.
        </li>
        <li>
          <b>Regeneration after a release.</b> Because the video is produced by browsing, a redesign means another run,
          not another filming session.
        </li>
      </ul>

      <h2>What Walkcast does not do</h2>
      <p>
        Being clear about this is more useful than another feature table. Walkcast is not an interactive demo tool: the
        viewer watches a video, they do not click through a replica of your product. It does not record your screen,
        your camera or a desktop application. It has no timeline editor and no lead capture, no viewer analytics and no
        SSO. If any of those is the requirement, one of the four commercial tools above is the right purchase, and this
        page is not the one to decide from.
      </p>

      <h2>What the open-source licence actually buys you</h2>
      <ul>
        <li>
          <b>No seat maths.</b> There is no account system, so there is no per-creator or per-viewer price. The app is
          MIT licensed and the source is on{" "}
          <a href={REPO_URL} rel="noopener" target="_blank">
            GitHub
          </a>
          .
        </li>
        <li>
          <b>You can read the password handling.</b> The claim that a password stays in memory is checkable in the
          code, which matters when the alternative is handing a test account to a hosted service.
        </li>
        <li>
          <b>Recordings stay on your PC.</b> The app uploads nothing. A share link, if you publish one, is served by a
          server you run.
        </li>
        <li>
          <b>No vendor lock-in on the output.</b> You get ordinary files: MP4, WebM, WebVTT, WAV and plain text, not a
          library that only plays inside one product.
        </li>
      </ul>

      <h2>Facts, with sources</h2>
      <ul className="sources">
        <li>
          Guidde's free plan allows up to 25 how-to videos; Pro is $29 per creator a month or $19 billed yearly, and
          Business is $59 or $39 billed yearly.{" "}
          <a href="https://www.guidde.com/pricing" rel="nofollow noopener" target="_blank">
            Guidde pricing
          </a>
        </li>
        <li>
          Tella has no free plan after its 7-day Pro trial; Pro is $29 a month or $16 billed yearly, and Premium is $39
          or $24 billed yearly, per user.{" "}
          <a href="https://www.tella.com/pricing" rel="nofollow noopener" target="_blank">
            Tella pricing
          </a>
        </li>
        <li>
          Storylane's free plan includes one creator and one published demo; Starter is $50 a month or $40 billed
          yearly, and Growth is $625 or $500 billed yearly.{" "}
          <a href="https://www.storylane.io/pricing" rel="nofollow noopener" target="_blank">
            Storylane pricing
          </a>
        </li>
        <li>
          Supademo's free plan includes five guided demos; Scale is $50 a month or $38 billed yearly per creator, and
          Business is $249 or $199 billed yearly.{" "}
          <a href="https://supademo.com/pricing" rel="nofollow noopener" target="_blank">
            Supademo pricing
          </a>
        </li>
        <li>
          Walkcast is MIT licensed, has no paid tier and runs on Windows and Linux.{" "}
          <a href={REPO_URL} rel="noopener" target="_blank">
            Walkcast source
          </a>
        </li>
        <li>
          Wyzowl's 2026 survey of 266 marketers and consumers found that 96% have watched an explainer video to learn
          about a product or service, and 85% have been convinced to buy by watching a video.{" "}
          <a href="https://www.wyzowl.com/video-marketing-statistics/" rel="noopener" target="_blank">
            Wyzowl, State of Video Marketing 2026
          </a>
        </li>
      </ul>

      <h2>Try it and decide</h2>
      <p>
        The cheapest test is the same one every comparison page proposes: record the same page with two tools and watch
        them side by side. Walkcast is a{" "}
        <a href="/download">free download for Windows and Linux</a>, needs no account, and the{" "}
        <a href="/guides/product-demo-video">product demo guide</a> walks through the first recording. If what you
        actually need is a click-through demo, start with Storylane or Supademo instead; a video will not satisfy that
        requirement, however free it is.
      </p>
    </Doc>
  );
}
