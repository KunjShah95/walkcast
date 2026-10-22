import { useEffect, useState, type FormEvent } from "react";
import { Button, Empty, PageHead, Panel, PanelHeader, Stamp, fieldClass } from "../components/ui.tsx";
import {
  createWebhook,
  deleteWebhook,
  isSnapshot,
  loadWebhookDeliveries,
  loadWebhooks,
  type Webhook,
  type WebhookDelivery,
} from "../lib/api.ts";
import { ago } from "../lib/format.ts";

const STATUS: Record<WebhookDelivery["status"], { label: string; tone: "pass" | "warn" | "fail" }> = {
  done: { label: "Delivered", tone: "pass" },
  pending: { label: "Retrying", tone: "warn" },
  failed: { label: "Failed", tone: "fail" },
};

/**
 * Webhooks: the finished recording, sent to the rest of the stack.
 *
 * The job queue writes a delivery row in the same step that finishes a walkthrough or lab run,
 * and a dispatcher retries it, so this page is not just configuration — it is the log of what
 * actually reached the endpoints. Receivers can de-duplicate on `X-Walkcast-Delivery` and verify
 * `X-Walkcast-Signature` when the server has a shared secret.
 */
export function Webhooks() {
  const [items, setItems] = useState<Webhook[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(!isSnapshot);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    if (isSnapshot) return;
    setLoading(true);
    try {
      const [hooks, log] = await Promise.all([loadWebhooks(), loadWebhookDeliveries()]);
      setItems(hooks);
      setDeliveries(log);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const target = url.trim();
    try {
      const parsed = new URL(target);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    } catch {
      setError("Use an http:// or https:// URL.");
      return;
    }
    setBusy(true);
    try {
      setItems(await createWebhook(target));
      setUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (webhook: Webhook) => {
    setRemoving(webhook.id);
    setError(null);
    try {
      setItems(await deleteWebhook(webhook.id));
      setDeliveries(await loadWebhookDeliveries());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemoving(null);
    }
  };

  if (isSnapshot) {
    return (
      <div className="grid gap-4">
        <PageHead title="Webhooks" description="Send a finished walkthrough or lab run to another tool." />
        <Panel className="p-4 text-[13px] text-ink-3">Webhooks need the live server. This snapshot is read-only.</Panel>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <PageHead
        title="Webhooks"
        description="When a walkthrough or lab run reaches a final state, Walkcast POSTs a job.completed event to every endpoint here. Deliveries are retried, and this page shows what arrived."
        actions={
          <Button size="sm" onClick={refresh} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      {error && <div className="rounded-xl border border-fail/30 bg-fail-soft px-4 py-3 text-[13px] text-fail">{error}</div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="grid content-start gap-4">
          <Panel>
            <PanelHeader title="Endpoints" eyebrow={`${items.length} of 10 used`} />
            <form onSubmit={add} className="grid gap-2.5 border-b border-line p-4">
              <label className="grid gap-1 text-[12.5px] text-ink-2">
                Endpoint URL
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://hooks.example.com/walkcast"
                  className={fieldClass}
                  autoComplete="url"
                  spellCheck={false}
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" tone="primary" size="sm" disabled={busy}>
                  {busy ? "Adding…" : "Add endpoint"}
                </Button>
                <span className="text-[11.5px] text-ink-3">Slack, Zapier or your own server.</span>
              </div>
            </form>
            {items.length === 0 ? (
              <Empty title="No endpoints yet" tone="signal">
                Add one above. The next walkthrough that finishes will send a job.completed event.
              </Empty>
            ) : (
              <ul>
                {items.map((w) => (
                  <li key={w.id} className="flex flex-wrap items-start gap-3 border-t border-line px-4 py-3 first:border-t-0">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{hostOf(w.url)}</div>
                      <div className="mt-0.5 truncate font-mono text-[11px] text-ink-3" title={w.url}>
                        {w.url}
                      </div>
                      <div className="mt-1 text-[11.5px] text-ink-3">added {ago(Date.parse(w.createdAt))}</div>
                    </div>
                    <Button
                      tone="danger"
                      size="sm"
                      onClick={() => remove(w)}
                      disabled={removing === w.id}
                      aria-label={`Remove endpoint ${w.url}`}
                    >
                      {removing === w.id ? "Removing…" : "Remove"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel className="p-4 text-[12.5px] leading-relaxed text-ink-2">
            <div className="mb-1 text-[13px] font-semibold text-ink">Checking a delivery</div>
            Every request carries <code className="rounded bg-panel-2 px-1 py-0.5 font-mono text-[11.5px]">X-Walkcast-Event</code> and{" "}
            <code className="rounded bg-panel-2 px-1 py-0.5 font-mono text-[11.5px]">X-Walkcast-Delivery</code>. When the server has{" "}
            <code className="rounded bg-panel-2 px-1 py-0.5 font-mono text-[11.5px]">LAB_WEBHOOK_SECRET</code> set,{" "}
            <code className="rounded bg-panel-2 px-1 py-0.5 font-mono text-[11.5px]">X-Walkcast-Signature</code> is an HMAC-SHA256 of{" "}
            <code className="rounded bg-panel-2 px-1 py-0.5 font-mono text-[11.5px]">timestamp.body</code>. Retries keep the same delivery id, so receivers
            should treat a repeated id as the same event.
          </Panel>
        </div>

        <Panel className="flex min-h-0 flex-col overflow-hidden">
          <PanelHeader title="Recent deliveries" eyebrow="Newest first, up to 50" />
          {deliveries.length === 0 ? (
            <Empty title="No deliveries yet" tone="muted">
              The first walkthrough or lab run that finishes after you add an endpoint will be logged here.
            </Empty>
          ) : (
            <ul className="max-h-[42rem] overflow-y-auto">
              {deliveries.map((d) => {
                const status = STATUS[d.status];
                const label = d.status === "pending" && d.attempts === 0 ? "Queued" : status.label;
                const expanded = open === d.id;
                return (
                  <li key={d.id} className="border-t border-line px-4 py-3 first:border-t-0">
                    <div className="flex flex-wrap items-start gap-2.5">
                      <Stamp tone={status.tone}>{label}</Stamp>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="font-mono text-[11.5px] text-ink-2">{d.event}</span>
                          <span className="truncate text-[11.5px] text-ink-3" title={d.url}>
                            {hostOf(d.url)}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-1 text-[11.5px] text-ink-3">
                          <span>{ago(Date.parse(d.createdAt))}</span>
                          <span>
                            {d.attempts} {d.attempts === 1 ? "attempt" : "attempts"}
                          </span>
                          {d.status === "pending" && d.attempts > 0 && <span>next try {timeOf(d.nextAt)}</span>}
                          {d.lastError && <span className="text-fail">{d.lastError}</span>}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setOpen(expanded ? null : d.id)}
                        aria-expanded={expanded}
                        className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[11.5px] text-ink-2 hover:border-line-strong hover:text-ink"
                      >
                        {expanded ? "Hide" : "Payload"}
                      </button>
                    </div>
                    {expanded && (
                      <pre className="mt-2.5 max-h-64 overflow-auto rounded-lg bg-panel-2 p-2.5 font-mono text-[11px] leading-relaxed text-ink-2">
                        {JSON.stringify({ event: d.event, delivery: d.id, ...d.payload }, null, 2)}
                      </pre>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function timeOf(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : iso;
}
