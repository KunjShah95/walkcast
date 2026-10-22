import { useEffect, useState, type FormEvent } from "react";
import { Button, Empty, PageHead, Panel, PanelHeader, Stamp, fieldClass } from "../components/ui.tsx";
import { createSchedule, deleteSchedule, isSnapshot, loadSchedules, type Schedule } from "../lib/api.ts";
import { ago, cn } from "../lib/format.ts";

const PRESETS = [
  { id: "hourly", label: "Every hour", interval: "0 * * * *" },
  { id: "six-hours", label: "Every 6 hours", interval: "0 */6 * * *" },
  { id: "daily", label: "Every day at 09:00", interval: "0 9 * * *" },
  { id: "weekly", label: "Every Monday at 09:00", interval: "0 9 * * 1" },
  { id: "custom", label: "Custom cadence", interval: "30m" },
] as const;

const INTERVAL_LABEL: Record<string, string> = {
  "0 * * * *": "Every hour, on the hour",
  "0 */6 * * *": "Every 6 hours",
  "0 9 * * *": "Every day at 09:00",
  "0 9 * * 1": "Every Monday at 09:00",
  "@hourly": "Every hour, on the hour",
  "@daily": "Every day at midnight",
  "@weekly": "Every Sunday at midnight",
};

/**
 * Recurring recordings.
 *
 * The value of a schedule is not another video: it is the comparison. Each run opens the same
 * site, so the Library's "What changed" panel has a fresh visit to compare with the last one.
 * The server keeps the cadence as written, and cron fires on the calendar in the server's local
 * time, so the form offers the useful cases first and stays out of the way for the rest.
 */
export function Schedules() {
  const [items, setItems] = useState<Schedule[]>([]);
  const [url, setUrl] = useState("");
  const [preset, setPreset] = useState<(typeof PRESETS)[number]["id"]>("daily");
  const [custom, setCustom] = useState("30m");
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(!isSnapshot);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (isSnapshot) return;
    setLoading(true);
    try {
      setItems(await loadSchedules());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!url.trim()) {
      setError("Add the site you want to record.");
      return;
    }
    if (!authorized) {
      setError("Confirm you are allowed to record this site.");
      return;
    }
    const chosen = PRESETS.find((p) => p.id === preset)!;
    const interval = preset === "custom" ? custom.trim() : chosen.interval;
    if (!interval) {
      setError("Add a cadence: a duration like 30m, or five-field cron.");
      return;
    }
    setBusy(true);
    try {
      setItems(await createSchedule({ url: url.trim(), interval, authorized }));
      setUrl("");
      setAuthorized(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (schedule: Schedule) => {
    setRemoving(schedule.id);
    setError(null);
    try {
      setItems(await deleteSchedule(schedule.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemoving(null);
    }
  };

  if (isSnapshot) {
    return (
      <div className="grid gap-4">
        <PageHead title="Scheduled" dim="recordings" description="Record the same site on a cadence, then read what changed in the Library." />
        <Panel className="p-4 text-[13px] text-ink-3">Schedules need the live server. This snapshot only carries the recordings it was built with.</Panel>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <PageHead
        title="Scheduled"
        dim="recordings"
        description="Walkcast records up to 8 pages on this computer's clock. Each visit lands in the Library, where What changed compares it with the last one."
        actions={<Stamp tone="muted">{items.length} of 20</Stamp>}
      />

      {error && <div className="rounded-xl border border-fail/30 bg-fail-soft px-4 py-3 text-[13px] text-fail">{error}</div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Panel>
          <PanelHeader title="Add a schedule" eyebrow="The recorder uses the default voice, length and page limit." />
          <form onSubmit={create} className="grid gap-3 p-4">
            <label className="grid gap-1 text-[12.5px] text-ink-2">
              Site URL
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className={fieldClass}
                autoComplete="url"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-[12.5px] text-ink-2">
                Cadence
                <select value={preset} onChange={(e) => setPreset(e.target.value as typeof preset)} className={fieldClass}>
                  {PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-[12.5px] text-ink-2">
                {preset === "custom" ? "Duration or cron" : "On the calendar"}
                {preset === "custom" ? (
                  <input
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    placeholder="30m or 0 9 * * 1"
                    className={cn(fieldClass, "font-mono")}
                    spellCheck={false}
                  />
                ) : (
                  <span className="flex h-[38px] items-center rounded-lg border border-line bg-panel-2 px-3 font-mono text-[12.5px] text-ink-2">
                    {PRESETS.find((p) => p.id === preset)!.interval}
                  </span>
                )}
              </label>
            </div>
            <p className="text-[11.5px] leading-snug text-ink-3">
              Durations: 30m, 6h, 1d. Cron is five fields (minute hour day month weekday) in this computer's local time, for example{" "}
              <span className="font-mono">0 9 * * 1</span>.
            </p>
            <label className="flex items-start gap-2 text-[13px] leading-snug">
              <input type="checkbox" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} className="mt-0.5" />
              <span>I am authorized to record this site.</span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" tone="primary" disabled={busy}>
                {busy ? "Adding…" : "Add schedule"}
              </Button>
              <span className="text-[11.5px] text-ink-3">Runs while the app (or server) is open.</span>
            </div>
          </form>
        </Panel>

        <Panel>
          <PanelHeader title="Active schedules" eyebrow={items.length ? `${items.length} of 20 used` : "Nothing scheduled yet"} />
          {loading ? (
            <p className="p-4 text-[13px] text-ink-3">Reading schedules…</p>
          ) : items.length === 0 ? (
            <Empty title="No schedules yet" tone="signal">
              Add a URL and a cadence on the left. The first visit will show up in the Library like any other recording.
            </Empty>
          ) : (
            <ul>
              {items.map((s) => (
                <li key={s.id} className="flex flex-wrap items-start gap-3 border-t border-line px-4 py-3 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[13px] font-medium">{hostOf(s.url)}</span>
                      <Stamp tone={s.authorized ? "pass" : "muted"}>{s.authorized ? "Active" : "Paused"}</Stamp>
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[11.5px] text-ink-3" title={s.url}>
                      {s.url}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-3">
                      <span>{humanInterval(s)}</span>
                      <span>last run {s.lastRunAt ? ago(Date.parse(s.lastRunAt)) : "not yet"}</span>
                      <span>added {ago(Date.parse(s.createdAt))}</span>
                    </div>
                  </div>
                  <Button
                    tone="danger"
                    size="sm"
                    onClick={() => remove(s)}
                    disabled={removing === s.id}
                    aria-label={`Remove schedule for ${s.url}`}
                  >
                    {removing === s.id ? "Removing…" : "Remove"}
                  </Button>
                </li>
              ))}
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

/** The stored cadence, read the way it was chosen. Unknown cron stays in mono-friendly form. */
function humanInterval(s: Schedule): string {
  const known = INTERVAL_LABEL[s.interval];
  if (known) return known;
  if (s.interval.startsWith("@")) return s.interval;
  const cron = s.interval.trim().split(/\s+/).length === 5;
  return cron ? `Cron ${s.interval}` : `Every ${s.interval}`;
}
