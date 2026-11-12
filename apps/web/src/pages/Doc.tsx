import type { ReactNode } from "react";
import { AUTHOR, ROUTES, UPDATED, type Route } from "../content.ts";
import { VERSION } from "../site.ts";
import { trackSiteEvent } from "../analytics.ts";
import { DownloadButton } from "../ui.tsx";

/**
 * The three pages that turn a reader into a visitor: a guide (read), a comparison (consider) and
 * pricing (decide). Every document ends with the same three-step ladder; it is the cheapest
 * possible "one more page", and the site has exactly one of those.
 */
const NEXT: Record<string, readonly string[]> = {
  "/guides/narrated-website-walkthrough": ["/guides/product-demo-video", "/compare/loom", "/pricing"],
  "/guides/product-demo-video": ["/guides/narrated-website-walkthrough", "/compare/loom", "/download"],
  "/guides/website-tutorial-video": ["/guides/product-demo-video", "/compare/loom", "/pricing"],
  "/faq": ["/guides/narrated-website-walkthrough", "/compare/loom", "/pricing"],
  "/pricing": ["/download", "/compare/loom", "/compare/screen-studio", "/faq"],
  "/download": ["/guides/product-demo-video", "/pricing", "/faq"],
  "/privacy": ["/pricing", "/download", "/faq"],
  "/lab": ["/guides/narrated-website-walkthrough", "/compare/screen-recording", "/pricing"],
};
const DEFAULT_NEXT = ["/guides/product-demo-video", "/compare/loom", "/pricing"] as const;
const nextStepsFor = (path: string): Route[] =>
  (NEXT[path] ?? DEFAULT_NEXT)
    .map((p) => ROUTES.find((r) => r.path === p))
    .filter((r): r is Route => !!r);

/**
 * The shell every document page wears: the breadcrumb, the byline and date, the body, and a
 * closing call to action. Answer engines read the h1, the answer paragraph and the headings.
 */
export function Doc({
  path,
  eyebrow,
  children,
}: {
  path: string;
  eyebrow: string;
  children: ReactNode;
}) {
  const route = ROUTES.find((r) => r.path === path)!;
  return (
    <article className="doc">
      <div className="wrap doc-wrap">
        <nav className="crumbs" aria-label="Breadcrumb">
          <a href="/">Walkcast</a>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{route.label}</span>
        </nav>
        <p className="eyebrow">
          <span className="eyebrow-n">{eyebrow}</span>
          Updated <time dateTime={UPDATED}>{new Date(UPDATED + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</time> · by{" "}
          <a href={AUTHOR.url}>{AUTHOR.name}</a>
        </p>
        {children}
        {route.faq?.length ? (
          <section aria-labelledby="doc-faq">
            <h2 id="doc-faq">Questions people ask</h2>
            <dl className="faq-list">
              {route.faq.map(([q, a]) => (
                <div key={q} id={q.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}>
                  <dt>
                    <h3>{q}</h3>
                  </dt>
                  <dd>{a}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
        <nav className="next-steps" aria-label="Read these next">
          <p className="next-steps-eyebrow">Read these next</p>
          <div className="next-steps-grid">
            {nextStepsFor(path).map((r) => (
              <a key={r.path} className="next-step" href={r.path} onClick={() => trackSiteEvent("next_step_click", { from: path, to: r.path })}>
                <b>{r.label}</b>
                <span>{r.description}</span>
              </a>
            ))}
          </div>
        </nav>
        <aside className="doc-cta">
          <div>
            <b>Make your first walkthrough</b>
            <p>Free for Windows and Linux. Version {VERSION}.</p>
          </div>
          <DownloadButton />
        </aside>
      </div>
    </article>
  );
}
