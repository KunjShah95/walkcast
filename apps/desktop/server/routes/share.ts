import { extname } from "node:path";
import type { RecordingSummary } from "../../../../packages/core/src/data.ts";
import { guideHtml, guideMarkdown, guideSteps } from "../../../../packages/core/src/record/guide.ts";
import { hostOf } from "../../../../packages/core/src/record/insights.ts";
import { chaptersOf } from "../../../../packages/core/src/record/transcript.ts";
import { TYPES, readableWhen, sameToken, streamFile } from "../http.ts";
import { embedPage, sharePage } from "../pages.ts";
import type { Ctx, Route } from "./router.ts";

/**
 * Send a recording's step-by-step guide.
 *
 * Built from the summary the store already holds, not from the media folder: on object
 * storage that folder is a presigned redirect, and a guide is a document, not a download.
 * Pictures are linked through `imageBase`; when the media store answers a picture with a
 * redirect, the CSP has to name the storage origin or the browser blocks every image.
 */
export async function sendGuide({ req, res, json, secure, securityHeaders, deps: { siteUrl, siteUrlConfigured, exposed, media } }: Ctx, id: string, summary: RecordingSummary, format: string, imageBase: string): Promise<void> {
  const steps = guideSteps(summary.pages ?? [], summary.actions ?? []);
  const doc = { url: summary.url ?? "", steps, createdAt: summary.createdAt };
  if (format === "md" || format === "markdown") {
    // Pasted elsewhere, a relative picture link points nowhere: spell out this server. Its
    // configured address when it has one, never the Host header of a request from outside.
    // A loopback-only server with nothing configured is only reached by its own machine, and
    // there the Host header is the one address that is sure to be right.
    const origin = siteUrlConfigured || exposed ? siteUrl : `${secure ? "https" : "http"}://${req.headers.host ?? "127.0.0.1"}`;
    const body = guideMarkdown({ ...doc, imageBase: `${origin}${imageBase}` });
    res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store", ...securityHeaders });
    return void res.end(body);
  }
  if (format === "html") {
    // A picture request goes to imageBase, is redirected to the media store, and the final
    // URL is what CSP checks. Ask the store where the first picture really lives.
    let imgSrc = "'self'";
    const first = steps.find((s) => s.image)?.image;
    if (first) {
      const where = await media.locate(id, first);
      if (where && "redirect" in where) {
        try {
          imgSrc += ` ${new URL(where.redirect).origin}`;
        } catch {
          /* a malformed redirect is the store's problem; 'self' is the safe default */
        }
      }
    }
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      // The page holds text from the recorded site. It is escaped, and even so it may run
      // nothing and load nothing but its own pictures.
      "Content-Security-Policy": `default-src 'none'; img-src ${imgSrc}; style-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'`,
      "X-Robots-Tag": "noindex, nofollow",
      ...securityHeaders,
    });
    return void res.end(guideHtml({ ...doc, imageBase }));
  }
  return json(400, { error: "unknown format" });
}

// The public side of a share link: the page, and the media it plays.
const SHARE_VIEW = /^\/share\/([\w.-]+)\/([A-Za-z0-9_-]{20,64})\/?$/;
const SHARE_GUIDE = /^\/share\/([\w.-]+)\/([A-Za-z0-9_-]{20,64})\/guide\/?$/;
const SHARE_FILE = /^\/share\/([\w.-]+)\/([A-Za-z0-9_-]{20,64})\/([\w.-]+)$/;

/**
 * The shared page, or one of its files. SHARE_VIEW and SHARE_FILE can never match the same path
 * (two segments after /share/<id> against three), so trying the file pattern first and the page
 * pattern second is the old `shareFile ?? shareView`.
 */
