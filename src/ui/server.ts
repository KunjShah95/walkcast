import { randomUUID, createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { LabData, type LabIndex, type RecordingSummary, type RunDetail } from "./data.ts";
import { type TaskId, allScenarios, isTaskId, normalizeScenario } from "../app/faults.ts";
import { allAgents } from "../agents/registry.ts";
import { seal, sharedKeyConfigured } from "../jobs/secret-box.ts";
import { Worker } from "../jobs/worker.ts";
import { configuredProviders } from "../llm/providers.ts";
import { createMedia, type MediaStore } from "../media/store.ts";
import { VOICES, hasFlite, isVoice, renarrate, voiceover, voicePreview } from "../record/media.ts";
import { log } from "../ops/log.ts";
import { Auth, AuthError, publicUser, safeNext, type User } from "../site/auth.ts";
import { SupabaseAuth, supabaseAuthConfig } from "../site/supabase-auth.ts";
import { FAVICON, assetPath, authPage, comparePage, compareSlugs, guidePage, guidesIndexPage, howPage, labPage, landingPage, llmsTxt, notFoundPage, pricingMd, pricingPage, robotsTxt, safetyPage, sitemapXml } from "../site/pages.ts";
import { guideBySlug } from "../site/guides.ts";
import { createStore, type Job, type QueuePosition, type Store } from "../store/index.ts";

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "dashboard", "dist", "index.html");
const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".wav": "audio/wav",
  ".vtt": "text/vtt; charset=utf-8",
  ".json": "application/json",
};

function dashboardHtml(path = DIST): string {
  if (!existsSync(path)) throw new Error("Dashboard not built. Run: npm run ui:build");
  return readFileSync(path, "utf8");
}

export interface ServeOptions {
  root?: string;
  /** Interface to bind; 127.0.0.1 unless LAB_HOST says otherwise. */
  host?: string;
  /** Public origin used for canonical URLs, sitemaps and OAuth redirects. */
  siteUrl?: string;
  /** Require a signed-in account to use the dashboard (default on; LAB_AUTH=off disables). */
  requireAuth?: boolean;
  /** Don't keep the process alive just for this server (tests). */
  unref?: boolean;
  /** Accounts, sessions, queue and recordings index (default: from the environment). */
  store?: Store;
  media?: MediaStore;
  /**
   * Run a queue worker inside this process (default on; LAB_WORKER=off for a web-only service
   * when separate `lab worker` processes do the work).
   */
  worker?: boolean;
  /** Set when nothing will ever take jobs off the queue: recordings and runs are refused with this. */
  jobsUnavailable?: string;
  /** The built dashboard (default: dashboard/dist/index.html next to the source). */
  dashboardHtml?: string;
}

/** The request handler and what it owns, without a listening socket (a serverless function). */
export interface App {
  handler: (req: IncomingMessage, res: ServerResponse) => void;
  store: Store;
  media: MediaStore;
  worker: Worker | null;
  auth: string;
  requireAuth: boolean;
  /** Refuse new jobs and fail readiness: the process is shutting down. */
  drain(): void;
}

export interface Running {
  url: string;
  store: Store;
  /** Stop accepting requests, let in-flight work finish (or hand it back to the queue), close. */
  close(graceMs?: number): Promise<void>;
}

/** Per-user limits on expensive work (shared across instances through the store). */
const LIMITS = {
  activeJobsPerUser: Number(process.env.LAB_MAX_ACTIVE_JOBS ?? 1),
  recordingsPerDay: Number(process.env.LAB_RECORDINGS_PER_DAY ?? 20),
  runsPerDay: Number(process.env.LAB_RUNS_PER_DAY ?? 100),
};

/**
 * The web server: the public landing page and crawler files at /, accounts under /auth, and the
 * dashboard at /app. Expensive work (recordings, lab runs) goes on the job queue: the request
 * returns 202 with a job id at once and the browser polls /api/jobs/:id, so nothing depends on a
 * request staying open for minutes behind a load balancer.
 */
export async function serveDashboard(port: number, options: ServeOptions | string = {}): Promise<Running> {
  const o = typeof options === "string" ? { root: options } : options;
  const host = o.host ?? process.env.LAB_HOST ?? "127.0.0.1";
  const app = createApp({ ...o, host, siteUrl: o.siteUrl ?? process.env.LAB_SITE_URL ?? `http://127.0.0.1:${port}` });
  const { store, media, worker } = app;
  const server = createServer(app.handler);
  // Keep-alive longer than the ALB's idle timeout (60 s) so the balancer never reuses a closed socket.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 30_000;

  await new Promise<void>((r) => server.listen(port, host, r));
  if (o.unref) server.unref();
  const address = `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`;
  log.info("server.started", { url: address, store: store.kind, media: media.kind, worker: Boolean(worker), auth: app.requireAuth ? app.auth : "off" });
  return {
    url: address,
    store,
    async close(graceMs = 30_000) {
      app.drain();
      // Stop accepting; idle keep-alive sockets close now, active requests finish.
      const closed = new Promise<void>((r) => server.close(() => r()));
      server.closeIdleConnections();
      await worker?.stop(graceMs);
      await withTimeout(closed, 10_000).catch(() => server.closeAllConnections());
      if (!o.store) await store.close();
      log.info("server.stopped", {});
    },
  };
}

