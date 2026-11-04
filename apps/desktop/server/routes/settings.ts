import { allScenarios } from "../../../../packages/core/src/app/faults.ts";
import { agentDailyLimit, agentExposure, allAgents } from "../../../../packages/core/src/agents/registry.ts";
import { findChrome } from "../../../../packages/core/src/lab/chrome.ts";
import { budgetLimitsFor } from "../../../../packages/core/src/llm/budget.ts";
import { providerHealth } from "../../../../packages/core/src/llm/health.ts";
import { configuredProviders } from "../../../../packages/core/src/llm/providers.ts";
import { minFreeDiskBytes } from "../../../../packages/core/src/ops/disk.ts";
import { alarmState, queueAlarmMs } from "../../../../packages/core/src/ops/queue-monitor.ts";
import { checkForUpdate } from "../../../../packages/core/src/ops/updates.ts";
import { browserSetup, installChromium } from "../../../../packages/core/src/record/browser-install.ts";
import { LIVE_MAX_SESSIONS, liveSessionCount } from "../../../../packages/core/src/record/live-view.ts";
import { VOICES, canNarrate } from "../../../../packages/core/src/record/media.ts";
import { configuredSttProviders } from "../../../../packages/core/src/record/stt.ts";
import { configuredCloudProviders } from "../../../../packages/core/src/record/voice.ts";
import { publicUser } from "../auth.ts";
import { CAPABILITIES_CACHE_MAX, CAPABILITIES_TTL_MS, capabilitiesCache } from "../caches.ts";
import { CREDENTIAL_KEYS, cleanCredential, connectedProviders, credentialNames, credentialSet, saveCredential, testCredential } from "../credentials.ts";
import { buildDiagnostics } from "../diagnostics.ts";
import { readJson } from "../http.ts";
import { LIMITS, TTS_PROVIDERS, demoSiteEnabled } from "../job-input.ts";
import type { Route } from "./router.ts";

