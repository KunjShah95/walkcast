import { type Auth, AuthError, publicUser, safeNext } from "../auth.ts";
import { clientIp, readJson } from "../http.ts";
import { openExternal } from "../open-external.ts";
import { authPage, continueInBrowserPage, messagePage } from "../pages.ts";
import type { SupabaseAuth } from "../supabase-auth.ts";
import type { Ctx, Route } from "./router.ts";

/** The `when` of a route checked the provider; these give the handler the type it narrowed to. */
const supabase = (ctx: Ctx) => ctx.deps.auth as SupabaseAuth;
const local = (ctx: Ctx) => ctx.deps.auth as Auth;
const isSupabase = (ctx: Ctx) => ctx.deps.auth.kind === "supabase";
const isLocal = (ctx: Ctx) => ctx.deps.auth.kind === "local";
const desktopSupabase = (ctx: Ctx) => Boolean(ctx.deps.o.desktop) && ctx.deps.auth.kind === "supabase";

/** One of the local provider's OAuth returns (Google, OpenRouter, ChatGPT): start the session, or say why not in plain text. */
function oauthCallback(finish: (auth: Auth, ctx: Ctx) => Promise<{ user: Parameters<Auth["startSession"]>[1]; next: string }>): Route["handler"] {
  return async (ctx) => {
    const { res, send, redirect } = ctx;
    const auth = local(ctx);
    try {
      const { user: signedIn, next } = await finish(auth, ctx);
      await auth.startSession(res, signedIn);
      return redirect(safeNext(next));
    } catch (e) {
      if (res.headersSent) return void res.end();
      return send(e instanceof AuthError ? e.status : 500, "text/plain; charset=utf-8", e instanceof Error ? e.message : String(e));
    }
  };
}

