import { log } from "../../../../packages/core/src/ops/log.ts";
import { sameToken, withTimeout } from "../http.ts";
import type { Route } from "./router.ts";

/** How long the running job gets to finish when the desktop shell asks for an orderly exit. */
export const SHUTDOWN_GRACE_MS = 25_000;

/**
 * Liveness, readiness and the desktop shell's shutdown. These run before the CSRF check and before
 * the session is read: a health probe carries neither.
 */
export const healthRoutes: Route[] = [
  // Liveness: the process answers. Readiness: it can reach its database and isn't shutting down.
  {
    method: "*",
    path: "/healthz",
    auth: "public",
    handler: ({ res, json, deps: { worker } }) => {
      // Public liveness, readable cross-origin so the mobile companion can check an address
      // before opening it. Carries { ok: true } and whether the worker is mid-job, which the
      // desktop shell reads before quitting.
      res.setHeader("Access-Control-Allow-Origin", "*");
      return json(200, { ok: true, worker: worker?.busy ? "busy" : "idle" });
    },
  },
  // An orderly exit for the desktop shell: loopback only, and only with the token the shell
  // generated and passed in WALKCAST_SHUTDOWN_TOKEN (no token configured: no route).
  {
    method: "POST",
    path: "/api/shutdown",
    auth: "public",
    when: ({ deps: { exposed } }) => !exposed && Boolean(process.env.WALKCAST_SHUTDOWN_TOKEN),
    handler: ({ req, res, json, deps }) => {
      const { o, self, worker, state } = deps;
      const given = req.headers["x-walkcast-shutdown"];
      if (typeof given !== "string" || !sameToken(process.env.WALKCAST_SHUTDOWN_TOKEN!, given)) return json(403, { error: "Shutdown refused." });
      if (!state.shuttingDown) {
        state.shuttingDown = true;
        state.draining = true;
        res.once("finish", () => {
          // serveDashboard sets self.shutdown (it owns the socket); a bare createApp has only
          // its own work to stop.
          const run =
            self.shutdown ??
            (async () => {
              self.drain();
              self.killTasks();
              await worker?.stop(SHUTDOWN_GRACE_MS);
              (o.onShutdown ?? (() => process.exit(0)))();
            });
          void run().catch((e: unknown) => log.error("server.shutdown_failed", { error: String(e) }));
        });
      }
      return json(202, { ok: true, shuttingDown: true });
    },
  },
  {
    method: "*",
    path: "/readyz",
    auth: "public",
    handler: async ({ json, deps: { store, media, worker, state } }) => {
      if (state.draining) return json(503, { ok: false, reason: "shutting down" });
      try {
        await withTimeout(store.ping(), 2000);
        return json(200, { ok: true, store: store.kind, media: media.kind, worker: worker ? (worker.busy ? "busy" : "idle") : "off" });
      } catch (e) {
        return json(503, { ok: false, reason: `store unreachable: ${e instanceof Error ? e.message : String(e)}` });
      }
    },
  },
];
