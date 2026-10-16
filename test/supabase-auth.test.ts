import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { FileStore } from "../src/store/index.ts";
import { serveDashboard, type Running } from "../src/ui/server.ts";
import { GoTrueMock } from "./gotrue-mock.ts";

process.env.LAB_LOG = "off";

const gotrue = new GoTrueMock();
let srv: Running;
let store: FileStore;
let root: string;

before(async () => {
  await gotrue.start();
  process.env.SUPABASE_URL = gotrue.url;
  process.env.SUPABASE_ANON_KEY = gotrue.anonKey;
  root = mkdtempSync(join(tmpdir(), "sbauth-"));
  store = new FileStore(join(root, "store.json"));
  srv = await serveDashboard(5100 + Math.floor(Math.random() * 300), { root, unref: true, store, worker: false });
});
after(async () => {
  await srv.close(100);
  gotrue.stop();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  rmSync(root, { recursive: true, force: true });
});

/** A tiny cookie jar: a browser for these tests. */
class Browser {
  jar = new Map<string, string>();
  async go(path: string, init: RequestInit = {}): Promise<Response> {
    const url = path.startsWith("http") ? path : `${srv.url}${path}`;
    const res = await fetch(url, { ...init, redirect: "manual", headers: { ...(init.headers as Record<string, string>), cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ") } });
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(";");
      const [k, ...v] = pair!.split("=");
      if (attrs.some((a) => /max-age=0/i.test(a.trim()))) this.jar.delete(k!.trim());
      else this.jar.set(k!.trim(), v.join("="));
    }
    return res;
  }
  post(path: string, body: unknown): Promise<Response> {
    return this.go(path, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
  }
  async me(): Promise<{ email: string } | null> {
    return ((await (await this.go("/api/me")).json()) as { user: { email: string } | null }).user;
  }
}

test("sign-in pages offer Google and password reset when Supabase has them on", async () => {
  const html = await (await new Browser().go("/login")).text();
  assert.match(html, /href="\/auth\/google\?next=/);
  assert.match(html, /href="\/forgot"/);
  assert.equal((await new Browser().go("/forgot")).status, 200);
});

test("email sign-up: confirmation link (PKCE) signs in, Supabase's own session is ended, our session works", async () => {
  const b = new Browser();
  const r = await b.post("/auth/signup", { email: "Eve@Example.com", password: "a-long-password", name: "Eve", next: "/app#record" });
  assert.equal(r.status, 200);
  assert.match(((await r.json()) as { message: string }).message, /Check your email/);
  assert.equal(await b.me(), null, "not signed in until the address is confirmed");
  // Signing in before confirming says so.
  const early = await new Browser().post("/auth/login", { email: "eve@example.com", password: "a-long-password" });
  assert.equal(early.status, 403);

  const mail = gotrue.mail.find((m) => m.to === "eve@example.com" && m.kind === "confirm")!;
  assert.ok(mail.link.startsWith(`${srv.url}/auth/callback?code=`));
  const cb = await b.go(mail.link);
  assert.equal(cb.status, 302);
  assert.equal(cb.headers.get("location"), "/app#record");
  assert.equal((await b.me())?.email, "eve@example.com");
  assert.ok(gotrue.loggedOut.size >= 1, "the Supabase session was signed out once we had our own");
  const row = await store.userByEmail("eve@example.com");
  assert.equal(row?.authId, gotrue.users.find((u) => u.email === "eve@example.com")!.id);
  assert.equal(row?.password, undefined, "no password is stored by Walkcast");
  assert.equal(row?.name, "Eve");

  // The same link a second time (or a stolen code) doesn't work.
  const again = await new Browser().go(mail.link);
  assert.match(decodeURIComponent(again.headers.get("location") ?? ""), /\/login\?notice=Your email is confirmed/);
});

test("password sign-in through Supabase, generic error on a wrong password", async () => {
  const wrong = await new Browser().post("/auth/login", { email: "eve@example.com", password: "nope-nope" });
  assert.equal(wrong.status, 401);
  assert.match(((await wrong.json()) as { error: string }).error, /incorrect/);
  const b = new Browser();
  const ok = await b.post("/auth/login", { email: "eve@example.com", password: "a-long-password", next: "/app#runs" });
  assert.equal(ok.status, 200);
  assert.equal(((await ok.json()) as { next: string }).next, "/app#runs");
  assert.equal((await b.me())?.email, "eve@example.com");
  await b.go("/auth/logout");
  assert.equal(await b.me(), null);
});

test("Google through Supabase with PKCE; a code without this browser's verifier is refused", async () => {
  const b = new Browser();
  const start = await b.go("/auth/google?next=%2Fapp%23simulator");
  const authorize = new URL(start.headers.get("location")!);
  assert.equal(authorize.origin + authorize.pathname, `${gotrue.url}/auth/v1/authorize`);
  assert.equal(authorize.searchParams.get("provider"), "google");
  assert.equal(authorize.searchParams.get("redirect_to"), `${srv.url}/auth/callback`);
  assert.equal(authorize.searchParams.get("code_challenge_method"), "s256");

  // Supabase (after Google) redirects back with a code.
  const back = await fetch(authorize, { redirect: "manual", headers: { apikey: gotrue.anonKey } });
  const callback = back.headers.get("location")!;
  // An attacker's browser (no verifier cookie) can't use the code...
  const stolen = await new Browser().go(callback);
  assert.match(decodeURIComponent(stolen.headers.get("location") ?? ""), /notice=/);
  // ...and a forged verifier fails the PKCE check at Supabase.
  const forged = new Browser();
  forged.jar.set("lab_auth_flow", Buffer.from(JSON.stringify({ verifier: "x".repeat(43), next: "/", purpose: "signin" })).toString("base64url"));
  assert.match(decodeURIComponent((await forged.go(callback)).headers.get("location") ?? ""), /expired or was already used/);

  // The right browser: one more round trip because the code above was consumed by nothing (PKCE failed),
  // so it is still valid for the browser holding the verifier.
  const done = await b.go(callback);
  assert.equal(done.headers.get("location"), "/app#simulator");
  const me = (await (await b.go("/api/me")).json()) as { user: { email: string; google: boolean } };
  assert.deepEqual(me.user, { email: "gina@example.com", name: "Gina", google: true, openrouter: false, chatgpt: false });
});

test("forgot password: reset link (PKCE) leads to a new-password form; the new password works", async () => {
  const b = new Browser();
  const r = await b.post("/auth/forgot", { email: "eve@example.com" });
  assert.match(((await r.json()) as { message: string }).message, /If an account exists/);
  // Unknown address: same answer, nothing sent.
  const unknown = await new Browser().post("/auth/forgot", { email: "nobody@example.com" });
  assert.equal(unknown.status, 200);
  assert.equal(gotrue.mail.filter((m) => m.to === "nobody@example.com").length, 0);

  const link = gotrue.mail.findLast((m) => m.to === "eve@example.com" && m.kind === "recovery")!.link;
  const cb = await b.go(link);
  assert.equal(cb.headers.get("location"), "/reset");
  assert.ok(b.jar.has("lab_recovery"));
  assert.equal((await b.go("/reset")).status, 200);
  const reset = await b.post("/auth/reset", { password: "brand-new-password" });
  assert.equal(reset.status, 200);
  assert.ok(!b.jar.has("lab_recovery"), "the recovery token is dropped once used");
  assert.equal((await b.me())?.email, "eve@example.com");
  assert.equal((await new Browser().post("/auth/login", { email: "eve@example.com", password: "brand-new-password" })).status, 200);
});

test("an account from before the switch is linked by confirmed email and keeps its id", async () => {
  await store.insertUser({ id: "legacy-1", email: "old@example.com", password: "scrypt$1$x$y", createdAt: "2026-01-01T00:00:00.000Z" });
  await store.createSession("old-session-hash", "legacy-1", new Date(Date.now() + 60_000));
  const b = new Browser();
  await b.post("/auth/signup", { email: "old@example.com", password: "a-long-password" });
  await b.go(gotrue.mail.find((m) => m.to === "old@example.com")!.link);
  assert.equal((await b.me())?.email, "old@example.com");
  const row = await store.userById("legacy-1");
  assert.ok(row?.authId, "linked to the Supabase user");
  assert.equal(row?.password, undefined, "Supabase owns the password now");
  assert.equal(await store.sessionUser("old-session-hash"), null, "sessions from the old password are ended");
});

test("with email confirmation off in Supabase, an old account is not linked by email alone", async () => {
  gotrue.settings.autoconfirm = true;
  // Settings are cached for a few minutes; a fresh server reads them now.
  const root2 = mkdtempSync(join(tmpdir(), "sbauth2-"));
  const store2 = new FileStore(join(root2, "store.json"));
  const srv2 = await serveDashboard(5500 + Math.floor(Math.random() * 300), { root: root2, unref: true, store: store2, worker: false });
  try {
    await store2.insertUser({ id: "victim", email: "victim@example.com", password: "scrypt$1$x$y", createdAt: "2026-01-01T00:00:00.000Z" });
    const r = await fetch(`${srv2.url}/auth/signup`, { method: "POST", body: JSON.stringify({ email: "victim@example.com", password: "attacker-password" }) });
    assert.equal(r.status, 403);
    assert.equal((await store2.userById("victim"))?.authId, undefined);
  } finally {
    gotrue.settings.autoconfirm = false;
    await srv2.close(100);
    rmSync(root2, { recursive: true, force: true });
  }
});
