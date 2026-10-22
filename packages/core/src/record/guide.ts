import { clock } from "./transcript.ts";

/**
 * The walkthrough as a step-by-step guide.
 *
 * Some readers want to skim, not watch: a support article, an onboarding doc, a ticket. This
 * is the same visit as numbered steps, each with a picture of the screen at that moment. The
 * pictures of actions are taken just before the action, with the pointer on the control and a
 * ring around it, so the annotation is the recording's own, not drawn on afterwards. A field is
 * pictured before anything is typed into it, so a guide never shows what was typed.
 */

/** One action the recorder took, as `recording.json` keeps it. Seconds are video time. */
export interface GuideAction {
  at: number;
  kind: "click" | "fill";
  /** The control's accessible name, as the recorder saw it. */
  name: string;
  /** The page it happened on. */
  url: string;
  /** Picture of the screen just before the action, relative to the recording folder. */
  shot?: string;
  /** For a fill: true when the field was a password, so the guide says so instead of a value. */
  secret?: boolean;
}

export interface GuidePage {
  url: string;
  title?: string;
  status?: number | null;
  screenshot?: string;
  /** Seconds into the video when this page was opened, when the caller knows it. */
  at?: number;
}

export interface GuideStep {
  n: number;
  /** Seconds into the video, when known. */
  at?: number;
  title: string;
  detail?: string;
  image?: string;
}

/** The control, quoted the way a guide names it; a nameless one is described by what it is. */
function quoted(name: string, kind: GuideAction["kind"]): string {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 80);
  if (clean) return `“${clean}”`;
  return kind === "fill" ? "the field" : "the button";
}

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

/**
 * The steps, in the order they happened: each page the visit opened, and each click and fill
 * on it. A page with actions of its own is opened once, then acted on; a page that was only
 * looked at is one step with its picture.
 */
export function guideSteps(pages: GuidePage[], actions: GuideAction[]): GuideStep[] {
  const steps: GuideStep[] = [];
  const add = (s: Omit<GuideStep, "n">) => steps.push({ n: steps.length + 1, ...s });
  const byPage = new Map<string, GuideAction[]>();
  for (const a of actions) {
    const key = pathOf(a.url);
    byPage.set(key, [...(byPage.get(key) ?? []), a]);
  }
  const used = new Set<GuideAction>();
  for (const [i, p] of pages.entries()) {
    const title = p.title?.trim() || pathOf(p.url);
    add({
      title: i === 0 ? `Open ${title}` : `Go to ${title}`,
      detail: `${p.url}${p.status ? ` · ${p.status}` : ""}`,
      ...(p.at !== undefined ? { at: p.at } : {}),
      ...(p.screenshot ? { image: p.screenshot } : {}),
    });
    for (const a of byPage.get(pathOf(p.url)) ?? []) {
      if (used.has(a)) continue;
      used.add(a);
      add(actionStep(a));
    }
  }
  // Actions on a page that was never recorded as a visit (a sign-in form before the walk).
  const rest = actions.filter((a) => !used.has(a)).sort((a, b) => a.at - b.at);
  if (rest.length) {
    // They happened first: the sign-in comes before the pages it unlocked.
    const lead = rest.map((a, i) => ({ n: i + 1, ...actionStep(a) }));
    return [...lead, ...steps.map((s) => ({ ...s, n: s.n + lead.length }))];
  }
  return steps;
}

function actionStep(a: GuideAction): Omit<GuideStep, "n"> {
  const title =
    a.kind === "click"
      ? `Click ${quoted(a.name, "click")}`
      : a.secret
        ? `Enter your password in ${quoted(a.name, "fill")}`
        : `Fill in ${quoted(a.name, "fill")}`;
  return { at: a.at, title, detail: `On ${pathOf(a.url)} at ${clock(a.at)} in the video`, ...(a.shot ? { image: a.shot } : {}) };
}

/** The guide as Markdown, with each picture linked from `imageBase` (where the files are served). */
export function guideMarkdown(o: { url: string; steps: GuideStep[]; imageBase: string; createdAt?: string }): string {
  const host = hostOf(o.url);
  const lines = [`# How to: ${host}`, "", `A step-by-step guide recorded by Walkcast from ${o.url}${o.createdAt ? ` on ${o.createdAt.slice(0, 10)}` : ""}.`, ""];
  for (const s of o.steps) {
    lines.push(`## ${s.n}. ${s.title}`, "");
    if (s.detail) lines.push(s.detail, "");
    if (s.image) lines.push(`![Step ${s.n}: ${s.title.replace(/[[\]]/g, "")}](${o.imageBase}${encodeURIComponent(s.image)})`, "");
  }
  if (!o.steps.length) lines.push("_This walkthrough has no steps to show._", "");
  else if (o.steps.some((s) => s.image)) lines.push("_The step pictures are served from the recording, so they load while it is available._", "");
  return lines.join("\n");
}

/**
 * The guide as one HTML page: readable on screen, and printable to PDF as one step per block.
 * Every string from the recorded site is escaped; the page loads nothing but its own pictures.
 */
export function guideHtml(o: { url: string; steps: GuideStep[]; imageBase: string; createdAt?: string }): string {
  const host = hostOf(o.url);
  const steps = o.steps
    .map(
      (s) => `<section class="step">
  <h2><span class="n">${s.n}</span>${esc(s.title)}</h2>
  ${s.detail ? `<p class="detail">${esc(s.detail)}</p>` : ""}
  ${s.image ? `<img src="${esc(o.imageBase + encodeURIComponent(s.image))}" alt="${esc(`Step ${s.n}: ${s.title}`)}">` : ""}
</section>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>How to: ${esc(host)}</title>
<style>
  :root { color-scheme: light; --ink:#1e1a16; --muted:#6b6257; --line:#e5ddcf; --signal:#1d5e58; --paper:#fbf8f3; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); color: var(--ink); font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 920px; margin: 0 auto; padding: 48px 20px 80px; }
  header h1 { margin: 0; font-size: clamp(28px, 4vw, 40px); letter-spacing: -0.03em; line-height: 1.1; }
  header p { margin: 10px 0 0; color: var(--muted); }
  .step { margin-top: 40px; padding-top: 28px; border-top: 1px solid var(--line); break-inside: avoid; }
  .step h2 { display: flex; align-items: center; gap: 12px; margin: 0; font-size: 20px; letter-spacing: -0.015em; }
  .n { display: inline-grid; place-items: center; flex: none; width: 30px; height: 30px; border-radius: 50%; background: var(--signal); color: #fff; font-size: 14px; }
  .detail { margin: 6px 0 0 42px; color: var(--muted); font-size: 14px; overflow-wrap: anywhere; }
  .step img { display: block; width: 100%; height: auto; margin-top: 16px; border-radius: 12px; border: 1px solid var(--line); box-shadow: 0 18px 40px -28px rgba(30,26,22,.45); }
  footer { margin-top: 56px; color: var(--muted); font-size: 13px; }
  @media print { body { background: #fff; } main { padding: 0; } .step img { box-shadow: none; } }
</style>
</head>
<body>
<main>
<header>
  <h1>How to: ${esc(host)}</h1>
  <p>${o.steps.length} step${o.steps.length === 1 ? "" : "s"}, recorded from <span>${esc(o.url)}</span>${o.createdAt ? ` on ${esc(o.createdAt.slice(0, 10))}` : ""}.</p>
</header>
${steps || "<p>This walkthrough has no steps to show.</p>"}
<footer>Recorded by Walkcast. Every step is something the browser actually did.</footer>
</main>
</body>
</html>
`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
