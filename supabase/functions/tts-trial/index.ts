// The free voice trial. Holds Walkcast's ElevenLabs key so it never ships in the desktop app, and
// spends against the tts_trials ledger: one recording per account, up to TRIAL_CHAR_CAP characters.
//
//   POST /tts-trial/ticket  Authorization: Bearer <Supabase access token>
//        → { ticket, state, charsLeft }   ticket = proof of who you are, for /speak, 30 days
//   POST /tts-trial/speak   { ticket, recording, text, voice? }
//        → audio/mpeg, or 402 { error } once the trial is spent
//
// The desktop app signs the Supabase session out right after sign-in (it keeps its own), so it
// can't present a Supabase token minutes later when a recording speaks. The ticket bridges that:
// an HMAC over the auth user id, minted while the sign-in token is still valid. Copying a ticket
// buys nothing: the ledger is per user, not per ticket.
//
// Secrets: ELEVENLABS_API_KEY, TRIAL_SIGNING_SECRET. Optional: TRIAL_CHAR_CAP (default 8000),
// ELEVENLABS_MODEL (default eleven_flash_v2_5). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
// provided by the platform. Deploy with --no-verify-jwt: /speak authenticates by ticket.

import { createClient } from "jsr:@supabase/supabase-js@2";

const CAP = Number(Deno.env.get("TRIAL_CHAR_CAP") ?? "8000");
const MODEL = Deno.env.get("ELEVENLABS_MODEL") ?? "eleven_flash_v2_5";
const TICKET_DAYS = 30;
const MAX_LINE = 600;
// The trial speaks only these voices (the same ones the app's ElevenLabs picker lists first).
const VOICES = new Set(["21m00Tcm4TlvDq8ikWAM", "pNInz6obpgDQGcFmaJgB", "EXAVITQu4vr4xnSDxMaL", "ErXwobaYiN019PkySvjV"]);
const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const enc = new TextEncoder();

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function hmac(data: string): Promise<Uint8Array> {
  const secret = Deno.env.get("TRIAL_SIGNING_SECRET");
  if (!secret) throw new Error("TRIAL_SIGNING_SECRET is not set");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

async function mint(sub: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify({ sub, exp: Date.now() + TICKET_DAYS * 86_400_000 })));
  return `${body}.${b64url(await hmac(body))}`;
}

/** The auth user id a ticket vouches for, or null when it is forged or expired. */
async function verify(ticket: unknown): Promise<string | null> {
  if (typeof ticket !== "string") return null;
  const [body, sig] = ticket.split(".");
  if (!body || !sig) return null;
  const want = await hmac(body);
  const got = fromB64url(sig);
  if (got.length !== want.length || !got.every((b, i) => b === want[i])) return null;
  const claims = JSON.parse(new TextDecoder().decode(fromB64url(body))) as { sub?: string; exp?: number };
  return typeof claims.sub === "string" && typeof claims.exp === "number" && claims.exp > Date.now() ? claims.sub : null;
}

async function status(sub: string) {
  const { data, error } = await admin.rpc("tts_trial_status", { p_user: sub, p_cap: CAP }).single<{ state: string; chars_left: number }>();
  if (error || !data) throw error ?? new Error("no status");
  return { state: data.chars_left > 0 ? data.state : "spent", charsLeft: data.chars_left };
}

async function ticket(req: Request): Promise<Response> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "Sign in to Walkcast first." });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return json(401, { error: "That sign-in has expired." });
  return json(200, { ticket: await mint(data.user.id), ...(await status(data.user.id)) });
}

async function speak(req: Request): Promise<Response> {
  const b = (await req.json().catch(() => ({}))) as { ticket?: unknown; recording?: unknown; text?: unknown; voice?: unknown };
  const sub = await verify(b.ticket);
  if (!sub) return json(401, { error: "The free voice ticket is invalid or expired. Sign in again." });
  const recording = typeof b.recording === "string" ? b.recording.slice(0, 100) : "";
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (!recording || !text) return json(400, { error: "recording and text are required" });
  if (text.length > MAX_LINE) return json(400, { error: `A line may be at most ${MAX_LINE} characters.` });
  const voice = typeof b.voice === "string" && VOICES.has(b.voice) ? b.voice : DEFAULT_VOICE;

  const { data: left, error } = await admin.rpc("tts_trial_spend", { p_user: sub, p_recording: recording, p_chars: text.length, p_cap: CAP });
  if (error) return json(500, { error: "The free voice is unavailable right now." });
  if (left === null) return json(402, { error: "Your free Walkcast voice recording is used up. Add your own voice key in Settings to keep narrating." });

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": Deno.env.get("ELEVENLABS_API_KEY")!, Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    // Give the characters back: the user shouldn't pay for our provider's failure.
    await admin.rpc("tts_trial_spend", { p_user: sub, p_recording: recording, p_chars: -text.length, p_cap: CAP });
    return json(502, { error: `The voice service failed (${res.status}).` });
  }
  return new Response(res.body, { status: 200, headers: { "Content-Type": "audio/mpeg", "X-Trial-Chars-Left": String(left) } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  try {
    if (path.endsWith("/ticket")) return await ticket(req);
    if (path.endsWith("/speak")) return await speak(req);
    return json(404, { error: "not found" });
  } catch (e) {
    console.error(e);
    return json(500, { error: "The free voice is unavailable right now." });
  }
});
