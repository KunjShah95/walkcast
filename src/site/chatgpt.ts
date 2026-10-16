import type { Store, User } from "../store/types.ts";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { seal, open } from "../jobs/secret-box.ts";

export const CHATGPT_ISSUER = "https://auth.openai.com";
export const CHATGPT_AUTH_ENDPOINT = "https://auth.openai.com/api/accounts/authorize";
export const CHATGPT_TOKEN_ENDPOINT = "https://auth.openai.com/api/accounts/oauth/token";
export const CHATGPT_JWKS_URI = "https://auth.openai.com/.well-known/jwks.json";
export const CHATGPT_CLIENT_ID = "dynamic_agent_client";
export const CHATGPT_RESOURCE = "https://api.openai.com/v1";

/** Stable opaque host id, persisted across sign-ins (one per installation). */
export function chatgptHostId(): string {
  const env = process.env.LAB_CHATGPT_HOST_ID;
  if (env) return env;
  const path = join(process.cwd(), ".lab", "chatgpt-host-id");
  try {
    const raw = readFileSync(path, "utf8").trim();
    if (raw) return raw;
  } catch { /* first run */ }
  try { mkdirSync(join(process.cwd(), ".lab"), { recursive: true }); } catch { /* exists */ }
  const id = `urn:uuid:${randomBytes(16).toString("hex").replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5")}`;
  try { writeFileSync(path, id + "\n", "utf8"); } catch { /* best effort */ }
  return id;
}

export function s256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decode (unverified) JWT payload — used to read claims; signature checked by OpenAI infra on token use. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const buf = Buffer.from(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    return JSON.parse(buf.toString("utf8")) as Record<string, unknown>;
  } catch { return null; }
}

export async function ensureChatGPTAccessToken(user: User, store: Store): Promise<string> {
  if (!user.chatgpt) throw new Error("chatgpt: account not connected");
  const c = user.chatgpt;
  if (c.accessToken && c.accessExpiresAt && new Date(c.accessExpiresAt).getTime() - 60_000 > Date.now()) {
    try { return open(c.accessToken); } catch { /* fall through to refresh */ }
  }
  if (!c.refreshToken) throw new Error("chatgpt: no refresh token; reconnect required");
  const refresh = open(c.refreshToken);
  const resp = await fetch(CHATGPT_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, client_id: c.clientId }),
  });
  const j = await resp.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };
  if (!j.access_token) throw new Error(`chatgpt refresh failed (${j.error ?? j.error_description ?? "no token"})`);
  c.accessToken = seal(j.access_token);
  if (j.refresh_token) c.refreshToken = seal(j.refresh_token);
  c.accessExpiresAt = new Date(Date.now() + Number(j.expires_in ?? 3600) * 1000).toISOString();
  if (j.scope) { c.scope = String(j.scope); c.planUsage = c.scope.includes("chatgpt.tokens.use.direct"); }
  user.chatgpt = c;
  await store.updateUser(user);
  return j.access_token;
}
export { seal, open };
export { seal as sealSecret, open as openSecret };