import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { Auth, AuthError, safeNext } from "../src/site/auth.ts";
import { FileStore } from "../src/store/index.ts";
import { authPage, landingPage, llmsTxt, robotsTxt, sitemapXml } from "../src/site/pages.ts";
import { serveDashboard } from "../src/ui/server.ts";

const dir = mkdtempSync(join(tmpdir(), "lab-site-"));
after(() => rmSync(dir, { recursive: true, force: true }));

function fakeRes() {
  const headers: Record<string, unknown> = {};
  let status = 0;
  const res = {
    setHeader: (k: string, v: unknown) => (headers[k.toLowerCase()] = v),
    writeHead: (s: number, h: Record<string, unknown>) => {
      status = s;
      for (const [k, v] of Object.entries(h)) headers[k.toLowerCase()] = v;
    },
    end: () => undefined,
  } as unknown as ServerResponse;
  return { res, headers, status: () => status };
}

test("email accounts: hashed passwords, generic errors, working sessions", async () => {
  const auth = new Auth(new FileStore(join(dir, "users.json")), "https://lab.example", null);
  const user = await auth.signUp("  Ana@Example.COM ", "correct-horse-battery", "Ana");
  assert.equal(user.email, "ana@example.com");
  await assert.rejects(auth.signUp("ana@example.com", "another-password"), (e: AuthError) => e.status === 409);
  await assert.rejects(auth.signUp("not-an-email", "long-enough-pw"), /valid email/);
  await assert.rejects(auth.signUp("b@example.com", "short"), /at least 8/);
  await assert.rejects(auth.signIn("ana@example.com", "wrong", "1.1.1.1"), /incorrect/);
  await assert.rejects(auth.signIn("nobody@example.com", "wrong", "1.1.1.1"), /incorrect/);
  assert.equal((await auth.signIn("ANA@example.com", "correct-horse-battery", "1.1.1.1")).id, user.id);
  const stored = readFileSync(join(dir, "users.json"), "utf8");
  assert.ok(!stored.includes("correct-horse-battery"));
  assert.match(stored, /scrypt\$/);

  const { res, headers } = fakeRes();
  await auth.startSession(res, user);
  const cookie = (headers["set-cookie"] as string[])[0]!;
  assert.match(cookie, /HttpOnly; SameSite=Lax/);
  assert.match(cookie, /Secure/);
  const token = cookie.split(";")[0]!.split("=")[1]!;
  assert.ok(!readFileSync(join(dir, "users.json"), "utf8").includes(token), "only the token's hash is stored");
  const req = { headers: { cookie: `other=1; lab_session=${token}` } } as never;
  assert.equal((await auth.user(req))?.id, user.id);
  await auth.endSession(req, fakeRes().res);
  assert.equal(await auth.user(req), null);
});

test("sign-in attempts are throttled per address", async () => {
  const auth = new Auth(new FileStore(join(dir, "throttle.json")), "http://localhost", null);
  for (let i = 0; i < 10; i++) await assert.rejects(auth.signIn("x@example.com", "nope", "9.9.9.9"), /incorrect/);
  await assert.rejects(auth.signIn("x@example.com", "nope", "9.9.9.9"), (e: AuthError) => e.status === 429);
});

test("Google sign-in: redirect carries state, accounts link by verified email", async () => {
  const auth = new Auth(new FileStore(join(dir, "google.json")), "https://lab.example", { clientId: "cid", clientSecret: "secret" });
  const { res, headers, status } = fakeRes();
  auth.googleRedirect(res, "/app#record");
  assert.equal(status(), 302);
  const location = new URL(String(headers.location));
  assert.equal(location.host, "accounts.google.com");
  assert.equal(location.searchParams.get("redirect_uri"), "https://lab.example/auth/google/callback");
  assert.equal(location.searchParams.get("scope"), "openid email profile");
  assert.ok(String(headers["set-cookie"]).includes(`lab_oauth_state=${location.searchParams.get("state")}.`));

  const email = await auth.signUp("sam@example.com", "password-123");
  const linked = await auth.upsertGoogle("google-sub-1", "Sam@Example.com", "Sam");
  assert.equal(linked.id, email.id);
  assert.equal((await auth.upsertGoogle("google-sub-1", "sam@example.com")).id, email.id);
});

test("post-sign-in redirects stay on this site", () => {
  assert.equal(safeNext("/app#record"), "/app#record");
  for (const bad of ["//evil.example", "https://evil.example", "/\\evil.example", "", null]) assert.equal(safeNext(bad), "/app#record");
});

