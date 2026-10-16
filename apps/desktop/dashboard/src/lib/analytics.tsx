import { Analytics } from "@vercel/analytics/react";

/**
 * Vercel Web Analytics, opt-in.
 *
 * Without `VITE_VERCEL_ANALYTICS_DSN` nothing is loaded and nothing is sent — Walkcast is
 * self-hostable and MIT-licensed, so analytics is never on by default. With it set, the script
 * is injected and each dashboard route is reported as its own page view.
 *
 * Self-hosters who proxy the script through their own domain also set
 * `VITE_VERCEL_ANALYTICS_SCRIPT_SRC` and `VITE_VERCEL_ANALYTICS_ENDPOINT`.
 */
const env = import.meta.env ?? {};

const analyticsConfig = {
  enabled: Boolean(env.VITE_VERCEL_ANALYTICS_DSN),
  dsn: env.VITE_VERCEL_ANALYTICS_DSN ?? "",
  scriptSrc: env.VITE_VERCEL_ANALYTICS_SCRIPT_SRC ?? undefined,
  endpoint: env.VITE_VERCEL_ANALYTICS_ENDPOINT ?? undefined,
} as const;

/**
 * Mounted once in the app root. `route` is passed explicitly, which turns off the script's
 * automatic tracking and makes each navigation report exactly one page view for the route the
 * user is on — including hash routes, which automatic tracking would otherwise lump together.
 */
export function AnalyticsTracker({ route, path }: { route: string; path: string }) {
  if (!analyticsConfig.enabled) return null;
  return (
    <Analytics
      dsn={analyticsConfig.dsn}
      scriptSrc={analyticsConfig.scriptSrc}
      endpoint={analyticsConfig.endpoint}
      route={route}
      path={path}
    />
  );
}