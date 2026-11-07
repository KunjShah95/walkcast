import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { serveDashboard } from "../apps/desktop/server/server.ts";
import { LocalMedia } from "../packages/core/src/media/store.ts";
import { FileStore } from "../packages/core/src/store/index.ts";

process.env.LAB_LOG = "off";

/**
 * The behavior lock for the HTTP surface: every route server.ts answers, probed signed out and
 * signed in with a minimal or invalid request, and what came back (status, content type, the
 * headers that carry policy, the redirect target and the error text) compared with what the
 * server answered before its routes moved into apps/desktop/server/routes/.
 *
 * ROUTE_INVENTORY_RECORD=<file> writes the observed table there instead of comparing it.
 */

type Seen = { status: number; type: string | null; cache?: string | null; xfo?: string | null; csp?: boolean; location?: string; body?: string };
type Probe = { route: string; method: string; path: string; body?: string; headers?: Record<string, string>; only?: "out" | "in" };

/** A file path: write the observed table there instead of comparing it. */
const RECORD = process.env.ROUTE_INVENTORY_RECORD;
const dirs: string[] = [];
after(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function call(base: string, method: string, path: string, opts: { body?: string; headers?: Record<string, string> } = {}): Promise<Seen> {
  const u = new URL(base);
  return new Promise((resolve, reject) => {
    const req = request({ host: u.hostname, port: u.port, method, path, headers: { connection: "close", ...(opts.body !== undefined ? { "content-type": "application/json" } : {}), ...opts.headers } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        const type = res.headers["content-type"] ?? null;
        const seen: Seen = { status: res.statusCode ?? 0, type, cache: res.headers["cache-control"] ?? null, xfo: (res.headers["x-frame-options"] as string | undefined) ?? null, csp: Boolean(res.headers["content-security-policy"]) };
        const loc = res.headers.location;
        if (loc) {
          try {
            const l = new URL(loc, "http://x.invalid");
            seen.location = l.origin === "http://x.invalid" ? `${l.pathname}${l.search}` : `${l.origin}${l.pathname}`;
          } catch {
            seen.location = loc;
          }
        }
        if (type?.startsWith("application/json") && text) {
          try {
            const v = JSON.parse(text) as Record<string, unknown>;
            seen.body = seen.status >= 500 ? "<5xx>" : typeof v.error === "string" ? `error: ${v.error}` : `keys: ${Object.keys(v).sort().join(",")}`;
          } catch {
            seen.body = "<unparsable>";
          }
        }
        resolve(seen);
      });
    });
    req.on("error", reject);
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

function makeRecording(root: string, id: string, owner: string | null): void {
  const dir = join(root, "recordings", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "recording.json"),
    JSON.stringify({ id, owner, url: "https://site.example/", createdAt: "2026-01-01T00:00:00.000Z", durationMs: 1000, signIn: { attempted: false, outcome: "not-attempted", detail: "" }, pages: [{ url: "https://site.example/", title: "Home", screenshot: "", at: 0 }], skipped: [], captions: [{ start: 0, end: 1, text: "Hello" }], media: { video: null, mp4: null, audio: null, captions: "", voice: "none", note: "" } }),
  );
}

const UUID = "00000000-0000-4000-8000-000000000000";
const TOKEN20 = "abcdefghijklmnopqrstuvwxyz";
let shareToken = "x".repeat(24);

/** In order: some probes change state the later ones see (a share link, the session, the recording). */
const PROBES: Probe[] = [
  // ---- pipeline
  { route: "pipeline:trailing-slash", method: "GET", path: "/api/index/" },
  { route: "pipeline:host-check", method: "GET", path: "/healthz", headers: { host: "evil.example" } },
  { route: "pipeline:csrf", method: "POST", path: "/api/credentials", body: "{}", headers: { origin: "http://evil.example" } },
  { route: "pipeline:csrf-delete", method: "DELETE", path: "/api/webhooks/x", headers: { origin: "http://evil.example" } },
  { route: "pipeline:404", method: "GET", path: "/nope" },
  { route: "pipeline:404-api", method: "GET", path: "/api/nope" },
  { route: "pipeline:404-files-prefix", method: "PUT", path: "/api/webhooks" },
  // ---- health
  { route: "GET /healthz", method: "GET", path: "/healthz" },
  { route: "GET /readyz", method: "GET", path: "/readyz" },
  { route: "POST /api/shutdown", method: "POST", path: "/api/shutdown" },
  { route: "POST /api/shutdown", method: "POST", path: "/api/shutdown?token", headers: { "x-walkcast-shutdown": "wrong" } },
  // ---- shell
  { route: "GET /", method: "GET", path: "/" },
  { route: "GET /favicon", method: "GET", path: "/favicon.svg" },
  { route: "GET /favicon", method: "GET", path: "/favicon.ico" },
  { route: "GET /manifest", method: "GET", path: "/manifest.webmanifest" },
  { route: "GET /manifest", method: "GET", path: "/manifest.json" },
  { route: "GET /sw.js", method: "GET", path: "/sw.js" },
  { route: "GET /assets/*", method: "GET", path: "/assets/nope.woff2" },
  { route: "GET /signup|login|forgot|reset", method: "GET", path: "/signup" },
  { route: "GET /signup|login|forgot|reset", method: "GET", path: "/login?next=/app" },
  { route: "GET /signup|login|forgot|reset", method: "GET", path: "/forgot" },
  { route: "GET /signup|login|forgot|reset", method: "GET", path: "/reset" },
  // ---- accounts
  { route: "POST /auth/signup", method: "POST", path: "/auth/signup", body: "{}" },
  { route: "POST /auth/login", method: "POST", path: "/auth/login", body: "{}" },
  { route: "POST /auth/forgot", method: "POST", path: "/auth/forgot", body: "{}" },
  { route: "POST /auth/reset", method: "POST", path: "/auth/reset", body: "{}" },
  { route: "/auth/google", method: "GET", path: "/auth/google" },
  { route: "/auth/openrouter", method: "GET", path: "/auth/openrouter" },
  { route: "/auth/chatgpt", method: "GET", path: "/auth/chatgpt" },
  { route: "/auth/desktop/callback/:state", method: "GET", path: `/auth/desktop/callback/${TOKEN20}` },
  { route: "POST /auth/desktop/poll/:state", method: "POST", path: `/auth/desktop/poll/${TOKEN20}` },
  { route: "POST /auth/desktop/exchange", method: "POST", path: "/auth/desktop/exchange", body: "{}" },
  { route: "/auth/callback", method: "GET", path: "/auth/callback" },
  { route: "/auth/google/callback", method: "GET", path: "/auth/google/callback" },
  { route: "/auth/openrouter/callback", method: "GET", path: "/auth/openrouter/callback" },
  { route: "/auth/chatgpt/callback", method: "GET", path: "/auth/chatgpt/callback" },
  { route: "/api/me", method: "GET", path: "/api/me" },
  // ---- dashboard data
  { route: "/api/index", method: "GET", path: "/api/index" },
  { route: "GET /api/failures", method: "GET", path: "/api/failures" },
  { route: "GET /api/failures/:id/:file", method: "GET", path: `/api/failures/${UUID}/failure.png` },
  { route: "GET /api/browser", method: "GET", path: "/api/browser" },
  { route: "POST /api/browser/install", method: "POST", path: "/api/browser/install" },
  { route: "/api/capabilities", method: "GET", path: "/api/capabilities" },
  // ---- credentials
  { route: "GET /api/credentials", method: "GET", path: "/api/credentials" },
  { route: "POST /api/credentials", method: "POST", path: "/api/credentials", body: "{}" },
  { route: "POST /api/credentials/test", method: "POST", path: "/api/credentials/test", body: "{}" },
  { route: "DELETE /api/credentials", method: "DELETE", path: "/api/credentials" },
  // ---- launch studio
  { route: "POST /api/launch-videos/setup", method: "POST", path: "/api/launch-videos/setup" },
  { route: "GET /api/launch-videos/jobs/:id", method: "GET", path: "/api/launch-videos/jobs/nope" },
  { route: "POST /api/recordings/:id/launch-videos", method: "POST", path: "/api/recordings/rec-1/launch-videos", body: "{}" },
  { route: "POST /api/recordings/:id/launch-videos/:film/voiceover", method: "POST", path: "/api/recordings/rec-1/launch-videos/film-1/voiceover", body: "", only: "out" },
  // ---- voices
  { route: "GET /api/voices/custom", method: "GET", path: "/api/voices/custom" },
  { route: "POST /api/voices/custom", method: "POST", path: "/api/voices/custom", body: "" },
  { route: "GET /api/voices/custom/:id", method: "GET", path: "/api/voices/custom/nope" },
  { route: "DELETE /api/voices/custom/:id", method: "DELETE", path: "/api/voices/custom/nope" },
  { route: "GET /api/voices", method: "GET", path: "/api/voices" },
  { route: "GET /api/voices/preview", method: "GET", path: "/api/voices/preview" },
  { route: "GET /api/voices/preview", method: "GET", path: "/api/voices/preview?provider=elevenlabs&voice=bad%20voice" },
  { route: "/api/voices/:voice.wav", method: "GET", path: "/api/voices/bogus.wav" },
  // ---- recordings
  { route: "POST /api/recordings/:id/narration|voiceover", method: "POST", path: "/api/recordings/rec-1/narration", body: "{}" },
  { route: "POST /api/recordings/:id/narration|voiceover", method: "POST", path: "/api/recordings/rec-1/voiceover", body: "" },
  { route: "POST /api/recordings/:id/narration|voiceover", method: "POST", path: "/api/recordings/missing/narration", body: "{}" },
  { route: "POST /api/recordings/:id/reveal", method: "POST", path: "/api/recordings/rec-1/reveal", body: "{}" },
  { route: "POST /api/recordings/:id/reveal", method: "POST", path: "/api/recordings/rec-1/reveal", body: JSON.stringify({ file: "..x" }) },
  { route: "POST /api/recordings/:id/reveal", method: "POST", path: "/api/recordings/rec-1/reveal", body: JSON.stringify({ file: "nope.mp4" }) },
  { route: "GET /api/diagnostics", method: "GET", path: "/api/diagnostics" },
  { route: "POST /api/recordings/:id/export", method: "POST", path: "/api/recordings/rec-1/export" },
  { route: "POST /api/recordings/:id/export", method: "POST", path: "/api/recordings/missing/export?shape=vertical" },
  { route: "POST /api/recordings/batch-render", method: "POST", path: "/api/recordings/batch-render", body: "{}" },
  { route: "POST /api/recordings/:id/no-voice", method: "POST", path: "/api/recordings/missing/no-voice" },
  { route: "POST|DELETE /api/recordings/:id/share", method: "POST", path: "/api/recordings/missing/share", body: "{}" },
  { route: "POST|DELETE /api/recordings/:id/share", method: "POST", path: "/api/recordings/rec-1/share", body: "{}", only: "in" },
  { route: "GET /share/:id/:token/guide", method: "GET", path: "/share/rec-1/{token}/guide" },
  { route: "GET /share/:id/:token/guide", method: "GET", path: "/share/rec-1/{token}/guide?format=md" },
  { route: "GET /share/:id/:token/guide", method: "GET", path: "/share/rec-1/{token}/guide?format=pdf" },
  { route: "GET /share/:id/:token[/file]", method: "GET", path: "/share/rec-1/{token}" },
  { route: "GET /share/:id/:token[/file]", method: "GET", path: "/share/rec-1/{token}/recording.json" },
  { route: "GET /share/:id/:token[/file]", method: "GET", path: `/share/rec-1/${"y".repeat(24)}` },
  { route: "GET /share/:id/:token[/file]", method: "GET", path: `/share/missing/${"y".repeat(24)}` },
  { route: "GET /share/:id/:token[/file]", method: "POST", path: `/share/missing/${"y".repeat(24)}` },
  { route: "POST|DELETE /api/recordings/:id/share", method: "DELETE", path: "/api/recordings/rec-1/share" },
  { route: "GET /api/recordings/:id/insights", method: "GET", path: "/api/recordings/rec-1/insights" },
  { route: "GET|POST /api/recordings/:id/annotations", method: "GET", path: "/api/recordings/rec-1/annotations" },
  { route: "GET|POST /api/recordings/:id/annotations", method: "POST", path: "/api/recordings/rec-1/annotations", body: "{}" },
  { route: "GET|POST /api/recordings/:id/annotations", method: "POST", path: "/api/recordings/rec-1/annotations", body: JSON.stringify({ text: "x", at: -1 }) },
  { route: "DELETE /api/recordings/:id/annotations/:note", method: "DELETE", path: "/api/recordings/rec-1/annotations/nope" },
  { route: "POST /api/recordings/:id/captions/stt", method: "POST", path: "/api/recordings/rec-1/captions/stt", body: "{}" },
  // ---- jobs
  { route: "POST /api/run|record", method: "POST", path: "/api/run", body: JSON.stringify({ op: "bogus" }) },
  { route: "POST /api/run|record", method: "POST", path: "/api/record", body: "{}" },
  { route: "POST /api/run|record", method: "POST", path: "/api/record", body: "not json" },
  { route: "/api/jobs/:id/live/:file", method: "GET", path: "/api/jobs/nope/live/index.m3u8" },
  { route: "POST /api/jobs/:id/cancel", method: "POST", path: "/api/jobs/nope/cancel" },
  { route: "GET /api/jobs/mine", method: "GET", path: "/api/jobs/mine" },
  { route: "GET /api/jobs/mine", method: "GET", path: "/api/jobs/mine?kind=any" },
  { route: "/api/jobs/:id", method: "GET", path: `/api/jobs/${UUID}` },
  { route: "/api/jobs/:id", method: "POST", path: "/api/jobs/mine" },
  // ---- ops
  { route: "GET /api/update", method: "GET", path: "/api/update" },
  { route: "GET /api/agents/usage", method: "GET", path: "/api/agents/usage" },
  { route: "GET /api/agents/usage", method: "GET", path: "/api/agents/usage?windowMs=-1" },
  { route: "/api/metrics", method: "GET", path: "/api/metrics" },
  { route: "/api/metrics", method: "GET", path: "/api/metrics?windowMs=0" },
  // ---- webhooks
  { route: "GET /api/webhooks", method: "GET", path: "/api/webhooks" },
  { route: "POST /api/webhooks", method: "POST", path: "/api/webhooks", body: "{}" },
  { route: "GET /api/webhooks/deliveries", method: "GET", path: "/api/webhooks/deliveries" },
  { route: "DELETE /api/webhooks[/:id]", method: "DELETE", path: "/api/webhooks/nope" },
  { route: "DELETE /api/webhooks[/:id]", method: "DELETE", path: "/api/webhooks" },
  // ---- schedules
  { route: "GET /api/schedules", method: "GET", path: "/api/schedules" },
  { route: "POST /api/schedules", method: "POST", path: "/api/schedules", body: "{}" },
  { route: "DELETE /api/schedules[/:id]", method: "DELETE", path: "/api/schedules/nope" },
  { route: "DELETE /api/schedules[/:id]", method: "DELETE", path: "/api/schedules" },
  // ---- lab
  { route: "/api/run (detail)", method: "GET", path: "/api/run?dir=runs/nope" },
  { route: "/api/run (detail)", method: "PUT", path: "/api/run" },
  // ---- documents
  { route: "GET /api/recordings/:id/transcript", method: "GET", path: "/api/recordings/rec-1/transcript" },
  { route: "GET /api/recordings/:id/transcript", method: "GET", path: "/api/recordings/rec-1/transcript?format=srt" },
  { route: "GET /api/recordings/:id/transcript", method: "GET", path: "/api/recordings/rec-1/transcript?format=vtt" },
  { route: "GET /api/recordings/:id/transcript", method: "GET", path: "/api/recordings/rec-1/transcript?format=md" },
  { route: "GET /api/recordings/:id/transcript", method: "GET", path: "/api/recordings/rec-1/transcript?format=doc" },
  { route: "GET /api/recordings/:id/guide", method: "GET", path: "/api/recordings/rec-1/guide" },
  { route: "GET /api/recordings/:id/guide", method: "GET", path: "/api/recordings/rec-1/guide?format=markdown" },
  { route: "GET /api/recordings/:id/guide", method: "GET", path: "/api/recordings/missing/guide" },
  // ---- files and shell tail
  { route: "/files/*", method: "GET", path: "/files/recordings/rec-1/recording.json" },
  { route: "/files/*", method: "GET", path: "/files/recordings/missing/recording.json" },
  { route: "/files/*", method: "GET", path: "/files/%E0%A4%A" },
  { route: "/files/*", method: "GET", path: "/files/runs/nope.json" },
  { route: "/walkthrough.mp4|vtt", method: "GET", path: "/walkthrough.vtt" },
  { route: "/app", method: "GET", path: "/app" },
  { route: "/app", method: "GET", path: "/app/" },
  // ---- last: these end the recording and the session
  { route: "DELETE /api/recordings/:id", method: "DELETE", path: "/api/recordings/missing" },
  { route: "DELETE /api/recordings/:id", method: "DELETE", path: "/api/recordings/.hidden" },
  { route: "DELETE /api/recordings/:id", method: "DELETE", path: "/api/recordings/rec-1" },
  { route: "POST /auth/logout", method: "POST", path: "/auth/logout" },
];

/** Observed against server.ts before the route table existed (ROUTE_INVENTORY_RECORD). */
const EXPECTED: Record<string, Seen> = {
  "tls GET /healthz x-forwarded-proto=http": {"status":302,"type":null,"cache":null,"xfo":"SAMEORIGIN","csp":false,"location":"https://walkcast.example/healthz"},
  "tls GET /favicon.svg": {"status":200,"type":"image/svg+xml","cache":"max-age=86400","xfo":"SAMEORIGIN","csp":false},
  "tls HSTS": {"status":1,"type":"max-age=31536000; includeSubDomains"},
  "out GET /api/index/": {"status":302,"type":null,"cache":null,"xfo":"SAMEORIGIN","csp":false,"location":"/api/index"},
  "in GET /api/index/": {"status":302,"type":null,"cache":null,"xfo":"SAMEORIGIN","csp":false,"location":"/api/index"},
  "out GET /healthz {\"host\":\"evil.example\"}": {"status":421,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: This server only answers to its loopback address."},
  "in GET /healthz {\"host\":\"evil.example\"}": {"status":421,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: This server only answers to its loopback address."},
  "out POST /api/credentials {\"origin\":\"http://evil.example\"} body={}": {"status":403,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Cross-site request refused."},
  "in POST /api/credentials {\"origin\":\"http://evil.example\"} body={}": {"status":403,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Cross-site request refused."},
  "out DELETE /api/webhooks/x {\"origin\":\"http://evil.example\"}": {"status":403,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Cross-site request refused."},
  "in DELETE /api/webhooks/x {\"origin\":\"http://evil.example\"}": {"status":403,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Cross-site request refused."},
  "out GET /nope": {"status":404,"type":"text/html; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "in GET /nope": {"status":404,"type":"text/html; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "out GET /api/nope": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/nope": {"status":404,"type":"text/html; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "out PUT /api/webhooks": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in PUT /api/webhooks": {"status":404,"type":"text/html; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "out GET /healthz": {"status":200,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"keys: ok,worker"},
  "in GET /healthz": {"status":200,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"keys: ok,worker"},
  "out GET /readyz": {"status":200,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"keys: media,ok,store,worker"},
  "in GET /readyz": {"status":200,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"keys: media,ok,store,worker"},
  "out POST /api/shutdown": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in POST /api/shutdown": {"status":404,"type":"text/html; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "out POST /api/shutdown?token {\"x-walkcast-shutdown\":\"wrong\"}": {"status":403,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Shutdown refused."},
  "in POST /api/shutdown?token {\"x-walkcast-shutdown\":\"wrong\"}": {"status":403,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Shutdown refused."},
  "out GET /": {"status":302,"type":null,"cache":null,"xfo":"SAMEORIGIN","csp":false,"location":"/app"},
  "in GET /": {"status":302,"type":null,"cache":null,"xfo":"SAMEORIGIN","csp":false,"location":"/app"},
  "out GET /favicon.svg": {"status":200,"type":"image/svg+xml","cache":"max-age=86400","xfo":"SAMEORIGIN","csp":false},
  "in GET /favicon.svg": {"status":200,"type":"image/svg+xml","cache":"max-age=86400","xfo":"SAMEORIGIN","csp":false},
  "out GET /favicon.ico": {"status":200,"type":"image/svg+xml","cache":"max-age=86400","xfo":"SAMEORIGIN","csp":false},
  "in GET /favicon.ico": {"status":200,"type":"image/svg+xml","cache":"max-age=86400","xfo":"SAMEORIGIN","csp":false},
  "out GET /manifest.webmanifest": {"status":200,"type":"application/manifest+json; charset=utf-8","cache":"max-age=3600","xfo":"SAMEORIGIN","csp":false},
  "in GET /manifest.webmanifest": {"status":200,"type":"application/manifest+json; charset=utf-8","cache":"max-age=3600","xfo":"SAMEORIGIN","csp":false},
  "out GET /manifest.json": {"status":200,"type":"application/manifest+json; charset=utf-8","cache":"max-age=3600","xfo":"SAMEORIGIN","csp":false},
  "in GET /manifest.json": {"status":200,"type":"application/manifest+json; charset=utf-8","cache":"max-age=3600","xfo":"SAMEORIGIN","csp":false},
  "out GET /sw.js": {"status":200,"type":"application/javascript; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "in GET /sw.js": {"status":200,"type":"application/javascript; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "out GET /assets/nope.woff2": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: not found"},
  "in GET /assets/nope.woff2": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: not found"},
  "out GET /signup": {"status":200,"type":"text/html; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "in GET /signup": {"status":302,"type":null,"cache":null,"xfo":"SAMEORIGIN","csp":false,"location":"/app"},
  "out GET /login?next=/app": {"status":200,"type":"text/html; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "in GET /login?next=/app": {"status":302,"type":null,"cache":null,"xfo":"SAMEORIGIN","csp":false,"location":"/app"},
  "out GET /forgot": {"status":404,"type":"text/plain; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "in GET /forgot": {"status":404,"type":"text/plain; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "out GET /reset": {"status":404,"type":"text/plain; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "in GET /reset": {"status":404,"type":"text/plain; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "out POST /auth/signup body={}": {"status":400,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Enter a valid email address."},
  "in POST /auth/signup body={}": {"status":400,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Enter a valid email address."},
  "out POST /auth/login body={}": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Email or password is incorrect."},
  "in POST /auth/login body={}": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Email or password is incorrect."},
  "out POST /auth/forgot body={}": {"status":404,"type":"text/html; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "in POST /auth/forgot body={}": {"status":404,"type":"text/html; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "out POST /auth/reset body={}": {"status":404,"type":"text/html; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "in POST /auth/reset body={}": {"status":404,"type":"text/html; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "out GET /auth/google": {"status":503,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"<5xx>"},
  "in GET /auth/google": {"status":503,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"<5xx>"},
  "out GET /auth/openrouter": {"status":302,"type":null,"cache":null,"xfo":null,"csp":false,"location":"https://openrouter.ai/auth"},
  "in GET /auth/openrouter": {"status":302,"type":null,"cache":null,"xfo":null,"csp":false,"location":"https://openrouter.ai/auth"},
  "out GET /auth/chatgpt": {"status":302,"type":null,"cache":null,"xfo":null,"csp":false,"location":"https://auth.openai.com/api/accounts/authorize"},
  "in GET /auth/chatgpt": {"status":302,"type":null,"cache":null,"xfo":null,"csp":false,"location":"https://auth.openai.com/api/accounts/authorize"},
  "out GET /auth/desktop/callback/abcdefghijklmnopqrstuvwxyz": {"status":404,"type":"text/html; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "in GET /auth/desktop/callback/abcdefghijklmnopqrstuvwxyz": {"status":404,"type":"text/html; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "out POST /auth/desktop/poll/abcdefghijklmnopqrstuvwxyz": {"status":404,"type":"text/html; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "in POST /auth/desktop/poll/abcdefghijklmnopqrstuvwxyz": {"status":404,"type":"text/html; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "out POST /auth/desktop/exchange body={}": {"status":404,"type":"text/html; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "in POST /auth/desktop/exchange body={}": {"status":404,"type":"text/html; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "out GET /auth/callback": {"status":404,"type":"text/html; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "in GET /auth/callback": {"status":404,"type":"text/html; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "out GET /auth/google/callback": {"status":503,"type":"text/plain; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "in GET /auth/google/callback": {"status":503,"type":"text/plain; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "out GET /auth/openrouter/callback": {"status":400,"type":"text/plain; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "in GET /auth/openrouter/callback": {"status":400,"type":"text/plain; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "out GET /auth/chatgpt/callback": {"status":400,"type":"text/plain; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "in GET /auth/chatgpt/callback": {"status":400,"type":"text/plain; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "out GET /api/me": {"status":200,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"keys: authRequired,chatgpt,google,openrouter,provider,user"},
  "in GET /api/me": {"status":200,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"keys: authRequired,chatgpt,google,openrouter,provider,user"},
  "out GET /api/index": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/index": {"status":200,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"keys: experiments,failedRecordings,fixtures,generatedAt,recordings,runs"},
  "out GET /api/failures": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/failures": {"status":200,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"keys: failures,runs"},
  "out GET /api/failures/00000000-0000-4000-8000-000000000000/failure.png": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/failures/00000000-0000-4000-8000-000000000000/failure.png": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: not found"},
  "out GET /api/browser": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/browser": {"status":200,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"keys: doneMb,error,item,percent,state,totalMb"},
  "out POST /api/browser/install": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in POST /api/browser/install": {"status":409,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: This server does not manage its browser."},
  "out GET /api/capabilities": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/capabilities": {"status":200,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"keys: agents,authRequired,demoSite,jobsUnavailable,limits,live,liveModels,providers,queue,running,scenarios,stagehand,sttProviders,tts,usage,user,voices"},
  "out GET /api/credentials": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/credentials": {"status":200,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"keys: editable,keys"},
  "out POST /api/credentials body={}": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in POST /api/credentials body={}": {"status":403,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Server credentials are set by the operator of this server."},
  "out POST /api/credentials/test body={}": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in POST /api/credentials/test body={}": {"status":400,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Unknown credential."},
  "out DELETE /api/credentials": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in DELETE /api/credentials": {"status":403,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Server credentials are set by the operator of this server."},
  "out POST /api/launch-videos/setup": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in POST /api/launch-videos/setup": {"status":403,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Kokoro setup is available from the local desktop app."},
  "out GET /api/launch-videos/jobs/nope": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/launch-videos/jobs/nope": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Launch video job not found."},
  "out POST /api/recordings/rec-1/launch-videos body={}": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in POST /api/recordings/rec-1/launch-videos body={}": {"status":403,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Launch Studio is available in the local desktop app."},
  "out POST /api/recordings/rec-1/launch-videos/film-1/voiceover": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "out GET /api/voices/custom": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/voices/custom": {"status":200,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"keys: voices"},
  "out POST /api/voices/custom": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in POST /api/voices/custom": {"status":400,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: No audio received."},
  "out GET /api/voices/custom/nope": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/voices/custom/nope": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Not found."},
  "out DELETE /api/voices/custom/nope": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in DELETE /api/voices/custom/nope": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Not found."},
  "out GET /api/voices": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/voices": {"status":200,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"keys: providers"},
  "out GET /api/voices/preview": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/voices/preview": {"status":400,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: provider is required."},
  "out GET /api/voices/preview?provider=elevenlabs&voice=bad%20voice": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/voices/preview?provider=elevenlabs&voice=bad%20voice": {"status":400,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: That voice or language is not one a provider names."},
  "out GET /api/voices/bogus.wav": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/voices/bogus.wav": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Unknown voice."},
  "out POST /api/recordings/rec-1/narration body={}": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in POST /api/recordings/rec-1/narration body={}": {"status":400,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: The script needs between 1 and 500 lines."},
  "out POST /api/recordings/rec-1/voiceover": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in POST /api/recordings/rec-1/voiceover": {"status":400,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: No audio received."},
  "out POST /api/recordings/missing/narration body={}": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in POST /api/recordings/missing/narration body={}": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Recording not found."},
  "out POST /api/recordings/rec-1/reveal body={}": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in POST /api/recordings/rec-1/reveal body={}": {"status":204,"type":null,"cache":null,"xfo":"SAMEORIGIN","csp":false},
  "out POST /api/recordings/rec-1/reveal body={\"file\":\"..x\"}": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in POST /api/recordings/rec-1/reveal body={\"file\":\"..x\"}": {"status":400,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: That isn't a file name."},
  "out POST /api/recordings/rec-1/reveal body={\"file\":\"nope.mp4\"}": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in POST /api/recordings/rec-1/reveal body={\"file\":\"nope.mp4\"}": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: File not found."},
  "out GET /api/diagnostics": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/diagnostics": {"status":200,"type":"application/json; charset=utf-8","cache":"no-store","xfo":"SAMEORIGIN","csp":false,"body":"keys: activeJobs,capabilities,disk,failedJobs,generatedAt,limits,log,os,server,versions"},
  "out POST /api/recordings/rec-1/export": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in POST /api/recordings/rec-1/export": {"status":400,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: shape must be vertical or square"},
  "out POST /api/recordings/missing/export?shape=vertical": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in POST /api/recordings/missing/export?shape=vertical": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Recording not found."},
  "out POST /api/recordings/batch-render body={}": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in POST /api/recordings/batch-render body={}": {"status":400,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: recordingIds must be a non-empty array of recording ids."},
  "out POST /api/recordings/missing/no-voice": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in POST /api/recordings/missing/no-voice": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Recording not found."},
  "out POST /api/recordings/missing/share body={}": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in POST /api/recordings/missing/share body={}": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Recording not found."},
  "in POST /api/recordings/rec-1/share body={}": {"status":200,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"keys: share,shares,url"},
  "out GET /share/rec-1/{token}/guide": {"status":200,"type":"text/html; charset=utf-8","cache":"no-store","xfo":"SAMEORIGIN","csp":true},
  "in GET /share/rec-1/{token}/guide": {"status":200,"type":"text/html; charset=utf-8","cache":"no-store","xfo":"SAMEORIGIN","csp":true},
  "out GET /share/rec-1/{token}/guide?format=md": {"status":200,"type":"text/markdown; charset=utf-8","cache":"no-store","xfo":"SAMEORIGIN","csp":false},
  "in GET /share/rec-1/{token}/guide?format=md": {"status":200,"type":"text/markdown; charset=utf-8","cache":"no-store","xfo":"SAMEORIGIN","csp":false},
  "out GET /share/rec-1/{token}/guide?format=pdf": {"status":400,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: unknown format"},
  "in GET /share/rec-1/{token}/guide?format=pdf": {"status":400,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: unknown format"},
  "out GET /share/rec-1/{token}": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: This walkthrough has no video to share."},
  "in GET /share/rec-1/{token}": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: This walkthrough has no video to share."},
  "out GET /share/rec-1/{token}/recording.json": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: not found"},
  "in GET /share/rec-1/{token}/recording.json": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: not found"},
  "out GET /share/rec-1/yyyyyyyyyyyyyyyyyyyyyyyy": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: This link has expired."},
  "in GET /share/rec-1/yyyyyyyyyyyyyyyyyyyyyyyy": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: This link has expired."},
  "out GET /share/missing/yyyyyyyyyyyyyyyyyyyyyyyy": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: This link is not valid."},
  "in GET /share/missing/yyyyyyyyyyyyyyyyyyyyyyyy": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: This link is not valid."},
  "out POST /share/missing/yyyyyyyyyyyyyyyyyyyyyyyy": {"status":404,"type":"text/html; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "in POST /share/missing/yyyyyyyyyyyyyyyyyyyyyyyy": {"status":404,"type":"text/html; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":false},
  "out DELETE /api/recordings/rec-1/share": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in DELETE /api/recordings/rec-1/share": {"status":200,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"keys: ok,shares"},
  "out GET /api/recordings/rec-1/insights": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/recordings/rec-1/insights": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: This walkthrough has no trace to read."},
  "out GET /api/recordings/rec-1/annotations": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/recordings/rec-1/annotations": {"status":200,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"keys: annotations"},
  "out POST /api/recordings/rec-1/annotations body={}": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in POST /api/recordings/rec-1/annotations body={}": {"status":400,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: A note needs some text."},
  "out POST /api/recordings/rec-1/annotations body={\"text\":\"x\",\"at\":-1}": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in POST /api/recordings/rec-1/annotations body={\"text\":\"x\",\"at\":-1}": {"status":400,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: A note needs a position in the video."},
  "out DELETE /api/recordings/rec-1/annotations/nope": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in DELETE /api/recordings/rec-1/annotations/nope": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Note not found."},
  "out POST /api/recordings/rec-1/captions/stt body={}": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in POST /api/recordings/rec-1/captions/stt body={}": {"status":400,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: No audio available for this recording."},
  "out POST /api/run body={\"op\":\"bogus\"}": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in POST /api/run body={\"op\":\"bogus\"}": {"status":400,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Unknown lab operation \"bogus\"."},
  "out POST /api/record body={}": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in POST /api/record body={}": {"status":400,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Confirm that you own this site or are authorized to test it."},
  "out POST /api/record body=not json": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in POST /api/record body=not json": {"status":400,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Request body must be a JSON object."},
  "out GET /api/jobs/nope/live/index.m3u8": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/jobs/nope/live/index.m3u8": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: job not found"},
  "out POST /api/jobs/nope/cancel": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in POST /api/jobs/nope/cancel": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: job not found"},
  "out GET /api/jobs/mine": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/jobs/mine": {"status":200,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"keys: job"},
  "out GET /api/jobs/mine?kind=any": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/jobs/mine?kind=any": {"status":200,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"keys: job"},
  "out GET /api/jobs/00000000-0000-4000-8000-000000000000": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/jobs/00000000-0000-4000-8000-000000000000": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: job not found"},
  "out POST /api/jobs/mine": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in POST /api/jobs/mine": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: job not found"},
  "out GET /api/update": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/update": {"status":200,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"keys: available,current,error,latest,notes,publishedAt,url"},
  "out GET /api/agents/usage": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/agents/usage": {"status":200,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"keys: agents,windowMs"},
  "out GET /api/agents/usage?windowMs=-1": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/agents/usage?windowMs=-1": {"status":400,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: windowMs must be 1ms..31 days"},
  "out GET /api/metrics": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/metrics": {"status":200,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"keys: alarm,finished,live,providers,queue,windowMs"},
  "out GET /api/metrics?windowMs=0": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/metrics?windowMs=0": {"status":400,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: windowMs must be 1ms..31 days"},
  "out GET /api/webhooks": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/webhooks": {"status":200,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"keys: items,webhooks"},
  "out POST /api/webhooks body={}": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in POST /api/webhooks body={}": {"status":400,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: url required"},
  "out GET /api/webhooks/deliveries": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/webhooks/deliveries": {"status":200,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"keys: deliveries"},
  "out DELETE /api/webhooks/nope": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in DELETE /api/webhooks/nope": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: webhook not found"},
  "out DELETE /api/webhooks": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in DELETE /api/webhooks": {"status":400,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: url or id required"},
  "out GET /api/schedules": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/schedules": {"status":200,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"keys: schedules"},
  "out POST /api/schedules body={}": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in POST /api/schedules body={}": {"status":400,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: invalid url"},
  "out DELETE /api/schedules/nope": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in DELETE /api/schedules/nope": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: schedule not found"},
  "out DELETE /api/schedules": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in DELETE /api/schedules": {"status":400,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: id required"},
  "out GET /api/run?dir=runs/nope": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/run?dir=runs/nope": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: run not found"},
  "out PUT /api/run": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in PUT /api/run": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: run not found"},
  "out GET /api/recordings/rec-1/transcript": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/recordings/rec-1/transcript": {"status":200,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"keys: captions"},
  "out GET /api/recordings/rec-1/transcript?format=srt": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/recordings/rec-1/transcript?format=srt": {"status":200,"type":"text/plain; charset=utf-8","cache":"no-store","xfo":"SAMEORIGIN","csp":false},
  "out GET /api/recordings/rec-1/transcript?format=vtt": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/recordings/rec-1/transcript?format=vtt": {"status":200,"type":"text/vtt; charset=utf-8","cache":"no-store","xfo":"SAMEORIGIN","csp":false},
  "out GET /api/recordings/rec-1/transcript?format=md": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/recordings/rec-1/transcript?format=md": {"status":200,"type":"text/markdown; charset=utf-8","cache":"no-store","xfo":"SAMEORIGIN","csp":false},
  "out GET /api/recordings/rec-1/transcript?format=doc": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/recordings/rec-1/transcript?format=doc": {"status":400,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: unknown format"},
  "out GET /api/recordings/rec-1/guide": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/recordings/rec-1/guide": {"status":200,"type":"text/html; charset=utf-8","cache":"no-store","xfo":"SAMEORIGIN","csp":true},
  "out GET /api/recordings/rec-1/guide?format=markdown": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/recordings/rec-1/guide?format=markdown": {"status":200,"type":"text/markdown; charset=utf-8","cache":"no-store","xfo":"SAMEORIGIN","csp":false},
  "out GET /api/recordings/missing/guide": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /api/recordings/missing/guide": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: not found"},
  "out GET /files/recordings/rec-1/recording.json": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /files/recordings/rec-1/recording.json": {"status":200,"type":"application/json","cache":"private, max-age=3600","xfo":null,"csp":false,"body":"keys: captions,createdAt,dir,durationMs,id,media,owner,pages,shares,signIn,skipped,url"},
  "out GET /files/recordings/missing/recording.json": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /files/recordings/missing/recording.json": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: not found"},
  "out GET /files/%E0%A4%A": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /files/%E0%A4%A": {"status":400,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: bad path"},
  "out GET /files/runs/nope.json": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in GET /files/runs/nope.json": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: not found"},
  "out GET /walkthrough.vtt": {"status":200,"type":"text/vtt; charset=utf-8","cache":"public, max-age=86400, immutable","xfo":null,"csp":false},
  "in GET /walkthrough.vtt": {"status":200,"type":"text/vtt; charset=utf-8","cache":"public, max-age=86400, immutable","xfo":null,"csp":false},
  "out GET /app": {"status":302,"type":null,"cache":null,"xfo":"SAMEORIGIN","csp":false,"location":"/login?next=%2Fapp"},
  "in GET /app": {"status":200,"type":"text/html; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":true},
  "out GET /app/": {"status":302,"type":null,"cache":null,"xfo":"SAMEORIGIN","csp":false,"location":"/login?next=%2Fapp"},
  "in GET /app/": {"status":200,"type":"text/html; charset=utf-8","cache":"no-cache","xfo":"SAMEORIGIN","csp":true},
  "out DELETE /api/recordings/missing": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in DELETE /api/recordings/missing": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Recording not found."},
  "out DELETE /api/recordings/.hidden": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in DELETE /api/recordings/.hidden": {"status":404,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Recording not found."},
  "out DELETE /api/recordings/rec-1": {"status":401,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"error: Sign in to use the dashboard."},
  "in DELETE /api/recordings/rec-1": {"status":200,"type":"application/json","cache":"no-store","xfo":null,"csp":false,"body":"keys: ok"},
  "out POST /auth/logout": {"status":302,"type":null,"cache":null,"xfo":"SAMEORIGIN","csp":false,"location":"/"},
  "in POST /auth/logout": {"status":302,"type":null,"cache":null,"xfo":"SAMEORIGIN","csp":false,"location":"/"},
};

