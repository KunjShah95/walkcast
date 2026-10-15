import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { promisify } from "node:util";
import { DuplicateError, type Store, type User } from "../store/index.ts";

export type { User };

/**
 * Accounts for the web app: email + password (scrypt) and Google sign-in (OAuth 2.0
 * authorization-code flow), stored through the Store (a local JSON file, or Supabase Postgres when
 * configured). Session tokens are random; only their SHA-256 is stored, so a leaked database can't
 * be replayed as cookies. Throttling counters live in the store too, so every instance shares them.
 */
const COOKIE = "lab_session";
const STATE_COOKIE = "lab_oauth_state";
const SESSION_DAYS = 30;
const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number, options: { N: number; r: number; p: number; maxmem?: number }) => Promise<Buffer>;

/**
 * The app's own sessions, whoever verified the identity (the built-in password store or Supabase
 * Auth): an opaque random cookie whose SHA-256 is stored, so sessions can be revoked instantly
 * and nothing has to verify a JWT on every request.
 */
export class Sessions {
  constructor(
    readonly store: Store,
    readonly siteUrl: string,
  ) {}

  get secure(): boolean {
    return this.siteUrl.startsWith("https://");
  }

  async startSession(res: ServerResponse, user: User): Promise<void> {
    const token = randomBytes(32).toString("base64url");
    await this.store.createSession(sha256(token), user.id, new Date(Date.now() + SESSION_DAYS * 86_400_000));
    appendCookie(res, cookie(COOKIE, token, SESSION_DAYS * 86_400, this.secure), cookie(STATE_COOKIE, "", 0, this.secure));
  }

  async endSession(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const token = readCookie(req, COOKIE);
    if (token) await this.store.deleteSession(sha256(token));
    appendCookie(res, cookie(COOKIE, "", 0, this.secure));
  }

  async user(req: IncomingMessage): Promise<User | null> {
    const token = readCookie(req, COOKIE);
    if (!token || token.length > 100) return null;
    return this.store.sessionUser(sha256(token));
  }

  /** Per address+account (so one shared proxy IP can't lock everyone out) and per address overall. */
  protected async throttle(kind: string, ip: string, email: string): Promise<void> {
    if ((await this.store.hit(`${kind}:${ip}|${email}`, 15 * 60_000)) > 10 || (await this.store.hit(`${kind}:${ip}`, 15 * 60_000)) > 50) {
      throw new AuthError(429, "Too many attempts. Try again in a few minutes.");
    }
  }
}

/** Built-in accounts: scrypt passwords in the store, and Google sign-in with our own OAuth client. */
export class Auth extends Sessions {
  readonly kind = "local" as const;
  constructor(
    store: Store,
    siteUrl: string,
    readonly google = googleConfig(),
  ) {
    super(store, siteUrl);
  }

  // ---------------------------------------------------------------- email + password

