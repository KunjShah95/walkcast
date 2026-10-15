import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LabData, type LabIndex, type RunDetail } from "./data.ts";
import { type TaskId, allScenarios, isTaskId, normalizeScenario } from "../app/faults.ts";
import { taskById } from "../lab/task.ts";
import { allAgents } from "../agents/registry.ts";
import { runOnce } from "../lab/runner.ts";
import { configuredProviders } from "../llm/providers.ts";
import { recordSite } from "../record/site.ts";

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

/** Local, read-only dashboard over runs/, fixtures/ and results/. Binds to 127.0.0.1 only. */
export async function serveDashboard(port: number, root = process.cwd()): Promise<string> {
  const data = new LabData(root);
  const html = dashboardHtml();
  let running: string | null = null;
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const json = (status: number, value: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(value));
    };
    try {
      if (url.pathname === "/api/index") return json(200, data.index());
      if (url.pathname === "/api/capabilities") {
        return json(200, {
          live: true,
          running,
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
            running = `recording ${input.url}`;
            recordSite({
              url: input.url,
              ...(input.username ? { username: input.username } : {}),
              ...(input.password ? { password: input.password } : {}),
              maxPages: Math.max(1, Math.min(30, Number(input.maxPages ?? 8))),
              authorized: true,
              outDir: join(data.root, "recordings"),
            }).then(
              (r) => {
                running = null;
                json(200, { dir: join("recordings", basename(r.dir)) });
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
      if (url.pathname === "/api/run") {
        const detail = data.run(url.searchParams.get("dir") ?? "");
        return detail ? json(200, detail) : json(404, { error: "run not found" });
      }
      if (url.pathname.startsWith("/files/")) {
        const abs = data.safe(decodeURIComponent(url.pathname.slice("/files/".length)));
        const type = abs ? TYPES[extname(abs).toLowerCase()] : undefined;
        if (!abs || !type || !existsSync(abs)) return json(404, { error: "not found" });
        // Byte ranges, so the video player can seek.
        const size = statSync(abs).size;
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
        if (range && (range[1] || range[2])) {
          const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
          const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
          if (start > end || start >= size) {
            res.writeHead(416, { "Content-Range": `bytes */${size}` });
            return res.end();
          }
          res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 });
          return createReadStream(abs, { start, end }).pipe(res);
        }
        res.writeHead(200, { "Content-Type": type, "Cache-Control": "max-age=3600", "Accept-Ranges": "bytes", "Content-Length": size });
        return createReadStream(abs).pipe(res);
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch (error) {
      json(500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  return `http://127.0.0.1:${port}`;
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
