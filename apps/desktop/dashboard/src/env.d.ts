/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Vercel Web Analytics DSN. Analytics is opt-in: leave it unset and no script is loaded and
   * no event leaves the browser. Set it at build time (`VITE_VERCEL_ANALYTICS_DSN=… npm run ui:build`).
   */
  readonly VITE_VERCEL_ANALYTICS_DSN?: string;
  /** Self-hosted: where to load the script from (default `/\_vercel/insights/script.js`). */
  readonly VITE_VERCEL_ANALYTICS_SCRIPT_SRC?: string;
  /** Self-hosted: where page-view events are POSTed. */
  readonly VITE_VERCEL_ANALYTICS_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}