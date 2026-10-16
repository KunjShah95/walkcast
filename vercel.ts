/**
 * Vercel project configuration: the marketing site only. apps/web is a static React build
 * (Vite) written to dist/web; there are no functions.
 */
export const config = {
  framework: null,
  buildCommand: "npm run web:build",
  outputDirectory: "dist/web",
};

export default config;
