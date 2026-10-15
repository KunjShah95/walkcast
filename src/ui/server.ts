import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LabData, type LabIndex, type RunDetail } from "./data.ts";
import { type TaskId, allScenarios, isTaskId, normalizeScenario } from "../app/faults.ts";
import { taskById } from "../lab/task.ts";
import { allAgents } from "../agents/registry.ts";
import { runOnce } from "../lab/runner.ts";
import { configuredProviders } from "../llm/providers.ts";
import { RecordError, recordSite } from "../record/site.ts";
import { Auth, AuthError, defaultAuthFile, publicUser, safeNext } from "../site/auth.ts";
import { FAVICON, assetPath, authPage, guidePage, guidesIndexPage, landingPage, llmsTxt, robotsTxt, sitemapXml } from "../site/pages.ts";
import { guideBySlug } from "../site/guides.ts";

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "dashboard", "dist", "index.html");
const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".wav": "audio/wav",
  ".vtt": "text/vtt; charset=utf-8",
};

function dashboardHtml(): string {
  if (!existsSync(DIST)) throw new Error("Dashboard not built. Run: npm run ui:build");
  return readFileSync(DIST, "utf8");
}

export interface ServeOptions {
  root?: string;
  /** Interface to bind; 127.0.0.1 unless LAB_HOST says otherwise. */
  host?: string;
  /** Public origin used for canonical URLs, sitemaps and OAuth redirects. */
  siteUrl?: string;
  /** Require a signed-in account to start runs and recordings (default on; LAB_AUTH=off disables). */
  requireAuth?: boolean;
  /** Don't keep the process alive just for this server (tests). */
  unref?: boolean;
}

/**
 * The lab's web server: the public landing page and crawler files at /, accounts under /auth,
 * and the dashboard at /app over runs/, fixtures/, results/ and recordings/.
 */
