import { PRICING_FAQ } from "../content.ts";
import { Doc } from "./Doc.tsx";

/**
 * The pricing page. It exists because "free" is the claim that has to be checked, and because
 * an agent comparing tools on a buyer's behalf cannot read a price out of a JavaScript bundle.
 * The same facts are published at /pricing.md for exactly that reason.
 */
export function PricingPage() {
  return (
    <Doc path="/pricing" eyebrow="Pricing">
      <h1>
        Walkcast pricing. <span className="dim">The price is zero.</span>
      </h1>
      <p className="answer">
        <strong>Short answer:</strong> Walkcast is free in full: one download, every feature, no trial that expires. It
        is MIT licensed and the source is public. The only costs are the download, about 600 MB of disk, and the CPU
        for the minute or two a recording takes.
      </p>

      <h2>What it costs</h2>
      <table>
        <thead>
          <tr>
            <th>Thing</th>
            <th>Price</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Walkcast, every feature</td><td>$0 — MIT licensed, no paid tier</td></tr>
          <tr><td>Seats</td><td>Unlimited. There is no per-user pricing because there is no account system.</td></tr>
          <tr><td>Recordings per day</td><td>No limit. The only ceiling is your machine.</td></tr>
          <tr><td>Pages per recording</td><td>Up to 30, on one site.</td></tr>
          <tr><td>Watermark</td><td>None.</td></tr>
          <tr><td>Cloud narration voices</td><td>Optional. Use your own ElevenLabs or OpenAI key, or the built-in offline voices, which cost nothing.</td></tr>
          <tr><td>Disk</td><td>About 600 MB: the app plus the recording browser it downloads once.</td></tr>
          <tr><td>Network</td><td>Only the sites you record, and the voice provider you choose. The app uploads nothing; a share link is served by the server you run.</td></tr>
        </tbody>
      </table>

      <h2>Why it is free</h2>
      <p>
        Walkcast is MIT licensed, so you can use it for work and fork it, and run it on your own machines. The app is a
        local desktop program: the recording happens on your computer, in your browser, and the files are written to your
        folder. There is no server to pay for, and nowhere for the app to upload anything.
      </p>
      <p>
        There is no plan for a paid tier, and every feature is in the free app. If you need something the app does not do
        today, that is a bug or a missing feature to report:{" "}
        <a href="https://github.com/KunjShah95/walkcast/issues" rel="noopener">
          open an issue
        </a>
        .
      </p>

      <h2>What the alternatives charge</h2>
      <p>
        Prices checked on 20 October 2026: Loom's paid seats start at $18 per user
        per month, Screen Studio is $29 per month or $108 per year, and Scribe's Pro Personal plan is $23 per user per
        month. Each of those is a fair tool for a different job. The comparisons are{" "}
        <a href="/compare/loom">Loom</a>, <a href="/compare/screen-studio">Screen Studio</a> and{" "}
        <a href="/compare/scribe">Scribe</a>, with the sources.
      </p>

      <h2>Questions people ask</h2>
      <dl className="faq-list">
        {PRICING_FAQ.map(([q, a]) => (
          <div key={q} id={q.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}>
            <dt>
              <h3>{q}</h3>
            </dt>
            <dd>{a}</dd>
          </div>
        ))}
      </dl>

      <h2>Pricing in plain text</h2>
      <p>
        The same facts are published as{" "}
        <a href="/pricing.md" rel="noopener">
          pricing.md
        </a>
        , so an agent comparing tools on someone's behalf can read the price without running any
        JavaScript.
      </p>
    </Doc>
  );
}
