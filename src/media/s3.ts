import { createHash, createHmac } from "node:crypto";

/**
 * Minimal S3 client (AWS Signature V4): upload objects and presign downloads. Enough for
 * recordings, without the AWS SDK. Works with AWS S3 and with Supabase Storage's S3-compatible
 * endpoint (https://<project>.supabase.co/storage/v1/s3, path-style).
 */
export interface S3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  /** Custom endpoint (Supabase, MinIO). Absent = AWS S3 virtual-hosted URLs. */
  endpoint?: string;
}

const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encPath = (key: string) => key.split("/").map(enc).join("/");
const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const hmac = (k: Buffer | string, data: string) => createHmac("sha256", k).update(data).digest();

/** Object URL: virtual-hosted on AWS, path-style on a custom endpoint. */
function objectUrl(cfg: S3Config, key: string): URL {
  if (cfg.endpoint) return new URL(`${cfg.endpoint.replace(/\/$/, "")}/${enc(cfg.bucket)}/${encPath(key)}`);
  const host = cfg.region === "us-east-1" ? `${cfg.bucket}.s3.amazonaws.com` : `${cfg.bucket}.s3.${cfg.region}.amazonaws.com`;
  return new URL(`https://${host}/${encPath(key)}`);
}

function signingKey(cfg: S3Config, date: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${cfg.secretAccessKey}`, date), cfg.region), "s3"), "aws4_request");
}

function canonicalQuery(params: URLSearchParams): string {
  return [...params.entries()]
    .map(([k, v]) => [enc(k), enc(v)] as const)
    .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

function amzDate(now: Date): { stamp: string; date: string } {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return { stamp, date: stamp.slice(0, 8) };
}

/** Presigned GET URL (query-string auth), valid for `expiresIn` seconds. */
export function presignGet(cfg: S3Config, key: string, expiresIn: number, now = new Date(), extra: Record<string, string> = {}): string {
  const url = objectUrl(cfg, key);
  const { stamp, date } = amzDate(now);
  const scope = `${date}/${cfg.region}/s3/aws4_request`;
  const params = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${cfg.accessKeyId}/${scope}`,
    "X-Amz-Date": stamp,
    "X-Amz-Expires": String(expiresIn),
    ...(cfg.sessionToken ? { "X-Amz-Security-Token": cfg.sessionToken } : {}),
    "X-Amz-SignedHeaders": "host",
    ...extra,
  });
  const canonical = ["GET", url.pathname, canonicalQuery(params), `host:${url.host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", stamp, scope, sha256(canonical)].join("\n");
  params.set("X-Amz-Signature", createHmac("sha256", signingKey(cfg, date)).update(toSign).digest("hex"));
  return `${url.origin}${url.pathname}?${canonicalQuery(params)}`;
}

/** Header-signed request. Returns the headers to send (everything signed except `host`). */
export function signHeaders(cfg: S3Config, method: string, url: URL, payloadHash: string, extra: Record<string, string> = {}, now = new Date()): Record<string, string> {
  const { stamp, date } = amzDate(now);
  const scope = `${date}/${cfg.region}/s3/aws4_request`;
  const headers: Record<string, string> = {
    ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k.toLowerCase(), v])),
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": stamp,
    ...(cfg.sessionToken ? { "x-amz-security-token": cfg.sessionToken } : {}),
  };
  const names = Object.keys(headers).sort();
  const canonical = [method, url.pathname, canonicalQuery(url.searchParams), names.map((n) => `${n}:${headers[n]!.trim()}\n`).join(""), names.join(";"), payloadHash].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", stamp, scope, sha256(canonical)].join("\n");
  const signature = createHmac("sha256", signingKey(cfg, date)).update(toSign).digest("hex");
  const { host: _host, ...rest } = headers;
  return { ...rest, authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}` };
}

export async function putObject(cfg: S3Config, key: string, body: Buffer, contentType: string): Promise<void> {
  const url = objectUrl(cfg, key);
  const headers = signHeaders(cfg, "PUT", url, sha256(body), { "content-type": contentType });
  const res = await fetch(url, { method: "PUT", headers, body: new Uint8Array(body), signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Upload of ${key} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
}
