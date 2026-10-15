import { Download, Film, Link2, LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Empty, Panel, PanelHeader } from "../components/ui.tsx";
import { SignInRequired, isSnapshot, loadCapabilities, loadMe, mediaUrl, startRecording } from "../lib/api.ts";
import { ago, cn, ms } from "../lib/format.ts";
import type { LabIndex, RecordingSummary } from "../lib/types.ts";

const OUTCOME: Record<string, { text: string; tone: string }> = {
  "signed-in": { text: "Signed in", tone: "bg-pass-soft text-pass" },
  "not-attempted": { text: "No sign-in", tone: "bg-panel-2 text-ink-2" },
  rejected: { text: "Sign-in rejected", tone: "bg-fail-soft text-fail" },
  captcha: { text: "Stopped at CAPTCHA", tone: "bg-fail-soft text-fail" },
  "mfa-required": { text: "Stopped at 2FA", tone: "bg-fail-soft text-fail" },
  "no-form": { text: "No sign-in form", tone: "bg-fail-soft text-fail" },
};

/**
 * Paste a site's URL (and sign-in details), get back a narrated video of the whole visit:
 * the browser video with a spoken track and captions, plus the pages visited.
 */
export function Record({ index, refresh, initialUrl }: { index: LabIndex; refresh: () => Promise<LabIndex>; initialUrl?: string }) {
  const recordings = index.recordings ?? [];
  const [selected, setSelected] = useState<string | null>(recordings[0]?.dir ?? null);
  const current = recordings.find((r) => r.dir === selected) ?? recordings[0];

  return (
    <div className="grid gap-4">
      <div>
        <div className="eyebrow">{recordings.length} recorded</div>
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight">Record a site</h1>
        <p className="mt-1 max-w-[68ch] text-[14px] text-ink-2">
          Paste the link of a site you sign in to. The lab signs in, walks its pages, and gives you a video with spoken narration
          and captions of everything it did.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="grid content-start gap-4">
          <RecordForm
            initialUrl={initialUrl ?? ""}
            onDone={async (dir) => {
              await refresh();
              setSelected(dir);
            }}
          />
          {recordings.length > 0 && (
            <Panel>
              <PanelHeader eyebrow="Library" title="Recordings" />
              <ul className="divide-y divide-line">
                {recordings.map((r) => (
                  <li key={r.dir}>
                    <button
                      type="button"
                      onClick={() => setSelected(r.dir)}
                      aria-current={current?.dir === r.dir ? "true" : undefined}
                      className={cn("grid w-full gap-0.5 px-4 py-2.5 text-left hover:bg-panel-2", current?.dir === r.dir && "bg-panel-2")}
                    >
                      <span className="truncate font-mono text-[12.5px]">{r.url}</span>
                      <span className="text-[12px] text-ink-3">
                        {OUTCOME[r.signIn.outcome]?.text ?? r.signIn.outcome} · {r.pages.length} pages · {ago(Date.parse(r.createdAt))}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
        {current ? <Player recording={current} /> : <Empty title="No recordings yet">Paste a link on the left to make the first one.</Empty>}
      </div>
    </div>
  );
}

function RecordForm({ onDone, initialUrl }: { onDone: (dir: string) => Promise<void>; initialUrl: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [maxPages, setMaxPages] = useState(8);
  const [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverBusy, setServerBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!isSnapshot) {
      loadCapabilities().then((c) => setServerBusy(c.running ?? null));
      loadMe().then((me) => setNeedsSignIn(Boolean(me && me.authRequired && !me.user)));
    }
  }, []);
  useEffect(() => {
    if (initialUrl) setUrl(initialUrl);
  }, [initialUrl]);

  const valid = /^https?:\/\/\S+$/i.test(url.trim()) && authorized;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const dir = await startRecording({ url: url.trim(), username, password, maxPages, authorized }, (job) =>
        setStatus(job.status === "queued" ? "Waiting for a free recorder…" : (job.progress ?? "Recording…")),
      );
      setPassword("");
      await onDone(dir);
    } catch (err) {
      if (err instanceof SignInRequired) setNeedsSignIn(true);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setStatus(null);
    }
  };

  const field = "w-full rounded-lg border border-line bg-paper px-3 py-2 text-[13.5px] outline-none focus:border-signal disabled:opacity-60";
  return (
    <Panel>
      <PanelHeader eyebrow="New recording" title="Paste a link" />
      <form onSubmit={submit} className="grid gap-3 px-4 py-4">
        {isSnapshot && (
          <p className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-[12.5px] text-ink-2">
            This is a snapshot, so it can play recordings but not make new ones. Run <code className="font-mono">npm run lab -- ui</code> to
            record from here, or <code className="font-mono">npm run lab -- record --url …</code> from the terminal.
          </p>
        )}
        <label className="grid gap-1">
          <span className="eyebrow">Website link</span>
          <span className="relative">
            <Link2 className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <input
              type="url"
              required
              inputMode="url"
              placeholder="https://app.example.com/login"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isSnapshot || busy}
              className={cn(field, "pl-8 font-mono")}
            />
          </span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1">
            <span className="eyebrow">Username or email</span>
            <input autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} disabled={isSnapshot || busy} className={field} />
          </label>
          <label className="grid gap-1">
            <span className="eyebrow">Password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSnapshot || busy}
              className={field}
            />
          </label>
        </div>
        <label className="grid gap-1">
          <span className="eyebrow">Pages to visit · {maxPages}</span>
          <input type="range" min={1} max={30} value={maxPages} onChange={(e) => setMaxPages(Number(e.target.value))} disabled={isSnapshot || busy} />
        </label>
        <label className="flex items-start gap-2 text-[12.5px] text-ink-2">
          <input type="checkbox" className="mt-0.5" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} disabled={isSnapshot || busy} />
          <span>I own this site or am authorized to test it. The recorder stops at CAPTCHAs and 2FA, submits no forms after sign-in, and skips sign-out and delete links.</span>
        </label>
        <p className="flex items-center gap-1.5 text-[12px] text-ink-3">
          <ShieldCheck className="size-3.5" aria-hidden /> The password stays in memory; traces and captions show it as a placeholder.
        </p>
        {needsSignIn && (
          <p className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-[12.5px] text-ink-2">
            Recording needs an account.{" "}
            <a className="font-medium text-ink underline" href={`/signup?next=${encodeURIComponent(`/app#record?url=${encodeURIComponent(url)}`)}`}>
              Create one
            </a>{" "}
            or{" "}
            <a className="font-medium text-ink underline" href={`/login?next=${encodeURIComponent(`/app#record?url=${encodeURIComponent(url)}`)}`}>
              sign in
            </a>
            , with Google or email.
          </p>
        )}
        {serverBusy && <p className="text-[12.5px] text-ink-2">Server busy: {serverBusy}</p>}
        {error && <p className="rounded-lg border border-fail/40 bg-fail-soft px-3 py-2 text-[12.5px] text-fail">{error}</p>}
        <button
          type="submit"
          disabled={isSnapshot || !valid || busy}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-3 py-2 text-[13.5px] font-medium text-paper disabled:opacity-40"
        >
          {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Film className="size-4" aria-hidden />}
          {busy ? (status ?? "Starting…") : "Record with narration"}
        </button>
      </form>
    </Panel>
  );
}

