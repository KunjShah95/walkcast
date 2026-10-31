import type { ReactNode } from "react";
import { AUTHOR, ROUTES, UPDATED } from "../content.ts";
import { VERSION } from "../site.ts";
import { DownloadButton } from "../ui.tsx";

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
