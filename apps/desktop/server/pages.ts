import { CSS, MARK, NAME, esc } from "../../../packages/brand/src/index.ts";

/**
 * The few HTML pages the desktop server renders itself: sign-in and its siblings, and a 404.
 * Everything else it serves is the dashboard (/app) and the API. The marketing site is a separate
 * static build (apps/web); nothing here links into it.
 */

function shell(o: { title: string; body: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(o.title)}</title>
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#ffffff">
<meta name="color-scheme" content="light">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/schibsted-grotesk.woff2" as="font" type="font/woff2" crossorigin>
<style>${CSS}</style>
</head>
<body>
<header class="top"><div class="wrap"><a class="brand" href="/app" aria-label="${NAME}">${MARK}<span>${NAME}</span></a></div></header>
<main id="main">${o.body}</main>
<script>document.documentElement.classList.add("js");</script>
</body>
</html>`;
}

export type AuthMode = "signup" | "login" | "forgot" | "reset";

const GOOGLE_ICON = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

/**
 * Sign-up, sign-in, forgot-password and set-new-password pages. The form posts JSON to
 * /auth/<mode>; the answer is either a place to go next or a message to show (e.g. "check your
 * email") in place of the form.
 */
export function authPage(
  mode: AuthMode,
  opts: { google: boolean; next: string; openrouter?: boolean; chatgpt?: boolean; url?: string; forgot?: boolean; provider?: "local" | "supabase"; notice?: string },
): string {
  const copy = {
    signup: { h1: "Start recording", lede: "Free. Record narrated walkthroughs of sites you own or may test.", button: "Create account", title: "Create an account" },
    login: { h1: "Sign in", lede: "Pick up where you left off.", button: "Sign in", title: "Sign in" },
    forgot: { h1: "Reset it by email", lede: "We'll email you a link to choose a new password.", button: "Send the link", title: "Reset your password" },
    reset: { h1: "Choose a new password", lede: "At least 8 characters.", button: "Save and sign in", title: "Choose a new password" },
  }[mode];
  const withEmail = mode !== "reset";
  const withPassword = mode !== "forgot";
  const showGoogle = mode === "signup" || mode === "login";
  const googleHint = opts.provider === "supabase" ? "Turn on the Google provider in your Supabase project (Authentication → Providers)." : "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server to enable.";
  const body = `
<section class="auth"><div class="wrap">
  <div class="auth-shell">
  <div class="auth-story">
    <p class="dh">Your site, walked and narrated.</p>
    <p>An MP4, captions and a transcript, from one link. The password stays in memory.</p>
    <p class="auth-files"><span>recording.mp4</span><span>recording.webm</span><span>captions.vtt</span><span>narration.wav</span></p>
  </div>
  <div class="auth-card">
    <h1>${copy.h1}</h1>
    <p class="sub">${copy.lede}</p>
    ${opts.url ? `<p class="note mono" style="word-break:break-all">Next: ${esc(opts.url)}</p>` : ""}
    ${opts.notice ? `<p class="note" role="status" style="color:var(--ink)">${esc(opts.notice)}</p>` : ""}
    ${
      showGoogle
        ? `<a class="pill ghost gbtn" ${opts.google ? `href="/auth/google?next=${encodeURIComponent(opts.next)}"` : `aria-disabled="true" title="${esc(googleHint)}"`}>${GOOGLE_ICON} Continue with Google</a>
    ${opts.google ? "" : `<p class="note gnote">Google sign-in isn't turned on for this server yet; use email below.</p>`}
     ${opts.openrouter ? `<a class="pill rbtn" href="/auth/openrouter?next=${encodeURIComponent(opts.next)}">Continue with OpenRouter (uses your credits)</a>` : ""}
     ${opts.chatgpt ? `<a class="pill cbtn" href="/auth/chatgpt?next=${encodeURIComponent(opts.next)}">Continue with ChatGPT (uses your plan)</a>` : ""}
    <div class="or">or with email</div>`
        : ""
    }
    <form id="auth" novalidate>
      ${mode === "signup" ? `<label>Name <input name="name" autocomplete="name" maxlength="80"></label>` : ""}
      ${withEmail ? `<label>Email <input name="email" type="email" autocomplete="email" required></label>` : ""}
      ${withPassword ? `<label>${mode === "reset" ? "New password" : "Password"} <input name="password" type="password" autocomplete="${mode === "login" ? "current-password" : "new-password"}" minlength="${mode === "login" ? 1 : 8}" required></label>` : ""}
      <button class="pill solid" type="submit">${copy.button}</button>
      <p class="err" role="alert" id="err"></p>
    </form>
    <p class="done" id="done" role="status" hidden></p>
    <p class="note">${
      mode === "signup"
        ? `Already have an account? <a href="/login?next=${encodeURIComponent(opts.next)}">Sign in</a>`
        : mode === "login"
          ? `New here? <a href="/signup?next=${encodeURIComponent(opts.next)}">Create an account</a>${opts.forgot ? ` · <a href="/forgot">Forgot your password?</a>` : ""}`
          : `<a href="/login">Back to sign in</a>`
    }</p>
  </div>
  </div>
</div></section>
<script>
document.getElementById("auth").addEventListener("submit",function(e){e.preventDefault();var f=e.target,err=document.getElementById("err"),done=document.getElementById("done"),b=f.querySelector("button");err.textContent="";b.disabled=true;
var body=Object.fromEntries(new FormData(f));body.next=${JSON.stringify(opts.next).replace(/</g, "\\u003c")};
fetch("/auth/${mode}",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||"Something went wrong.");
if(j.message){f.hidden=true;document.querySelectorAll(".gbtn,.or,.gnote").forEach(function(x){x.style.display="none"});done.textContent=j.message;done.hidden=false;return}location.href=j.next||${JSON.stringify(opts.next).replace(/</g, "\\u003c")}})}).catch(function(x){err.textContent=x.message;b.disabled=false})});
</script>`;
  return shell({ title: `${copy.title} · ${NAME}`, body });
}

export function notFoundPage(): string {
  const body = `
<section class="page-head"><div class="wrap">
  <h1>This page <span class="dim">isn't here.</span></h1>
  <p class="lede">The link may be old. Your recordings and runs are in the app.</p>
  <div class="actions"><a class="pill solid big" href="/app">Open the app</a></div>
</div></section>`;
  return shell({ title: `Page not found · ${NAME}`, body });
}