  async signUp(emailRaw: string, password: string, name?: string): Promise<User> {
    const email = normalizeEmail(emailRaw);
    if (!email) throw new AuthError(400, "Enter a valid email address.");
    if (password.length < 8) throw new AuthError(400, "Use a password of at least 8 characters.");
    if (password.length > 200) throw new AuthError(400, "That password is too long.");
    const user: User = {
      id: randomBytes(9).toString("base64url"),
      email,
      ...(name?.trim() ? { name: name.trim().slice(0, 80) } : {}),
      password: await hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    try {
      // The unique index decides; no check-then-insert race between instances.
      await this.store.insertUser(user);
    } catch (e) {
      if (!(e instanceof DuplicateError)) throw e;
      const existing = await this.store.userByEmail(email);
      throw new AuthError(409, existing?.password ? "An account with this email already exists. Sign in instead." : "This email signs in with Google.");
    }
    return user;
  }

  async signIn(emailRaw: string, password: string, ip: string): Promise<User> {
    const email = normalizeEmail(emailRaw) ?? "?";
    await this.throttle("login", ip, email);
    const user = await this.store.userByEmail(email);
    // Same work and same message whether or not the account exists.
    const ok = await verifyPassword(password, user?.password ?? (await dummyHash()));
    if (!user || !user.password || !ok) throw new AuthError(401, "Email or password is incorrect.");
    return user;
  }

  // ---------------------------------------------------------------- Google

  googleRedirect(res: ServerResponse, next: string): void {
    if (!this.google) throw new AuthError(503, "Google sign-in is not configured on this server.");
    const state = randomBytes(16).toString("base64url");
    const params = new URLSearchParams({
      client_id: this.google.clientId,
      redirect_uri: `${this.siteUrl}/auth/google/callback`,
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account",
    });
    res.writeHead(302, {
      Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      "Set-Cookie": cookie(STATE_COOKIE, `${state}.${Buffer.from(safeNext(next)).toString("base64url")}`, 600, this.secure),
    });
    res.end();
  }

  async googleCallback(req: IncomingMessage, url: URL): Promise<{ user: User; next: string }> {
    if (!this.google) throw new AuthError(503, "Google sign-in is not configured on this server.");
    const [state, nextEncoded = ""] = (readCookie(req, STATE_COOKIE) ?? "").split(".");
    if (!state || url.searchParams.get("state") !== state) throw new AuthError(400, "Sign-in expired or was tampered with. Please try again.");
    const code = url.searchParams.get("code");
    if (!code) throw new AuthError(400, url.searchParams.get("error") ?? "Google did not return a code.");
    const token = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.google.clientId,
        client_secret: this.google.clientSecret,
        redirect_uri: `${this.siteUrl}/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    }).then((r) => r.json() as Promise<{ access_token?: string; error?: string }>);
    if (!token.access_token) throw new AuthError(502, `Google sign-in failed (${token.error ?? "no token"}).`);
    const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` } }).then(
      (r) => r.json() as Promise<{ sub?: string; email?: string; email_verified?: boolean; name?: string }>,
    );
    if (!info.sub || !info.email || !info.email_verified) throw new AuthError(403, "Google did not confirm a verified email for this account.");
    return { user: await this.upsertGoogle(info.sub, info.email, info.name), next: safeNext(Buffer.from(nextEncoded, "base64url").toString()) };
  }

  async upsertGoogle(sub: string, emailRaw: string, name?: string): Promise<User> {
    const email = normalizeEmail(emailRaw)!;
    const user = (await this.store.userByGoogle(sub)) ?? (await this.store.userByEmail(email));
    if (user) {
      if (!user.google) {
        // Email sign-ups are not verified, so anyone could have registered this address first.
        // Google has verified it: the Google owner takes the account over, and the unverified
        // password and every existing session stop working.
        delete user.password;
        await this.store.deleteUserSessions(user.id);
      }
      user.google = sub;
      await this.store.updateUser(user);
      return user;
    }
    const created: User = { id: randomBytes(9).toString("base64url"), email, ...(name ? { name } : {}), google: sub, createdAt: new Date().toISOString() };
    try {
      await this.store.insertUser(created);
      return created;
    } catch (e) {
      // Two callbacks for the same new account raced; the other one won.
      if (e instanceof DuplicateError) return (await this.store.userByEmail(email))!;
      throw e;
    }
  }
}

export class AuthError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function publicUser(user: User | null): { email: string; name?: string; google: boolean } | null {
  return user ? { email: user.email, ...(user.name ? { name: user.name } : {}), google: Boolean(user.google) } : null;
}

function googleConfig(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** Only same-site relative paths are allowed as post-sign-in destinations. */
export function safeNext(next: string | null | undefined): string {
  const fallback = "/app#record";
  // Browsers strip tabs/newlines and treat "\\" as "/" in URLs, so any of them could turn a
  // path into "//evil.example". Reject them outright, then require a same-origin result.
  if (!next || !next.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  try {
    const base = "http://same.invalid";
    const url = new URL(next, base);
    return url.origin === base ? url.pathname + url.search + url.hash : fallback;
  } catch {
    return fallback;
  }
}

export function normalizeEmail(email: string): string | null {
  const e = email.trim().toLowerCase();
  return /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254 ? e : null;
}

// scrypt runs on libuv's thread pool (async), so a burst of sign-ins doesn't stall other requests.
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$${salt.toString("base64")}$${hash.toString("base64")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !n || !saltB64 || !hashB64 || Number(n) > 1 << 17) return false;
  const expected = Buffer.from(hashB64, "base64");
  if (expected.length === 0) return false;
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, { N: Number(n), r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
  return timingSafeEqual(expected, actual);
}

let dummy: Promise<string> | undefined;
const dummyHash = () => (dummy ??= hashPassword(randomBytes(12).toString("hex")));

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Add Set-Cookie headers without dropping ones already set on this response. */
export function appendCookie(res: ServerResponse, ...cookies: string[]): void {
  const existing = res.getHeader("Set-Cookie");
  const list = existing === undefined ? [] : Array.isArray(existing) ? existing.map(String) : [String(existing)];
  res.setHeader("Set-Cookie", [...list, ...cookies]);
}

export function cookie(name: string, value: string, maxAge: number, secure: boolean): string {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function readCookie(req: IncomingMessage, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}
