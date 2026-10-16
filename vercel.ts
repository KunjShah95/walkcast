/**
 * Vercel project configuration, generated at build time.
 *
 * This replaces `vercel.json` because a static config file cannot read environment variables:
 * rewrite destinations must be an absolute pathname or an external URL, so `$APP_ORIGIN/login`
 * was never interpolated. The rewrite silently did not match, and `/login`, `/signup`, `/forgot`
 * and `/reset` fell through to the static 404 - which is also why the sign-in and registration
 * pages appeared to be missing. `vercel.ts` runs during the build, so `process.env` is available.
 * Vercel only allows one configuration file, hence this replaces the JSON one outright.
 *
 * Set `APP_ORIGIN` in the Vercel project to the origin of the Node server (the Docker image on
 * ECS, Fly, or wherever `npm run lab -- ui` runs). The build fails loudly without it rather than
 * shipping a site whose "Sign in" and "Get started" buttons 404.
 */
const origin = (process.env.APP_ORIGIN ?? "").trim().replace(/\/+$/, "");
if (!origin) {
  throw new Error(
    "APP_ORIGIN is not set. Point it at the Walkcast Node server (the host serving /app, /api and /auth/*) " +
      "so /login, /signup, /forgot, /reset, /app and /api/* can be proxied. Without it every one of those is a 404.",
  );
}
if (!/^https?:\/\//.test(origin)) {
  throw new Error(`APP_ORIGIN must be an absolute http(s) origin, got "${origin}".`);
}

/** Proxy a path (and, with `:path*`, its sub-paths) to the Node server. */
const proxy = (source: string) => ({ source, destination: `${origin}${source.replace(/\/:path\*$/, "/:path*")}` });

export const config = {
  buildCommand: "npm run ui:build && npm run site:build",
  outputDirectory: "dist",
  framework: null,
  rewrites: [
    // The dashboard and everything it talks to.
    proxy("/app"),
    proxy("/app/:path*"),
    proxy("/api/:path*"),
    proxy("/files/:path*"),
    // Auth: the pages, their POST targets, the OAuth callbacks and the health check.
    proxy("/auth/:path*"),
    proxy("/login"),
    proxy("/signup"),
    proxy("/forgot"),
    proxy("/reset"),
    proxy("/start"),
    proxy("/healthz"),
  ],
  headers: [
    {
      source: "/404.html",
      headers: [{ key: "X-Robots-Tag", value: "noindex, follow" }],
    },
    {
      source: "/assets/:path*",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    },
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
      ],
    },
  ],
};

export default config;