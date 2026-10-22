import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Credentials a recording job needs (the site password) never sit in the queue in plain text.
 * They are sealed with AES-256-GCM under LAB_SECRET_KEY (32 bytes, base64), opened only by the
 * worker that claims the job, and the sealed copy is cleared from the job row when it ends.
 *
 * Without LAB_SECRET_KEY a random per-process key is used: fine when the web server runs the
 * worker itself (local use), but a separate worker could not open it, so `sealable()` says so.
 */
let processKey: Buffer | undefined;
let fileKey: Buffer | undefined;

/**
 * Keep the sealing key in a file beside a local store, so a password sealed for a queued job can
 * still be opened after a restart. Without it the key was random per process: a sign-in job
 * queued before a restart lost its password and failed as if the site had refused it.
 * LAB_SECRET_KEY, when set, still wins.
 */
export function useLocalKeyFile(dir: string): void {
  const file = join(dir, "secret.key");
  let k = existsSync(file) ? Buffer.from(readFileSync(file, "utf8").trim(), "base64") : Buffer.alloc(0);
  if (k.length !== 32) {
    k = randomBytes(32);
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, k.toString("base64"), { mode: 0o600 });
  }
  fileKey = k;
}

function key(): Buffer {
  const configured = process.env.LAB_SECRET_KEY;
  if (configured) {
    const k = Buffer.from(configured, "base64");
    if (k.length !== 32) throw new Error("LAB_SECRET_KEY must be 32 bytes, base64-encoded (e.g. `openssl rand -base64 32`).");
    return k;
  }
  return fileKey ?? (processKey ??= randomBytes(32));
}

/** Whether a sealed secret can be opened by a different process (a separate worker). */
export function sharedKeyConfigured(): boolean {
  return Boolean(process.env.LAB_SECRET_KEY);
}

/**
 * Seal a value that has to survive a restart, such as a user's linked OpenRouter or ChatGPT
 * credentials. The per-process fallback key is deliberately not allowed here: it is regenerated
 * on every boot, so anything sealed under it becomes permanently undecryptable the next time the
 * server restarts, and the failure surfaces far from its cause (the worker's `open()` throws,
 * gets swallowed as best-effort, and the run silently falls back to the operator's own key).
 */
export function sealPersistent(plain: string): string {
  if (!sharedKeyConfigured()) {
    throw new Error(
      "LAB_SECRET_KEY must be set to link an account (32 bytes, base64: `openssl rand -base64 32`). " +
        "Without it, linked credentials would be sealed under a key that changes on every restart.",
    );
  }
  return seal(plain);
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${body.toString("base64url")}`;
}

export function open(sealed: string): string {
  const [v, iv, tag, body] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || body === undefined) throw new Error("Unrecognised sealed secret.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}