/**
 * Everything `serveDashboard` serves, as a plain `(req, res)` handler: the local server listens
 * with it, and the Vercel function (src/deploy/vercel-function.ts) exports it.
 */
export function createApp(o: ServeOptions = {}): App {
  const root = o.root ?? process.cwd();
  const host = o.host ?? process.env.LAB_HOST ?? "127.0.0.1";
  const siteUrl = (o.siteUrl ?? process.env.LAB_SITE_URL ?? "http://127.0.0.1:4320").replace(/\/$/, "");
  const requireAuth = o.requireAuth ?? process.env.LAB_AUTH !== "off";
  const store = o.store ?? createStore(root);
  const media = o.media ?? createMedia(root);
  const data = new LabData(root);
  // Supabase Auth when SUPABASE_URL + SUPABASE_ANON_KEY are set; otherwise built-in accounts.
  const supabaseCfg = supabaseAuthConfig();
  const auth: Auth | SupabaseAuth = supabaseCfg ? new SupabaseAuth(store, siteUrl, supabaseCfg) : new Auth(store, siteUrl);
  const authOptions = async () =>
    auth.kind === "supabase"
      ? { ...(await auth.options()), openrouter: true, chatgpt: false }
      : { google: Boolean(auth.google), openrouter: true, chatgpt: true, forgot: false, confirmEmail: false, signupDisabled: false };
  const html = dashboardHtml(o.dashboardHtml);
  const exposed = !["127.0.0.1", "localhost", "::1"].includes(host);
  const allowLiveRuns = !exposed || process.env.LAB_ALLOW_LIVE_RUNS === "1";
  const worker = (o.worker ?? process.env.LAB_WORKER !== "off") ? new Worker({ store, media, root }).start() : null;
  let draining = false;

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    const started = Date.now();
    // Behind an ALB the trace id ties our log line to the load balancer's.
    const requestId = String(req.headers["x-amzn-trace-id"] ?? req.headers["x-request-id"] ?? randomUUID());
    res.setHeader("X-Request-Id", requestId);
    res.on("finish", () => {
      const path = (req.url ?? "/").split("?")[0];
      if (path === "/healthz") return;
      log.info("http", { id: requestId, method: req.method, path, status: res.statusCode, ms: Date.now() - started });
    });
    handle(req, res).catch((error: unknown) => {
      const status = error instanceof AuthError ? error.status : 500;
      if (status >= 500) log.error("http.error", { id: requestId, error: error instanceof Error ? (error.stack ?? error.message) : String(error) });
      if (res.headersSent) return void res.end();
      // Internal details stay in the log; the client gets the request id to quote.
      const message = status >= 500 ? `Something went wrong (request ${requestId}).` : error instanceof Error ? error.message : String(error);
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ error: message }));
    });
  };

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    const json = (status: number, value: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(value));
    };
    // HTTPS + security headers, only when this deployment is served over TLS. Local http dev is
    // left alone: HSTS on a plain-http host strands the browser.
    const secure = siteUrl.startsWith("https://");
    const securityHeaders: Record<string, string> = {
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "SAMEORIGIN",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      ...(secure ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" } : {}),
    };
    const send = (status: number, type: string, body: string, cache = "no-cache") => {
      res.writeHead(status, { "Content-Type": type, "Cache-Control": cache, ...securityHeaders });
      res.end(body);
    };
    const redirect = (location: string) => {
      res.writeHead(302, { Location: location, ...securityHeaders });
      res.end();
    };

    // Canonical host + scheme: one URL per page, https, no trailing-slash duplicates.
    if (secure && req.headers["x-forwarded-proto"] === "http") {
      return redirect(`${siteUrl}${url.pathname}${url.search}`);
    }
    if ((req.method === "GET" || req.method === "HEAD") && url.pathname !== "/" && url.pathname.endsWith("/") && !url.pathname.startsWith("/app")) {
      return redirect(`${url.pathname.replace(/\/+$/, "")}${url.search}`);
    }

    // ---------------------------------------------------------------- health
    // Liveness: the process answers. Readiness: it can reach its database and isn't shutting down.
    if (url.pathname === "/healthz") return json(200, { ok: true });
    if (url.pathname === "/readyz") {
      if (draining) return json(503, { ok: false, reason: "shutting down" });
      try {
        await withTimeout(store.ping(), 2000);
        return json(200, { ok: true, store: store.kind, media: media.kind, worker: worker ? (worker.busy ? "busy" : "idle") : "off" });
      } catch (e) {
        return json(503, { ok: false, reason: `store unreachable: ${e instanceof Error ? e.message : String(e)}` });
      }
    }

    // Cross-site POSTs are refused (the session cookie is SameSite=Lax as a second line).
    if (req.method === "POST") {
      const origin = req.headers.origin;
      let sameSite = true;
      try {
        sameSite = !origin || new URL(origin).host === req.headers.host;
      } catch {
        sameSite = false;
      }
      if (!sameSite) return json(403, { error: "Cross-site request refused." });
    }
    const user = await auth.user(req);

    // ---------------------------------------------------------------- public site
    if (url.pathname === "/" && req.method === "GET") return send(200, "text/html; charset=utf-8", landingPage(siteUrl, user));
    if (url.pathname === "/how") return send(200, "text/html; charset=utf-8", howPage(siteUrl, user));
    if (url.pathname === "/lab") return send(200, "text/html; charset=utf-8", labPage(siteUrl, user));
    if (url.pathname === "/safety") return send(200, "text/html; charset=utf-8", safetyPage(siteUrl, user));
    if (url.pathname === "/pricing") return send(200, "text/html; charset=utf-8", pricingPage(siteUrl, user));
    if (url.pathname === "/compare" || url.pathname === "/compare/") return redirect("/compare/walkcast-vs-loom");
    if (url.pathname.startsWith("/compare/")) {
      const slug = url.pathname.slice("/compare/".length).replace(/\/$/, "");
      const html = comparePage(siteUrl, slug, user);
      if (html) return send(200, "text/html; charset=utf-8", html);
    }
    if (url.pathname === "/guides" || url.pathname === "/guides/") return send(200, "text/html; charset=utf-8", guidesIndexPage(siteUrl, user));
    if (url.pathname.startsWith("/guides/")) {
      const guide = guideBySlug(url.pathname.slice("/guides/".length).replace(/\/$/, ""));
      if (guide) return send(200, "text/html; charset=utf-8", guidePage(siteUrl, guide, user));
    }
    if (url.pathname === "/robots.txt") return send(200, "text/plain; charset=utf-8", robotsTxt(siteUrl), "max-age=3600");
    if (url.pathname === "/sitemap.xml") return send(200, "application/xml; charset=utf-8", sitemapXml(siteUrl), "max-age=3600");
    if (url.pathname === "/llms.txt") return send(200, "text/plain; charset=utf-8", llmsTxt(siteUrl), "max-age=3600");
    if (url.pathname === "/pricing.md") return send(200, "text/markdown; charset=utf-8", pricingMd(siteUrl), "max-age=3600");
    if (url.pathname === "/favicon.svg" || url.pathname === "/favicon.ico") return send(200, "image/svg+xml", FAVICON, "max-age=86400");
    if (url.pathname.startsWith("/assets/")) {
      const asset = assetPath(url.pathname.slice("/assets/".length));
      if (!asset) return json(404, { error: "not found" });
      return streamFile(req, res, asset.path, asset.type, "public, max-age=86400");
    }
    if (url.pathname === "/signup" || url.pathname === "/login" || url.pathname === "/forgot" || url.pathname === "/reset") {
      const mode = url.pathname.slice(1) as "signup" | "login" | "forgot" | "reset";
      if ((mode === "forgot" || mode === "reset") && auth.kind !== "supabase") return send(404, "text/plain; charset=utf-8", "Password reset needs Supabase Auth on this server.");
      const target = url.searchParams.get("url");
      const next = safeNext(url.searchParams.get("next") ?? (target ? `/app#record?url=${encodeURIComponent(target)}` : null));
      if (user && mode !== "reset") return redirect(next);
      const opts = await authOptions();
      const notice = url.searchParams.get("notice") ?? undefined;
      return send(
        200,
        "text/html; charset=utf-8",
        authPage(siteUrl, mode, { google: opts.google, openrouter: opts.openrouter, chatgpt: opts.chatgpt, forgot: opts.forgot, provider: auth.kind, next, ...(target ? { url: target } : {}), ...(notice ? { notice: notice.slice(0, 300) } : {}) }),
      );
    }
    if (url.pathname === "/start") {
      const target = url.searchParams.get("url") ?? "";
      return redirect(user ? `/app#record?url=${encodeURIComponent(target)}` : `/signup?url=${encodeURIComponent(target)}`);
    }

    // ---------------------------------------------------------------- accounts
    if (url.pathname === "/auth/signup" && req.method === "POST") {
      const b = await readJson(req);
      const next = safeNext(typeof b.next === "string" ? b.next : null);
      const name = typeof b.name === "string" ? b.name : undefined;
      if (auth.kind === "supabase") {
        const r = await auth.signUp(res, String(b.email ?? ""), String(b.password ?? ""), name, clientIp(req), next);
        if ("confirmEmail" in r) return json(200, { message: "Check your email: we sent you a link to confirm your address. Open it in this browser to finish signing up." });
        await auth.startSession(res, r.user);
        return json(201, { user: publicUser(r.user), next });
      }
      const created = await auth.signUp(String(b.email ?? ""), String(b.password ?? ""), name, clientIp(req));
      await auth.startSession(res, created);
      return json(201, { user: publicUser(created), next });
    }
    if (url.pathname === "/auth/login" && req.method === "POST") {
      const b = await readJson(req);
      const found = await auth.signIn(String(b.email ?? ""), String(b.password ?? ""), clientIp(req));
      await auth.startSession(res, found);
      return json(200, { user: publicUser(found), next: safeNext(typeof b.next === "string" ? b.next : null) });
    }
    if (url.pathname === "/auth/forgot" && req.method === "POST" && auth.kind === "supabase") {
      const b = await readJson(req);
      await auth.forgot(res, String(b.email ?? ""), clientIp(req));
      return json(200, { message: "If an account exists for that address, we've emailed a link to reset the password. Open it in this browser." });
    }
    if (url.pathname === "/auth/reset" && req.method === "POST" && auth.kind === "supabase") {
      const b = await readJson(req);
      const updated = await auth.resetPassword(req, res, String(b.password ?? ""));
      await auth.startSession(res, updated);
      return json(200, { user: publicUser(updated), next: "/app#record" });
    }
    if (url.pathname === "/auth/logout") {
      await auth.endSession(req, res);
      return redirect("/");
    }
    if (url.pathname === "/auth/google") {
      if (auth.kind === "supabase" && !(await auth.options()).google) throw new AuthError(503, "Google sign-in isn't turned on in this Supabase project.");
      return auth.googleRedirect(res, url.searchParams.get("next") ?? "/app#record");
    }
    if (url.pathname === "/auth/openrouter") {
      if (auth.kind !== "local") throw new AuthError(503, "OpenRouter sign-in requires the local auth mode (not Supabase).");
      return auth.openrouterRedirect(res, url.searchParams.get("next") ?? "/app#record");
    }
    if (url.pathname === "/auth/chatgpt") {
      if (auth.kind !== "local") throw new AuthError(503, "ChatGPT sign-in requires the local auth mode (not Supabase).");
      return auth.chatgptRedirect(res, url.searchParams.get("next") ?? "/app#record");
    }
    // Supabase Auth sends the browser back here after Google, an email confirmation or a reset link.
    if (url.pathname === "/auth/callback" && auth.kind === "supabase") {
      try {
        const r = await auth.callback(req, res, url);
        if ("recovery" in r) return redirect("/reset");
        await auth.startSession(res, r.user);
        return redirect(safeNext(r.next));
      } catch (e) {
        if (!(e instanceof AuthError)) throw e;
        return redirect(`/login?notice=${encodeURIComponent(e.message)}`);
      }
    }
    if (url.pathname === "/auth/google/callback" && auth.kind === "local") {
      try {
        const { user: signedIn, next } = await auth.googleCallback(req, url);
        await auth.startSession(res, signedIn);
        return redirect(safeNext(next));
      } catch (e) {
        if (res.headersSent) return void res.end();
        return send(e instanceof AuthError ? e.status : 500, "text/plain; charset=utf-8", e instanceof Error ? e.message : String(e));
      }
    }
    if (url.pathname === "/auth/openrouter/callback" && auth.kind === "local") {
      try {
        const { user: signedIn, next } = await auth.openrouterCallback(req, url);
        await auth.startSession(res, signedIn);
        return redirect(safeNext(next));
      } catch (e) {
        if (res.headersSent) return void res.end();
        return send(e instanceof AuthError ? e.status : 500, "text/plain; charset=utf-8", e instanceof Error ? e.message : String(e));
      }
    }
    if (url.pathname === "/auth/chatgpt/callback" && auth.kind === "local") {
      try {
        const { user: signedIn, next } = await auth.chatgptCallback(req, url);
        await auth.startSession(res, signedIn);
        return redirect(safeNext(next));
      } catch (e) {
        if (res.headersSent) return void res.end();
        return send(e instanceof AuthError ? e.status : 500, "text/plain; charset=utf-8", e instanceof Error ? e.message : String(e));
      }
    }
    if (url.pathname === "/api/me") return json(200, { user: publicUser(user), google: (await authOptions()).google, openrouter: (await authOptions()).openrouter, chatgpt: (await authOptions()).chatgpt, provider: auth.kind, authRequired: requireAuth });

    // Everything below is the dashboard: its data (recordings of signed-in pages, traces) and its
    // actions need an account when accounts are on.
    if (requireAuth && !user && (url.pathname.startsWith("/api/") || url.pathname.startsWith("/files/"))) {
      return json(401, { error: "Sign in to use the dashboard.", signIn: `/login?next=${encodeURIComponent("/app")}` });
    }
    // A recording is visible to the account that made it; ones made from the CLI (no owner) only
    // on a server that isn't reachable from other machines.
    const canSee = (owner: string | null | undefined) => (owner ? !requireAuth || owner === user?.id : !exposed);
    const owner = user?.id ?? null;

    // ---------------------------------------------------------------- dashboard API
    if (url.pathname === "/api/index") {
      const limit = clampInt(url.searchParams.get("limit"), 1, 2000, 500);
      const index = data.index(limit);
      return json(200, { ...index, recordings: (await listRecordings(user)).filter((r) => canSee(r.owner)) });
    }
    if (url.pathname === "/api/capabilities") {
      return json(200, {
        live: true,
        running: worker?.busy ? "a job" : null,
        queue: await store.queueDepth().catch(() => null),
        user: publicUser(user),
        authRequired: requireAuth,
        stagehand: Boolean(process.env.LAB_CHROME_PATH && existsSync(process.env.LAB_CHROME_PATH)),
        liveModels: allowLiveRuns,
        providers: configuredProviders().map((p) => p.id),
        agents: allAgents().map((a) => ({ id: a.id, kind: a.kind, description: a.description })),
        scenarios: allScenarios("pairs"),
        limits: LIMITS,
        usage: { recordingsToday: (await listRecordings(user)).filter((r) => canSee(r.owner) && Date.now() - Date.parse(r.createdAt) < 86_400_000).length },
        voices: { available: hasFlite(), list: VOICES, editable: media.kind === "local" },
        jobsUnavailable: o.jobsUnavailable ?? null,
      });
    }
    // ---------------------------------------------------------------- narration
    const voiceMatch = /^\/api\/voices\/(\w+)\.wav$/.exec(url.pathname);
    if (voiceMatch) {
      if (!isVoice(voiceMatch[1])) return json(404, { error: "Unknown voice." });
      if (!hasFlite()) return json(503, { error: "Voice previews need ffmpeg with the flite voice on this server." });
      const wav = await voicePreview(voiceMatch[1]);
      res.writeHead(200, { "Content-Type": "audio/wav", "Content-Length": wav.length, "Cache-Control": "private, max-age=86400" });
      return void res.end(wav);
    }
    const narrationMatch = /^\/api\/recordings\/([\w.-]+)\/(narration|voiceover)$/.exec(url.pathname);
    if (narrationMatch && req.method === "POST") {
      const [, id, what] = narrationMatch as unknown as [string, string, "narration" | "voiceover"];
      const row = await findRecording(id);
      if (!row || !canSee(row.owner)) return json(404, { error: "Recording not found." });
      if (media.kind !== "local") return json(501, { error: "Editing narration needs recordings kept on this server's disk." });
      const dir = join(root, "recordings", id);
      const file = join(dir, "recording.json");
      if (!existsSync(file)) return json(404, { error: "Recording not found." });
      const summary = JSON.parse(readFileSync(file, "utf8")) as RecordingSummary & Record<string, unknown>;
      let result;
      if (what === "narration") {
        const b = await readJson(req, 500_000);
        const captions = validateCaptions(b.captions);
        const voice = isVoice(b.voice) ? b.voice : "slt";
        result = await renarrate(dir, captions, voice);
        summary.captions = captions;
      } else {
        const audioPath = await readBodyToTemp(req, 40_000_000, "voiceover");
try {
  result = await voiceover(dir, audioPath, summary.captions);
} finally {
  rmSync(audioPath, { force: true });
}
      }
      summary.media = { ...summary.media, ...result, video: summary.media.video };
      writeFileSync(file, JSON.stringify(summary, null, 2));
      if (store.kind !== "file") {
        const { dir: _dir, ...rest } = summary;
        await store.saveRecording({ id, owner: row.owner, url: summary.url, createdAt: summary.createdAt, summary: rest });
      }
      return json(200, { recording: { ...summary, id, dir: `recordings/${id}` } });
    }
    if ((url.pathname === "/api/run" || url.pathname === "/api/record") && req.method === "POST") {
      if (draining) return json(503, { error: "The server is restarting. Try again in a moment." });
      if (o.jobsUnavailable) return json(503, { error: o.jobsUnavailable });
      const kind = url.pathname === "/api/run" ? "run" : "record";
      const b = await readJson(req);
      const input = kind === "run" ? validateRun(b, allowLiveRuns) : validateRecord(b, exposed);
      // A retried submit (double-click, network retry) gets the job it already created.
      const idempotencyKey = typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"].slice(0, 100) : null;
      if (idempotencyKey) {
        const existing = await store.jobByKey(owner, idempotencyKey);
        if (existing) return json(202, { job: await withQueue(store, existing) });
      }
      // Per-user limits, enforced atomically in the store so they hold across instances: the
      // daily quota and the active-job ceiling are single statements, not reads the caller races.
      const perDay = kind === "record" ? LIMITS.recordingsPerDay : LIMITS.runsPerDay;
      if ((await store.hit(`quota:${kind}:${owner ?? "local"}`, 86_400_000)) > perDay) {
        throw new AuthError(429, `Daily limit reached (${perDay} ${kind === "record" ? "recordings" : "runs"}). Try again tomorrow.`);
      }
      let secret: string | null = null;
      if (kind === "record" && typeof b.password === "string" && b.password) {
        if (!worker && !sharedKeyConfigured()) throw new AuthError(503, "This server is missing LAB_SECRET_KEY, which separate workers need to receive sign-in details. Ask the operator to set it.");
        secret = seal(b.password);
      }
      const job = await store.enqueueLimited({ kind, owner, input, secret, idempotencyKey }, LIMITS.activeJobsPerUser);
      if (!job) throw new AuthError(429, "You already have a job running. Wait for it to finish.");
      worker?.poke();
      log.info("job.enqueued", { job: job.id, kind, owner });
      return json(202, { job: await withQueue(store, job) });
    }
     const jobMatch = /^\/api\/jobs\/([\w-]+)$/.exec(url.pathname);
    if (jobMatch) {
      const id = jobMatch[1]!;
      const ifNone = req.headers["if-none-match"];
      const cached = statusCache.get(id);
      if (cached && Date.now() - cached.at < STATUS_TTL_MS) {
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
      const payload = { job: await withQueue(store, job) };
      const body = JSON.stringify(payload);
      const etag = `"${createHash("sha1").update(body).digest("hex").slice(0, 16)}"`;
      setStatusCache(id, body, etag);
      if (ifNone && String(ifNone).trim() === etag) {
        res.writeHead(304, { ...securityHeaders, ETag: etag, "Cache-Control": "private, max-age=1" });
        return void res.end();
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", ...securityHeaders, ETag: etag, "Cache-Control": "private, max-age=1" });
      return void res.end(body);
    }
    if (url.pathname === "/api/metrics") {
      let windowMs = 86_400_000;
      const q = url.searchParams.get("windowMs");
      if (q) {
        const n = Number(q);
        if (!Number.isFinite(n) || n <= 0 || n > 31 * 86_400_000) return json(400, { error: "windowMs must be 1ms..31 days" });
        windowMs = n;
      }
      const snap = await store.metrics(windowMs);
      // Open to operators; authed users only see queue-level aggregates (no per-tenant content).
      return json(200, snap);
    }
    if (url.pathname === "/api/run") {
      const detail = data.run(url.searchParams.get("dir") ?? "");
      return detail ? json(200, detail) : json(404, { error: "run not found" });
    }
    if (url.pathname.startsWith("/files/")) {
      let rel: string;
      try {
        rel = decodeURIComponent(url.pathname.slice("/files/".length));
      } catch {
        return json(400, { error: "bad path" });
      }
      // Accept a backslash as a separator too: recordings indexed before this was normalised on
      // Windows carry "recordings\<id>" in their `dir`, and those are already on disk.
      const rec = /^recordings[\\/]([^\\/]+)[\\/]([^\\/]+)$/.exec(rel);
      if (rec) {
        const [, id, file] = rec as unknown as [string, string, string];
        const row = await findRecording(id);
        if (!row || !canSee(row.owner)) return json(404, { error: "not found" });
        const where = await media.locate(id, file);
        if (!where) return json(404, { error: "not found" });
        if ("redirect" in where) return redirect(where.redirect);
        return streamFile(req, res, where.path, TYPES[extname(file).toLowerCase()] ?? "application/octet-stream", "private, max-age=3600");
      }
      const abs = data.safe(rel);
      const type = abs ? TYPES[extname(abs).toLowerCase()] : undefined;
      const inRecordings = !!abs && (abs === join(data.root, "recordings") || abs.startsWith(join(data.root, "recordings") + sep));
      if (!abs || !type || !existsSync(abs) || inRecordings) return json(404, { error: "not found" });
      return streamFile(req, res, abs, type, "private, max-age=3600");
    }
    if (url.pathname === "/app" || url.pathname === "/app/") {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "X-Robots-Tag": "noindex, nofollow",
      });
      return void res.end(html);
    }
    {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache", ...securityHeaders, "X-Robots-Tag": "noindex, follow" });
      return void res.end(notFoundPage(siteUrl));
    }
  }

  /** Postgres: the recordings table. Local files: recordings/*\/recording.json (CLI ones included). */
  async function listRecordings(user: User | null): Promise<RecordingSummary[]> {
    if (store.kind === "file") return data.recordings();
    const rows = await store.recordings(requireAuth ? (user?.id ?? "-") : null, 100);
    return rows.map((r) => ({ ...(r.summary as unknown as RecordingSummary), id: r.id, owner: r.owner ?? undefined, dir: `recordings/${r.id}` }));
  }
  async function findRecording(id: string): Promise<{ owner: string | null } | null> {
    if (store.kind === "file") {
      const r = data.recordings().find((x) => x.id === id || basename(x.dir) === id);
      return r ? { owner: r.owner ?? null } : null;
    }
    return store.recording(id);
  }

  return {
    handler,
    store,
    media,
    worker,
    auth: auth.kind,
    requireAuth,
    drain() {
      draining = true;
    },
  };
}