function Player({ recording: r }: { recording: RecordingSummary }) {
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  // MP4 (H.264) first; the narrated WebM covers browsers built without H.264.
  const sources = (
    [
      [r.media.mp4, "video/mp4"],
      [r.media.webm, "video/webm"],
      [r.media.mp4 || r.media.webm ? null : r.media.video, "video/webm"],
    ] as const
  ).flatMap(([file, type]) => {
    const url = file ? mediaUrl(r.dir, file) : undefined;
    return url ? [{ url, type }] : [];
  });
  const vtt = mediaUrl(r.dir, r.media.captions);
  const outcome = OUTCOME[r.signIn.outcome] ?? { text: r.signIn.outcome, tone: "bg-panel-2 text-ink-2" };
  const active = r.captions.findIndex((c) => time >= c.start && time < c.end);

  return (
    <div className="grid min-w-0 content-start gap-4">
      <Panel className="overflow-hidden">
        <PanelHeader
          eyebrow={new URL(r.url).host}
          title={<span className="break-all">{r.url}</span>}
          aside={<span className={cn("rounded-full px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wider", outcome.tone)}>{outcome.text}</span>}
        />
        {sources.length ? (
          <video
            key={r.dir}
            ref={video}
            controls
            playsInline
            preload="metadata"
            className="aspect-[16/10] w-full bg-ink"
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          >
            {sources.map((s, i) => (
              <source key={i} src={s.url} type={s.type} />
            ))}
            {vtt && <track kind="captions" src={vtt} srcLang="en" label="Narration" default />}
          </video>
        ) : (
          <p className="px-4 py-6 text-[13px] text-ink-3">The video for this recording is not included here. {r.media.note}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-2.5 text-[12.5px] text-ink-2">
          <span>{r.signIn.detail}</span>
          <span className="font-mono text-ink-3">
            {r.pages.length} pages · {ms(r.durationMs)} · {r.media.voice === "flite" ? "spoken narration" : "captions only"}
          </span>
          <span className="ml-auto flex gap-2">
            {(
              [
                [r.media.mp4, "MP4"],
                [r.media.captions, "Captions"],
                [r.media.audio, "Audio"],
              ] as const
            ).map(([file, label]) => {
              const href = file ? mediaUrl(r.dir, file) : undefined;
              return href ? (
                <a key={label} href={href} download={`${r.id}-${file}`} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 hover:bg-panel-2">
                  <Download className="size-3.5" aria-hidden />
                  {label}
                </a>
              ) : null;
            })}
          </span>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHeader eyebrow="Narration" title="Transcript" aside={<span className="font-mono text-[11px] text-ink-3">from recorded events</span>} />
          <ol className="max-h-[22rem] overflow-y-auto py-1">
            {r.captions.map((c, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => {
                    if (video.current) {
                      video.current.currentTime = c.start;
                      void video.current.play();
                    }
                  }}
                  className={cn("grid w-full grid-cols-[3.5rem_minmax(0,1fr)] gap-2 px-4 py-1.5 text-left text-[13px] hover:bg-panel-2", i === active && "bg-highlight/40")}
                >
                  <span className="tabular font-mono text-[11.5px] text-ink-3">{clock(c.start)}</span>
                  <span>{c.text}</span>
                </button>
              </li>
            ))}
          </ol>
        </Panel>
        <Panel>
          <PanelHeader eyebrow="Visited" title="Pages" />
          <ul className="divide-y divide-line">
            {r.pages.map((p, i) => (
              <li key={i} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-2 px-4 py-2">
                <span className={cn("font-mono text-[12px]", (p.status ?? 200) >= 400 ? "text-fail" : "text-ink-3")}>{p.status ?? "—"}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px]">{p.title || "(untitled)"}</span>
                  <span className="block truncate font-mono text-[11.5px] text-ink-3">{new URL(p.url).pathname}</span>
                </span>
              </li>
            ))}
          </ul>
          {r.skipped.length > 0 && (
            <details className="border-t border-line px-4 py-2 text-[12.5px] text-ink-2">
              <summary className="cursor-pointer">{r.skipped.length} link(s) skipped on purpose</summary>
              <ul className="mt-1 grid gap-0.5">
                {r.skipped.map((s, i) => (
                  <li key={i} className="truncate font-mono text-[11.5px]">
                    {new URL(s.url).pathname} — {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Panel>
      </div>
    </div>
  );
}

function clock(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
