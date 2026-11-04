import { extname, join } from "node:path";
import { FAVICON, fontPath } from "../../../../packages/brand/src/index.ts";
import { TYPES, streamFile } from "../http.ts";
import { webManifest, SERVICE_WORKER } from "../pwa.ts";
import type { Route } from "./router.ts";

/** The app shell's own files: icon, manifest, service worker, fonts. Public, ahead of the sign-in gate. */
export const shellRoutes: Route[] = [
  { method: ["GET", "HEAD"], path: "/", auth: "public", handler: ({ redirect }) => redirect("/app") },
  { method: "*", path: ["/favicon.svg", "/favicon.ico"], auth: "public", handler: ({ send }) => send(200, "image/svg+xml", FAVICON, "max-age=86400") },
  {
    method: "*",
    path: ["/manifest.webmanifest", "/manifest.json"],
    auth: "public",
    handler: ({ send, deps: { siteUrl } }) => send(200, "application/manifest+json; charset=utf-8", webManifest({ siteUrl }), "max-age=3600"),
  },
  { method: "*", path: "/sw.js", auth: "public", handler: ({ send }) => send(200, "application/javascript; charset=utf-8", SERVICE_WORKER, "no-cache") },
  {
    method: "*",
    path: /^\/assets\//,
    auth: "public",
    handler: ({ req, res, url, json }) => {
      const font = fontPath(url.pathname.slice("/assets/".length));
      if (!font) return json(404, { error: "not found" });
      return streamFile(req, res, font, "font/woff2", "public, max-age=86400");
    },
  },
];

/** The last routes before the 404: the bundled walkthrough video and the dashboard page itself. */
export const appShellRoutes: Route[] = [
  {
    method: "*",
    path: ["/walkthrough.mp4", "/walkthrough.vtt"],
    auth: "public",
    handler: ({ req, res, url, deps: { staticDir } }) => {
      // The product walkthrough video, bundled with the desktop app so new users can watch it
      // before they've made their first recording. Served from the app's own static directory.
      const abs = join(staticDir, url.pathname.slice(1));
      const type = TYPES[extname(abs).toLowerCase()] ?? "application/octet-stream";
      return streamFile(req, res, abs, type, "public, max-age=86400, immutable");
    },
  },
  {
    method: "*",
    path: ["/app", "/app/"],
    auth: "public",
    handler: ({ res, user, redirect, securityHeaders, deps: { requireAuth, appCsp, html } }) => {
      // Nothing of the app is shown before sign-in when accounts are required: not even the shell.
      if (requireAuth && !user) return redirect(`/login?next=${encodeURIComponent("/app")}`);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
        ...securityHeaders,
        "Content-Security-Policy": appCsp,
        "X-Robots-Tag": "noindex, nofollow",
      });
      return void res.end(html);
    },
  },
];