const STATUS_TTL_MS = Number(process.env.LAB_STATUS_TTL_MS ?? 1500);
const STATUS_CACHE_MAX = 20_000;
const statusCache = new Map<string, { body: string; etag: string; at: number }>();

function setStatusCache(id: string, body: string, etag: string) {
  if (statusCache.size >= STATUS_CACHE_MAX) {
    const first = statusCache.keys().next().value;
    if (first) statusCache.delete(first);
  }
  statusCache.set(id, { body, etag, at: Date.now() });
}

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

function validateRun(b: Record<string, unknown>, allowLiveRuns: boolean): Record<string, unknown> {
  const agent = String(b.agent ?? "v0");
  if (!allAgents().some((a) => a.id === agent)) throw new AuthError(400, `Unknown agent "${agent}".`);
  const modelMode = b.modelMode === undefined ? undefined : String(b.modelMode);
  if (modelMode !== undefined && !["live", "replay", "scripted"].includes(modelMode)) throw new AuthError(400, `Unknown model mode "${modelMode}".`);
  if (modelMode === "live" && !allowLiveRuns) throw new AuthError(403, "Live model runs are disabled on this server (they cost money). Set LAB_ALLOW_LIVE_RUNS=1 to allow them.");
  let fault: string;
  try {
    fault = normalizeScenario(String(b.fault ?? "none"));
  } catch (e) {
    throw new AuthError(400, e instanceof Error ? e.message : String(e));
  }
  const task: TaskId = isTaskId(String(b.task ?? "")) ? (b.task as TaskId) : "create-lead";
  const seed = Number.isFinite(Number(b.seed)) ? Math.trunc(Number(b.seed)) : 1;
  return { agent, fault, task, seed, ...(modelMode ? { modelMode } : {}) };
}

