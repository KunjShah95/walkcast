import { Doc } from "./Doc.tsx";

/**
 * "Interactive demo vs video demo". The search is a comparison between two formats, and almost
 * every page that ranks for it is written by a vendor that sells one of them. This page says so,
 * gives a way to choose that does not depend on a statistic, and states where Walkcast fits: it
 * makes the video side, and it cannot make a click-through demo. No figure from a vendor report is
 * repeated here, because none could be checked against its method.
 */
export function InteractiveVsVideoPage() {
  return (
    <Doc path="/guides/interactive-demo-vs-video" eyebrow="Guide">
      <h1>
        Interactive demo or video demo? <span className="dim">Choose by what the viewer has to do.</span>
      </h1>
      <p className="answer">
        <strong>Short answer:</strong> use an interactive demo when a visitor should drive the product and you want to see where
        they click. Use a video when they should watch and understand, as in onboarding, documentation, release notes and
        support. Either one goes out of date the day the product changes. A video made by a program that walks your live site can
        be made again after each release; Walkcast makes that kind of video, and it cannot make a click-through demo.
      </p>

      <h2>What each format is for</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Question</th>
              <th>Interactive demo</th>
              <th>Video demo</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>What does the viewer do?</td><td>Clicks through a replica of the product at their own pace.</td><td>Watches from start to end, or scrubs to the part they need.</td></tr>
            <tr><td>What do you learn about them?</td><td>Where they went, how far they got and, with a form, who they are.</td><td>Little. At most, how much of the video was played.</td></tr>
            <tr><td>Best for</td><td>Evaluators deciding whether to buy.</td><td>People learning to use something they already have.</td></tr>
            <tr><td>Who can use it</td><td>Anyone who can click, on a screen.</td><td>Anyone who can watch, with captions, in a feed, an email or a document.</td></tr>
            <tr><td>Effort to make</td><td>Capture, then edit each step by hand.</td><td>Record or generate, then add voice and captions.</td></tr>
            <tr><td>What happens when the product changes</td><td>Rebuild the affected steps.</td><td>Record again, or run the generator again.</td></tr>
          </tbody>
        </table>
      </div>

      <h2>What the published numbers can and cannot tell you</h2>
      <p>
        Most pages that compare the two formats are written by companies that sell one of them. Arcade, Navattic, Storylane and
        Walnut each publish on the question, and each sells demo software of one kind or another. That is not a reason to
        distrust the authors; it is a reason to read the method behind any figure, to check how the vendor defines a
        conversion or a win, and to remember that a customer who bought an interactive demo tool is not a random sample of
        buyers. We found no independent study that settles which format converts better.
      </p>
      <p>
        So this guide repeats none of those figures. The honest way to decide is to run both on your own page for a fixed
        period and compare the thing you care about: sign-ups, replies from sales, or support tickets.
      </p>

      <h2>The cost most teams do not budget: keeping it current</h2>
      <p>
        A demo is a copy of the product on the day someone made it. Each release that moves a button or renames a page makes the
        copy a little wrong, and usually nobody is assigned to notice. The result is a growing pile of small errors in the
        material a new customer sees first. We call it demo debt, and it is the same for both formats. What differs is the price of
        paying it down. An interactive demo is rebuilt by the person who made it. A walkthrough recorded by a program is run
        again, and the new version is identical in structure to the old one.
      </p>

      <h2>A simple way to choose</h2>
      <ol className="steps">
        <li>
          <h3>1. Decide what the viewer should do</h3>
          <p>If they should try the product, make an interactive demo. If they should understand it, make a video.</p>
        </li>
        <li>
          <h3>2. Decide who reads the result</h3>
          <p>
            A buyer comparing three vendors wants to click. A customer on day two wants to be shown. A support agent wants a link
            to paste into a ticket.
          </p>
        </li>
        <li>
          <h3>3. Count the releases</h3>
          <p>
            If the product changes every week, a format you can regenerate beats a format you must rebuild. If it changes twice
            a year, either will do.
          </p>
        </li>
        <li>
          <h3>4. Use both where both fit</h3>
          <p>
            An interactive demo on the pricing page for people evaluating you, and a narrated video in your documentation,
            onboarding emails and release notes for people learning the product.
          </p>
        </li>
      </ol>

      <h2>Where Walkcast fits</h2>
      <p>
        Walkcast opens your website in a real browser and signs in with a test account. It walks the pages and returns an MP4
        with a voice-over, captions, a transcript and a written guide. It is free and MIT licensed. It cannot track viewers,
        capture leads or run as a click-through, so it is the wrong tool for a sales team that needs those. For the interactive side,
        see how it compares with <a href="/compare/supademo">Supademo</a> and <a href="/compare/storylane">Storylane</a>; for
        the step-by-step guide side, <a href="/compare/guidde">Guidde</a> and <a href="/compare/scribe">Scribe</a>. The{" "}
        <a href="/compare">comparison index</a> lists them all, and the{" "}
        <a href="/guides/product-demo-video">product demo video guide</a> shows how to make the video.
      </p>

      <h2>Sources</h2>
      <p>These are vendor-published, and are listed so you can read the method for yourself.</p>
      <ul className="sources">
        <li>
          Arcade, on video against interactive demos.{" "}
          <a href="https://www.arcade.software/post/video-vs-interactive-demo" rel="nofollow noopener" target="_blank">
            arcade.software
          </a>
        </li>
        <li>
          Storylane, on interactive demos against product videos.{" "}
          <a href="https://www.storylane.io/blog/interactive-demos-vs-product-videos" rel="nofollow noopener" target="_blank">
            storylane.io
          </a>
        </li>
        <li>
          Navattic, State of the Interactive Product Demo 2026.{" "}
          <a href="https://www.navattic.com/report/state-of-the-interactive-product-demo-2026" rel="nofollow noopener" target="_blank">
            navattic.com
          </a>
        </li>
        <li>
          Walnut, on B2B demo platform trends.{" "}
          <a href="https://www.walnut.io/blog/product-demos/b2b-demo-platform-trends-2026/" rel="nofollow noopener" target="_blank">
            walnut.io
          </a>
        </li>
      </ul>
    </Doc>
  );
}
