/**
 * Vercel project configuration.
 *
 * The build writes `.vercel/output` (Build Output API, see src/deploy/vercel-build.ts): the
 * prerendered marketing pages as static files, and the Node server bundled into one function
 * that answers everything else (/login, /signup, /app, /auth/*, /api/*). One deployment serves
 * the whole site, the same as `npm run dev` does locally - no separate server to point at.
 *
 * Routes and headers live in the generated `.vercel/output/config.json`, not here: with the
 * Build Output API Vercel takes them from the build.
 */
export const config = {
  buildCommand: "npm run vercel:build",
  framework: null,
};

export default config;