const shareViewOrFile: Route["handler"] = async ({ req, res, url, json, send, redirect, securityHeaders, params, deps: { findRecording, media, store, siteUrl } }) => {
  const [, id, token, file] = params as unknown as [string, string, string, string | undefined];
  const found = await findRecording(id);
  const summary = found?.summary;
  if (!summary) return json(404, { error: "This link is not valid." });
  const share = (summary.shares ?? []).find((s) => sameToken(s.token, token));
  if (!share || Date.parse(share.expiresAt) <= Date.now()) return json(404, { error: "This link has expired." });
  if (file) {
    // Only the files this walkthrough published can be fetched through the link.
    const allowed = new Set(
      [
        summary.media.mp4,
        summary.media.webm,
        summary.media.video,
        summary.media.silent,
        summary.media.captions,
        summary.media.audio,
        ...summary.pages.map((p) => p.screenshot),
        ...(summary.actions ?? []).map((a) => a.shot),
      ].filter((f): f is string => Boolean(f)),
    );
    if (!allowed.has(file)) return json(404, { error: "not found" });
    const where = await media.locate(id, file);
    if (!where) return json(404, { error: "not found" });
    if ("redirect" in where) return redirect(where.redirect);
    return streamFile(req, res, where.path, TYPES[extname(file).toLowerCase()] ?? "application/octet-stream", "private, max-age=3600");
  }
  const base = `/share/${encodeURIComponent(id)}/${token}`;
  // A link made with no narration plays the no-voice copy only: the narrated mp4/webm sitting
  // next to it on disk is exactly what this link was asked to leave out.
  const sources = share.silent && summary.media.silent
    ? [{ url: `${base}/${summary.media.silent}`, type: "video/mp4" }]
    : [
        summary.media.mp4 ? { url: `${base}/${summary.media.mp4}`, type: "video/mp4" } : null,
        summary.media.webm ? { url: `${base}/${summary.media.webm}`, type: "video/webm" } : null,
        summary.media.mp4 || summary.media.webm ? null : summary.media.video ? { url: `${base}/${summary.media.video}`, type: "video/webm" } : null,
      ].filter((s): s is { url: string; type: string } => s !== null);
  if (sources.length === 0) return json(404, { error: "This walkthrough has no video to share." });
  const captions = summary.captions ?? [];
  // A chapter starts where the recorder opened a page, exactly as it does in the app.
  const chapters = chaptersOf(captions, hostOf(summary.url));
  // A picture of each page: the page says what the walkthrough contains, not only that it
  // exists. Only the pictures this walkthrough took are offered.
  const pictures = summary.pages.filter((p) => Boolean(p.screenshot)).map((p) => ({ url: `${base}/${p.screenshot}`, title: p.title || p.url }));
  // The owner's notes, when this link was made to carry them.
  const notes = share.includeNotes ? (await store.annotations(id, found?.owner ?? null)).map((a) => ({ at: a.at, text: a.text })) : [];
  const page = {
    title: hostOf(summary.url),
    host: summary.url,
    recorded: readableWhen(summary.createdAt),
    pages: summary.pages.length,
    durationMs: summary.durationMs,
    sources,
    captions: summary.media.captions ? `${base}/${summary.media.captions}` : null,
    poster: pictures[0]?.url ?? null,
    pictures,
    chapters,
    transcript: captions.map((c) => ({ start: c.start, text: c.text })),
    notes,
    guideUrl: `${base}/guide`,
    expiresAt: share.expiresAt.slice(0, 10),
    ...(summary.media.note && /failed|instead|could not reach/i.test(summary.media.note) ? { note: summary.media.note } : {}),
  };
  // The embed is the same walkthrough without the page around it: a player to drop into
  // somebody else's site, with nothing of Walkcast's shell in the way.
  if (url.searchParams.get("embed") === "1") {
    // The one page meant to live in another site's iframe, so it drops X-Frame-Options and
    // names who may frame it instead: anyone, or the sites listed in LAB_EMBED_ANCESTORS.
    const { "X-Frame-Options": _xfo, ...framable } = securityHeaders;
    const ancestors = (process.env.LAB_EMBED_ANCESTORS ?? "").trim() || "*";
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache", ...framable, "Content-Security-Policy": `frame-ancestors ${ancestors}` });
    return void res.end(embedPage({ ...page, openUrl: `${siteUrl}${base}` }));
  }
  return send(200, "text/html; charset=utf-8", sharePage(page));
};

/** Share links: public, because the token in the path is the permission. */
export const shareRoutes: Route[] = [
  // A shared walkthrough can also be read as a step-by-step guide. The token is the permission,
  // exactly as it is for the video: a reader who was sent the link needs no account for either.
  {
    method: ["GET", "HEAD"],
    path: SHARE_GUIDE,
    auth: "public",
    handler: async (ctx) => {
      const { url, json, params, deps: { findRecording } } = ctx;
      const [, id, token] = params as unknown as [string, string, string];
      const found = await findRecording(id);
      const summary = found?.summary;
      const share = summary && (summary.shares ?? []).find((s) => sameToken(s.token, token));
      if (!summary || !share || Date.parse(share.expiresAt) <= Date.now()) return json(404, { error: "This link has expired." });
      return sendGuide(ctx, id, summary, (url.searchParams.get("format") ?? "html").toLowerCase(), `/share/${encodeURIComponent(id)}/${token}/`);
    },
  },
  { method: ["GET", "HEAD"], path: SHARE_FILE, auth: "public", handler: shareViewOrFile },
  { method: ["GET", "HEAD"], path: SHARE_VIEW, auth: "public", handler: shareViewOrFile },
];
