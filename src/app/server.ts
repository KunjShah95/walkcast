import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { type FaultId, type Scenario, normalizeScenario, parseScenario, seededInt } from "./faults.ts";

/**
 * MiniCRM: a deliberately small CRM used as the controlled application under test.
 *
 * The harness reads `state` in-process to build its ground-truth oracle, so nothing the
 * agent can reach over HTTP exposes the oracle.
 */

export const OWNERS_ALPHABETICAL = ["Alex Kim", "Maria Lopez", "Priya Shah", "Sam Carter"];
export const OWNERS_BY_WORKLOAD = ["Sam Carter", "Priya Shah", "Alex Kim", "Maria Lopez"];
export const DEFAULT_OWNER = "Unassigned";
export const CREDENTIALS = { username: "demo", password: "demo-pass" };

export interface Lead {
  id: number;
  contact: string;
  company: string;
  owner: string;
  createdAt: number;
}

export interface LedgerEntry {
  at: number;
  method: string;
  path: string;
  body: Record<string, string>;
  outcome: "committed" | "rejected-auth" | "rejected-invalid";
  leadId?: number;
}

export interface AppState {
  leads: Lead[];
  ledger: LedgerEntry[];
}

export interface AppOptions {
  /** One fault id, or several joined with "+". */
  fault: Scenario;
  seed: number;
  port?: number;
}

export interface RunningApp {
  url: string;
  state: AppState;
  fault: Scenario;
  seed: number;
  /** Fault timings derived from the seed, recorded in fixtures. */
  timings: { ownersRefreshMs: number; submitDelayMs: number };
  close(): Promise<void>;
}

interface Session {
  createdAt: number;
  /** Set when the new-lead form was served; session-expiry kills the session on the next POST. */
  formServed: boolean;
  reauthenticated: boolean;
}

export async function startApp(options: AppOptions): Promise<RunningApp> {
  const { seed } = options;
  const fault = normalizeScenario(options.fault);
  const active = new Set<FaultId>(parseScenario(fault));
  const state: AppState = { leads: [], ledger: [] };
  const sessions = new Map<string, Session>();
  const timings = {
    ownersRefreshMs: seededInt(seed, 300, 1200),
    submitDelayMs: seededInt(seed + 1, 1000, 3000),
  };
  let nextId = 1001;

  const server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      if (!res.headersSent) send(res, 500, page("Error", `<p>Internal error</p>`));
      console.error("[minicrm]", error);
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;

    if (path === "/login" && req.method === "GET") {
      const expired = url.searchParams.get("expired") === "1";
      return send(res, 200, loginPage(url.searchParams.get("next") ?? "/leads", expired));
    }
    if (path === "/login" && req.method === "POST") {
      const body = await readForm(req);
      if (body.username !== CREDENTIALS.username || body.password !== CREDENTIALS.password) {
        return send(res, 401, loginPage(body.next ?? "/leads", false, "Invalid username or password"));
      }
      const sid = randomUUID();
      const hadExpired = body.expired === "1";
      sessions.set(sid, { createdAt: Date.now(), formServed: false, reauthenticated: hadExpired });
      return redirect(res, safeNext(body.next), { "Set-Cookie": `sid=${sid}; HttpOnly; Path=/; SameSite=Lax` });
    }

    const sid = parseCookies(req.headers.cookie).sid;
    const session = sid ? sessions.get(sid) : undefined;
    if (!session || !sid) {
      if (req.method === "POST") recordRejected(req, path, await readForm(req), "rejected-auth");
      return redirect(res, `/login?next=${encodeURIComponent(path === "/leads" ? "/leads/new" : path)}`);
    }

    if (path === "/") return redirect(res, "/leads");

    if (path === "/api/owners" && req.method === "GET") {
      const order = url.searchParams.get("order") === "workload" ? OWNERS_BY_WORKLOAD : OWNERS_ALPHABETICAL;
      return sendJson(res, 200, { owners: order });
    }

    if (path === "/leads" && req.method === "GET") {
      return send(res, 200, leadsPage(state.leads));
    }

    if (path === "/leads/new" && req.method === "GET") {
      session.formServed = true;
      return send(res, 200, newLeadPage(active, timings.ownersRefreshMs));
    }

    if (path === "/leads" && req.method === "POST") {
      const body = await readForm(req);
      if (active.has("session-expiry") && session.formServed && !session.reauthenticated) {
        sessions.delete(sid);
        recordRejected(req, path, body, "rejected-auth");
        return redirect(res, `/login?next=${encodeURIComponent("/leads/new")}&expired=1`);
      }
      const contact = (body.contact ?? "").trim();
      const company = (body.company ?? "").trim();
      if (!contact || !company) {
        recordRejected(req, path, body, "rejected-invalid");
        return send(res, 400, newLeadPage(active, timings.ownersRefreshMs, "Contact and company are required"));
      }
      // silent-owner-drop: the form posts `ownerId`, the server only reads `owner`.
      const owner = (body.owner ?? "").trim() || DEFAULT_OWNER;
      const lead: Lead = { id: nextId++, contact, company, owner, createdAt: Date.now() };
      state.leads.push(lead);
      state.ledger.push({ at: Date.now(), method: "POST", path, body, outcome: "committed", leadId: lead.id });
      if (active.has("gateway-timeout")) {
        await delay(timings.submitDelayMs);
        return send(res, 504, page("Gateway timeout", `<p role="alert">The server took too long to respond. Please try again.</p><p><a href="/leads/new">Back to form</a></p>`));
      }
      return redirect(res, `/leads/${lead.id}?created=1`);
    }

    const detail = path.match(/^\/leads\/(\d+)$/);
    if (detail && req.method === "GET") {
      const lead = state.leads.find((l) => l.id === Number(detail[1]));
      if (!lead) return send(res, 404, page("Not found", `<p>Lead not found</p>`));
      return send(res, 200, leadDetailPage(lead, url.searchParams.get("created") === "1"));
    }

    return send(res, 404, page("Not found", `<p>Page not found</p>`));
  }

  function recordRejected(
    req: IncomingMessage,
    path: string,
    body: Record<string, string>,
    outcome: LedgerEntry["outcome"],
  ): void {
    state.ledger.push({ at: Date.now(), method: req.method ?? "POST", path, body, outcome });
  }

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    state,
    fault,
    seed,
    timings,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