test("crawlers: the landing page carries full content and structured data", () => {
  const html = landingPage("https://lab.example", null);
  assert.equal((html.match(/<h1/g) ?? []).length, 1);
  assert.match(html, /<link rel="canonical" href="https:\/\/lab.example\/">/);
  assert.match(html, /narrated video walkthrough/i);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)![1]!);
  assert.deepEqual(
    ld["@graph"].map((n: { "@type": string }) => n["@type"]),
    ["WebSite", "SoftwareApplication", "VideoObject", "HowTo", "FAQPage"],
  );
  const faq = ld["@graph"][4].mainEntity as { name: string }[];
  for (const q of faq) assert.ok(html.includes(q.name.replace(/"/g, "&quot;")), `FAQ answer visible on the page: ${q.name}`);

  const robots = robotsTxt("https://lab.example");
  for (const bot of ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "Googlebot", "Bingbot"]) assert.match(robots, new RegExp(`User-agent: ${bot}\\nAllow: /`));
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Sitemap: https:\/\/lab.example\/sitemap.xml/);
  assert.match(sitemapXml("https://lab.example"), /<video:content_loc>https:\/\/lab.example\/assets\/demo.mp4<\/video:content_loc>/);
  assert.match(llmsTxt("https://lab.example"), /^# Walkcast\n\n> /);
});

test("server: public pages, protected actions, sign-up then record", async () => {
  const root = mkdtempSync(join(tmpdir(), "lab-srv-"));
  const port = 4600 + Math.floor(Math.random() * 300);
  const srv = await serveDashboard(port, { root, unref: true, worker: false });
  const base = srv.url;
  try {
    for (const path of ["/", "/robots.txt", "/sitemap.xml", "/llms.txt", "/signup", "/app", "/assets/og.png"]) {
      assert.equal((await fetch(base + path)).status, 200, path);
    }
    assert.equal((await fetch(`${base}/api/record`, { method: "POST", body: "{}" })).status, 401);
    const crossSite = await fetch(`${base}/auth/login`, { method: "POST", headers: { Origin: "https://evil.example" }, body: "{}" });
    assert.equal(crossSite.status, 403);
    const start = await fetch(`${base}/start?url=https%3A%2F%2Fsite.example`, { redirect: "manual" });
    assert.equal(start.headers.get("location"), "/signup?url=https%3A%2F%2Fsite.example");

    const signup = await fetch(`${base}/auth/signup`, { method: "POST", body: JSON.stringify({ email: "kim@example.com", password: "a-good-password" }) });
    assert.equal(signup.status, 201);
    const cookie = signup.headers.get("set-cookie")!.split(";")[0]!;
    const me = (await (await fetch(`${base}/api/me`, { headers: { cookie } })).json()) as { user: { email: string } };
    assert.equal(me.user.email, "kim@example.com");
    // Signed in, the record endpoint now validates input instead of refusing.
    const rec = await fetch(`${base}/api/record`, { method: "POST", headers: { cookie }, body: JSON.stringify({ url: "https://site.example" }) });
    assert.equal(rec.status, 400);
    assert.match(((await rec.json()) as { error: string }).error, /authorized/);
  } finally {
    await srv.close(100);
    rmSync(root, { recursive: true, force: true });
  }
});

