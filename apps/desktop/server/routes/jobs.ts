import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { extname, join } from "node:path";
import { agentDailyLimit, resolveAgent } from "../../../../packages/core/src/agents/registry.ts";
import { seal, sharedKeyConfigured } from "../../../../packages/core/src/jobs/secret-box.ts";
import { log } from "../../../../packages/core/src/ops/log.ts";
import { browserNotReady } from "../../../../packages/core/src/record/browser-install.ts";
import { liveDirForJob } from "../../../../packages/core/src/record/live-view.ts";
import { configuredCloudProviders, kokoroReady } from "../../../../packages/core/src/record/voice.ts";
import { credentialFor, isCloudProvider } from "../../../../packages/core/src/record/voices.ts";
import type { Job, JobKind, QueuePosition, Store } from "../../../../packages/core/src/store/index.ts";
import { AuthError } from "../auth.ts";
import { STATUS_TTL_MS, capabilitiesCache, setStatusCache, statusCache } from "../caches.ts";
import { TYPES, readJson, streamFile } from "../http.ts";
import { LIMITS, TTS_PROVIDER_LABEL, validateRecord, validateRun } from "../job-input.ts";
import type { Route } from "./router.ts";
import { voiceAccess } from "./voices.ts";

function publicJob(job: Job) {
  const { secret: _secret, input, ...rest } = job;
  // Never echo a password back; the URL and settings are fine to show to their owner.
  return { ...rest, input: { ...input } };
}

/**
 * A queued job also carries its place in line, so the app can say "1 job ahead of you" instead of
 * showing an indefinite spinner. The position is a nicety: a job's status must never fail because
 * the queue counters could not be read.
 */
async function withQueue(store: Store, job: Job) {
  const base = publicJob(job);
  if (job.status !== "queued") return base;
  try {
    const { ahead, oldestQueuedMs }: QueuePosition = await store.queuePosition(job.createdAt);
    return { ...base, queue: { ahead, oldestQueuedMs, waitingMs: Math.max(0, Date.now() - Date.parse(job.createdAt)) } };
  } catch {
    return base;
  }
}

/**
 * The job queue as the dashboard sees it. Expensive work (recordings, lab runs) goes on the queue:
 * the request returns 202 with a job id at once and the browser polls /api/jobs/:id.
 */
