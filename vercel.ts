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
 * ECS, Fly, or wherever `npm run lab -- ui` runs).
 *
 * Unset is not fatal: the marketing site is a static export and deploys fine on its own, so a
 * docs-only deployment must not be blocked. But then `/login`, `/signup`, `/forgot`, `/reset`,
 * `/app` and `/api/*` have nothing behind them and will 404, so the build says so loudly rather
 * than shipping quietly. A value that is set but malformed *is* fatal - that is a typo, not a
 * deliberate choice.
 */
const origin = (process.env.APP_ORIGIN ?? "").trim().replace(/\/+$/, "");
if (origin && !/^https?:\/\//.test(origin)) {
  throw new Error(
    `APP_ORIGIN must be an absolute http(s) origin (e.g. https://app.example.com), got "${origin}". ` +
      "Unset it entirely for a static, marketing-only deployment.",
  );
}
if (!origin) {
  console.warn(
    "\n  [walkcast] APP_ORIGIN is not set: deploying the static marketing site only.\n" +
      "  /login, /signup, /forgot, /reset, /app and /api/* will 404 until you set APP_ORIGIN\n" +
      "  in the Vercel project to the origin of the Node server (`npm run lab -- ui`).\n",
  );
}

/** Proxy a path (and, with `:path*`, its sub-paths) to the Node server. */
const proxy = (source: string) => ({ source, destination: `${origin}${source}` });

const PROXIED = [
  // The dashboard and everything it talks to.
  "/app",
  "/app/:path*",
  "/api/:path*",
  "/files/:path*",
  // Auth: the pages, their POST targets, the OAuth callbacks and the health check.
  "/auth/:path*",
  "/login",
  "/signup",
  "/forgot",
  "/reset",
  "/start",
  "/healthz",
];

export const config = {
  buildCommand: "npm run ui:build && npm run site:build",
  outputDirectory: "dist",
  framework: null,
  // No origin, no proxy: the static files are served as-is.
  rewrites: origin ? PROXIED.map(proxy) : [],
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