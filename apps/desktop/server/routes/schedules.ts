import { blockedHost } from "../../../../packages/core/src/record/ssrf.ts";
import { newSchedule } from "../../../../packages/core/src/schedules.ts";
import { readJson } from "../http.ts";
import type { Route } from "./router.ts";

// ---------------------------------------------------------------- schedules (owner-scoped)
export const scheduleRoutes: Route[] = [
  {
    method: "GET",
    path: "/api/schedules",
    auth: "owner-checked",
    handler: async ({ owner, json, deps: { store } }) => json(200, { schedules: await store.schedules(owner) }),
  },
  {
    method: "POST",
    path: "/api/schedules",
    auth: "owner-checked",
    handler: async ({ req, owner, json, deps: { store, blockPrivate, exposed } }) => {
      const b = (await readJson(req).catch(() => ({}))) as any;
      let sched;
      try {
        sched = newSchedule(owner, { url: b?.url, interval: b?.interval ?? b?.cron ?? b?.every, intervalMs: b?.intervalMs, authorized: b?.authorized === true });
      } catch (e) {
        return json(400, { error: e instanceof Error ? e.message : String(e) });
      }
      if (blockPrivate) {
        const blocked = await blockedHost(new URL(sched.url).hostname);
        if (blocked) return json(400, { error: blocked });
      }
      // Exposed servers: a schedule must not recur faster than every 15 minutes or exceed 20 per account.
      if (exposed && sched.intervalMs < 15 * 60_000) return json(400, { error: "Schedules on a shared server run at most every 15 minutes." });
      if ((await store.schedules(owner)).length >= 20) return json(400, { error: "At most 20 schedules per account." });
      await store.addSchedule(sched);
      return json(201, { schedule: sched, schedules: await store.schedules(owner) });
    },
  },
  {
    method: "DELETE",
    path: /^\/api\/schedules(?:\/(.+))?$/,
    auth: "owner-checked",
    handler: async ({ req, url, owner, json, params, deps: { store } }) => {
      const id = params[1] ? decodeURIComponent(params[1]) : String(((await readJson(req).catch(() => ({}))) as any)?.id ?? url.searchParams.get("id") ?? "");
      if (!id) return json(400, { error: "id required" });
      const removed = await store.removeSchedule(id, owner);
      return json(removed ? 200 : 404, { schedules: await store.schedules(owner), ...(removed ? {} : { error: "schedule not found" }) });
    },
  },
];