export const jobRoutes: Route[] = [
  {
    method: "POST",
    path: ["/api/run", "/api/record"],
    auth: "owner-checked",
    handler: async (ctx) => {
      const { req, url, owner, json, canSeeLab, deps: { o, root, store, worker, exposed, allowLiveRuns, state, noteRefusal } } = ctx;
      const { mayUseVoice } = voiceAccess(ctx);
      const kind = url.pathname === "/api/run" ? "run" : "record";
      const b = await readJson(req);
      // A recording turned away before it could start is still a failed recording to the person
      // who asked: keep it, so the Lab lists it with the reason. Quotas and "already running" are
      // not failures of the site and aren't kept.
      const refuse = async (status: number, error: string): Promise<void> => {
        if (kind === "record") await noteRefusal(owner, b.demo === true ? "" : String(b.url ?? ""), error, b.demo === true).catch((e) => log.warn("job.refusal_not_kept", { error: String(e) }));
        return json(status, { error });
      };
      if (state.draining) return refuse(503, "The server is restarting. Try again in a moment.");
      if (o.jobsUnavailable) return refuse(503, o.jobsUnavailable);
      const notReady = browserNotReady();
      if (notReady) return refuse(503, notReady);
      let input: Record<string, unknown>;
      try {
        input = kind === "run" ? validateRun(b, allowLiveRuns, root) : validateRecord(b, exposed, owner);
      } catch (e) {
        // An unfinished form (no URL, box not ticked) is not a failed recording; a bad address is.
        if (e instanceof AuthError && e.status === 400) return /^(Confirm that you own|Paste the site's URL)/.test(e.message) ? json(400, { error: e.message }) : refuse(400, e.message);
        throw e;
      }
      // Another account's fixture is as good as absent: replaying it would read their run.
      if (kind === "run" && typeof input.fixture === "string" && !canSeeLab(input.fixture)) return json(400, { error: "That fixture doesn't exist here." });
      // A cloud voice this process can't reach would quietly ship with no voice, which reads as "I picked ElevenLabs and got something else". When we hold the worker we can say so up front,
      // instead of returning a video in the wrong voice minutes later.
      if (kind === "record" && worker && typeof input.ttsProvider === "string" && isCloudProvider(input.ttsProvider) && !configuredCloudProviders().includes(input.ttsProvider)) {
        const id = TTS_PROVIDER_LABEL[input.ttsProvider] ?? input.ttsProvider;
        const env = credentialFor(input.ttsProvider);
        return refuse(400, `${id} is selected but this server has no ${env}, so the recording would not use it. Add the key in Settings, or pick the basic offline voice.`);
      }
      // Kokoro needs a local Python install with the kokoro package; without it the recording
      // would silently fall back to the robotic voice, which reads the same as the cloud case above.
      if (kind === "record" && worker && input.ttsProvider === "kokoro" && !(await kokoroReady())) {
        return refuse(400, "Kokoro is selected but this server has no working Python + kokoro install, so the recording would not use it. Install kokoro, or pick the basic offline voice.");
      }
      // A custom voice sample is the uploader's. Naming somebody else's id in the form would
      // narrate in a stranger's voice, so it is refused rather than quietly swapped for a default.
      if (kind === "record" && input.ttsProvider === "custom-voice" && typeof input.ttsVoice === "string" && !mayUseVoice(input.ttsVoice)) {
        return json(400, { error: "That voice sample belongs to another account. Upload your own in Settings." });
      }
      // A retried submit (double-click, network retry) gets the job it already created.
      const idempotencyKey = typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"].slice(0, 100) : null;
      if (idempotencyKey) {
        const existing = await store.jobByKey(owner, idempotencyKey);
        if (existing) return json(202, { job: await withQueue(store, existing) });
      }
      // Per-user limits, enforced atomically in the store so they hold across instances: the
      // daily quota and the active-job ceiling are single statements, not reads the caller races.
      // Refuse "already running" before charging the daily quota: a click while a job runs used to
      // spend one of the day's recordings on a request that was turned away. enqueueLimited below
      // still enforces the ceiling atomically; this only keeps the common case from costing quota.
      if ((await store.activeJobs(owner)) >= LIMITS.activeJobsPerUser) throw new AuthError(429, "You already have a job running. Wait for it to finish.");
      const perDay = kind === "record" ? LIMITS.recordingsPerDay : LIMITS.runsPerDay;
      // Every quota this request was charged, so a request turned away below gets them back:
      // a refusal must not cost one of the day's runs.
      const charged: string[] = [];
      const refund = () => Promise.all(charged.map((k) => store.unhit(k).catch((e) => log.warn("quota.refund_failed", { key: k, error: String(e) }))));
      let job: Awaited<ReturnType<typeof store.enqueueLimited>>;
      try {
        job = await (async () => {
          const dayKey = `quota:${kind}:${owner ?? "local"}`;
          const usedToday = await store.hit(dayKey, 86_400_000);
          charged.push(dayKey);
          if (usedToday > perDay) {
            throw new AuthError(429, `Daily limit reached (${perDay} ${kind === "record" ? "recordings" : "runs"}). Try again tomorrow.`);
          }
          if (kind === "run") {
            // Model-backed agents spend provider tokens on a live run: they get their own ceiling.
            const spec = resolveAgent(String(input.agent));
            const perAgent = agentDailyLimit(spec);
            const free = input.modelMode === "replay" || input.modelMode === "scripted";
            if (perAgent !== null && !free) {
              const agentKey = `quota:agent:${spec.id}:${owner ?? "local"}`;
              const usedByAgent = await store.hit(agentKey, 86_400_000);
              charged.push(agentKey);
              if (usedByAgent > perAgent) {
                throw new AuthError(429, `Daily limit reached for agent ${spec.id} (${perAgent} runs). Try again tomorrow, or replay a fixture instead (no model cost).`);
              }
            }
          }
          let secret: string | null = null;
          if (kind === "record" && typeof b.password === "string" && b.password) {
            if (!worker && !sharedKeyConfigured()) throw new AuthError(503, "This server is missing LAB_SECRET_KEY, which separate workers need to receive sign-in details. Ask the operator to set it.");
            secret = seal(b.password);
          }
          const queued = await store.enqueueLimited({ kind, owner, input, secret, idempotencyKey }, LIMITS.activeJobsPerUser);
          if (!queued) throw new AuthError(429, "You already have a job running. Wait for it to finish.");
          return queued;
        })();
      } catch (e) {
        await refund();
        throw e;
      }
      worker?.poke();
      log.info("job.enqueued", { job: job.id, kind, owner });
      return json(202, { job: await withQueue(store, job) });
    },
  },
  // The live preview of a running recording: its HLS manifest and segments.
  {
    method: "*",
    path: /^\/api\/jobs\/([\w-]+)\/live\/([\w.-]+)$/,
    auth: "owner-checked",
    handler: async ({ req, res, owner, json, params, deps: { store, requireAuth } }) => {
      const [, id, file] = params as unknown as [string, string, string];
      const job = await store.job(id);
      if (!job || (requireAuth && job.owner !== owner)) return json(404, { error: "job not found" });
      const dir = liveDirForJob(id);
      const type = TYPES[extname(file).toLowerCase()];
      // Only the manifest and its own segments; no path outside this job's own live/ directory.
      if (!dir || !type) return json(404, { error: "no live preview for this job" });
      const abs = join(dir, "live", file);
      if (!existsSync(abs)) return json(404, { error: "not found" });
      // Rewritten by ffmpeg every few seconds: a cached manifest would show stale segments, and a
      // cached, since-deleted segment would 404 forever once the player tried it again.
      return streamFile(req, res, abs, type, "no-store");
    },
  },
  // Cancel a queued or running job (its owner only). The worker aborts at once when it is in this
  // process, else at its next heartbeat; the partial recording is discarded.
  {
    method: "POST",
    path: /^\/api\/jobs\/([\w-]+)\/cancel$/,
    auth: "owner-checked",
    handler: async ({ user, owner, json, params, deps: { store, worker, requireAuth } }) => {
      const id = params[1]!;
      const job = await store.job(id);
      if (!job || (requireAuth && job.owner !== owner)) return json(404, { error: "job not found" });
      const cancelled = await store.cancel(id);
      if (!cancelled) return json(409, { error: `The job already ${job.status}.`, job: await withQueue(store, job) });
      worker?.cancel(id);
      statusCache.delete(id);
      capabilitiesCache.delete(user?.id ?? "__anon__");
      log.info("job.cancelled", { job: id, owner });
      return json(200, { job: await withQueue(store, cancelled) });
    },
  },
  // The owner's own queued or running job, if any: how a client that lost track of a job id
  // (a page it left and came back to, a reload) finds its way back to a recording that never
  // stopped rather than showing a blank form as if it had. Matched before jobMatch, whose
  // `[\w-]+` would otherwise read "mine" as a job id and 404.
  {
    method: "GET",
    path: "/api/jobs/mine",
    auth: "owner-checked",
    handler: async ({ url, owner, json, deps: { store } }) => {
      // ?kind=record (default), run, batch-render, or any (the newest active job of any kind), so
      // the Library can reattach to a batch render after a reload.
      const asked = url.searchParams.get("kind");
      const kinds: JobKind[] = asked === "run" ? ["run"] : asked === "batch-render" ? ["batch-render"] : asked === "any" ? ["record", "run", "batch-render"] : ["record"];
      const job = (await Promise.all(kinds.map((k) => store.activeJob(owner, k))))
        .filter((j): j is Job => j !== null)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (!job) return json(200, { job: null });
      return json(200, { job: { ...(await withQueue(store, job)), live: job.status === "running" && Boolean(liveDirForJob(job.id)) } });
    },
  },
  {
    method: "*",
    path: /^\/api\/jobs\/([\w-]+)$/,
    auth: "owner-checked",
    handler: async ({ req, res, user, owner, json, params, securityHeaders, deps: { store, requireAuth } }) => {
      const id = params[1]!;
      const ifNone = req.headers["if-none-match"];
      const cached = statusCache.get(id);
      // The cache is shared by every caller, so a hit is only served to the job's owner; anyone
      // else falls through to the store lookup and its 404.
      if (cached && Date.now() - cached.at < STATUS_TTL_MS && (!requireAuth || cached.owner === owner)) {
        if (ifNone && String(ifNone).trim() === cached.etag) {
          res.writeHead(304, { ...securityHeaders, ETag: cached.etag, "Cache-Control": "private, max-age=1" });
          return void res.end();
        }
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", ...securityHeaders, ETag: cached.etag, "Cache-Control": "private, max-age=1" });
        return void res.end(cached.body);
      }
      const job = await store.job(id);
      if (!job || (requireAuth && job.owner !== owner)) {
        statusCache.delete(id);
        return json(404, { error: "job not found" });
      }
      // A finished job changes "recordings used today": drop this viewer's cached capabilities so
      // the next read isn't up to 5 s stale.
      if (job.status === "succeeded" || job.status === "failed") capabilitiesCache.delete(user?.id ?? "__anon__");
      // A live preview manifest exists only while the job's own recordSite() call is running.
      const payload = { job: { ...(await withQueue(store, job)), live: job.status === "running" && Boolean(liveDirForJob(id)) } };
      const body = JSON.stringify(payload);
      const etag = `"${createHash("sha1").update(body).digest("hex").slice(0, 16)}"`;
      setStatusCache(id, body, etag, job.owner ?? null);
      if (ifNone && String(ifNone).trim() === etag) {
        res.writeHead(304, { ...securityHeaders, ETag: etag, "Cache-Control": "private, max-age=1" });
        return void res.end();
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", ...securityHeaders, ETag: etag, "Cache-Control": "private, max-age=1" });
      return void res.end(body);
    },
  },
];
