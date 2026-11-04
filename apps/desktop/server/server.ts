import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LabData, type LabIndex, type RecordingSummary, type RunDetail } from "../../../packages/core/src/data.ts";
import { useLocalKeyFile } from "../../../packages/core/src/jobs/secret-box.ts";
import { Worker, failureDir } from "../../../packages/core/src/jobs/worker.ts";
import { type FailureReport, type RunFailure, explainFailure } from "../../../packages/core/src/record/failure.ts";
import { createMedia, type MediaStore } from "../../../packages/core/src/media/store.ts";
import { log } from "../../../packages/core/src/ops/log.ts";
import { Auth, AuthError, type User } from "./auth.ts";
import { DesktopTasks, sweepLaunchWork } from "./desktop-tasks.ts";
import { SupabaseAuth, supabaseAuthConfig } from "./supabase-auth.ts";
import { notFoundPage } from "./pages.ts";
import { createStore, type Job, type Store } from "../../../packages/core/src/store/index.ts";
import { importLegacyWebhooks, startWebhookDispatcher } from "../../../packages/core/src/webhooks.ts";
import { startQueueMonitor } from "../../../packages/core/src/ops/queue-monitor.ts";
import { importLegacySchedules, startScheduler } from "../../../packages/core/src/schedules.ts";
import { loadPlugins } from "../../../packages/core/src/plugins.ts";
import { applyCredentialsFile } from "./credentials.ts";
import { withTimeout } from "./http.ts";
import { SHUTDOWN_GRACE_MS } from "./routes/health.ts";
import { APP_ROUTES, PRE_CSRF_ROUTES, PUBLIC_ROUTES } from "./routes/index.ts";
import { type ServerDeps, createContext, dispatch, signInRequired } from "./routes/router.ts";

// Moved out when the routes became a table; still importable from here.
export { CREDENTIAL_ALIASES, CREDENTIAL_KEYS, type CredentialGroup, applyCredentialsFile, cleanCredential, credentialSet, readCredentials } from "./credentials.ts";
export { demoSiteEnabled, validateRun } from "./job-input.ts";

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dashboard", "dist", "index.html");
const APP_SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
/** Files bundled with the app (the walkthrough video), next to this module. */
const STATIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "static");

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
  /** The built dashboard (default: apps/desktop/dashboard/dist/index.html). */
  dashboardHtml?: string;
  /**
   * Running inside the desktop app: Google sign-in goes through the system browser, and pages the
   * system browser lands on (email links) explain themselves instead of starting a session there.
   */
  desktop?: boolean;
  /** How the desktop server opens a URL in the system browser (tests pass a stub). */
  openExternal?: (url: string) => void;
  /** How the desktop server shows a file in the OS file manager (tests pass a stub). */
  reveal?: (path: string) => void;
  /**
   * Called once POST /api/shutdown has closed everything (default: exit the process with 0).
   * Tests pass a stub so the test runner survives.
   */
  onShutdown?: () => void;
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
  /** Kill every running desktop task (Launch Studio render, Kokoro setup) and its process tree. */
  killTasks(): void;
  /** Set by serveDashboard: what POST /api/shutdown runs after answering 202. */
  shutdown?: () => Promise<void>;
}

export interface Running {
  url: string;
  store: Store;
  /** Stop accepting requests, let in-flight work finish (or hand it back to the queue), close. */
  close(graceMs?: number): Promise<void>;
}

async function freePort(host: string): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, host, () => resolve());
  });
  const { port } = probe.address() as { port: number };
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

