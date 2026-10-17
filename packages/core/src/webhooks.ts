import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export interface OutboxEntry {
  id: string;
  url: string;
  event: string;
  payload: unknown;
  attempts: number;
  nextAt: string;
  status: "pending" | "done" | "failed";
  lastError?: string;
  createdAt: string;
}

function labDir(root: string): string {
  const d = join(root, ".lab");
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  return d;
}

export function webhooksPath(root: string): string {
  return join(labDir(root), "webhooks.json");
}

export function outboxPath(root: string): string {
  return join(labDir(root), "webhook-outbox.json");
}

export function loadWebhooks(root: string): string[] {
  const p = webhooksPath(root);
  if (!existsSync(p)) return [];
  try {
    const v = JSON.parse(readFileSync(p, "utf8"));
    if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
    if (v && Array.isArray(v.webhooks)) return v.webhooks.filter((x: unknown) => typeof x === "string");
    if (v && Array.isArray(v.urls)) return v.urls.filter((x: unknown) => typeof x === "string");
    return [];
  } catch {
    return [];
  }
}

export function saveWebhooks(root: string, urls: string[]): void {
  writeFileSync(webhooksPath(root), JSON.stringify(urls, null, 2), { mode: 0o600 });
}

export function addWebhook(root: string, url: string): string[] {
  const urls = loadWebhooks(root);
  if (!urls.includes(url)) urls.push(url);
  saveWebhooks(root, urls);
  return urls;
}

export function removeWebhook(root: string, url: string): string[] {
  const urls = loadWebhooks(root).filter((u) => u !== url);
  saveWebhooks(root, urls);
  return urls;
}

export function readOutbox(root: string): OutboxEntry[] {
  const p = outboxPath(root);
  if (!existsSync(p)) return [];
  try {
    const v = JSON.parse(readFileSync(p, "utf8"));
    return Array.isArray(v) ? (v as OutboxEntry[]) : [];
  } catch {
    return [];
  }
}

export function writeOutbox(root: string, entries: OutboxEntry[]): void {
  writeFileSync(outboxPath(root), JSON.stringify(entries, null, 2), { mode: 0o600 });
}

export function enqueueWebhook(root: string, event: string, payload: unknown, urls?: string[]): void {
  const targets = urls ?? loadWebhooks(root);
  if (targets.length === 0) return;
  const entries = readOutbox(root);
  const now = new Date().toISOString();
  for (const url of targets) {
    entries.push({
      id: randomUUID(),
      url,
      event,
      payload,
      attempts: 0,
      nextAt: now,
      status: "pending",
      createdAt: now,
    });
  }
  writeOutbox(root, entries);
}

export function startWebhookDispatcher(root: string, intervalMs = 5000): { stop: () => void } {
  let stopped = false;
  const timer = setInterval(() => {
    if (stopped) return;
    void processOutbox(root).catch(() => undefined);
  }, intervalMs);
  // best-effort immediate
  void processOutbox(root).catch(() => undefined);
  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}

export async function processOutbox(root: string): Promise<void> {
  const entries = readOutbox(root);
  const now = Date.now();
  let changed = false;
  for (const e of entries) {
    if (e.status !== "pending") continue;
    if (new Date(e.nextAt).getTime() > now) continue;
    e.attempts += 1;
    try {
      const res = await fetch(e.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: e.event, ...((e.payload && typeof e.payload === "object") ? e.payload : { payload: e.payload }) }),
      });
      if (res.ok) {
        e.status = "done";
        changed = true;
        continue;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      e.lastError = err instanceof Error ? err.message : String(err);
      if (e.attempts >= 5) {
        e.status = "failed";
      } else {
        const backoff = Math.min(60_000, 1000 * 2 ** (e.attempts - 1));
        e.nextAt = new Date(Date.now() + backoff).toISOString();
      }
      changed = true;
    }
  }
  if (changed) writeOutbox(root, entries);
}