function validateRecord(b: Record<string, unknown>, exposed: boolean): Record<string, unknown> {
  if (b.authorized !== true) throw new AuthError(400, "Confirm that you own this site or are authorized to test it.");
  if (typeof b.url !== "string" || !b.url.trim()) throw new AuthError(400, "Paste the site's URL.");
  let url: URL;
  try {
    url = new URL(b.url.trim());
  } catch {
    throw new AuthError(400, "That doesn't look like a web address. Paste the full link, starting with https://");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new AuthError(400, "Only http(s) addresses can be recorded.");
  const pages = Number(b.maxPages);
  return {
    url: url.toString(),
    ...(typeof b.username === "string" && b.username ? { username: b.username.slice(0, 200) } : {}),
    maxPages: Number.isFinite(pages) ? Math.max(1, Math.min(30, Math.trunc(pages))) : 8,
    ...(isVoice(b.voice) ? { voice: b.voice } : {}),
    blockPrivate: exposed && process.env.LAB_ALLOW_PRIVATE !== "1",
  };
}

async function readBodyToTemp(req: IncomingMessage, limit: number, prefix: string): Promise<string> {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const tmpDir = path.join(os.tmpdir(), "walkcast-voiceover");
  fs.mkdirSync(tmpDir, { recursive: true });
  const file = path.join(tmpDir, `${randomUUID()}.bin`);
  const { createWriteStream } = await import("node:fs");
  // Pipe chunks to disk instead of buffering, so a 40 MB voice doesn't pin the event loop.
  const out = createWriteStream(file);
  let size = 0;
  try {
    for await (const chunk of req as AsyncIterable<Buffer>) {
      size += chunk.length;
      if (size > limit) throw new AuthError(413, "That recording is too large.");
      if (!out.write(chunk)) await new Promise<void>((r) => out.once("drain", () => r()));
    }
    out.end();
    await new Promise<void>((resolve, reject) => {
      out.on("finish", () => resolve());
      out.on("error", reject);
    });
  } catch (e) {
    fs.rmSync(file, { force: true });
    if (out && !out.destroyed) out.destroy();
    throw e;
  }
  if (!size) {
    fs.rmSync(file, { force: true });
    throw new AuthError(400, "No audio received.");
  }
  return file;
}
function validateCaptions(raw: unknown): { start: number; end: number; text: string }[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 500) throw new AuthError(400, "The script needs between 1 and 500 lines.");
  return raw.map((c, i) => {
    const x = c as { start?: unknown; end?: unknown; text?: unknown };
    const start = Number(x.start);
    const end = Number(x.end);
    const text = typeof x.text === "string" ? x.text.replace(/\s+/g, " ").trim().slice(0, 400) : "";
    if (!Number.isFinite(start) || start < 0 || !Number.isFinite(end) || !text) throw new AuthError(400, `Line ${i + 1} of the script is empty or has no time.`);
    return { start, end: Math.max(end, start), text };
  });
}

