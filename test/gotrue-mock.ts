import { createHash, randomBytes, randomUUID } from "node:crypto";
import { type IncomingMessage, type Server, createServer } from "node:http";

/**
 * A stand-in for Supabase Auth (GoTrue) implementing the endpoints Walkcast calls, with the
 * request/response shapes of the real API: /settings, /signup, /token (password, pkce),
 * /authorize, /recover, /user (GET/PUT), /logout. PKCE is checked for real (S256). "Emails" are
 * captured in `mail` as the links GoTrue would redirect to after /verify.
 */
export interface MockUser {
  id: string;
  email: string;
  password: string;
  confirmed: boolean;
  provider: "email" | "google";
  name?: string;
}

export class GoTrueMock {
  readonly anonKey = `anon-${randomBytes(4).toString("hex")}`;
  users: MockUser[] = [];
  mail: { to: string; kind: "confirm" | "recovery"; link: string }[] = [];
  /** Access tokens revoked through /logout. */
  loggedOut = new Set<string>();
  settings = { googleEnabled: true, autoconfirm: false };
  /** The Google identity /authorize will "consent" as. */
  googleIdentity = { email: "gina@example.com", name: "Gina" };
  private codes = new Map<string, { userId: string; challenge: string; purpose: "signin" | "recovery" }>();
  private tokens = new Map<string, string>(); // access token -> user id
  private server: Server | undefined;
  url = "";

  async start(): Promise<this> {
    this.server = createServer((req, res) => {
      void this.handle(req).then(
        ({ status, body, headers }) => {
          res.writeHead(status, { "Content-Type": "application/json", ...headers });
          res.end(body === undefined ? "" : JSON.stringify(body));
        },
        (e: unknown) => {
          res.writeHead(500);
          res.end(String(e));
        },
      );
    });
    await new Promise<void>((r) => this.server!.listen(0, "127.0.0.1", r));
    this.url = `http://127.0.0.1:${(this.server.address() as { port: number }).port}`;
    return this;
  }

  stop(): void {
    this.server?.close();
  }

  private session(user: MockUser) {
    const access = `at-${randomBytes(12).toString("hex")}`;
    this.tokens.set(access, user.id);
    return { access_token: access, token_type: "bearer", expires_in: 3600, refresh_token: `rt-${randomBytes(8).toString("hex")}`, user: this.publicUser(user) };
  }

  private publicUser(u: MockUser) {
    return {
      id: u.id,
      aud: "authenticated",
      email: u.email,
      email_confirmed_at: u.confirmed ? new Date().toISOString() : null,
      app_metadata: { provider: u.provider, providers: [u.provider] },
      user_metadata: u.name ? { full_name: u.name } : {},
      identities: [{ provider: u.provider }],
    };
  }

  private code(user: MockUser, challenge: string, purpose: "signin" | "recovery"): string {
    const code = randomUUID();
    this.codes.set(code, { userId: user.id, challenge, purpose });
    return code;
  }

