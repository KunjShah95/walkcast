#!/usr/bin/env node
// Configures the Supabase project's sign-in for Walkcast through the Management API:
// turns on Google, stores its OAuth client, and allow-lists every URL Walkcast sends people back
// to after Google, an email confirmation or a password reset. Safe to re-run; existing allow-list
// entries are kept.
//
//   node scripts/configure-supabase-auth.mjs --check
//   SUPABASE_ACCESS_TOKEN=sbp_... GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... \
//     node scripts/configure-supabase-auth.mjs
//
// SUPABASE_ACCESS_TOKEN: a personal access token (supabase.com → Account → Access Tokens).
// GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET: a Google Cloud OAuth client of type "Web application"
// whose Authorized redirect URI is <SUPABASE_URL>/auth/v1/callback (printed by --check).
// SUPABASE_URL and LAB_SITE_URL are read from the environment or the repo's .env.
//
// Optional, strongly recommended: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SENDER (the
// From address) and SMTP_SENDER_NAME. Without custom SMTP, Supabase's built-in mailer only sends
// confirmation and reset emails to the project's own team members, so real sign-ups never get
// their confirmation link.
import { readFileSync } from "node:fs";

const env = { ...readDotenv(), ...process.env };
const check = process.argv.includes("--check");

function readDotenv() {
  try {
    return Object.fromEntries(
      readFileSync(new URL("../.env", import.meta.url), "utf8")
        .split(/\r?\n/)
        .map((l) => /^(?:export\s+)?([A-Z_]+)=(.*)$/.exec(l.trim()))
        .filter(Boolean)
        .map((m) => [m[1], m[2].replace(/^(["'])(.*)\1$/, "$2").trim()]),
    );
  } catch {
    return {};
  }
}

const supabaseUrl = (env.SUPABASE_URL ?? "").replace(/\/$/, "");
const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co$/.exec(supabaseUrl)?.[1];
if (!ref) {
  console.error("SUPABASE_URL must look like https://<ref>.supabase.co");
  process.exit(2);
}
const site = (env.LAB_SITE_URL ?? "").replace(/\/$/, "");

/** Every place Walkcast's server sends Supabase back to (see apps/desktop/server/supabase-auth.ts). */
const RETURN_URLS = [
  "http://127.0.0.1:4317/auth/**", // the desktop app (its fixed loopback port)
  "walkcast://auth/callback", // the desktop app when it could not take 4317 (port-independent)
  "http://127.0.0.1:4320/auth/**", // `walkcast ui` / npm run ui
  "http://localhost:4320/auth/**",
  ...(site && !/127\.0\.0\.1|localhost/.test(site) ? [`${site}/auth/**`] : []),
];

console.log(`Supabase project: ${ref}`);
console.log(`Google Cloud → OAuth client (Web application) → Authorized redirect URI:\n  ${supabaseUrl}/auth/v1/callback`);
console.log(`Return URLs Walkcast needs allow-listed:\n  ${RETURN_URLS.join("\n  ")}`);

const token = env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  if (check) {
    const settings = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: env.SUPABASE_ANON_KEY ?? "" } }).then((r) => r.json()).catch(() => null);
    const on = Object.entries(settings?.external ?? {}).filter(([, v]) => v).map(([k]) => k);
    console.log(`\nProviders enabled now (public settings): ${on.join(", ") || "unknown"}`);
    console.log(`Google: ${settings?.external?.google ? "ON" : "OFF"}`);
    console.log("Set SUPABASE_ACCESS_TOKEN to also see and fix the allow-list.");
    process.exit(settings?.external?.google ? 0 : 1);
  }
  console.error("\nSUPABASE_ACCESS_TOKEN is required (supabase.com → Account → Access Tokens).");
  process.exit(2);
}

const api = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const current = await fetch(api, { headers }).then(async (r) => {
  if (!r.ok) throw new Error(`reading auth config failed: HTTP ${r.status} ${await r.text()}`);
  return r.json();
});
const allow = new Set(String(current.uri_allow_list ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const missing = RETURN_URLS.filter((u) => !allow.has(u));
console.log(`\nGoogle now: ${current.external_google_enabled ? "ON" : "OFF"}; custom SMTP: ${current.smtp_host ? "yes" : "NO"}; allow-list missing: ${missing.length ? missing.join(", ") : "nothing"}`);
if (check) process.exit(current.external_google_enabled && current.smtp_host && !missing.length ? 0 : 1);

const patch = { uri_allow_list: [...allow, ...missing].join(",") };
if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  Object.assign(patch, {
    external_google_enabled: true,
    external_google_client_id: env.GOOGLE_CLIENT_ID,
    external_google_secret: env.GOOGLE_CLIENT_SECRET,
  });
} else if (!current.external_google_enabled) {
  console.log("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set: updating the allow-list only; Google stays off.");
}
if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.SMTP_SENDER) {
  Object.assign(patch, {
    smtp_host: env.SMTP_HOST,
    smtp_port: String(env.SMTP_PORT ?? "587"),
    smtp_user: env.SMTP_USER,
    smtp_pass: env.SMTP_PASS,
    smtp_admin_email: env.SMTP_SENDER,
    smtp_sender_name: env.SMTP_SENDER_NAME ?? "Walkcast",
  });
} else if (!current.smtp_host) {
  console.log("No custom SMTP configured: Supabase will only email your team members. Set SMTP_* to fix.");
}
const res = await fetch(api, { method: "PATCH", headers, body: JSON.stringify(patch) });
if (!res.ok) {
  console.error(`updating auth config failed: HTTP ${res.status} ${await res.text()}`);
  process.exit(1);
}
const after = await res.json();
console.log(`Done. Google: ${after.external_google_enabled ? "ON" : "OFF"}; allow-list: ${after.uri_allow_list}`);