async function readJson(req: IncomingMessage, limit = 100_000): Promise<Record<string, unknown>> {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > limit) throw new AuthError(413, "Request body too large.");
  }
  try {
    const value = JSON.parse(body || "{}") as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value as Record<string, unknown>;
  } catch {
    throw new AuthError(400, "Request body must be a JSON object.");
  }
}

function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && raw !== null ? Math.max(min, Math.min(max, Math.trunc(n))) : fallback;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms))]);
}

/** The client's address; behind a reverse proxy set LAB_TRUST_PROXY=1 to use X-Forwarded-For. */
function clientIp(req: IncomingMessage): string {
  const forwarded = process.env.LAB_TRUST_PROXY === "1" ? String(req.headers["x-forwarded-for"] ?? "").split(",")[0]?.trim() : "";
  return forwarded || req.socket.remoteAddress || "?";
}

/** Serve a file with byte-range support, so video players can seek. */
function streamFile(req: IncomingMessage, res: ServerResponse, abs: string, type: string, cache: string): void {
  let size: number;
  try {
    const st = statSync(abs);
    if (!st.isFile()) { res.writeHead(404); res.end(); return; }
    size = st.size;
  } catch {
    res.writeHead(404); res.end(); return;
  }
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      res.writeHead(416, { "Content-Range": `bytes */${size}` });
      res.end();
      return;
    }
    res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Cache-Control": cache });
    const s = createReadStream(abs, { start, end }).on("error", () => { if (!res.headersSent) { res.writeHead(500); } res.end(); });
    s.pipe(res);
    return;
  }
  res.writeHead(200, { "Content-Type": type, "Cache-Control": cache, "Accept-Ranges": "bytes", "Content-Length": size });
  const s = createReadStream(abs).on("error", () => { if (!res.headersSent) { res.writeHead(500); } res.end(); });
  s.pipe(res);
}

