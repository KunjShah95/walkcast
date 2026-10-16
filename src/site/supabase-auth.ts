import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { DuplicateError, type Store, type User } from "../store/index.ts";
import { AuthError, Sessions, appendCookie, cookie, normalizeEmail, readCookie, safeNext } from "./auth.ts";

/**
 * Sign-in through Supabase Auth (GoTrue): Supabase holds the passwords, confirms email addresses,
 * sends password-reset mail and runs Google sign-in (configured in the Supabase dashboard). Walkcast
 * calls its REST API from the server, uses PKCE for every redirect flow, and once Supabase has
 * vouched for a user starts its own session (see Sessions) and signs the Supabase session out,
 * so no Supabase tokens live in the browser.
 *
 * Configure with SUPABASE_URL and SUPABASE_ANON_KEY (or the newer SUPABASE_PUBLISHABLE_KEY), and add
 * <LAB_SITE_URL>/auth/callback to Authentication → URL Configuration → Redirect URLs.
 */
const FLOW_COOKIE = "lab_auth_flow";
const RECOVERY_COOKIE = "lab_recovery";

interface SupabaseUser {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  app_metadata?: { provider?: string; providers?: string[] };
  user_metadata?: { full_name?: string; name?: string };
}

interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  user: SupabaseUser;
}

interface Flow {
  verifier: string;
  next: string;
  purpose: "signin" | "recovery";
}

export interface SupabaseAuthConfig {
  url: string;
  anonKey: string;
}

export function supabaseAuthConfig(env = process.env): SupabaseAuthConfig | null {
  const url = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey || env.LAB_AUTH_PROVIDER === "local") return null;
  return { url: url.replace(/\/$/, ""), anonKey };
}

export class SupabaseAuth extends Sessions {
  readonly kind = "supabase" as const;
  private settings: { at: number; value: { google: boolean; confirmEmail: boolean; signupDisabled: boolean } } | undefined;

  constructor(
    store: Store,
    siteUrl: string,
    readonly cfg: SupabaseAuthConfig,
  ) {
    super(store, siteUrl);
  }

  private get callbackUrl(): string {
    return `${this.siteUrl}/auth/callback`;
  }

  // ---------------------------------------------------------------- what the pages offer

  /** From Supabase's public settings: which providers are on and whether email must be confirmed. */
  async options(): Promise<{ google: boolean; forgot: boolean; confirmEmail: boolean; signupDisabled: boolean }> {
    if (!this.settings || Date.now() - this.settings.at > 5 * 60_000) {
      try {
        const s = await this.call<{ external?: Record<string, boolean>; mailer_autoconfirm?: boolean; disable_signup?: boolean }>("GET", "/settings");
        this.settings = { at: Date.now(), value: { google: Boolean(s.external?.google), confirmEmail: !s.mailer_autoconfirm, signupDisabled: Boolean(s.disable_signup) } };
      } catch {
        // Supabase unreachable: offer the safe defaults and try again on the next page load.
        return { google: false, forgot: true, confirmEmail: true, signupDisabled: false };
      }
    }
    return { ...this.settings.value, forgot: true };
  }

  // ---------------------------------------------------------------- email + password

  /** Creates the account in Supabase. Either signs in at once or asks the user to confirm their email. */
  async signUp(res: ServerResponse, emailRaw: string, password: string, name: string | undefined, ip: string, next: string): Promise<{ user: User } | { confirmEmail: true }> {
    const email = normalizeEmail(emailRaw);
    if (!email) throw new AuthError(400, "Enter a valid email address.");
    if (password.length < 8) throw new AuthError(400, "Use a password of at least 8 characters.");
    if (password.length > 200) throw new AuthError(400, "That password is too long.");
    await this.throttle("signup", ip, email);
    // PKCE for the confirmation link, so it can only complete in this browser.
    const { verifier, challenge } = pkce();
    const result = await this.call<Partial<SupabaseSession> & SupabaseUser>(
      "POST",
      `/signup?redirect_to=${encodeURIComponent(this.callbackUrl)}`,
      { email, password, data: name?.trim() ? { full_name: name.trim().slice(0, 80) } : {}, code_challenge: challenge, code_challenge_method: "s256" },
    );
    if (result.access_token && result.user) return { user: await this.adopt(result as SupabaseSession) };
    // Confirmation required (or, with Supabase's enumeration protection, the address already has an
    // account). Either way the honest answer is the same: check your email.
    // Confirmation emails may be opened hours later; keep this verifier for a day.
    this.setFlow(res, { verifier, next: safeNext(next), purpose: "signin" }, 86_400);
    return { confirmEmail: true };
  }

