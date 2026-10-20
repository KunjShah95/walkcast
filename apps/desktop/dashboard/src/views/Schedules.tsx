import { useEffect, useState } from "react";

interface Schedule {
  id: string;
  url: string;
  intervalMs: number;
  authorized: boolean;
  createdAt: string;
  lastRunAt?: string | null;
}

export function Schedules() {
  const [items, setItems] = useState<Schedule[]>([]);
  const [url, setUrl] = useState("");
  const [interval, setIntervalMs] = useState("60m");
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await fetch("/api/schedules");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const b = (await r.json()) as { schedules?: Schedule[] };
      setItems(b.schedules ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => { void load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const r = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, interval, authorized }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error ?? `HTTP ${r.status}`);
      setUrl("");
      setAuthorized(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async (id: string) => {
    try {
      const r = await fetch(`/api/schedules/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b?.error ?? `HTTP ${r.status}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="grid gap-6">
      <h1 className="text-[22px] font-semibold">Scheduled recordings</h1>
      <form onSubmit={create} className="grid gap-3 rounded-lg border border-line bg-panel p-4">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" className="rounded-md border border-line bg-panel-2 px-3 py-2 text-[13px]" />
        <label className="grid gap-1 text-[12.5px] text-ink-3">
          How often (30m, 6h, 1d)
          <input value={interval} onChange={(e) => setIntervalMs(e.target.value)} placeholder="60m" className="rounded-md border border-line bg-panel-2 px-3 py-2 text-[13px] text-ink" />
        </label>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} />
          I am authorized to record this site
        </label>
        <button type="submit" className="rounded-full bg-solid px-4 py-2 text-[13px] font-medium text-on-solid">Add schedule</button>
        {error && <p className="text-[12px] text-rec">{error}</p>}
      </form>
      <ul className="grid gap-2">
        {items.map((s) => (
          <li key={s.id} className="flex items-center justify-between rounded-lg border border-line bg-panel p-3">
            <div className="min-w-0">
              <div className="truncate text-[13px]">{s.url}</div>
              <div className="font-mono text-[11px] text-ink-3">every {every(s.intervalMs)} · {s.authorized ? "authorized" : "not authorized"}</div>
            </div>
            <button type="button" onClick={() => remove(s.id)} className="rounded-full border border-line px-3 py-1 text-[12px] hover:bg-panel-2">Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 3600000 → "60 min", 86400000 → "1 day": the stored milliseconds read as people set them. */
function every(ms: number): string {
  const units: [number, string][] = [[86_400_000, "day"], [3_600_000, "h"], [60_000, "min"], [1000, "s"]];
  for (const [size, name] of units) {
    if (ms >= size && ms % size === 0) {
      const n = ms / size;
      return name === "day" ? `${n} day${n === 1 ? "" : "s"}` : `${n} ${name}`;
    }
  }
  return `${Math.round(ms / 60_000)} min`;
}