/** What this server can do and how it is set up: browser, capabilities, credentials, support bundle. */
export const settingsRoutes: Route[] = [
  // The recording browser's first-run download (desktop app); "unmanaged" everywhere else.
  { method: ["GET", "HEAD"], path: "/api/browser", auth: "user", handler: ({ json }) => json(200, browserSetup()) },
  {
    method: "POST",
    path: "/api/browser/install",
    auth: "user",
    handler: ({ json }) => {
      if (browserSetup().state === "unmanaged") return json(409, { error: "This server does not manage its browser." });
      return json(202, installChromium());
    },
  },
  {
    method: "*",
    path: "/api/capabilities",
    auth: "user",
    handler: async ({ user, json, canSee, deps: { worker, store, media, requireAuth, allowLiveRuns, exposed, o, listRecordings } }) => {
      const cacheKey = user?.id ?? "__anon__";
      const cached = capabilitiesCache.get(cacheKey);
      if (cached && Date.now() - cached.at < CAPABILITIES_TTL_MS) {
        // LRU touch: re-insert so recently used entries survive eviction.
        capabilitiesCache.delete(cacheKey);
        capabilitiesCache.set(cacheKey, cached);
        return json(200, cached.payload);
      }
      const payload = {
        live: true,
        running: worker?.busy ? "a job" : null,
        queue: await store.queueDepth().catch(() => null),
        user: publicUser(user),
        authRequired: requireAuth,
        stagehand: findChrome() !== null,
        liveModels: allowLiveRuns,
        providers: [...new Set([...configuredProviders().map((p) => p.id), ...connectedProviders(user)])],
        sttProviders: configuredSttProviders(),
        demoSite: demoSiteEnabled(exposed),
        agents: allAgents().map((a) => ({ id: a.id, kind: a.kind, description: a.description, exposure: agentExposure(a), dailyLimit: agentDailyLimit(a), budget: budgetLimitsFor(a.id) })),
        scenarios: allScenarios("pairs"),
        limits: LIMITS,
        usage: { recordingsToday: (await listRecordings(user)).filter((r) => canSee(r.owner) && Date.now() - Date.parse(r.createdAt) < 86_400_000).length },
        voices: { available: canNarrate(), list: VOICES, editable: media.kind === "local" },
        tts: { providers: TTS_PROVIDERS, configured: configuredCloudProviders() },
        jobsUnavailable: o.jobsUnavailable ?? null,
      };
      if (capabilitiesCache.size >= CAPABILITIES_CACHE_MAX) {
        const first = capabilitiesCache.keys().next().value;
        if (first) capabilitiesCache.delete(first);
      }
      capabilitiesCache.set(cacheKey, { payload, at: Date.now() });
      return json(200, payload);
    },
  },
  // ---------------------------------------------------------------- credentials
  {
    method: "GET",
    path: "/api/credentials",
    auth: "user",
    handler: ({ user, json, deps: { requireAuth, credentialsEditable } }) => {
      if (requireAuth && !user) return json(401, { error: "Sign in first." });
      return json(200, { editable: credentialsEditable, keys: CREDENTIAL_KEYS.map((k) => ({ env: k.env, label: k.label, group: k.group, set: credentialSet(k.env) })) });
    },
  },
  {
    method: "POST",
    path: "/api/credentials",
    auth: "user",
    handler: async ({ req, user, json, deps: { requireAuth, credentialsEditable, root } }) => {
      if (requireAuth && !user) return json(401, { error: "Sign in first." });
      if (!credentialsEditable) return json(403, { error: "Server credentials are set by the operator of this server." });
      const b = await readJson(req);
      const env = String(b.env ?? "");
      const value = String(b.value ?? "");
      if (!CREDENTIAL_KEYS.some((k) => k.env === env)) return json(400, { error: "Unknown credential." });
      saveCredential(root, env, cleanCredential(value));
      return json(200, { ok: true, set: credentialSet(env) });
    },
  },
  {
    method: "POST",
    path: "/api/credentials/test",
    auth: "user",
    handler: async ({ req, user, json, deps: { requireAuth } }) => {
      if (requireAuth && !user) return json(401, { error: "Sign in first." });
      const env = String((await readJson(req)).env ?? "");
      if (!CREDENTIAL_KEYS.some((k) => k.env === env)) return json(400, { error: "Unknown credential." });
      return json(200, await testCredential(env));
    },
  },
  {
    method: "DELETE",
    path: "/api/credentials",
    auth: "user",
    handler: ({ url, user, json, deps: { requireAuth, credentialsEditable, root } }) => {
      if (requireAuth && !user) return json(401, { error: "Sign in first." });
      if (!credentialsEditable) return json(403, { error: "Server credentials are set by the operator of this server." });
      const env = url.searchParams.get("env") ?? "";
      if (!CREDENTIAL_KEYS.some((k) => k.env === env)) return json(400, { error: "Unknown credential." });
      saveCredential(root, env, "");
      return json(200, { ok: true });
    },
  },
  // A support bundle to attach to a bug report (JSON; see diagnostics.ts for what's in it and
  // what is stripped). The account's own jobs only on a server with accounts.
  {
    method: "GET",
    path: "/api/diagnostics",
    auth: "user",
    handler: async ({ res, user, json, securityHeaders, deps: { root, appSourceRoot, store, media, worker, requireAuth, exposed, o } }) => {
      if (requireAuth && !user) return json(401, { error: "Sign in first." });
      const bundle = await buildDiagnostics({
        root,
        appRoot: appSourceRoot,
        store,
        storeKind: store.kind,
        mediaKind: media.kind,
        worker: worker ? (worker.busy ? "busy" : "idle") : "off",
        scope: requireAuth ? (user?.id ?? "-") : null,
        limits: { ...LIMITS, minFreeDiskMb: Math.round(minFreeDiskBytes() / 1048576) },
        credentialEnvs: CREDENTIAL_KEYS.flatMap((k) => credentialNames(k.env)),
        exposed,
        requireAuth,
        desktop: Boolean(o.desktop),
      });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="walkcast-diagnostics-${stamp}.json"`,
        "Cache-Control": "no-store",
        ...securityHeaders,
      });
      return void res.end(JSON.stringify(bundle, null, 2));
    },
  },
  {
    method: "GET",
    path: "/api/update",
    auth: "user",
    // The newest published release vs. what this server runs. The desktop app installs updates
    // itself (Tauri updater); servers and source checkouts get a link to the release.
    handler: async ({ json }) => json(200, await checkForUpdate()),
  },
  {
    method: "GET",
    path: "/api/agents/usage",
    auth: "user",
    handler: async ({ url, json, deps: { store } }) => {
      let windowMs = 86_400_000;
      const q = url.searchParams.get("windowMs");
      if (q) {
        const n = Number(q);
        if (!Number.isFinite(n) || n <= 0 || n > 31 * 86_400_000) return json(400, { error: "windowMs must be 1ms..31 days" });
        windowMs = n;
      }
      // Aggregate counts per agent id across every account: no inputs, owners or results.
      const usage = await store.agentUsage(windowMs);
      const known = new Map(allAgents().map((a) => [a.id, a]));
      return json(200, {
        windowMs,
        agents: usage.map((u) => {
          const spec = known.get(u.agent);
          return { ...u, kind: spec?.kind ?? "unknown", exposure: spec ? agentExposure(spec) : "unknown", dailyLimit: spec ? agentDailyLimit(spec) : null, budget: spec ? budgetLimitsFor(spec.id) : null };
        }),
      });
    },
  },
  {
    method: "*",
    path: "/api/metrics",
    auth: "user",
    handler: async ({ url, json, deps: { store } }) => {
      let windowMs = 86_400_000;
      const q = url.searchParams.get("windowMs");
      if (q) {
        const n = Number(q);
        if (!Number.isFinite(n) || n <= 0 || n > 31 * 86_400_000) return json(400, { error: "windowMs must be 1ms..31 days" });
        windowMs = n;
      }
      const snap = await store.metrics(windowMs);
      const alarmMs = queueAlarmMs();
      // Open to operators; authed users only see queue-level aggregates (no per-tenant content).
      // How each model provider has been answering this process's live calls (llm/health.ts).
      return json(200, {
        ...snap,
        alarm: { state: alarmState(snap.queue.oldestQueuedMs, alarmMs), thresholdMs: alarmMs },
        providers: providerHealth(windowMs),
        // A live preview is an x264 encoder this process is running; at fleet scale it is real
        // CPU the capacity math in docs/SCALING.md has to account for, so it is counted here.
        live: { previews: liveSessionCount(), limit: LIVE_MAX_SESSIONS },
      });
    },
  },
];
