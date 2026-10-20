import { CSS, MARK, NAME, esc } from "../../../packages/brand/src/index.ts";

/**
 * The few HTML pages the desktop server renders itself: sign-in and its siblings, and a 404.
 * Everything else it serves is the dashboard (/app) and the API. The marketing site is a separate
 * static build (apps/web); nothing here links into it.
 */

function shell(o: { title: string; body: string; css?: string }): string {
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
<style>${CSS}${o.css ?? ""}</style>
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
  opts: { google: boolean; next: string; openrouter?: boolean; chatgpt?: boolean; url?: string; forgot?: boolean; provider?: "local" | "supabase"; notice?: string; skip?: boolean },
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
    ${opts.skip && (mode === "signup" || mode === "login") ? `<p class="note"><a href="/app">Use Walkcast without an account</a></p>` : ""}
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

/** "the shop" reads as a sentence, not as a fragment of the narration. */
function sentenceCase(text: string): string {
  return text ? text[0]!.toUpperCase() + text.slice(1) : text;
}

/**
 * A shared walkthrough, for someone who was sent the link.
 *
 * The point of the link is that it needs nothing from the person who opens it: no account, no
 * sign-in, no app. The video plays, the captions are there, the transcript is readable, and
 * the chapters seek the video. The brand is one line at the bottom, because this page is
 * somebody else's property being shown, not the app's.
 */
export function sharePage(o: {
  title: string;
  host: string;
  recorded: string;
  pages: number;
  durationMs: number;
  sources: { url: string; type: string }[];
  captions: string | null;
  /** A picture of the first page, shown before the video is played. */
  poster?: string | null;
  /** A picture of each page, so the page says what the walkthrough contains. */
  pictures?: { url: string; title: string }[];
  chapters: { start: number; title: string }[];
  transcript: { start: number; text: string }[];
  expiresAt: string;
  note?: string;
}): string {
  const clock = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const body = `
<section class="share-head"><div class="wrap">
  <p class="dh">Walkthrough</p>
  <h1>${esc(o.title)}</h1>
  <p class="lede">${esc(o.host)} · ${o.pages} page${o.pages === 1 ? "" : "s"} · ${clock(o.durationMs / 1000)} · recorded ${esc(o.recorded)}</p>
</div></section>
<section class="share"><div class="wrap narrow">
  <div class="frame"><div class="win">
    <video id="v" controls playsinline preload="metadata" class="share-video"${o.poster ? ` poster="${esc(o.poster)}"` : ""}>
      ${o.sources.map((s) => `<source src="${esc(s.url)}" type="${esc(s.type)}">`).join("")}
      ${o.captions ? `<track kind="captions" src="${esc(o.captions)}" srclang="en" label="Narration" default>` : ""}
    </video>
  </div></div>
  ${o.pictures && o.pictures.length > 1 ? `<ul class="share-pages">${o.pictures.map((p) => `<li><img src="${esc(p.url)}" alt="${esc(p.title)}" loading="lazy"></li>`).join("")}</ul>` : ""}
  ${o.note ? `<p class="note">${esc(o.note)}</p>` : ""}
  <div class="share-grid">
    <section>
      <h2>Chapters</h2>
      ${o.chapters.length ? `<ol class="share-list">${o.chapters.map((c) => `<li><button type="button" data-start="${c.start}"><span class="mono">${clock(c.start)}</span> ${esc(sentenceCase(c.title))}</button></li>`).join("")}</ol>` : `<p class="dim">No chapters.</p>`}
    </section>
    <section>
      <h2>Transcript</h2>
      ${o.transcript.length ? `<ol class="share-list">${o.transcript.map((t) => `<li><button type="button" data-start="${t.start}"><span class="mono">${clock(t.start)}</span> ${esc(t.text)}</button></li>`).join("")}</ol>` : `<p class="dim">This walkthrough has no narration.</p>`}
    </section>
  </div>
  <p class="fineprint">This link stops working on <b>${esc(o.expiresAt)}</b>. Recorded with ${NAME}.</p>
</div></section>
<script>
(function(){var v=document.getElementById("v");document.querySelectorAll("[data-start]").forEach(function(b){b.addEventListener("click",function(){if(!v)return;v.currentTime=parseFloat(b.getAttribute("data-start"))||0;v.play()})})})();
</script>`;
  const css = `
.share-head{padding:clamp(40px,7vw,84px) 0 8px;text-align:center}
.share-head .dh{color:var(--signal);font-weight:700;font-size:clamp(13px,1.4vw,15px);letter-spacing:.14em;text-transform:uppercase;margin:0}
.share-head h1{font-size:clamp(28px,4.4vw,46px);letter-spacing:-.03em;margin:10px 0 0}
.share-head .lede{margin-inline:auto}
.share .frame{margin-top:clamp(20px,3vw,34px)}
.share-video{display:block;width:100%;background:#000;aspect-ratio:16/10}
.share-pages{list-style:none;margin:18px 0 0;padding:0;display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}
.share-pages img{width:100%;aspect-ratio:16/10;object-fit:cover;object-position:top;border-radius:var(--r-sm);box-shadow:inset 0 0 0 1px var(--line);background:var(--panel-2)}
.share-grid{display:grid;gap:clamp(20px,3vw,34px);margin-top:34px;grid-template-columns:1fr}
@media (min-width:860px){.share-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
.share-grid h2{font-size:15px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);font-weight:700;margin:0 0 10px}
.share-list{list-style:none;margin:0;padding:0;display:grid;gap:2px;max-height:420px;overflow:auto}
.share-list button{display:flex;gap:10px;width:100%;text-align:left;border:0;background:transparent;font:14.5px/1.45 var(--sans);color:var(--ink-2);padding:7px 9px;border-radius:var(--r-sm);cursor:pointer}
.share-list button:hover{background:var(--panel-2);color:var(--ink)}
.share-list .mono{color:var(--dim);font-size:12.5px;flex:none;padding-top:1px}
.share .note{margin:16px 0 0;font-size:14px;color:var(--muted)}
`;
  return shell({ title: `${o.title} · ${NAME}`, body, css });
}

/** A short message in the brand shell: what the system-browser tab shows after a desktop sign-in. */
export function messagePage(title: string, text: string, opts: { ok: boolean }): string {
  const body = `
<section class="page-head"><div class="wrap">
  <h1>${esc(title)}</h1>
  <p class="lede">${esc(text)}</p>
  ${opts.ok ? "" : `<div class="actions"><a class="pill ghost big" href="/login">Back to sign in</a></div>`}
</div></section>`;
  return shell({ title: `${title} · ${NAME}`, body });
}

/**
 * Shown in the app window while Google sign-in happens in the system browser. It polls the
 * desktop flow by its state and, once the browser has come back, takes the session and moves on.
 */
export function continueInBrowserPage(state: string, authorizeUrl: string): string {
  const body = `
<section class="auth"><div class="wrap">
  <div class="auth-card" style="max-width:440px;margin:0 auto">
    <h1>Continue in your browser</h1>
    <p class="sub">We opened Google sign-in in your web browser. Finish there and this window carries on by itself.</p>
    <p class="note" id="status" role="status">Waiting for the browser…</p>
    <p class="note">Didn't open? <a href="${esc(authorizeUrl)}" target="_blank" rel="noopener">Open the sign-in page</a> · <a href="/login">Cancel</a></p>
  </div>
</div></section>
<script>
(function(){var s=document.getElementById("status"),state=${JSON.stringify(state).replace(/</g, "\u003c")};
function poll(){fetch("/auth/desktop/poll/"+encodeURIComponent(state),{method:"POST"}).then(function(r){return r.json().then(function(j){
if(r.status===202){setTimeout(poll,1000);return}
if(r.ok&&j.next){s.textContent="Signed in.";location.href=j.next;return}
s.textContent=j.error||"Sign-in didn't complete. Go back and try again.";})}).catch(function(){setTimeout(poll,2000)})}
poll();})();
</script>`;
  return shell({ title: `Signing in · ${NAME}`, body });
}
