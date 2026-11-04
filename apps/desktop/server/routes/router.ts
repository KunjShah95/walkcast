import type { IncomingMessage, ServerResponse } from "node:http";
import type { LabData, RecordingSummary } from "../../../../packages/core/src/data.ts";
import type { Worker } from "../../../../packages/core/src/jobs/worker.ts";
import type { MediaStore } from "../../../../packages/core/src/media/store.ts";
import type { FailureReport, RunFailure } from "../../../../packages/core/src/record/failure.ts";
import type { Job, Store } from "../../../../packages/core/src/store/index.ts";
import type { Auth, User } from "../auth.ts";
import type { DesktopTasks } from "../desktop-tasks.ts";
import type { App, ServeOptions } from "../server.ts";
import type { SupabaseAuth } from "../supabase-auth.ts";

/**
 * The route table's moving parts.
 *
 * createApp builds one ServerDeps (what every handler used to close over) and, per request, one
 * Ctx. The pipeline in server.ts runs the stages in a fixed order (host check, health, CSRF, auth,
 * public routes, the /api/ + /files/ sign-in gate, app routes, 404); within a stage the first route
 * whose method, path and `when` all match answers, exactly like the if-chain it replaced. A route
 * that matches answers: there is no falling through to a later one.
 */

/**
 * Who may reach a route.
 *
 * - "public": no account needed.
 * - "user": needs an account when accounts are on.
 * - "owner-checked": "user", and the handler also checks the account owns what it touches.
 *
 * The sign-in gate itself is still the one prefix rule in server.ts (every /api/ and /files/ path
 * after the public stage, matched or not, answers 401 signed out), so these labels must agree with
 * it: validateRoutes refuses a table where a non-public route sits outside that prefix, or a public
 * one inside it.
 */
export type RouteAuth = "public" | "user" | "owner-checked";

export interface Route {
  /** One method, several, or "*" for any (several routes answer every method, as they always did). */
  method: string | readonly string[];
  /** An exact path, one of several exact paths, or a pattern whose groups become ctx.params. */
  path: string | readonly string[] | RegExp;
  auth: RouteAuth;
  /** Extra conditions the old if-statement carried (desktop only, auth provider, …): false means "not this route". */
  when?: (ctx: Ctx) => boolean;
  handler: (ctx: Ctx) => Promise<void> | void;
}

/** What createApp owns and every handler may use. Built once, where the handler is created. */
export interface ServerDeps {
  o: ServeOptions;
  root: string;
  /** The repository root the server was started from (scripts, launch-film templates). */
  appSourceRoot: string;
  /** apps/desktop/server/static: files bundled with the app (the walkthrough video). */
  staticDir: string;
  store: Store;
  media: MediaStore;
  data: LabData;
  worker: Worker | null;
  auth: Auth | SupabaseAuth;
  authOptions: () => Promise<{ google: boolean; openrouter: boolean; chatgpt: boolean; forgot: boolean }>;
  requireAuth: boolean;
  exposed: boolean;
  siteUrl: string;
  siteUrlConfigured: boolean;
  credentialsEditable: boolean;
  allowLiveRuns: boolean;
  blockPrivate: boolean;
  desktopTasks: DesktopTasks;
  /** The built dashboard page and its Content-Security-Policy. */
  html: string;
  appCsp: string;
  /** The App createApp returns: POST /api/shutdown reads its shutdown hook. */
  self: App;
  /** Shutdown state, flipped by drain() and POST /api/shutdown. */
  state: { draining: boolean; shuttingDown: boolean };
  listRecordings(user: User | null): Promise<RecordingSummary[]>;
  findRecording(id: string): Promise<{ owner: string | null; summary?: RecordingSummary } | null>;
  saveRecordingSummary(id: string, owner: string | null, summary: RecordingSummary): Promise<void>;
  failureFor(job: Job): FailureReport;
  runFailureFor(job: Job): RunFailure;
  noteRefusal(owner: string | null, url: string, error: string, demo?: boolean): Promise<void>;
}

