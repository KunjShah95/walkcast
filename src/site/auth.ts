import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join } from "node:path";

/**
 * Accounts for the hosted dashboard: email + password (scrypt) and Google sign-in (OAuth 2.0
 * authorization-code flow). Stored in a JSON file under .lab/ (git-ignored). Session tokens are
 * random; only their SHA-256 is stored, so a leaked store cannot be replayed as a cookie.
 */
export interface User {
  id: string;
  email: string;
  name?: string;
  /** scrypt$N$salt$hash, absent for Google-only accounts. */
  password?: string;
  google?: string;
  createdAt: string;
}

interface Store {
  users: User[];
  sessions: { hash: string; userId: string; expires: number }[];
}

const COOKIE = "lab_session";
const STATE_COOKIE = "lab_oauth_state";
const SESSION_DAYS = 30;

export class Auth {
  private store: Store;
  private attempts = new Map<string, { count: number; since: number }>();

  constructor(
    readonly file: string,
    readonly siteUrl: string,
    readonly google = googleConfig(),
  ) {
    this.store = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Store) : { users: [], sessions: [] };
  }

  get secure(): boolean {
    return this.siteUrl.startsWith("https://");
  }

  // ---------------------------------------------------------------- email + password

  signUp(emailRaw: string, password: string, name?: string): User {
    const email = normalizeEmail(emailRaw);
    if (!email) throw new AuthError(400, "Enter a valid email address.");
    if (password.length < 8) throw new AuthError(400, "Use a password of at least 8 characters.");
    if (password.length > 200) throw new AuthError(400, "That password is too long.");
    const existing = this.store.users.find((u) => u.email === email);
    if (existing) throw new AuthError(409, existing.password ? "An account with this email already exists. Sign in instead." : "This email signs in with Google.");
    const user: User = { id: randomBytes(9).toString("base64url"), email, ...(name?.trim() ? { name: name.trim().slice(0, 80) } : {}), password: hashPassword(password), createdAt: new Date().toISOString() };
    this.store.users.push(user);
    this.save();
    return user;
  }

  signIn(emailRaw: string, password: string, ip: string): User {
    // Per address+account (so one shared proxy IP can't lock everyone out) and per address overall.
    this.throttle(`${ip}|${normalizeEmail(emailRaw) ?? "?"}`, 10);
    this.throttle(ip, 50);
    const user = this.store.users.find((u) => u.email === normalizeEmail(emailRaw));
    // Same work and same message whether or not the account exists.
    const ok = verifyPassword(password, user?.password ?? DUMMY_HASH);
    if (!user || !user.password || !ok) throw new AuthError(401, "Email or password is incorrect.");
    this.attempts.delete(`${ip}|${user.email}`);
    return user;
  }

  private throttle(key: string, limit: number): void {
    const now = Date.now();
    const a = this.attempts.get(key);
    if (!a || now - a.since > 15 * 60_000) {
      this.attempts.set(key, { count: 1, since: now });
      return;
    }
    a.count++;
    if (a.count > limit) throw new AuthError(429, "Too many attempts. Try again in a few minutes.");
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
    return { user: this.upsertGoogle(info.sub, info.email, info.name), next: safeNext(Buffer.from(nextEncoded, "base64url").toString()) };
  }

  upsertGoogle(sub: string, emailRaw: string, name?: string): User {
    const email = normalizeEmail(emailRaw)!;
    let user = this.store.users.find((u) => u.google === sub) ?? this.store.users.find((u) => u.email === email);
    if (user && !user.google) {
      // Email sign-ups are not verified, so anyone could have registered this address first.
      // Google has verified it: the Google owner takes the account over, and the unverified
      // password and every existing session stop working.
      delete user.password;
      this.store.sessions = this.store.sessions.filter((s) => s.userId !== user!.id);
    }
    if (user) user.google = sub;
    else {
      user = { id: randomBytes(9).toString("base64url"), email, ...(name ? { name } : {}), google: sub, createdAt: new Date().toISOString() };
      this.store.users.push(user);
    }
    this.save();
    return user;
  }

  // ---------------------------------------------------------------- sessions

  startSession(res: ServerResponse, user: User): void {
    const token = randomBytes(32).toString("base64url");
    const now = Date.now();
    this.store.sessions = this.store.sessions.filter((s) => s.expires > now);
    this.store.sessions.push({ hash: sha256(token), userId: user.id, expires: now + SESSION_DAYS * 86_400_000 });
    this.save();
    res.setHeader("Set-Cookie", [cookie(COOKIE, token, SESSION_DAYS * 86_400, this.secure), cookie(STATE_COOKIE, "", 0, this.secure)]);
  }

  endSession(req: IncomingMessage, res: ServerResponse): void {
    const token = readCookie(req, COOKIE);
    if (token) {
      const hash = sha256(token);
      this.store.sessions = this.store.sessions.filter((s) => s.hash !== hash);
      this.save();
    }
    res.setHeader("Set-Cookie", cookie(COOKIE, "", 0, this.secure));
  }

  user(req: IncomingMessage): User | null {
    const token = readCookie(req, COOKIE);
    if (!token) return null;
    const hash = sha256(token);
    const session = this.store.sessions.find((s) => s.hash === hash && s.expires > Date.now());
    return session ? (this.store.users.find((u) => u.id === session.userId) ?? null) : null;
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.store, null, 2), { mode: 0o600 });
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

export function defaultAuthFile(root: string): string {
  return join(root, ".lab", "users.json");
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

function normalizeEmail(email: string): string | null {
  const e = email.trim().toLowerCase();
  return /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254 ? e : null;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$${salt.toString("base64")}$${hash.toString("base64")}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [scheme, n, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !n || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = scryptSync(password, Buffer.from(saltB64, "base64"), expected.length, { N: Number(n), r: 8, p: 1 });
  return timingSafeEqual(expected, actual);
}

const DUMMY_HASH = hashPassword(randomBytes(12).toString("hex"));

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function cookie(name: string, value: string, maxAge: number, secure: boolean): string {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function readCookie(req: IncomingMessage, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}