// ---------------------------------------------------------------- pages

function newLeadPage(active: Set<FaultId>, ownersRefreshMs: number, error?: string): string {
  const ownerField = active.has("silent-owner-drop") ? "ownerId" : "owner";
  const submit =
    active.has("ui-drift")
      ? `<button id="create-lead-v2" class="btn-primary" type="submit">Create</button>`
      : `<button id="save-lead" type="submit">Save lead</button>`;
  const options = OWNERS_ALPHABETICAL.map((o) => `<option value="${o}">${o}</option>`).join("");
  const refresh =
    active.has("stale-owners")
      ? `<script>
  setTimeout(async () => {
    const res = await fetch('/api/owners?order=workload');
    const { owners } = await res.json();
    const select = document.getElementById('owner');
    select.innerHTML = '<option value="">Select owner</option>' +
      owners.map((o) => '<option value="' + o + '">' + o + '</option>').join('');
  }, ${ownersRefreshMs});
</script>`
      : "";
  return page(
    "New lead",
    `${error ? `<p role="alert" class="error">${error}</p>` : ""}
<form id="lead-form" method="post" action="/leads">
  <label for="contact">Contact name</label>
  <input id="contact" name="contact" type="text">
  <label for="company">Company</label>
  <input id="company" name="company" type="text">
  <label for="owner">Owner</label>
  <select id="owner" name="${ownerField}"><option value="">Select owner</option>${options}</select>
  ${submit}
</form>
${refresh}`,
  );
}

function leadsPage(leads: Lead[]): string {
  const rows = leads
    .map((l) => `<tr><td><a href="/leads/${l.id}">${l.id}</a></td><td>${l.contact}</td><td>${l.company}</td><td>${l.owner}</td></tr>`)
    .join("");
  return page(
    "Leads",
    `<p><a id="new-lead" href="/leads/new">New lead</a></p>
<table><thead><tr><th>ID</th><th>Contact</th><th>Company</th><th>Owner</th></tr></thead><tbody>${rows}</tbody></table>`,
  );
}

function leadDetailPage(lead: Lead, created: boolean): string {
  return page(
    `Lead ${lead.id}`,
    `${created ? `<p role="status" class="toast">Lead created ✓</p>` : ""}
<dl id="lead">
  <dt>ID</dt><dd data-field="id">${lead.id}</dd>
  <dt>Contact</dt><dd data-field="contact">${lead.contact}</dd>
  <dt>Company</dt><dd data-field="company">${lead.company}</dd>
  <dt>Owner</dt><dd data-field="owner">${lead.owner}</dd>
</dl>
<p><a href="/leads">Back to leads</a></p>`,
  );
}

function loginPage(next: string, expired: boolean, error?: string): string {
  return page(
    "Sign in",
    `${expired ? `<p role="alert">Your session expired. Please sign in again.</p>` : ""}
${error ? `<p role="alert" class="error">${error}</p>` : ""}
<form id="login-form" method="post" action="/login">
  <input type="hidden" name="next" value="${escapeAttr(next)}">
  <input type="hidden" name="expired" value="${expired ? "1" : "0"}">
  <label for="username">Username</label><input id="username" name="username" type="text">
  <label for="password">Password</label><input id="password" name="password" type="password">
  <button id="sign-in" type="submit">Sign in</button>
</form>`,
  );
}

function page(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title} · MiniCRM</title></head>
<body><h1>${title}</h1>${body}</body></html>`;
}

// ---------------------------------------------------------------- helpers

function send(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
}

function redirect(res: ServerResponse, location: string, headers: Record<string, string> = {}): void {
  res.writeHead(303, { Location: location, ...headers });
  res.end();
}

function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/leads";
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k) out[k] = v.join("=");
  }
  return out;
}

async function readForm(req: IncomingMessage): Promise<Record<string, string>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString("utf8")));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