  async signIn(emailRaw: string, password: string, ip: string): Promise<User> {
    const email = normalizeEmail(emailRaw) ?? "?";
    await this.throttle("login", ip, email);
    try {
      const session = await this.call<SupabaseSession>("POST", "/token?grant_type=password", { email, password });
      return await this.adopt(session);
    } catch (e) {
      if (e instanceof SupabaseError && e.code === "email_not_confirmed") throw new AuthError(403, "Confirm your email address first: open the link we sent you, then sign in.");
      if (e instanceof SupabaseError && e.status < 500) throw new AuthError(401, "Email or password is incorrect.");
      throw e;
    }
  }

  // ---------------------------------------------------------------- Google (and any OAuth provider Supabase has on)

  googleRedirect(res: ServerResponse, next: string): void {
    const { verifier, challenge } = pkce();
    this.setFlow(res, { verifier, next: safeNext(next), purpose: "signin" });
    const params = new URLSearchParams({ provider: "google", redirect_to: this.callbackUrl, code_challenge: challenge, code_challenge_method: "s256" });
    res.writeHead(302, { Location: `${this.cfg.url}/auth/v1/authorize?${params}` });
    res.end();
  }

  /**
   * Where Supabase sends the browser back to, after Google, an email confirmation or a reset link:
   * exchange the one-time code (with this browser's PKCE verifier) for a session.
   */
  async callback(req: IncomingMessage, res: ServerResponse, url: URL): Promise<{ user: User; next: string } | { recovery: true }> {
    const error = url.searchParams.get("error_description") ?? url.searchParams.get("error");
    if (error) throw new AuthError(400, `Sign-in didn't complete: ${error}`);
    const code = url.searchParams.get("code");
    if (!code) throw new AuthError(400, "The sign-in link is missing its code. Please try again.");
    const flow = this.readFlow(req);
    appendCookie(res, cookie(FLOW_COOKIE, "", 0, this.secure));
    if (!flow) {
      // A confirmation link opened in another browser: the address is confirmed, the code can't be used here.
      throw new AuthError(400, "Your email is confirmed. Sign in with your email and password to continue.");
    }
    const session = await this.call<SupabaseSession>("POST", "/token?grant_type=pkce", { auth_code: code, code_verifier: flow.verifier }).catch((e: unknown) => {
      throw e instanceof SupabaseError && e.status < 500 ? new AuthError(400, "This sign-in link has expired or was already used. Please try again.") : e;
    });
    if (flow.purpose === "recovery") {
      // Hold the short-lived token only until the new password is set (10 minutes, HttpOnly).
      appendCookie(res, cookie(RECOVERY_COOKIE, session.access_token, 600, this.secure));
      return { recovery: true };
    }
    return { user: await this.adopt(session), next: flow.next };
  }

  // ---------------------------------------------------------------- password reset

  /** Sends Supabase's reset email. Always succeeds from the caller's view (no account enumeration). */
  async forgot(res: ServerResponse, emailRaw: string, ip: string): Promise<void> {
    const email = normalizeEmail(emailRaw);
    if (!email) throw new AuthError(400, "Enter a valid email address.");
    await this.throttle("recover", ip, email);
    const { verifier, challenge } = pkce();
    this.setFlow(res, { verifier, next: "/app#record", purpose: "recovery" });
    await this.call("POST", `/recover?redirect_to=${encodeURIComponent(this.callbackUrl)}`, { email, code_challenge: challenge, code_challenge_method: "s256" }).catch((e: unknown) => {
      if (!(e instanceof SupabaseError) || e.status >= 500) throw e;
    });
  }

  async resetPassword(req: IncomingMessage, res: ServerResponse, password: string): Promise<User> {
    if (password.length < 8) throw new AuthError(400, "Use a password of at least 8 characters.");
    const token = readCookie(req, RECOVERY_COOKIE);
    if (!token) throw new AuthError(400, "This reset link has expired. Ask for a new one.");
    appendCookie(res, cookie(RECOVERY_COOKIE, "", 0, this.secure));
    const user = await this.call<SupabaseUser>("PUT", "/user", { password }, token).catch((e: unknown) => {
      throw e instanceof SupabaseError && e.status < 500 ? new AuthError(400, e.message) : e;
    });
    const linked = await this.link(user);
    await this.call("POST", "/logout?scope=local", undefined, token).catch(() => undefined);
    return linked;
  }

