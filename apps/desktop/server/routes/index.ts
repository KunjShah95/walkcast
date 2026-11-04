import { accountRoutes } from "./accounts.ts";
import { fileRoutes } from "./files.ts";
import { healthRoutes } from "./health.ts";
import { jobRoutes } from "./jobs.ts";
import { labRoutes, labRunRoutes } from "./lab.ts";
import { launchRoutes } from "./launch.ts";
import { documentRoutes, recordingRoutes } from "./recordings.ts";
import { type Route, validateRoutes } from "./router.ts";
import { scheduleRoutes } from "./schedules.ts";
import { settingsRoutes } from "./settings.ts";
import { shareRoutes } from "./share.ts";
import { appShellRoutes, shellRoutes } from "./static.ts";
import { voiceRoutes } from "./voices.ts";
import { webhookRoutes } from "./webhooks.ts";

/**
 * The route table, in the three stages server.ts runs it in. Order matters only where two routes
 * can match the same request, and every such pair sits inside one module except one: POST
 * /api/run (jobRoutes) must come before labRunRoutes, which answers every method on /api/run.
 */

/** Before the CSRF check and before the session is read. */
export const PRE_CSRF_ROUTES: readonly Route[] = validateRoutes(healthRoutes, "before-gate");

/** After the session is read, before the /api/ + /files/ sign-in gate. */
export const PUBLIC_ROUTES: readonly Route[] = validateRoutes([...shellRoutes, ...accountRoutes], "before-gate");

/** Behind the sign-in gate (for /api/ and /files/ paths), then the share pages and the dashboard shell. */
export const APP_ROUTES: readonly Route[] = validateRoutes(
  [
    ...labRoutes,
    ...settingsRoutes,
    ...launchRoutes,
    ...voiceRoutes,
    ...recordingRoutes,
    ...shareRoutes,
    ...jobRoutes,
    ...webhookRoutes,
    ...scheduleRoutes,
    ...labRunRoutes,
    ...documentRoutes,
    ...fileRoutes,
    ...appShellRoutes,
  ],
  "after-gate",
);
