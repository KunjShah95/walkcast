import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { hostname } from "node:os";
import { join } from "node:path";
import { log } from "./ops/log.ts";
import { blockedHost, guardedLookup } from "./record/ssrf.ts";
import type { Store, WebhookDelivery } from "./store/index.ts";

/**
 * Webhook delivery from the transactional outbox. `Store.finish` writes one delivery row per
 * owner webhook in the same atomic step as the job's terminal transition; this dispatcher leases
 * due rows (SKIP LOCKED in Postgres) and POSTs them, so any number of instances can run it and
 * each event is delivered at least once. Receivers should de-duplicate on `X-Walkcast-Delivery`.
 */

export const MAX_ATTEMPTS = 5;

/** Why `raw` can't be a webhook URL, or null. Private targets are refused when `blockPrivate`. */
export async function webhookUrlProblem(raw: string, blockPrivate: boolean): Promise<string | null> {
  let u: URL;
  try { u = new URL(raw); } catch { return "invalid url"; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "webhook url must be http(s)";
  if (u.username || u.password) return "webhook url must not contain credentials";
  if (blockPrivate) return blockedHost(u.hostname);
  return null;
}

/** HMAC-SHA256 of `${timestamp}.${body}` under LAB_WEBHOOK_SECRET, or null when unset. */
export function signature(body: string, timestamp: string, secret = process.env.LAB_WEBHOOK_SECRET): string | null {
  if (!secret) return null;
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

/** Retry delay after the n-th failed attempt: 1 s, 2 s, 4 s … capped at 60 s. */
export function backoffMs(attempts: number): number {
  return Math.min(60_000, 1000 * 2 ** Math.max(0, attempts - 1));
}

export interface DispatcherOptions {
  intervalMs?: number;
  /** Refuse to deliver to private/loopback addresses (re-checked on every send against rebinding). */
  blockPrivate?: boolean;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export async function deliver(d: WebhookDelivery, opts: DispatcherOptions = {}): Promise<void> {
  const problem = await webhookUrlProblem(d.url, opts.blockPrivate ?? false);
  if (problem) throw new Error(problem);
  const body = JSON.stringify({ event: d.event, delivery: d.id, ...d.payload });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sig = signature(body, timestamp);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Walkcast-Webhook/1",
    "X-Walkcast-Event": d.event,
    "X-Walkcast-Delivery": d.id,
    "X-Walkcast-Timestamp": timestamp,
    ...(sig ? { "X-Walkcast-Signature": sig } : {}),
  };
  const timeoutMs = opts.timeoutMs ?? 10_000;
  // Private targets refused: send over a socket whose address is checked as it connects, so a
  // name that passed the check above cannot be rebound to a local address for the send itself.
  const status =
    opts.blockPrivate && !opts.fetch
      ? await guardedPost(d.url, headers, body, timeoutMs)
      : await (opts.fetch ?? fetch)(d.url, {
          method: "POST",
          headers,
          body,
          // A redirect could point the server at an internal address after the check above.
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs),
        }).then(async (res) => {
          await res.arrayBuffer().catch(() => undefined);
          return res.status;
        });
  if (status < 200 || status >= 300) throw new Error(`HTTP ${status}`);
}

/** POST `body` and resolve with the status, connecting only to a public address. Redirects are not followed. */
function guardedPost(url: string, headers: Record<string, string>, body: string, timeoutMs: number): Promise<number> {
  const u = new URL(url);
  const send = u.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise<number>((resolve, reject) => {
    const req = send(
      u,
      { method: "POST", headers: { ...headers, "Content-Length": String(Buffer.byteLength(body)) }, lookup: guardedLookup, timeout: timeoutMs },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode ?? 0));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error(`timed out after ${timeoutMs} ms`)));
    req.on("error", reject);
    req.end(body);
  });
}

/** Lease and send one batch of due deliveries. Returns how many were attempted. */
export async function processOutbox(store: Store, workerId: string, opts: DispatcherOptions = {}): Promise<number> {
  const batch = await store.claimDeliveries(workerId, 60_000, 20);
  for (const d of batch) {
    try {
      await deliver(d, opts);
      await store.completeDelivery(d.id, workerId, { ok: true });
      log.info("webhook.delivered", { delivery: d.id, type: d.event, attempts: d.attempts });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      const retryAt = d.attempts >= MAX_ATTEMPTS ? null : new Date(Date.now() + backoffMs(d.attempts));
      await store.completeDelivery(d.id, workerId, { ok: false, error, retryAt }).catch(() => undefined);
      log.warn("webhook.failed", { delivery: d.id, type: d.event, attempts: d.attempts, error, final: retryAt === null });
    }
  }
  return batch.length;
}

export function startWebhookDispatcher(store: Store, opts: DispatcherOptions = {}): { stop: () => void } {
  const id = `${hostname()}-${process.pid}-wh-${randomUUID().slice(0, 8)}`;
  const intervalMs = opts.intervalMs ?? Number(process.env.LAB_WEBHOOK_INTERVAL_MS ?? 5000);
  let stopped = false;
  let running = false;
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      // Drain while there is work, then wait for the next tick.
      while (!stopped && (await processOutbox(store, id, opts)) > 0);
    } catch (e) {
      log.warn("webhook.tick_failed", { error: String(e) });
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => { void tick(); }, intervalMs);
  timer.unref?.();
  void tick();
  return { stop() { stopped = true; clearInterval(timer); } };
}

/** One-time import of the pre-store `.lab/webhooks.json` into the store, owned by `owner`. */
export async function importLegacyWebhooks(root: string, store: Store, owner: string | null = null): Promise<number> {
  const p = join(root, ".lab", "webhooks.json");
  if (!existsSync(p)) return 0;
  let urls: string[] = [];
  try {
    const v = JSON.parse(readFileSync(p, "utf8")) as unknown;
    const arr = Array.isArray(v) ? v : ((v as { webhooks?: unknown[]; urls?: unknown[] })?.webhooks ?? (v as { urls?: unknown[] })?.urls ?? []);
    urls = (arr as unknown[]).filter((x): x is string => typeof x === "string");
  } catch { /* unreadable */ }
  for (const u of urls) await store.addWebhook(owner, u);
  try { renameSync(p, `${p}.imported`); } catch { /* best effort */ }
  return urls.length;
}