export async function serveDashboard(port: number, options: ServeOptions | string = {}): Promise<Running> {
  const o = typeof options === "string" ? { root: options } : options;
  await loadPlugins(o.root ?? process.cwd());
  const host = o.host ?? process.env.LAB_HOST ?? "127.0.0.1";
  // 0 asks the OS for a free port instead of guessing one, which is what every caller that doesn't
  // care which port it gets (tests, mainly) should pass — a guessed port can collide with another
  // test's server running concurrently and the connection just refuses.
  const resolvedPort = port === 0 ? await freePort(host) : port;
  const app = createApp({ ...o, host, siteUrl: o.siteUrl ?? process.env.LAB_SITE_URL ?? `http://127.0.0.1:${resolvedPort}` });
  const { store, media, worker } = app;
  const server = createServer(app.handler);
  // Keep-alive longer than the ALB's idle timeout (60 s) so the balancer never reuses a closed socket.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 30_000;

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(resolvedPort, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  if (o.unref) server.unref();
  // The close() below only stops the listening socket. A request left on a keep-alive socket (or
  // one the test harness closed by aborting the event loop) keeps the process alive long enough
  // for the run to hit its 240 s budget on CI, where these tests are quarantined (#6).
  server.once("close", () => server.closeAllConnections());
  process.once("exit", () => server.closeAllConnections());
  const address = `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${resolvedPort}`;
  log.info("server.started", { url: address, store: store.kind, media: media.kind, worker: Boolean(worker), auth: app.requireAuth ? app.auth : "off" });
  let closing: Promise<void> | null = null;
  const running: Running = {
    url: address,
    store,
    close(graceMs = 30_000) {
      closing ??= closeNow(graceMs);
      return closing;
    },
  };
  async function closeNow(graceMs: number): Promise<void> {
      app.drain();
      // Stop accepting; idle keep-alive sockets close now, active requests finish.
      const closed = new Promise<void>((r) => server.close(() => r()));
      server.closeIdleConnections();
      // A launch film's renderer (and its Chromium) must not outlive the server that started it.
      app.killTasks();
      await worker?.stop(graceMs);
      const grace = await withTimeout(closed, 10_000).catch(() => server.closeAllConnections());
      // closeAllConnections() is async in newer Node versions; wait for it so the process has no
      // live connections when it exits (this is what lets the quarantined CI tests hang at the end,
      // after the assertions have already passed, when the event loop is still held by a keep-alive
      // socket whose listener the server never removed from the event loop).
      await grace;
      if (!o.store) await store.close();
      log.info("server.stopped", {});
  }
  // POST /api/shutdown: the desktop shell asks for an orderly exit instead of killing the process
  // mid-recording. The running job gets SHUTDOWN_GRACE_MS to finish, else it goes back to the queue.
  app.shutdown = async () => {
    log.info("server.shutdown_requested", {});
    try {
      await running.close(SHUTDOWN_GRACE_MS);
    } finally {
      (o.onShutdown ?? (() => process.exit(0)))();
    }
  };
  return running;
}

/**
 * Everything `serveDashboard` serves, as a plain `(req, res)` handler: the dashboard at /app, its
 * API, sign-in, and the recordings on disk. The marketing site is a separate static build.
 */
export function createApp(o: ServeOptions = {}): App {
  const root = o.root ?? process.cwd();
  const desktopTasks = new DesktopTasks();
  // Working folders of renders that died with an earlier process (none are running yet).
  sweepLaunchWork(root);
  applyCredentialsFile(root);
  const host = o.host ?? process.env.LAB_HOST ?? "127.0.0.1";
  const siteUrl = (o.siteUrl ?? process.env.LAB_SITE_URL ?? "http://127.0.0.1:4320").replace(/\/$/, "");
  // Whether anyone said where this server lives; createApp alone falls back to a guess.
  const siteUrlConfigured = Boolean(o.siteUrl ?? process.env.LAB_SITE_URL);
  const requireAuth = o.requireAuth ?? process.env.LAB_AUTH !== "off";
  // Credentials are a single process-global set (they land in process.env, so they are used by
  // every tenant). There is no admin/operator concept, so "is there a session" was the only gate:
  // any self-registered user could repoint LAB_CUSTOM_BASE_URL at their own host, exfiltrating
  // page content from everyone's runs, or delete the operator's keys. Fail closed — writing them
  // is refused whenever accounts exist unless an operator explicitly opts back in. Reading which
  // keys are set stays open; it exposes no values.
  // The desktop app is deliberately excluded: it runs one account on that person's own machine and
  // writes the keys to their own app-data directory, so Settings must keep working there even
  // though releases set WALKCAST_REQUIRE_ACCOUNTS=1. The restriction targets a *hosted* server
  // shared between accounts.
  const credentialsEditable = !requireAuth || Boolean(o.desktop) || process.env.LAB_CREDENTIALS_EDITABLE === "1";
  const store = o.store ?? createStore(root);
  // A local store keeps its sealing key beside it, so a queued sign-in survives a restart.
  if (store.kind === "file") useLocalKeyFile(dirname((store as { file?: string }).file ?? join(root, ".lab", "store.json")));
  const media = o.media ?? createMedia(root);
  const data = new LabData(root);
  // Supabase Auth when SUPABASE_URL + SUPABASE_ANON_KEY are set; otherwise built-in accounts.
  const forceLocal = process.env.LAB_AUTH === "local" || process.env.LAB_AUTH === "off";
  const supabaseCfg = forceLocal ? null : supabaseAuthConfig();
  const auth: Auth | SupabaseAuth = supabaseCfg ? new SupabaseAuth(store, siteUrl, supabaseCfg) : new Auth(store, siteUrl);
  const authOptions = async () =>
    auth.kind === "supabase"
      ? // Desktop: a reset link opens in the system browser, which can't hand the reset back to the app.
        // OpenRouter and ChatGPT sign-in exist only in the local auth mode.
        { ...(await auth.options()), openrouter: false, chatgpt: false, ...(o.desktop ? { forgot: false } : {}) }
      : { google: Boolean(auth.google), openrouter: true, chatgpt: true, forgot: false, confirmEmail: false, signupDisabled: false };
  const html = dashboardHtml(o.dashboardHtml);
  const appCsp = dashboardCsp(inlineScriptHashes(html));
  const exposed = !["127.0.0.1", "localhost", "::1"].includes(host);
  // Assigned at the end, once the handler it carries exists: POST /api/shutdown reads its hook.
  const self = {} as App;
  const allowLiveRuns = !exposed || process.env.LAB_ALLOW_LIVE_RUNS === "1";
  const worker = (o.worker ?? process.env.LAB_WORKER !== "off") ? new Worker({ store, media, root }).start() : null;
  // Both run on every instance: the store hands each due schedule and each delivery to exactly
  // one of them. Private targets are refused whenever the server is reachable from elsewhere.
  const blockPrivate = exposed && process.env.LAB_ALLOW_PRIVATE !== "1";
  void Promise.all([importLegacySchedules(root, store), importLegacyWebhooks(root, store)]).catch((e: unknown) => log.warn("legacy.import_failed", { error: String(e) }));
  const webhookDispatcher = startWebhookDispatcher(store, { blockPrivate });
  const scheduler = startScheduler(store, { blockPrivate, onEnqueued: () => worker?.poke() });
  const queueMonitor = startQueueMonitor(store);

  // Flipped by drain() and POST /api/shutdown; read by /readyz and the job routes.
  const state = { draining: false, shuttingDown: false };

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    const started = Date.now();
    // Behind an ALB the trace id ties our log line to the load balancer's.
    const requestId = String(req.headers["x-amzn-trace-id"] ?? req.headers["x-request-id"] ?? randomUUID());
    res.setHeader("X-Request-Id", requestId);
    res.on("finish", () => {
      const path = (req.url ?? "/").split("?")[0] ?? "/";
      log[requestLogLevel(req.method, path)]("http", { id: requestId, method: req.method, path, status: res.statusCode, ms: Date.now() - started });
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

  // What the route handlers used to close over, built once here (see routes/router.ts).
  const deps: ServerDeps = {
    o,
    root,
    appSourceRoot: APP_SOURCE_ROOT,
    staticDir: STATIC_DIR,
    store,
    media,
    data,
    worker,
    auth,
    authOptions,
    requireAuth,
    exposed,
    siteUrl,
    siteUrlConfigured,
    credentialsEditable,
    allowLiveRuns,
    blockPrivate,
    desktopTasks,
    html,
    appCsp,
    self,
    state,
    listRecordings,
    findRecording,
    saveRecordingSummary,
    failureFor,
    runFailureFor,
    noteRefusal,
  };

  /**
   * The request pipeline. The order is the contract: canonical-URL redirects, the loopback Host
   * check, health (no CSRF, no session), the CSRF check, the session, the public routes, the
   * sign-in gate for /api/ and /files/, the app routes, and the 404 page.
   */
  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const ctx = createContext(deps, req, res);
    const { url, json, redirect, securityHeaders } = ctx;

    // Canonical host + scheme: one URL per page, https, no trailing-slash duplicates.
    if (ctx.secure && req.headers["x-forwarded-proto"] === "http") {
      return redirect(`${siteUrl}${url.pathname}${url.search}`);
    }
    if ((req.method === "GET" || req.method === "HEAD") && url.pathname !== "/" && url.pathname.endsWith("/") && !url.pathname.startsWith("/app")) {
      return redirect(`${url.pathname.replace(/\/+$/, "")}${url.search}`);
    }

    // DNS rebinding: a loopback-only server answers only to the names loopback has. The Origin
    // check below can't catch this, because to the browser the rebound page *is* same-origin.
    // LAB_ALLOWED_HOSTS adds names (comma-separated host:port), e.g. the Vite dev proxy's.
    if (!exposed && !allowedLoopbackHost(req.headers.host, req.socket.localPort) && !extraAllowedHosts().includes(String(req.headers.host ?? "").toLowerCase())) {
      return json(421, { error: "This server only answers to its loopback address." });
    }

    // ---------------------------------------------------------------- health
    if (await dispatch(PRE_CSRF_ROUTES, ctx)) return;

    // Cross-site state changes are refused (the session cookie is SameSite=Lax as a second line).
    // This has to cover every mutating verb: DELETE /api/credentials and friends were unprotected
    // because only POST was checked.
    if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH" || req.method === "DELETE") {
      const origin = req.headers.origin;
      let sameSite = true;
      try {
        sameSite = !origin || new URL(origin).host === req.headers.host;
      } catch {
        sameSite = false;
      }
      if (!sameSite) return json(403, { error: "Cross-site request refused." });
    }
    ctx.user = await auth.user(req);
    ctx.owner = ctx.user?.id ?? null;

    // ---------------------------------------------------------------- app shell and accounts
    if (await dispatch(PUBLIC_ROUTES, ctx)) return;

    // Everything below is the dashboard: its data (recordings of signed-in pages, traces) and its
    // actions need an account when accounts are on.
    if (requireAuth && !ctx.user && (url.pathname.startsWith("/api/") || url.pathname.startsWith("/files/"))) {
      return signInRequired(ctx);
    }

    // ---------------------------------------------------------------- dashboard API
    if (await dispatch(APP_ROUTES, ctx)) return;

    {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache", ...securityHeaders, "X-Robots-Tag": "noindex, follow" });
      return void res.end(notFoundPage());
    }
  }

  /** Postgres: the recordings table. Local files: recordings/*\/recording.json (CLI ones included). */
  /** One failed recording job as the Lab shows it: the stored report when there is one. */
  function failureFor(job: Job): FailureReport {
    const path = join(failureDir(root, job.id), "failure.json");
    if (existsSync(path)) {
      try {
        return JSON.parse(readFileSync(path, "utf8")) as FailureReport;
      } catch {
        /* torn write: fall back to the job row */
      }
    }
    // No report: the worker died mid-job (app closed, crash) or this predates reports.
    const error = job.error ?? "The recording failed without an error message.";
    const input = job.input as { url?: string; demo?: boolean; refused?: boolean };
    return {
      ...(input.refused ? { refused: true } : {}),
      jobId: job.id,
      url: input.demo ? "Sample site" : String(input.url ?? ""),
      owner: job.owner,
      createdAt: job.createdAt,
      failedAt: job.finishedAt ?? job.createdAt,
      attempts: job.attempts,
      error,
      stage: job.progress,
      ...explainFailure(error),
      pages: [],
      signIn: null,
      skipped: [],
      durationMs: job.startedAt && job.finishedAt ? Date.parse(job.finishedAt) - Date.parse(job.startedAt) : null,
      files: { screenshot: null, video: null },
    };
  }

  /**
   * Keep a refused recording request as a failed job. The same refusal again within a couple of
   * minutes (repeated clicks while the browser downloads) is one entry, not a pile of them.
   */
  async function noteRefusal(owner: string | null, url: string, error: string, demo = false): Promise<void> {
    const recent = await store.failedJobs(owner, "record", 5);
    const now = Date.now();
    if (recent.some((j) => j.error === error && (j.input as { url?: unknown }).url === url && now - Date.parse(j.finishedAt ?? j.createdAt) < 2 * 60_000)) return;
    // Only the address: never the password or anything else from the request.
    await store.insertFailed({ kind: "record", owner, input: { url, refused: true, ...(demo ? { demo: true } : {}) } }, error);
  }

  /** A Lab agent run that never produced a result: its job row is all there is. */
  function runFailureFor(job: Job): RunFailure {
    const input = job.input as { agent?: string; fault?: string; task?: string; seed?: number; modelMode?: string };
    const error = job.error ?? "The run failed without an error message.";
    return {
      jobId: job.id,
      agent: String(input.agent ?? ""),
      fault: String(input.fault ?? "none"),
      task: String(input.task ?? "create-lead"),
      seed: Number(input.seed ?? 0),
      modelMode: input.modelMode ?? null,
      createdAt: job.createdAt,
      failedAt: job.finishedAt ?? job.createdAt,
      attempts: job.attempts,
      error,
      ...explainFailure(error),
    };
  }

  async function listRecordings(user: User | null): Promise<RecordingSummary[]> {
    if (store.kind === "file") return data.recordings();
    const rows = await store.recordings(requireAuth ? (user?.id ?? "-") : null, 100);
    return rows.map((r) => ({ ...(r.summary as unknown as RecordingSummary), id: r.id, owner: r.owner ?? undefined, dir: `recordings/${r.id}` }));
  }
  async function findRecording(id: string): Promise<{ owner: string | null; summary?: RecordingSummary } | null> {
    if (store.kind === "file") {
      const r = data.recordings().find((x) => x.id === id || basename(x.dir) === id);
      return r ? { owner: r.owner ?? null, summary: r } : null;
    }
    const row = await store.recording(id);
    return row ? { owner: row.owner ?? null, summary: row.summary as unknown as RecordingSummary } : null;
  }

  /**
   * Write a walkthrough's summary back, wherever it is kept.
   *
   * A summary lives in two places on a shared server: the file on disk and the row in the
   * database. Both are written, or the next reader sees one of them and not the other.
   *
   * The row is also the record of whether the walkthrough still exists. A re-voice, an export or
   * a transcript reads the summary, spends a minute on ffmpeg, then gets here. If the walkthrough
   * was deleted in the meantime, an upsert would bring the index row back pointing at files that
   * are gone, so a save after a delete is dropped instead.
   */
  async function saveRecordingSummary(id: string, owner: string | null, summary: RecordingSummary): Promise<void> {
    if (media.kind === "local") {
      const file = join(root, "recordings", id, "recording.json");
      if (existsSync(file)) writeFileSync(file, JSON.stringify(summary, null, 2));
    }
    if (store.kind !== "file") {
      if (!(await store.recording(id))) return;
      const { dir: _dir, ...rest } = summary;
      await store.saveRecording({ id, owner, url: summary.url, createdAt: summary.createdAt, summary: rest });
    }
  }

  Object.assign(self, {
    handler,
    store,
    media,
    worker,
    auth: auth.kind,
    requireAuth,
    drain() {
      state.draining = true;
      webhookDispatcher.stop();
      scheduler.stop();
      queueMonitor.stop();
    },
    killTasks() {
      desktopTasks.killAll();
    },
  } satisfies App);
  return self;
}

/**
 * How a request is logged. The dashboard polls job status, health and the live preview every
 * second or two; at info those lines buried everything else in the log, so they go at debug.
 */
export function requestLogLevel(method: string | undefined, path: string): "debug" | "info" {
  if (path === "/healthz" || path === "/readyz") return "debug";
  if ((method === "GET" || method === "HEAD") && (path.startsWith("/api/jobs/") || path.startsWith("/api/launch-videos/jobs/"))) return "debug";
  return "info";
}

/**
 * The Host values a loopback-only server answers to. Anything else is a DNS-rebinding attempt: a
 * page on evil.example re-pointed its own name at 127.0.0.1, so the browser treats the request as
 * same-origin to evil.example — the Origin check alone can't tell.
 */
export function allowedLoopbackHost(hostHeader: string | undefined, port: number | undefined): boolean {
  if (!hostHeader || !port) return false;
  const h = hostHeader.trim().toLowerCase();
  const names = ["127.0.0.1", "localhost", "[::1]"];
  return names.some((n) => h === `${n}:${port}` || (port === 80 && h === n));
}

function extraAllowedHosts(): string[] {
  return (process.env.LAB_ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
}

/** The inline scripts of the dashboard page, as CSP hashes, so script-src needs no 'unsafe-inline'. */
export function inlineScriptHashes(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    out.push(`'sha256-${createHash("sha256").update(m[1]!, "utf8").digest("base64")}'`);
  }
  return [...new Set(out)];
}

/**
 * The dashboard's Content-Security-Policy. The page is one self-contained file (vite single-file:
 * the bundle is an inline module script, assets are data: URIs), so scripts are pinned by hash.
 * Styles stay 'unsafe-inline': the bundle inlines its stylesheet and components set style
 * attributes. hls.js plays the live preview through blob: URLs and a blob: worker; recordings in
 * object storage are presigned https: redirects. The desktop shell's IPC is ipc:/ipc.localhost.
 */
export function dashboardCsp(scriptHashes: string[]): string {
  return [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.join(" ")}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' ipc: http://ipc.localhost",
    "worker-src 'self' blob:",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; ");
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