test("SSRF guard: private, loopback, link-local and IPv4-mapped addresses are blocked", async () => {
  const { blockedHost, isPrivateAddress } = await import("../src/record/ssrf.ts");
  for (const a of ["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.20.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "[::ffff:169.254.169.254]"]) {
    assert.equal(isPrivateAddress(a), true, a);
  }
  for (const a of ["93.184.215.14", "1.1.1.1", "2606:4700:4700::1111"]) assert.equal(isPrivateAddress(a), false, a);
  assert.match(String(await blockedHost("localhost")), /private or local/);
  assert.match(String(await blockedHost("[::ffff:127.0.0.1]")), /private or local/);
  assert.equal(await blockedHost("93.184.215.14"), null);
});

test("review regressions: escaped redirect target, strict next, Google takeover, JSON bodies", async () => {
  // Script-context XSS through ?next=
  const page = authPage("https://lab.example", "login", { google: false, next: safeNext("/</script><script>alert(1)</script>") });
  assert.ok(!page.includes("</script><script>alert(1)"));
  // Tabs/newlines/backslashes can't smuggle a second slash in.
  for (const bad of ["/\t/evil.example", "/\n", "/\r\n/evil.example", "/\\evil.example", "//evil.example"]) assert.equal(safeNext(bad), "/app#record", JSON.stringify(bad));
  assert.equal(safeNext("/app#record?url=https%3A%2F%2Fx.example"), "/app#record?url=https%3A%2F%2Fx.example");

  // Someone pre-registers the victim's email; the verified Google owner takes the account back.
  const auth = new Auth(new FileStore(join(dir, "takeover.json")), "https://lab.example", { clientId: "c", clientSecret: "s" });
  const squatter = await auth.signUp("victim@example.com", "attacker-password");
  const { res, headers } = fakeRes();
  await auth.startSession(res, squatter);
  const token = (headers["set-cookie"] as string[])[0]!.split(";")[0]!.split("=")[1]!;
  const req = { headers: { cookie: `lab_session=${token}` } } as never;
  await auth.upsertGoogle("google-victim", "victim@example.com");
  assert.equal(await auth.user(req), null, "the squatter's session is gone");
  await assert.rejects(auth.signIn("victim@example.com", "attacker-password", "2.2.2.2"), /incorrect/);

  const { parseBody } = await import("../src/capture/recorder.ts");
  assert.deepEqual(parseBody('{"email":"a@b.c","password":"Tr0ub&dor3","n":1}', "application/json"), { email: "a@b.c", password: "Tr0ub&dor3", n: "1" });
  assert.deepEqual(parseBody("a=1&b=two", "application/x-www-form-urlencoded"), { a: "1", b: "two" });
});

test("server: dashboard data needs an account; recordings are only shown to their owner", async () => {
  const root = mkdtempSync(join(tmpdir(), "lab-own-"));
  const port = 4900 + Math.floor(Math.random() * 90);
  const { mkdirSync, writeFileSync } = await import("node:fs");
  for (const [name, owner] of [["a-1", "OWNER_A"], ["b-1", "OWNER_B"]] as const) {
    mkdirSync(join(root, "recordings", name), { recursive: true });
    writeFileSync(join(root, "recordings", name, "recording.json"), JSON.stringify({ id: name, owner, url: `https://${name}.example/`, createdAt: new Date().toISOString(), durationMs: 1, signIn: {}, pages: [], skipped: [], captions: [], media: { captions: "captions.vtt" } }));
    writeFileSync(join(root, "recordings", name, "captions.vtt"), "WEBVTT\n");
  }
  const srv = await serveDashboard(port, { root, unref: true, worker: false });
  const base = srv.url;
  try {
    assert.equal((await fetch(`${base}/api/index`)).status, 401);
    assert.equal((await fetch(`${base}/files/recordings/a-1/captions.vtt`)).status, 401);
    const signup = await fetch(`${base}/auth/signup`, { method: "POST", body: JSON.stringify({ email: "o@example.com", password: "a-good-password" }) });
    const cookie = signup.headers.get("set-cookie")!.split(";")[0]!;
    const index = (await (await fetch(`${base}/api/index`, { headers: { cookie } })).json()) as { recordings: unknown[] };
    assert.equal(index.recordings.length, 0, "other accounts' recordings are hidden");
    assert.equal((await fetch(`${base}/files/recordings/a-1/captions.vtt`, { headers: { cookie } })).status, 404);
    assert.equal((await fetch(`${base}/files/%E0`, { headers: { cookie } })).status, 400);
    const bad = await fetch(`${base}/api/record`, { method: "POST", headers: { cookie }, body: JSON.stringify({ url: "not a url", authorized: true }) });
    assert.equal(bad.status, 400);
    const agent = await fetch(`${base}/api/run`, { method: "POST", headers: { cookie }, body: JSON.stringify({ agent: "nope" }) });
    assert.equal(agent.status, 400);
  } finally {
    await srv.close(100);
    rmSync(root, { recursive: true, force: true });
  }
});

test("guides: unique titles and descriptions, valid structured data, all in the sitemap", async () => {
  const { GUIDES } = await import("../src/site/guides.ts");
  const { guidePage, guidesIndexPage } = await import("../src/site/pages.ts");
  assert.ok(GUIDES.length >= 6);
  for (const key of ["slug", "title", "h1", "description"] as const) {
    assert.equal(new Set(GUIDES.map((g) => g[key])).size, GUIDES.length, `${key} must be unique`);
  }
  const sitemap = sitemapXml("https://lab.example");
  for (const g of GUIDES) {
    assert.ok(g.title.length <= 70, `title short enough for search results: ${g.title}`);
    assert.ok(g.description.length >= 110 && g.description.length <= 200, `description length: ${g.slug}`);
    assert.ok(sitemap.includes(`<loc>https://lab.example/guides/${g.slug}</loc>`));
    const html = guidePage("https://lab.example", g, null);
    assert.equal((html.match(/<h1/g) ?? []).length, 1);
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)![1]!);
    assert.deepEqual(ld["@graph"].map((n: { "@type": string }) => n["@type"]), ["Article", "HowTo", "FAQPage", "BreadcrumbList"]);
    // Every other guide is linked from this one.
    for (const o of GUIDES) if (o.slug !== g.slug) assert.ok(html.includes(`href="/guides/${o.slug}"`));
  }
  assert.ok(guidesIndexPage("https://lab.example", null).includes("CollectionPage"));
  assert.ok(landingPage("https://lab.example", null).includes(`href="/guides/${GUIDES[0]!.slug}"`));
});
