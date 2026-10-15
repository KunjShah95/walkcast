import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { lookup } from "node:dns/promises";
import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import { isIP } from "node:net";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LabData, type LabIndex, type RunDetail } from "./data.ts";
import { type TaskId, allScenarios, isTaskId, normalizeScenario } from "../app/faults.ts";
import { taskById } from "../lab/task.ts";
import { allAgents } from "../agents/registry.ts";
import { runOnce } from "../lab/runner.ts";
import { configuredProviders } from "../llm/providers.ts";
import { recordSite } from "../record/site.ts";
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
  let running: string | null = null;
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
          const found = auth.signIn(String(b.email ?? ""), String(b.password ?? ""), req.socket.remoteAddress ?? "?");
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
        auth.googleCallback(req, url).then(
          ({ user: signedIn, next }) => {
            auth.startSession(res, signedIn);
            res.writeHead(302, { Location: next });
            res.end();
          },
          (e: unknown) => send(e instanceof AuthError ? e.status : 500, "text/plain; charset=utf-8", e instanceof Error ? e.message : String(e)),
        );
        return;
      }
      if (url.pathname === "/api/me") return json(200, { user: publicUser(user), google: Boolean(auth.google), authRequired: requireAuth });
      if (requireAuth && !user && req.method === "POST" && (url.pathname === "/api/run" || url.pathname === "/api/record")) {
        return json(401, { error: "Sign in to start runs and recordings.", signIn: "/login?next=%2Fapp%23record" });
      }
      // ---------------------------------------------------------------- dashboard API
      if (url.pathname === "/api/index") return json(200, data.index());
      if (url.pathname === "/api/capabilities") {
        return json(200, {
          live: true,
          running,
          user: publicUser(user),
          authRequired: requireAuth,
          stagehand: Boolean(process.env.LAB_CHROME_PATH && existsSync(process.env.LAB_CHROME_PATH)),
          providers: configuredProviders().map((p) => p.id),
          agents: allAgents().map((a) => ({ id: a.id, kind: a.kind, description: a.description })),
          scenarios: allScenarios("pairs"),
        });
      }
      if (url.pathname === "/api/run" && req.method === "POST") {
        // Starts a real run. Local-only server; one run at a time.
        if (running) return json(409, { error: `A run is already in progress (${running}).` });
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          let input: { agent?: string; fault?: string; seed?: number; task?: string; modelMode?: "live" | "replay" | "scripted" };
          try {
            input = JSON.parse(body || "{}");
            const fault = normalizeScenario(input.fault ?? "none");
            const agent = String(input.agent ?? "v0");
            running = `${agent} on ${fault}`;
            runOnce({
              fault,
              seed: Number(input.seed ?? 1),
              agent,
              task: taskById(isTaskId(input.task ?? "") ? (input.task as TaskId) : "create-lead"),
              outDir: join(data.root, "runs"),
              screenshots: true,
              ...(input.modelMode ? { modelMode: input.modelMode } : {}),
            }).then(
              (r) => {
                running = null;
                json(200, { dir: join("runs", basename(r.runDir)) });
              },
              (e: unknown) => {
                running = null;
                json(500, { error: e instanceof Error ? e.message : String(e) });
              },
            );
          } catch (e) {
            running = null;
            json(400, { error: e instanceof Error ? e.message : String(e) });
          }
        });
        return;
      }
      if (url.pathname === "/api/record" && req.method === "POST") {
        // Records a site the user says they may test. The password lives only in this request's memory.
        if (running) return json(409, { error: `Busy (${running}).` });
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          try {
            const input = JSON.parse(body || "{}") as { url?: string; username?: string; password?: string; maxPages?: number; authorized?: boolean };
            if (!input.authorized) return json(400, { error: "Confirm that you own this site or are authorized to test it." });
            if (!input.url) return json(400, { error: "Paste the site's URL." });
            const target = input.url;
            const exposed = !["127.0.0.1", "localhost", "::1"].includes(host);
            running = `recording ${target}`;
            privateTarget(target, exposed)
              .then((blocked) => {
                if (blocked) throw new AuthError(400, blocked);
                return recordSite({
                  url: target,
                  ...(input.username ? { username: input.username } : {}),
                  ...(input.password ? { password: input.password } : {}),
                  maxPages: Math.max(1, Math.min(30, Number(input.maxPages ?? 8))),
                  authorized: true,
                  outDir: join(data.root, "recordings"),
                });
              })
              .then(
                (r) => {
                  running = null;
                  json(200, { dir: join("recordings", basename(r.dir)) });
                },
                (e: unknown) => {
                  running = null;
                  json(e instanceof AuthError ? e.status : 500, { error: e instanceof Error ? e.message : String(e) });
                },
              );
          } catch (e) {
            running = null;
            json(400, { error: e instanceof Error ? e.message : String(e) });
          }
        });
        return;
      }
      if (url.pathname === "/api/run") {
        const detail = data.run(url.searchParams.get("dir") ?? "");
        return detail ? json(200, detail) : json(404, { error: "run not found" });
      }
      if (url.pathname.startsWith("/files/")) {
        const abs = data.safe(decodeURIComponent(url.pathname.slice("/files/".length)));
        const type = abs ? TYPES[extname(abs).toLowerCase()] : undefined;
        if (!abs || !type || !existsSync(abs)) return json(404, { error: "not found" });
        return streamFile(req, res, abs, type, "max-age=3600");
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

/**
 * On a server reachable from other machines, refuse targets on private networks (SSRF guard):
 * the recorder would otherwise browse the server's own network for whoever asked.
 * LAB_ALLOW_PRIVATE=1 lifts it (e.g. a team recording its own staging hosts).
 */
export async function privateTarget(target: string, exposed: boolean): Promise<string | null> {
  if (!exposed || process.env.LAB_ALLOW_PRIVATE === "1") return null;
  const hostname = new URL(target).hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname) ? [hostname] : (await lookup(hostname, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0) return `Could not resolve ${hostname}.`;
  const blocked = addresses.find((a) =>
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(a) ||
    /^(::1?$|f[cd]|fe[89ab]|::ffff:(127|10|192\.168|169\.254)\.)/i.test(a),
  );
  return blocked ? `This server does not record private or local addresses (${hostname} resolves to ${blocked}).` : null;
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