/** Sign-in pages and the account endpoints: all public, all ahead of the sign-in gate. */
export const accountRoutes: Route[] = [
  {
    method: "*",
    path: ["/signup", "/login", "/forgot", "/reset"],
    auth: "public",
    handler: async ({ url, user, send, redirect, deps: { auth, authOptions, o, requireAuth } }) => {
      const mode = url.pathname.slice(1) as "signup" | "login" | "forgot" | "reset";
      if ((mode === "forgot" || mode === "reset") && auth.kind !== "supabase") return send(404, "text/plain; charset=utf-8", "Password reset needs Supabase Auth on this server.");
      const target = url.searchParams.get("url");
      const next = safeNext(url.searchParams.get("next") ?? (target ? `/app#record?url=${encodeURIComponent(target)}` : null));
      if (user && mode !== "reset") return redirect(next);
      const opts = await authOptions();
      const notice = url.searchParams.get("notice") ?? undefined;
      return send(
        200,
        "text/html; charset=utf-8",
        authPage(mode, { skip: Boolean(o.desktop) && !requireAuth, google: opts.google, openrouter: opts.openrouter, chatgpt: opts.chatgpt, forgot: opts.forgot, provider: auth.kind, next, ...(target ? { url: target } : {}), ...(notice ? { notice: notice.slice(0, 300) } : {}) }),
      );
    },
  },

  // ---------------------------------------------------------------- accounts
  {
    method: "POST",
    path: "/auth/signup",
    auth: "public",
    handler: async ({ req, res, json, deps: { auth } }) => {
      const b = await readJson(req);
      const next = safeNext(typeof b.next === "string" ? b.next : null);
      const name = typeof b.name === "string" ? b.name : undefined;
      if (auth.kind === "supabase") {
        const r = await auth.signUp(res, String(b.email ?? ""), String(b.password ?? ""), name, clientIp(req), next);
        // The confirmation link necessarily opens in the mail client's browser, which does not share this
        // app's cookies, so telling the user to open it "in this browser" sent them to a dead-end
        // 400 page. The address is confirmed by opening it anywhere; they then sign in here.
        if ("confirmEmail" in r) return json(200, { message: "Check your email: we sent you a link to confirm your address. Open the link in your normal browser, then sign in here with your email and password." });
        await auth.startSession(res, r.user);
        return json(201, { user: publicUser(r.user), next });
      }
      const created = await auth.signUp(String(b.email ?? ""), String(b.password ?? ""), name, clientIp(req));
      await auth.startSession(res, created);
      return json(201, { user: publicUser(created), next });
    },
  },
  {
    method: "POST",
    path: "/auth/login",
    auth: "public",
    handler: async ({ req, res, json, deps: { auth } }) => {
      const b = await readJson(req);
      const found = await auth.signIn(String(b.email ?? ""), String(b.password ?? ""), clientIp(req));
      await auth.startSession(res, found);
      return json(200, { user: publicUser(found), next: safeNext(typeof b.next === "string" ? b.next : null) });
    },
  },
  {
    method: "POST",
    path: "/auth/forgot",
    auth: "public",
    when: isSupabase,
    handler: async (ctx) => {
      const { req, res, json } = ctx;
      const auth = supabase(ctx);
      const b = await readJson(req);
      await auth.forgot(res, String(b.email ?? ""), clientIp(req));
      return json(200, { message: "If an account exists for that address, we've emailed a link to reset the password. Open it in this browser." });
    },
  },
  {
    method: "POST",
    path: "/auth/reset",
    auth: "public",
    when: isSupabase,
    handler: async (ctx) => {
      const { req, res, json } = ctx;
      const auth = supabase(ctx);
      const b = await readJson(req);
      const updated = await auth.resetPassword(req, res, String(b.password ?? ""));
      await auth.startSession(res, updated);
      return json(200, { user: publicUser(updated), next: "/app#record" });
    },
  },
  {
    method: "POST",
    path: "/auth/logout",
    auth: "public",
    handler: async ({ req, res, redirect, deps: { auth } }) => {
      // POST only. As a GET this was a cross-site request forgery: any page could sign the user
      // out with an <img src=".../auth/logout">, and SameSite=Lax does not help because a
      // top-level navigation is exactly the case that still sends the cookie.
      await auth.endSession(req, res);
      return redirect("/");
    },
  },
  {
    method: "*",
    path: "/auth/google",
    auth: "public",
    handler: async ({ res, url, send, deps: { auth, o } }) => {
      if (auth.kind === "supabase" && !(await auth.options()).google) throw new AuthError(503, "Google sign-in isn't turned on in this Supabase project.");
      if (o.desktop && auth.kind === "supabase") {
        const flow = auth.desktopGoogleStart(url.searchParams.get("next") ?? "/app#record");
        (o.openExternal ?? openExternal)(flow.url);
        if (flow.mode === "link") {
          // Nothing is listening on this tab: the browser is about to be handed to the OS, which
          // opens Walkcast with the code. Tell the user what to expect instead of showing the
          // loopback "waiting" page, which would never finish.
          return send(200, "text/html; charset=utf-8", messagePage("Check Walkcast", "Sign-in continues in the Walkcast window. You can close this tab.", { ok: true }));
        }
        return send(200, "text/html; charset=utf-8", continueInBrowserPage(flow.state, flow.url));
      }
      return auth.googleRedirect(res, url.searchParams.get("next") ?? "/app#record");
    },
  },
  {
    method: "*",
    path: "/auth/openrouter",
    auth: "public",
    handler: ({ res, url, deps: { auth } }) => {
      if (auth.kind !== "local") throw new AuthError(503, "OpenRouter sign-in requires the local auth mode (not Supabase).");
      return auth.openrouterRedirect(res, url.searchParams.get("next") ?? "/app#record");
    },
  },
  {
    method: "*",
    path: "/auth/chatgpt",
    auth: "public",
    handler: ({ res, url, deps: { auth } }) => {
      if (auth.kind !== "local") throw new AuthError(503, "ChatGPT sign-in requires the local auth mode (not Supabase).");
      return auth.chatgptRedirect(res, url.searchParams.get("next") ?? "/app#record");
    },
  },
  // Supabase Auth sends the browser back here after Google, an email confirmation or a reset link.
  // ---------------------------------------------------------------- desktop sign-in via the system browser
  {
    method: "*",
    path: /^\/auth\/desktop\/callback\/([\w-]{20,64})$/,
    auth: "public",
    when: desktopSupabase,
    handler: async (ctx) => {
      const { url, send, params } = ctx;
      const auth = supabase(ctx);
      try {
        await auth.desktopCallback(params[1]!, url);
        return send(200, "text/html; charset=utf-8", messagePage("You're signed in", "Go back to Walkcast: it has carried on without you. You can close this tab.", { ok: true }));
      } catch (e) {
        if (!(e instanceof AuthError)) throw e;
        return send(400, "text/html; charset=utf-8", messagePage("Sign-in didn't finish", `${e.message} Go back to Walkcast to try again.`, { ok: false }));
      }
    },
  },
  {
    method: "POST",
    path: /^\/auth\/desktop\/poll\/([\w-]{20,64})$/,
    auth: "public",
    when: desktopSupabase,
    handler: async (ctx) => {
      const { res, json, params } = ctx;
      const auth = supabase(ctx);
      const claim = auth.desktopClaim(params[1]!);
      if (!claim) return json(404, { error: "This sign-in has expired. Start again." });
      if ("pending" in claim) return json(202, { pending: true });
      if ("error" in claim) return json(400, { error: claim.error });
      await auth.startSession(res, claim.user);
      return json(200, { next: safeNext(claim.next) });
    },
  },
  // The walkcast:// return, delivered by the OS to the app window. Same-origin, so the session
  // cookie this sets is one the app already sends.
  {
    method: "POST",
    path: "/auth/desktop/exchange",
    auth: "public",
    when: desktopSupabase,
    handler: async (ctx) => {
      const { req, res, json } = ctx;
      const auth = supabase(ctx);
      const b = await readJson(req);
      const state = String(b.state ?? "");
      const code = String(b.code ?? "");
      if (!/^[\w-]{20,64}$/.test(state) || !code) return json(400, { error: "That sign-in link is incomplete." });
      try {
        const r = await auth.desktopDeepLinkCallback(state, code);
        await auth.startSession(res, r.user);
        return json(200, { next: safeNext(r.next) });
      } catch (e) {
        if (!(e instanceof AuthError)) throw e;
        return json(400, { error: e.message });
      }
    },
  },
  {
    method: "*",
    path: "/auth/callback",
    auth: "public",
    when: isSupabase,
    handler: async (ctx) => {
      const { req, res, url, send, redirect, deps: { o } } = ctx;
      const auth = supabase(ctx);
      try {
        const r = await auth.callback(req, res, url);
        if ("recovery" in r) return redirect("/reset");
        await auth.startSession(res, r.user);
        return redirect(safeNext(r.next));
      } catch (e) {
        if (!(e instanceof AuthError)) throw e;
        // Desktop: email links open in the system browser, not the app; say what to do next there.
        if (o.desktop) return send(400, "text/html; charset=utf-8", messagePage("Back to Walkcast", `${e.message} Do that in the Walkcast app.`, { ok: true }));
        return redirect(`/login?notice=${encodeURIComponent(e.message)}`);
      }
    },
  },
  { method: "*", path: "/auth/google/callback", auth: "public", when: isLocal, handler: oauthCallback((auth, { req, url }) => auth.googleCallback(req, url)) },
  { method: "*", path: "/auth/openrouter/callback", auth: "public", when: isLocal, handler: oauthCallback((auth, { req, url }) => auth.openrouterCallback(req, url)) },
  { method: "*", path: "/auth/chatgpt/callback", auth: "public", when: isLocal, handler: oauthCallback((auth, { req, url }) => auth.chatgptCallback(req, url)) },
  {
    method: "*",
    path: "/api/me",
    auth: "public",
    handler: async ({ user, json, deps: { auth, authOptions, requireAuth } }) =>
      json(200, { user: publicUser(user), google: (await authOptions()).google, openrouter: (await authOptions()).openrouter, chatgpt: (await authOptions()).chatgpt, provider: auth.kind, authRequired: requireAuth }),
  },
];
