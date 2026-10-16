import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { serveDashboard, type Running } from "../apps/desktop/server/server.ts";
import { GoTrueMock } from "./gotrue-mock.ts";

/**
 * The desktop app's optional account: Supabase sign-in, with Google done in the system browser
 * (which shares no cookies with the app window) and handed back to the app window by polling.
 */
const gotrue = new GoTrueMock();
const opened: string[] = [];
let srv: Running;
let root: string;

before(async () => {
  await gotrue.start();
  process.env.SUPABASE_URL = gotrue.url;
  process.env.SUPABASE_ANON_KEY = gotrue.anonKey;
  root = mkdtempSync(join(tmpdir(), "lab-desktop-auth-"));
  srv = await serveDashboard(5600 + Math.floor(Math.random() * 300), {
    root,
    unref: true,
    worker: false,
    requireAuth: false,
    desktop: true,
    openExternal: (url) => opened.push(url),
  });
});

after(async () => {
  await srv.close(100);
  gotrue.stop();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  rmSync(root, { recursive: true, force: true });
});

const poll = (state: string, cookie = "") =>
  fetch(`${srv.url}/auth/desktop/poll/${state}`, { method: "POST", headers: cookie ? { cookie } : {} });

test("Google sign-in goes through the system browser and lands in the app window", async () => {
  // The app window asks for Google: the server opens the system browser and shows a waiting page.
  const start = await fetch(`${srv.url}/auth/google?next=${encodeURIComponent("/app#library")}`);
  assert.equal(start.status, 200);
  assert.match(await start.text(), /Continue in your browser/);
  const authorize = new URL(opened.at(-1)!);
  assert.equal(authorize.origin + authorize.pathname, `${gotrue.url}/auth/v1/authorize`);
  const redirectTo = new URL(authorize.searchParams.get("redirect_to")!);
  const state = /^\/auth\/desktop\/callback\/([\w-]+)$/.exec(redirectTo.pathname)?.[1];
  assert.ok(state, `redirect_to carries the flow's state: ${redirectTo}`);
  assert.equal(redirectTo.origin, srv.url);

  // Nothing yet.
  assert.equal((await poll(state)).status, 202);

  // The system browser: Google consents, Supabase redirects back to the local server, no cookies.
  const back = await fetch(authorize, { redirect: "manual", headers: { apikey: gotrue.anonKey } });
  const landing = await fetch(back.headers.get("location")!, { redirect: "manual" });
  assert.equal(landing.status, 200);
  assert.match(await landing.text(), /You.re signed in/);
  assert.equal(landing.headers.get("set-cookie"), null, "the browser tab gets no session");

  // The app window's next poll takes the session.
  const claimed = await poll(state);
  assert.equal(claimed.status, 200);
  assert.deepEqual(await claimed.json(), { next: "/app#library" });
  const cookie = claimed.headers.get("set-cookie")!.split(";")[0]!;
  const me = (await (await fetch(`${srv.url}/api/me`, { headers: { cookie } })).json()) as { user: { email: string } };
  assert.equal(me.user.email, "gina@example.com");

  // Single use.
  assert.equal((await poll(state)).status, 404);
});

test("an unknown or made-up state gets nothing", async () => {
  assert.equal((await poll("x".repeat(32))).status, 404);
  const landing = await fetch(`${srv.url}/auth/desktop/callback/${"y".repeat(32)}?code=abc`);
  assert.equal(landing.status, 400);
  assert.match(await landing.text(), /expired/);
});

test("email and password work in the app window; recording is not gated on an account", async () => {
  gotrue.settings.autoconfirm = true;
  const signup = await fetch(`${srv.url}/auth/signup`, { method: "POST", body: JSON.stringify({ email: "dee@example.com", password: "a-good-password" }) });
  assert.equal(signup.status, 201);
  const login = await fetch(`${srv.url}/auth/login`, { method: "POST", body: JSON.stringify({ email: "dee@example.com", password: "a-good-password" }) });
  assert.equal(login.status, 200);
  // Signed out, a recording request still gets as far as input validation.
  assert.equal((await fetch(`${srv.url}/api/record`, { method: "POST", body: JSON.stringify({ url: "https://site.example" }) })).status, 400);
});

test("desktop pages: no password-reset link, and email links explain themselves in the browser", async () => {
  const login = await (await fetch(`${srv.url}/login`)).text();
  assert.doesNotMatch(login, /href="\/forgot"/, "a reset link would open in the system browser and strand the reset there");
  assert.match(login, /<a href="\/app">Use Walkcast without an account<\/a>/, "the account is optional, and the page says so");
  assert.doesNotMatch(login, /auth\/openrouter/, "OpenRouter sign-in only exists in the local auth mode");
  // A confirmation link opened in the system browser (no flow cookie) says to go back to the app.
  const confirm = await fetch(`${srv.url}/auth/callback?code=whatever`, { redirect: "manual" });
  assert.equal(confirm.status, 400);
  assert.match(await confirm.text(), /Walkcast app/);
});