  private async handle(req: IncomingMessage): Promise<{ status: number; body?: unknown; headers?: Record<string, string> }> {
    if (req.headers.apikey !== this.anonKey) return { status: 401, body: { message: "Invalid API key" } };
    const url = new URL(req.url!, this.url);
    const path = url.pathname.replace(/^\/auth\/v1/, "");
    let raw = "";
    for await (const c of req) raw += c;
    const body = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    const err = (status: number, error_code: string, msg: string) => ({ status, body: { code: status, error_code, msg } });
    const bearerUser = () => {
      const token = String(req.headers.authorization ?? "").replace(/^Bearer /, "");
      if (this.loggedOut.has(token)) return null;
      const id = this.tokens.get(token);
      return this.users.find((u) => u.id === id) ?? null;
    };

    if (path === "/settings" && req.method === "GET") {
      return { status: 200, body: { external: { email: true, google: this.settings.googleEnabled, github: false }, disable_signup: false, mailer_autoconfirm: this.settings.autoconfirm } };
    }
    if (path === "/signup" && req.method === "POST") {
      const redirectTo = url.searchParams.get("redirect_to") ?? "";
      const existing = this.users.find((u) => u.email === body.email);
      if (existing) return { status: 200, body: { ...this.publicUser(existing), identities: [] } }; // enumeration protection
      if (String(body.password ?? "").length < 6) return err(422, "weak_password", "Password should be at least 6 characters.");
      const user: MockUser = { id: randomUUID(), email: body.email!, password: body.password!, confirmed: this.settings.autoconfirm, provider: "email", ...((body as unknown as { data?: { full_name?: string } }).data?.full_name ? { name: (body as unknown as { data: { full_name: string } }).data.full_name } : {}) };
      this.users.push(user);
      if (this.settings.autoconfirm) return { status: 200, body: this.session(user) };
      assertS256(body);
      this.mail.push({ to: user.email, kind: "confirm", link: `${redirectTo}?code=${this.code(user, body.code_challenge!, "signin")}` });
      return { status: 200, body: { ...this.publicUser(user), confirmation_sent_at: new Date().toISOString() } };
    }
    if (path === "/token" && req.method === "POST") {
      const grant = url.searchParams.get("grant_type");
      if (grant === "password") {
        const user = this.users.find((u) => u.email === body.email && u.password === body.password);
        if (!user) return err(400, "invalid_credentials", "Invalid login credentials");
        if (!user.confirmed) return err(400, "email_not_confirmed", "Email not confirmed");
        return { status: 200, body: this.session(user) };
      }
      if (grant === "pkce") {
        const entry = this.codes.get(body.auth_code!);
        if (!entry) return err(404, "flow_state_not_found", "invalid flow state, no valid flow state found");
        const challenge = createHash("sha256").update(body.code_verifier ?? "").digest("base64url");
        if (challenge !== entry.challenge) return err(400, "bad_code_verifier", "code challenge does not match previously saved code verifier");
        this.codes.delete(body.auth_code!);
        const user = this.users.find((u) => u.id === entry.userId)!;
        user.confirmed = true;
        return { status: 200, body: this.session(user) };
      }
      return err(400, "unsupported_grant_type", "unsupported grant type");
    }
    if (path === "/authorize" && req.method === "GET") {
      if (url.searchParams.get("provider") !== "google" || !this.settings.googleEnabled) return err(400, "validation_failed", "Unsupported provider: provider is not enabled");
      if (url.searchParams.get("code_challenge_method") !== "s256" || !url.searchParams.get("code_challenge")) return err(400, "validation_failed", "PKCE required by this test");
      // Pretend Google consented: find-or-create the Google user and redirect back with a code.
      let user = this.users.find((u) => u.email === this.googleIdentity.email);
      if (!user) {
        user = { id: randomUUID(), email: this.googleIdentity.email, password: randomBytes(8).toString("hex"), confirmed: true, provider: "google", name: this.googleIdentity.name };
        this.users.push(user);
      }
      const code = this.code(user, url.searchParams.get("code_challenge")!, "signin");
      return { status: 302, headers: { Location: `${url.searchParams.get("redirect_to")}?code=${code}` } };
    }
    if (path === "/recover" && req.method === "POST") {
      const user = this.users.find((u) => u.email === body.email);
      if (user) {
        assertS256(body);
        this.mail.push({ to: user.email, kind: "recovery", link: `${url.searchParams.get("redirect_to")}?code=${this.code(user, body.code_challenge!, "recovery")}` });
      }
      return { status: 200, body: {} };
    }
    if (path === "/user") {
      const user = bearerUser();
      if (!user) return err(401, "bad_jwt", "invalid JWT");
      if (req.method === "PUT" && body.password) user.password = body.password;
      return { status: 200, body: this.publicUser(user) };
    }
    if (path === "/logout" && req.method === "POST") {
      this.loggedOut.add(String(req.headers.authorization ?? "").replace(/^Bearer /, ""));
      return { status: 204 };
    }
    return err(404, "not_found", `no route ${req.method} ${path}`);
  }
}

function assertS256(body: Record<string, string>): void {
  if (body.code_challenge_method !== "s256" || !/^[\w-]{43}$/.test(body.code_challenge ?? "")) throw new Error("expected an S256 PKCE challenge");
}