export interface ExportOptions {
  out: string;
  /** Include at most this many runs (newest first). */
  maxRuns: number;
  /** Embed step screenshots as data URIs (bigger file, fully self-contained). */
  screenshots: boolean;
  /** Embed screenshots for at most this many runs (newest first), to bound file size. */
  screenshotRuns?: number;
  /** Write page content without the html/head/body wrapper (for hosts that add their own). */
  fragment?: boolean;
  /** Embed the narrated MP4 and captions of at most this many recordings (newest first). */
  recordings?: number;
  root?: string;
}

/**
 * A single self-contained HTML file with the data baked in: for CI artifacts, sharing, or
 * opening without the server.
 */
export function exportDashboard(options: ExportOptions): { path: string; runs: number; bytes: number } {
  const data = new LabData(options.root);
  const index = data.index();
  const runs = index.runs.slice(0, options.maxRuns);
  const details: Record<string, RunDetail> = {};
  const files: Record<string, string> = {};
  let withShots = 0;
  for (const run of runs) {
    const detail = data.run(run.dir);
    if (!detail) continue;
    details[run.dir] = detail;
    if (!options.screenshots || run.screenshots === 0 || withShots >= (options.screenshotRuns ?? Infinity)) continue;
    withShots++;
    for (const e of detail.events) {
      if (e.type !== "step" || !e.screenshot) continue;
      const rel = join(run.dir, basename(e.screenshot));
      const abs = data.safe(rel);
      if (abs && existsSync(abs)) files[rel] = `data:image/jpeg;base64,${readFileSync(abs).toString("base64")}`;
    }
  }
  const recordings = index.recordings.slice(0, options.recordings ?? 1);
  for (const rec of recordings) {
    for (const [name, mime] of [[rec.media.mp4, "video/mp4"], [rec.media.webm ?? null, "video/webm"], [rec.media.captions, "text/vtt"]] as const) {
      const abs = name ? data.safe(join(rec.dir, name)) : null;
      if (abs && existsSync(abs)) files[join(rec.dir, name!)] = `data:${mime};base64,${readFileSync(abs).toString("base64")}`;
    }
  }
  const payload: { index: LabIndex; details: Record<string, RunDetail>; files: Record<string, string> } = {
    index: { ...index, runs, recordings },
    details,
    files,
  };
  const script = `<script>window.__LAB_DATA__=${JSON.stringify(payload).replace(/</g, "\\u003c")}</script>`;
  let html = dashboardHtml().replace("</head>", `${script}</head>`);
  if (options.fragment) {
    const head = html.match(/<head>([\s\S]*)<\/head>/)?.[1] ?? "";
    const body = html.match(/<body>([\s\S]*)<\/body>/)?.[1] ?? "";
    html = head.replace(/<meta charset[^>]*>\s*/i, "").replace(/<meta name="viewport"[^>]*>\s*/i, "") + body;
  }
  writeFileSync(options.out, html);
  return { path: options.out, runs: Object.keys(details).length, bytes: Buffer.byteLength(html) };
}
