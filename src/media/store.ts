import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { presignGet, putObject, type S3Config } from "./s3.ts";

/**
 * Where recording media lives. Local disk (recordings/<id>/) by default; S3-compatible object
 * storage when configured, so any web instance can serve what any worker recorded:
 *
 * - Supabase Storage: SUPABASE_URL, SUPABASE_S3_ACCESS_KEY_ID, SUPABASE_S3_SECRET_ACCESS_KEY,
 *   SUPABASE_S3_REGION (your project's region), SUPABASE_STORAGE_BUCKET (default "recordings").
 * - AWS S3: MEDIA_S3_BUCKET, MEDIA_S3_REGION, and credentials from AWS_ACCESS_KEY_ID /
 *   AWS_SECRET_ACCESS_KEY or, on ECS, the task role (no keys to manage).
 *
 * Buckets stay private: files are served through short-lived presigned URLs after the server has
 * checked who is asking.
 */
export interface MediaStore {
  readonly kind: "local" | "s3";
  /** Make a finished recording's files available (uploads them for object storage). */
  publish(id: string, localDir: string, files: string[]): Promise<void>;
  /** A local file to stream, or a URL to redirect to; null when it doesn't exist. */
  locate(id: string, file: string): Promise<{ path: string } | { redirect: string } | null>;
}

export const MEDIA_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".wav": "audio/wav",
  ".vtt": "text/vtt; charset=utf-8",
  ".json": "application/json",
};

export class LocalMedia implements MediaStore {
  readonly kind = "local" as const;
  constructor(readonly dir: string) {}
  async publish(): Promise<void> {}
  async locate(id: string, file: string) {
    if (!/^[\w.-]+$/.test(id) || !/^[\w.-]+$/.test(file) || id === "." || id === ".." || file === "." || file === ".." || id.includes("..") || file.includes("..")) return null;
    const path = join(this.dir, id, file);
    return existsSync(path) ? { path } : null;
  }
}

type Credentials = Pick<S3Config, "accessKeyId" | "secretAccessKey" | "sessionToken">;

export class S3Media implements MediaStore {
  readonly kind = "s3" as const;
  private cached: { creds: Credentials; until: number } | undefined;

  constructor(
    readonly cfg: Omit<S3Config, "accessKeyId" | "secretAccessKey" | "sessionToken">,
    private readonly credentials: () => Promise<Credentials & { expiresAt?: number }>,
    readonly prefix = "recordings",
  ) {}

  private async config(): Promise<S3Config> {
    if (!this.cached || this.cached.until < Date.now()) {
      const c = await this.credentials();
      // Refresh role credentials five minutes before they expire.
      this.cached = { creds: c, until: c.expiresAt ? c.expiresAt - 5 * 60_000 : Number.POSITIVE_INFINITY };
    }
    return { ...this.cfg, ...this.cached.creds };
  }

  async publish(id: string, localDir: string, files: string[]): Promise<void> {
    const cfg = await this.config();
    for (const file of files) {
      const path = join(localDir, file);
      if (!existsSync(path)) continue;
      await putObject(cfg, this.key(id, file), readFileSync(path), MEDIA_TYPES[extname(file)] ?? "application/octet-stream");
    }
  }

  async locate(id: string, file: string) {
    if (!/^[\w.-]+$/.test(id) || !/^[\w.-]+$/.test(file) || id === "." || id === ".." || file === "." || file === ".." || id.includes("..") || file.includes("..")) return null;
    // Short-lived: long enough to watch a recording, short enough that a leaked link expires.
    return { redirect: presignGet(await this.config(), this.key(id, file), 15 * 60) };
  }

  private key(id: string, file: string): string {
    return [this.prefix, id, file].filter(Boolean).join("/");
  }
}

/** Static keys from the environment, or the ECS task role via the container credentials endpoint. */
export async function awsCredentials(): Promise<Credentials & { expiresAt?: number }> {
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY, ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {}) };
  }
  const relative = process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI;
  const full = process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI;
  if (!relative && !full) throw new Error("No AWS credentials: set AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY or run with an ECS task role.");
  const res = await fetch(full ?? `http://169.254.170.2${relative}`, {
    headers: process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN ? { Authorization: process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN } : {},
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Could not read ECS task-role credentials (${res.status}).`);
  const c = (await res.json()) as { AccessKeyId: string; SecretAccessKey: string; Token?: string; Expiration?: string };
  return { accessKeyId: c.AccessKeyId, secretAccessKey: c.SecretAccessKey, ...(c.Token ? { sessionToken: c.Token } : {}), ...(c.Expiration ? { expiresAt: Date.parse(c.Expiration) } : {}) };
}

/** Pick the media store from the environment. */
export function createMedia(root: string, env = process.env): MediaStore {
  if (env.SUPABASE_URL && env.SUPABASE_S3_ACCESS_KEY_ID && env.SUPABASE_S3_SECRET_ACCESS_KEY) {
    const accessKeyId = env.SUPABASE_S3_ACCESS_KEY_ID;
    const secretAccessKey = env.SUPABASE_S3_SECRET_ACCESS_KEY;
    return new S3Media(
      { bucket: env.SUPABASE_STORAGE_BUCKET ?? "recordings", region: env.SUPABASE_S3_REGION ?? "us-east-1", endpoint: `${env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/s3` },
      async () => ({ accessKeyId, secretAccessKey }),
      "",
    );
  }
  if (env.MEDIA_S3_BUCKET) {
    return new S3Media(
      { bucket: env.MEDIA_S3_BUCKET, region: env.MEDIA_S3_REGION ?? env.AWS_REGION ?? "us-east-1", ...(env.MEDIA_S3_ENDPOINT ? { endpoint: env.MEDIA_S3_ENDPOINT } : {}) },
      awsCredentials,
      env.MEDIA_S3_PREFIX ?? "recordings",
    );
  }
  return new LocalMedia(join(root, "recordings"));
}
