import { webhookUrlProblem } from "../../../../packages/core/src/webhooks.ts";
import { clampInt, readJson } from "../http.ts";
import type { Route } from "./router.ts";

// ---------------------------------------------------------------- webhooks (owner-scoped)
export const webhookRoutes: Route[] = [
  {
    method: "GET",
    path: "/api/webhooks",
    auth: "owner-checked",
    handler: async ({ owner, json, deps: { store } }) => {
      const items = await store.webhooks(owner);
      return json(200, { webhooks: items.map((w) => w.url), items });
    },
  },
  {
    method: "POST",
    path: "/api/webhooks",
    auth: "owner-checked",
    handler: async ({ req, owner, json, deps: { store, blockPrivate } }) => {
      const b = await readJson(req);
      const u = String((b as any)?.url ?? "").trim();
      if (!u) return json(400, { error: "url required" });
      const problem = await webhookUrlProblem(u, blockPrivate);
      if (problem) return json(400, { error: problem });
      if ((await store.webhooks(owner)).length >= 10) return json(400, { error: "At most 10 webhooks per account." });
      const webhook = await store.addWebhook(owner, u);
      const items = await store.webhooks(owner);
      return json(201, { webhook, webhooks: items.map((w) => w.url), items });
    },
  },
  {
    method: "GET",
    path: "/api/webhooks/deliveries",
    auth: "owner-checked",
    handler: async ({ url, owner, json, deps: { store } }) => json(200, { deliveries: await store.deliveries(owner, clampInt(url.searchParams.get("limit"), 1, 200, 50)) }),
  },
  {
    method: "DELETE",
    path: /^\/api\/webhooks(?:\/(.+))?$/,
    auth: "owner-checked",
    handler: async ({ req, owner, json, params, deps: { store } }) => {
      const target = params[1] ? decodeURIComponent(params[1]) : String(((await readJson(req).catch(() => ({}))) as any)?.url ?? "").trim();
      if (!target) return json(400, { error: "url or id required" });
      const removed = await store.removeWebhook(owner, target);
      const items = await store.webhooks(owner);
      return json(removed ? 200 : 404, { webhooks: items.map((w) => w.url), items, ...(removed ? {} : { error: "webhook not found" }) });
    },
  },
];