test("every route answers as it did before the route table", { timeout: 120_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "route-inventory-"));
  dirs.push(root);
  const store = new FileStore(join(root, ".lab", "store.json"));
  const revealed: string[] = [];
  const srv = await serveDashboard(0, { root, unref: true, store, media: new LocalMedia(join(root, "recordings")), worker: false, requireAuth: true, reveal: (p) => revealed.push(p), onShutdown: () => undefined });
  // A second server behind TLS: the https redirect and HSTS.
  const tls = await serveDashboard(0, { root, unref: true, store, media: new LocalMedia(join(root, "recordings")), worker: false, requireAuth: true, siteUrl: "https://walkcast.example" });
  try {
    const signup = await fetch(`${srv.url}/auth/signup`, { method: "POST", body: JSON.stringify({ email: "inventory@example.com", password: "a-good-password" }) });
    assert.equal(signup.status, 201);
    const cookie = signup.headers.get("set-cookie")!.split(";")[0]!;
    const owner = (await store.userByEmail("inventory@example.com"))!.id;
    makeRecording(root, "rec-1", owner);

    const observed: Record<string, Seen> = {};
    const tlsSeen = await call(tls.url, "GET", "/healthz", { headers: { "x-forwarded-proto": "http" } });
    observed["tls GET /healthz x-forwarded-proto=http"] = tlsSeen;
    observed["tls GET /favicon.svg"] = await call(tls.url, "GET", "/favicon.svg");
    const tlsHsts = await new Promise<string | null>((resolve, reject) => {
      const u = new URL(tls.url);
      request({ host: u.hostname, port: u.port, path: "/favicon.svg" }, (res) => {
        res.resume();
        resolve((res.headers["strict-transport-security"] as string | undefined) ?? null);
      }).on("error", reject).end();
    });
    observed["tls HSTS"] = { status: tlsHsts ? 1 : 0, type: tlsHsts };

    for (const p of PROBES) {
      for (const who of ["out", "in"] as const) {
        if (p.only && p.only !== who) continue;
        const path = p.path.replace("{token}", shareToken);
        const headers = { ...(who === "in" ? { cookie } : {}), ...p.headers };
        if (p.route === "POST /api/shutdown" && path.includes("?token")) process.env.WALKCAST_SHUTDOWN_TOKEN = "the-right-token";
        let seen: Seen;
        try {
          seen = await call(srv.url, p.method, path, { ...(p.body !== undefined ? { body: p.body } : {}), headers });
        } finally {
          delete process.env.WALKCAST_SHUTDOWN_TOKEN;
        }
        observed[`${who} ${p.method} ${p.path}${p.headers ? ` ${JSON.stringify(p.headers)}` : ""}${p.body ? ` body=${p.body}` : ""}`] = seen;
        if (p.route === "POST|DELETE /api/recordings/:id/share" && p.method === "POST" && who === "in" && path.includes("rec-1")) {
          const share = JSON.parse(readShare(root)) as { shares?: { token: string }[] };
          shareToken = share.shares?.at(-1)?.token ?? shareToken;
        }
      }
    }
    assert.equal(revealed.length, 1, "only the bare reveal reached the file manager");

    if (RECORD) {
      writeFileSync(RECORD, JSON.stringify(observed, null, 2));
      return;
    }
    const routes = new Set(PROBES.map((p) => p.route));
    assert.equal(routes.size, 88, "routes probed (81 handlers plus 7 pipeline checks)");
    const problems: string[] = [];
    for (const key of new Set([...Object.keys(EXPECTED), ...Object.keys(observed)])) {
      try {
        assert.deepEqual(observed[key], EXPECTED[key]);
      } catch {
        problems.push(`${key}\n  expected ${JSON.stringify(EXPECTED[key])}\n  observed ${JSON.stringify(observed[key])}`);
      }
    }
    assert.deepEqual(problems, []);
  } finally {
    await srv.close(100);
    await tls.close(100);
  }
});

function readShare(root: string): string {
  // The share token lives in the recording's own summary (see POST /api/recordings/:id/share).
  return readFileSync(join(root, "recordings", "rec-1", "recording.json"), "utf8");
}
