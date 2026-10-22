import { Check, Minus, X } from "lucide-react";
import { COMPARE_FAQ, COMPARES, type Compare, type Verdict } from "../content.ts";
import { Doc } from "./Doc.tsx";

function MarkCell({ m }: { m: Verdict }) {
  if (m === "yes") return <span className="mark yes"><Check size={15} /> Yes</span>;
  if (m === "no") return <span className="mark no"><X size={15} /> No</span>;
  return <span className="mark some"><Minus size={15} /> Partly</span>;
}

/**
 * One comparison page, built from the data in content.ts. The shape is deliberate: it opens with
 * a one-paragraph answer, states the competitor's price with the date it was checked, says what
 * the competitor is genuinely good at, and only then compares. A comparison that flatters us is
 * a comparison engines discount and readers distrust.
 */
function CompareArticle({ compare }: { compare: Compare }) {
  const faq = COMPARE_FAQ[compare.path] ?? [];
  return (
    <Doc path={compare.path} eyebrow="Compare">
      <h1>
        {compare.them} alternative: <span className="dim">Walkcast, compared fairly.</span>
      </h1>
      <p className="answer">
        <strong>Short answer:</strong> Walkcast is a free, open-source alternative to {compare.them} that records your
        website rather than your screen. It signs in, walks the pages and hands back an MP4 with narration, captions and
        a transcript. Regenerate it after every change. But {compare.them} is the better tool for{" "}
        {compare.theyAreGoodAt[0]?.replace(/^./, (c) => c.toLowerCase()).replace(/:\s*/, ", ")} We are not trying to say{" "}
        {compare.them} is bad.
      </p>

      <h2>What {compare.them} costs</h2>
      <p>
        {compare.price} Prices checked on {compare.priceChecked} on{" "}
        <a href={compare.themUrl} rel="nofollow noopener" target="_blank">
          {compare.them}'s own pricing page
        </a>
        . Walkcast is free and MIT licensed, with unlimited seats. The video carries no watermark.
      </p>

      <h2>Where {compare.them} is better</h2>
      <p>It is worth being straight about this, because it decides whether you should use {compare.them} instead:</p>
      <ul>
        {compare.theyAreGoodAt.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>

      <h2>Side by side</h2>
      <div className="table-scroll">
        <table className="compare">
          <thead>
            <tr>
              <th>Question</th>
              <th>Walkcast</th>
              <th>{compare.them}</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {compare.rows.map(([q, a, b, note]) => (
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

      <h2>Choose {compare.them} when</h2>
      <ul>
        {compare.chooseThem.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>

      <h2>Choose Walkcast when</h2>
      <ul>
        {compare.chooseUs.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>

      <h2>Facts, with sources</h2>
      <ul className="sources">
        {compare.facts.map(([claim, source]) => (
          <li key={claim}>
            {claim}{" "}
            <a href={source} rel="nofollow noopener" target="_blank">
              Source
            </a>
          </li>
        ))}
      </ul>

      <h2>Questions people ask</h2>
      <dl className="faq-list">
        {faq.map(([q, a]) => (
          <div key={q} id={q.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}>
            <dt>
              <h3>{q}</h3>
            </dt>
            <dd>{a}</dd>
          </div>
        ))}
      </dl>

      <h2>Try it and decide</h2>
      <p>
        The fastest way to settle this is to record the same page with both tools and watch them side by side. Walkcast is
        a{" "}
        <a href="/download">free download for Windows, Mac and Linux</a>. It requires no account, so the only thing it
        costs you is the time to try it.
      </p>
    </Doc>
  );
}

export function LoomComparePage() {
  return <CompareArticle compare={COMPARES[0]!} />;
}
export function ScreenStudioComparePage() {
  return <CompareArticle compare={COMPARES[1]!} />;
}
export function ScribeComparePage() {
  return <CompareArticle compare={COMPARES[2]!} />;
}