/** One request: built once, before the first route is tried. */
export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  deps: ServerDeps;
  /** Set once the session is read (after the CSRF check); null before that and when signed out. */
  user: User | null;
  owner: string | null;
  /** The matched route's pattern groups; [0] is the whole path. Empty for an exact-path route. */
  params: readonly (string | undefined)[];
  /** Whether this deployment is served over TLS (its site URL is https). */
  secure: boolean;
  securityHeaders: Record<string, string>;
  json(status: number, value: unknown): void;
  send(status: number, type: string, body: string, cache?: string): void;
  redirect(location: string): void;
  /** A recording is visible to the account that made it; ones made from the CLI (no owner) only on a server that isn't reachable from other machines. */
  canSee(owner: string | null | undefined): boolean;
  /** Lab output stamped for an account is that account's; unstamped output stays visible. */
  canSeeLab(path: string): boolean;
}

export function createContext(deps: ServerDeps, req: IncomingMessage, res: ServerResponse): Ctx {
  const url = new URL(req.url ?? "/", "http://localhost");
  const json = (status: number, value: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(value));
  };
  // HTTPS + security headers, only when this deployment is served over TLS. Local http dev is
  // left alone: HSTS on a plain-http host strands the browser.
  const secure = deps.siteUrl.startsWith("https://");
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
  const ctx: Ctx = {
    req,
    res,
    url,
    deps,
    user: null,
    owner: null,
    params: [],
    secure,
    securityHeaders,
    json,
    send,
    redirect,
    canSee: (owner) => (owner ? !deps.requireAuth || owner === ctx.user?.id : !deps.exposed),
    canSeeLab: (path) => {
      const stamped = deps.data.ownerOf(path);
      return stamped === null || ctx.canSee(stamped);
    },
  };
  return ctx;
}

function methodMatches(want: Route["method"], method: string | undefined): boolean {
  if (want === "*") return true;
  return typeof want === "string" ? method === want : want.includes(method ?? "");
}

function pathMatches(want: Route["path"], pathname: string): readonly (string | undefined)[] | null {
  if (typeof want === "string") return pathname === want ? [pathname] : null;
  if (want instanceof RegExp) return want.exec(pathname);
  return want.includes(pathname) ? [pathname] : null;
}

/** The 401 the sign-in gate answers with; server.ts sends the same one for every /api/ and /files/ path. */
export function signInRequired(ctx: Ctx): void {
  ctx.json(401, { error: "Sign in to use the dashboard.", signIn: `/login?next=${encodeURIComponent("/app")}` });
}

/** Try each route in order; true when one answered. */
export async function dispatch(routes: readonly Route[], ctx: Ctx): Promise<boolean> {
  const { pathname } = ctx.url;
  for (const route of routes) {
    if (!methodMatches(route.method, ctx.req.method)) continue;
    const params = pathMatches(route.path, pathname);
    if (!params) continue;
    if (route.when && !route.when(ctx)) continue;
    // validateRoutes keeps every non-public route behind the /api/ + /files/ gate, which has
    // already answered a signed-out request; this is the label enforcing itself, never a new rule.
    if (route.auth !== "public" && ctx.deps.requireAuth && !ctx.user) {
      signInRequired(ctx);
      return true;
    }
    ctx.params = params;
    await route.handler(ctx);
    return true;
  }
  return false;
}

/** Whether every path a route can match sits behind the sign-in gate (/api/ or /files/). */
function behindGate(path: Route["path"]): boolean {
  const gated = (p: string) => p.startsWith("/api/") || p.startsWith("/files/");
  if (typeof path === "string") return gated(path);
  if (path instanceof RegExp) return /^\^\\\/(api|files)\\\//.test(path.source);
  return path.every(gated);
}

/**
 * Check a stage's table against the gate, at startup. Before the gate ("before") every route must
 * be public; after it, a route is public exactly when its path is outside /api/ and /files/.
 */
export function validateRoutes(routes: readonly Route[], stage: "before-gate" | "after-gate"): readonly Route[] {
  for (const r of routes) {
    const where = `${Array.isArray(r.method) ? r.method.join("|") : r.method} ${String(r.path)}`;
    if (stage === "before-gate" && r.auth !== "public") throw new Error(`Route ${where} runs before the sign-in gate, so it must be public.`);
    if (stage === "after-gate" && (r.auth === "public") === behindGate(r.path)) {
      throw new Error(`Route ${where} is labelled ${r.auth}, but the sign-in gate ${behindGate(r.path) ? "covers" : "does not cover"} its path.`);
    }
  }
  return routes;
}