  // ---------------------------------------------------------------- linking

  /** Turn a Supabase session into our user, then end the Supabase session (we keep our own). */
  private async adopt(session: SupabaseSession): Promise<User> {
    try {
      return await this.link(session.user);
    } finally {
      await this.call("POST", "/logout?scope=local", undefined, session.access_token).catch(() => undefined);
    }
  }

  private async link(su: SupabaseUser): Promise<User> {
    const email = normalizeEmail(su.email ?? "");
    if (!email) throw new AuthError(400, "Supabase returned an account without an email address.");
    const name = su.user_metadata?.full_name ?? su.user_metadata?.name;
    const viaGoogle = (su.app_metadata?.providers ?? [su.app_metadata?.provider]).includes("google");
    const known = await this.store.userByAuthId(su.id);
    if (known) {
      const updated: User = { ...known, email, ...(name && !known.name ? { name } : {}), ...(viaGoogle ? { google: known.google ?? "supabase" } : {}) };
      await this.store.updateUser(updated);
      return updated;
    }
    // An account from before the switch to Supabase Auth: link it by email, but only once Supabase
    // has confirmed the address (otherwise anyone could claim someone else's history).
    const legacy = await this.store.userByEmail(email);
    if (legacy) {
      // With "Confirm email" off, Supabase marks every address confirmed, so that alone proves
      // nothing: link only when the project really confirms addresses, or Google vouched for it.
      const verified = viaGoogle || ((await this.options()).confirmEmail && Boolean(su.email_confirmed_at));
      if (!verified) throw new AuthError(403, "An earlier account uses this email. Turn on email confirmation in Supabase (or sign in with Google) to connect it.");
      const linked: User = { ...legacy, authId: su.id, ...(viaGoogle ? { google: legacy.google ?? "supabase" } : {}) };
      delete linked.password; // Supabase owns the password now
      await this.store.updateUser(linked);
      await this.store.deleteUserSessions(legacy.id);
      return linked;
    }
    const created: User = { id: su.id, authId: su.id, email, ...(name ? { name: name.slice(0, 80) } : {}), ...(viaGoogle ? { google: "supabase" } : {}), createdAt: new Date().toISOString() };
    try {
      await this.store.insertUser(created);
      return created;
    } catch (e) {
      if (e instanceof DuplicateError) {
        const winner = await this.store.userByAuthId(su.id); // a concurrent sign-in created it first
        if (winner) return winner;
      }
      throw e;
    }
  }

  // ---------------------------------------------------------------- plumbing

  private setFlow(res: ServerResponse, flow: Flow, maxAge = 900): void {
    // The verifier is useless without the code Supabase sends to this callback; HttpOnly.
    appendCookie(res, cookie(FLOW_COOKIE, Buffer.from(JSON.stringify(flow)).toString("base64url"), maxAge, this.secure));
  }

  private readFlow(req: IncomingMessage): Flow | null {
    const raw = readCookie(req, FLOW_COOKIE);
    if (!raw) return null;
    try {
      const f = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<Flow>;
      if (typeof f.verifier !== "string" || !/^[\w-]{43,128}$/.test(f.verifier)) return null;
      return { verifier: f.verifier, next: safeNext(f.next), purpose: f.purpose === "recovery" ? "recovery" : "signin" };
    } catch {
      return null;
    }
  }

  private async call<T>(method: string, path: string, body?: unknown, bearer?: string): Promise<T> {
    const res = await fetch(`${this.cfg.url}/auth/v1${path}`, {
      method,
      headers: {
        apikey: this.cfg.anonKey,
        Authorization: `Bearer ${bearer ?? this.cfg.anonKey}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    if (!res.ok) {
      // GoTrue answers errors as {code, error_code, msg} (current) or {error, error_description} (older).
      const message = String(data.msg ?? data.error_description ?? data.message ?? data.error ?? `Supabase Auth error ${res.status}`);
      throw new SupabaseError(res.status, String(data.error_code ?? data.error ?? ""), message);
    }
    return data as T;
  }
}

class SupabaseError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** RFC 7636 PKCE pair: a random verifier and its S256 challenge. */
export function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}
