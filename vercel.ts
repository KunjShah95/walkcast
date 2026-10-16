/**
 * Vercel project configuration: the marketing site only (apps/web).
 *
 * The build writes `.vercel/output` (Build Output API, see apps/web/build.ts): the prerendered
 * pages as static files and nothing else. There is no function: sign-in, the dashboard and the
 * API belong to the desktop app (apps/desktop) and never run on Vercel.
 *
 * Routes and headers live in the generated `.vercel/output/config.json`, not here: with the
 * Build Output API Vercel takes them from the build.
 */
export const config = {
  buildCommand: "npm run vercel:build",
  framework: null,
};

export default config;
