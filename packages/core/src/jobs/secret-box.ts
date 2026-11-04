import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Credentials a recording job needs (the site password) never sit in the queue in plain text.
 * They are sealed with AES-256-GCM under LAB_SECRET_KEY (32 bytes, base64), opened only by the
 * worker that claims the job, and the sealed copy is cleared from the job row when it ends.
 *
 * WALKCAST_MASTER_KEY (64 hex characters) is the desktop app's key: the shell keeps it in the OS
 * keychain and hands it to the server, so nothing on disk can open what it sealed. With it set,
 * no secret.key file is written, and one left from before is only read to open old secrets.
 *
 * Without either, a random per-process key is used: fine when the web server runs the worker
 * itself (local use), but a separate worker could not open it, so `sealable()` says so.
 */
let processKey: Buffer | undefined;
let fileKey: Buffer | undefined;
/** A secret.key left from before WALKCAST_MASTER_KEY was set: opens old secrets, seals nothing new. */
let legacyKey: Buffer | undefined;

/**
 * The master key from WALKCAST_MASTER_KEY, or null when unset. A value that is set but malformed
 * throws: silently falling back to a key file would defeat the point of setting it.
 */
export function masterKey(): Buffer | null {
  const raw = process.env.WALKCAST_MASTER_KEY?.trim();
  if (!raw) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) throw new Error("WALKCAST_MASTER_KEY must be 64 hex characters (32 bytes), e.g. `openssl rand -hex 32`.");
  return Buffer.from(raw, "hex");
}

/**
 * Keep the sealing key in a file beside a local store, so a password sealed for a queued job can
 * still be opened after a restart. Without it the key was random per process: a sign-in job
 * queued before a restart lost its password and failed as if the site had refused it.
 * LAB_SECRET_KEY, when set, still wins. With WALKCAST_MASTER_KEY set the file is never written;
 * an existing one is kept for opening what it sealed.
 */
export function useLocalKeyFile(dir: string): void {
  const file = join(dir, "secret.key");
  const existing = existsSync(file) ? Buffer.from(readFileSync(file, "utf8").trim(), "base64") : Buffer.alloc(0);
  if (masterKey()) {
    fileKey = undefined;
    legacyKey = existing.length === 32 ? existing : undefined;
    return;
  }
  legacyKey = undefined;
  let k = existing;
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
  return masterKey() ?? fileKey ?? (processKey ??= randomBytes(32));
}

/** Whether a sealed secret can be opened by a different process (a separate worker). */
export function sharedKeyConfigured(): boolean {
  return Boolean(process.env.LAB_SECRET_KEY) || Boolean(process.env.WALKCAST_MASTER_KEY?.trim());
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

function sealWith(k: Buffer, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${body.toString("base64url")}`;
}

function openWith(k: Buffer, sealed: string): string {
  const [v, iv, tag, body] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || body === undefined) throw new Error("Unrecognised sealed secret.");
  const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

export function seal(plain: string): string {
  return sealWith(key(), plain);
}

export function open(sealed: string): string {
  try {
    return openWith(key(), sealed);
  } catch (e) {
    // Sealed before WALKCAST_MASTER_KEY existed: the old key file still opens it.
    if (legacyKey) return openWith(legacyKey, sealed);
    throw e;
  }
}

/**
 * Encrypt a file's contents under WALKCAST_MASTER_KEY (and only that key: a file sealed under a
 * key kept beside it would protect nothing). Throws when the master key is not set.
 */
export function sealAtRest(plain: string): string {
  const k = masterKey();
  if (!k) throw new Error("WALKCAST_MASTER_KEY is not set.");
  return sealWith(k, plain);
}

/** Open what `sealAtRest` wrote. Throws when the master key is unset or is not the one it was sealed with. */
export function openAtRest(sealed: string): string {
  const k = masterKey();
  if (!k) throw new Error("WALKCAST_MASTER_KEY is not set.");
  return openWith(k, sealed.trim());
}