export async function serveDashboard(port: number, options: ServeOptions | string = {}): Promise<string> {
  const o = typeof options === "string" ? { root: options } : options;
  const root = o.root ?? process.cwd();
  const host = o.host ?? process.env.LAB_HOST ?? "127.0.0.1";
  const siteUrl = (o.siteUrl ?? process.env.LAB_SITE_URL ?? `http://127.0.0.1:${port}`).replace(/\/$/, "");
  const requireAuth = o.requireAuth ?? process.env.LAB_AUTH !== "off";
  const data = new LabData(root);
  const auth = new Auth(defaultAuthFile(root), siteUrl);
  const html = dashboardHtml();
  let running: { label: string; owner: string | undefined } | null = null;
  const exposed = !["127.0.0.1", "localhost", "::1"].includes(host);
  const allowLiveRuns = !exposed || process.env.LAB_ALLOW_LIVE_RUNS === "1";
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const json = (status: number, value: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(value));
    };
    const send = (status: number, type: string, body: string, cache = "no-cache") => {
      res.writeHead(status, { "Content-Type": type, "Cache-Control": cache, "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" });
      res.end(body);
    };
    const readJsonBody = (handle: (body: Record<string, unknown>) => void | Promise<void>) => {
      let body = "";
      req.on("data", (c) => {
        body += c;
        if (body.length > 1e5) req.destroy();
      });
      req.on("end", () => {
        Promise.resolve()
          .then(() => handle(JSON.parse(body || "{}") as Record<string, unknown>))
          .catch((e: unknown) => json(e instanceof AuthError ? e.status : 400, { error: e instanceof Error ? e.message : String(e) }));
      });
    };
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
    const user = auth.user(req);
    try {
      // ---------------------------------------------------------------- public site
      if (url.pathname === "/" && req.method === "GET") return send(200, "text/html; charset=utf-8", landingPage(siteUrl, user));
      if (url.pathname === "/guides" || url.pathname === "/guides/") return send(200, "text/html; charset=utf-8", guidesIndexPage(siteUrl, user));
      if (url.pathname.startsWith("/guides/")) {
        const guide = guideBySlug(url.pathname.slice("/guides/".length).replace(/\/$/, ""));
        if (guide) return send(200, "text/html; charset=utf-8", guidePage(siteUrl, guide, user));
      }
      if (url.pathname === "/robots.txt") return send(200, "text/plain; charset=utf-8", robotsTxt(siteUrl), "max-age=3600");
      if (url.pathname === "/sitemap.xml") return send(200, "application/xml; charset=utf-8", sitemapXml(siteUrl), "max-age=3600");
      if (url.pathname === "/llms.txt") return send(200, "text/plain; charset=utf-8", llmsTxt(siteUrl), "max-age=3600");
      if (url.pathname === "/favicon.svg" || url.pathname === "/favicon.ico") return send(200, "image/svg+xml", FAVICON, "max-age=86400");
      if (url.pathname.startsWith("/assets/")) {
        const asset = assetPath(url.pathname.slice("/assets/".length));
        if (!asset) return json(404, { error: "not found" });
        return streamFile(req, res, asset.path, asset.type, "public, max-age=86400");
      }
      if (url.pathname === "/signup" || url.pathname === "/login") {
        const target = url.searchParams.get("url");
        const next = safeNext(url.searchParams.get("next") ?? (target ? `/app#record?url=${encodeURIComponent(target)}` : null));
        if (user) {
          res.writeHead(302, { Location: next });
          return res.end();
        }
        return send(200, "text/html; charset=utf-8", authPage(siteUrl, url.pathname === "/signup" ? "signup" : "login", { google: Boolean(auth.google), next, ...(target ? { url: target } : {}) }));
      }
      if (url.pathname === "/start") {
        const target = url.searchParams.get("url") ?? "";
        const app = `/app#record?url=${encodeURIComponent(target)}`;
        res.writeHead(302, { Location: user ? app : `/signup?url=${encodeURIComponent(target)}` });
        return res.end();
      }
      // ---------------------------------------------------------------- accounts
      if (url.pathname === "/auth/signup" && req.method === "POST") {
        return readJsonBody((b) => {
          const created = auth.signUp(String(b.email ?? ""), String(b.password ?? ""), typeof b.name === "string" ? b.name : undefined);
          auth.startSession(res, created);
          json(201, { user: publicUser(created) });
        });
      }
      if (url.pathname === "/auth/login" && req.method === "POST") {
        return readJsonBody((b) => {
          const found = auth.signIn(String(b.email ?? ""), String(b.password ?? ""), clientIp(req));
          auth.startSession(res, found);
          json(200, { user: publicUser(found) });
        });
      }
      if (url.pathname === "/auth/logout") {
        auth.endSession(req, res);
        res.writeHead(302, { Location: "/" });
        return res.end();
      }
      if (url.pathname === "/auth/google") return auth.googleRedirect(res, url.searchParams.get("next") ?? "/app#record");
      if (url.pathname === "/auth/google/callback") {
        auth
          .googleCallback(req, url)
          .then(({ user: signedIn, next }) => {
            auth.startSession(res, signedIn);
            res.writeHead(302, { Location: safeNext(next) });
            res.end();
          })
          .catch((e: unknown) => {
            if (res.headersSent) return res.end();
            send(e instanceof AuthError ? e.status : 500, "text/plain; charset=utf-8", e instanceof Error ? e.message : String(e));
          });
        return;
      }
      if (url.pathname === "/api/me") return json(200, { user: publicUser(user), google: Boolean(auth.google), authRequired: requireAuth });
      // Everything below is the dashboard: its data (recordings of signed-in pages, traces) and its
      // actions need an account when accounts are on.
      if (requireAuth && !user && (url.pathname.startsWith("/api/") || url.pathname.startsWith("/files/"))) {
        return json(401, { error: "Sign in to use the dashboard.", signIn: `/login?next=${encodeURIComponent("/app")}` });
      }
      // A recording is visible to the account that made it; ones made from the CLI (no owner) only
      // on a server that isn't reachable from other machines.
      const canSee = (owner: string | undefined) => (owner ? !requireAuth || owner === user?.id : !exposed);

      // ---------------------------------------------------------------- dashboard API
      if (url.pathname === "/api/index") {
        const index = data.index();
        return json(200, { ...index, recordings: index.recordings.filter((r) => canSee(r.owner)) });
      }
      if (url.pathname === "/api/capabilities") {
        return json(200, {
          live: true,
          running: running ? (running.owner === user?.id || !requireAuth ? running.label : "another job") : null,
          user: publicUser(user),
          authRequired: requireAuth,
          stagehand: Boolean(process.env.LAB_CHROME_PATH && existsSync(process.env.LAB_CHROME_PATH)),
          liveModels: allowLiveRuns,
          providers: configuredProviders().map((p) => p.id),
          agents: allAgents().map((a) => ({ id: a.id, kind: a.kind, description: a.description })),
          scenarios: allScenarios("pairs"),
        });
      }
      if ((url.pathname === "/api/run" || url.pathname === "/api/record") && req.method === "POST") {
        // One job at a time. Claimed before the body is read so two requests can't both start.
        if (running) return json(409, { error: `Busy: ${running.owner === user?.id || !requireAuth ? running.label : "another job is running"}. Try again shortly.` });
        const job = { label: url.pathname === "/api/run" ? "a run" : "a recording", owner: user?.id };
        running = job;
        const release = () => {
          if (running === job) running = null;
        };
        req.on("close", () => {
          if (!res.writableEnded && !req.complete) release();
        });
        return readJsonBody(async (b) => {
          try {
            if (url.pathname === "/api/run") {
              const agent = String(b.agent ?? "v0");
              if (!allAgents().some((a) => a.id === agent)) throw new AuthError(400, `Unknown agent "${agent}".`);
              const modelMode = b.modelMode === undefined ? undefined : String(b.modelMode);
              if (modelMode !== undefined && !["live", "replay", "scripted"].includes(modelMode)) throw new AuthError(400, `Unknown model mode "${modelMode}".`);
              if (modelMode === "live" && !allowLiveRuns) throw new AuthError(403, "Live model runs are disabled on this server (they cost money). Set LAB_ALLOW_LIVE_RUNS=1 to allow them.");
              const fault = normalizeScenario(String(b.fault ?? "none"));
              const task = taskById(isTaskId(String(b.task ?? "")) ? (b.task as TaskId) : "create-lead");
              const seed = Number.isFinite(Number(b.seed)) ? Number(b.seed) : 1;
              job.label = `${agent} on ${fault}`;
              const r = await runOnce({ fault, seed, agent, task, outDir: join(data.root, "runs"), screenshots: true, ...(modelMode ? { modelMode: modelMode as "live" | "replay" | "scripted" } : {}) });
              return json(200, { dir: join("runs", basename(r.runDir)) });
            }
            // Records a site the user says they may test. The password lives only in this request's memory.
            if (b.authorized !== true) throw new AuthError(400, "Confirm that you own this site or are authorized to test it.");
            if (typeof b.url !== "string" || !b.url.trim()) throw new AuthError(400, "Paste the site's URL.");
            job.label = `recording ${b.url}`;
            const pages = Number(b.maxPages);
            const r = await recordSite({
              url: b.url.trim(),
              ...(typeof b.username === "string" && b.username ? { username: b.username } : {}),
              ...(typeof b.password === "string" && b.password ? { password: b.password } : {}),
              maxPages: Number.isFinite(pages) ? Math.max(1, Math.min(30, pages)) : 8,
              authorized: true,
              outDir: join(data.root, "recordings"),
              blockPrivate: exposed && process.env.LAB_ALLOW_PRIVATE !== "1",
              ...(user ? { owner: user.id } : {}),
            });
            return json(200, { dir: join("recordings", basename(r.dir)) });
          } catch (e) {
            if (e instanceof RecordError) throw new AuthError(400, e.message);
            throw e instanceof AuthError ? e : new AuthError(500, e instanceof Error ? e.message : String(e));
          } finally {
            release();
          }
        });
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
        const abs = data.safe(rel);
        const type = abs ? TYPES[extname(abs).toLowerCase()] : undefined;
        if (!abs || !type || !existsSync(abs)) return json(404, { error: "not found" });
        const recording = /^recordings[\\/]([^\\/]+)/.exec(rel)?.[1];
        if (recording && !canSee(data.recordingOwner(recording))) return json(404, { error: "not found" });
        return streamFile(req, res, abs, type, "private, max-age=3600");
      }
      if (url.pathname === "/app" || url.pathname === "/app/") return send(200, "text/html; charset=utf-8", html);
      return send(404, "text/html; charset=utf-8", `<!doctype html><meta charset="utf-8"><title>Not found</title><p style="font-family:system-ui;padding:40px">Page not found. <a href="/">Home</a> · <a href="/app">Dashboard</a></p>`);
    } catch (error) {
      json(error instanceof AuthError ? error.status : 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
  await new Promise<void>((r) => server.listen(port, host, r));
  if (o.unref) server.unref();
  return `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`;
}

/** The client's address; behind a reverse proxy set LAB_TRUST_PROXY=1 to use X-Forwarded-For. */
function clientIp(req: IncomingMessage): string {
  const forwarded = process.env.LAB_TRUST_PROXY === "1" ? String(req.headers["x-forwarded-for"] ?? "").split(",")[0]?.trim() : "";
  return forwarded || req.socket.remoteAddress || "?";
}

/** Serve a file with byte-range support, so video players can seek. */
function streamFile(req: IncomingMessage, res: ServerResponse, abs: string, type: string, cache: string): void {
  const size = statSync(abs).size;
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
    createReadStream(abs, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { "Content-Type": type, "Cache-Control": cache, "Accept-Ranges": "bytes", "Content-Length": size });
  createReadStream(abs).pipe(res);
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
