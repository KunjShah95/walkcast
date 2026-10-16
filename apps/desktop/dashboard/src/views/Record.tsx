import { useEffect, useState } from "react";
import type { Route } from "../App.tsx";
import { normalizeUrl } from "../components/RecordBar.tsx";
import { VoicePicker, hostOf } from "../components/Studio.tsx";
import { Button, PageHead, Panel, Stamp, fieldClass } from "../components/ui.tsx";
import { type Capabilities, type JobStatus, SignInRequired, isSnapshot, loadCapabilities, loadMe, startRecording } from "../lib/api.ts";
import { ago, cn, formatElapsed } from "../lib/format.ts";
import { usePrefs } from "../lib/prefs.ts";
import type { LabIndex } from "../lib/types.ts";

type Attempt = { url: string; status: "running" | "failed"; message: string; at: number };

/**
 * Paste a link, get a narrated walkthrough. The form is the whole page: link, optional sign-in,
 * how far to walk, which voice. While it records, the job panel shows what the browser is doing.
 */
export function Record({ index, refresh, initialUrl, go }: { index: LabIndex; refresh: () => Promise<LabIndex>; initialUrl?: string; go: (r: Route) => void }) {
  const [prefs] = usePrefs();
  const [url, setUrl] = useState(initialUrl ?? "");
  const [signIn, setSignIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [maxPages, setMaxPages] = useState(prefs.maxPages);
  const [voice, setVoice] = useState(prefs.voice);
  const [authorized, setAuthorized] = useState(false);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [needsAccount, setNeedsAccount] = useState(false);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const busy = job !== null;

  useEffect(() => {
    if (isSnapshot) return;
    loadCapabilities().then(setCaps);
    loadMe().then((me) => setNeedsAccount(Boolean(me && me.authRequired && !me.user)));
  }, []);
  useEffect(() => {
    if (initialUrl) setUrl(initialUrl);
  }, [initialUrl]);

  const target = normalizeUrl(url);
  const limitHit = caps?.limits && caps.usage ? caps.usage.recordingsToday >= caps.limits.recordingsPerDay : false;
  const blocked = isSnapshot ? "This is a snapshot: it plays recordings but can't make new ones." : (caps?.jobsUnavailable ?? (limitHit ? "You've reached today's recording limit. It resets 24 hours after your oldest recording today." : null));
  const ready = Boolean(target) && authorized && !blocked && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || !target) return;
    setError(null);
    const attempt: Attempt = { url: target, status: "running", message: "Starting", at: Date.now() };
    setAttempts((a) => [attempt, ...a]);
    try {
      const dir = await startRecording({ url: target, ...(signIn ? { username, password } : {}), maxPages, authorized, voice }, (s) => setJob(s));
      setPassword("");
      setAttempts((a) => a.filter((x) => x !== attempt));
      await refresh();
      go({ view: "library", dir: dir.split("/").pop() ?? dir });
    } catch (err) {
      if (err instanceof SignInRequired) setNeedsAccount(true);
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setAttempts((a) => a.map((x) => (x === attempt ? { ...x, status: "failed", message } : x)));
    } finally {
      setJob(null);
    }
  };

  const recent = (index.recordings ?? []).slice(0, 4);

  return (
    <div className="grid gap-6">
      <PageHead title="Record a walkthrough" description="Paste a link. A real browser walks the site and narrates what it actually did, line by line, with captions and a transcript." />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel className="overflow-hidden">
          <form onSubmit={submit} className="grid gap-5 p-5 sm:p-6">
            <div className="relative grid gap-2">
              <label htmlFor="rec-url" className="text-[13px] font-medium">
                Website link
              </label>
              <input
                id="rec-url"
                type="text"
                inputMode="url"
                spellCheck={false}
                placeholder="app.example.com/login"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={busy || isSnapshot}
                className={cn(fieldClass, "h-12 font-mono text-[15px]")}
              />
              {url && !target && <p className="text-[12.5px] text-fail">That doesn't look like a web address.</p>}
            </div>

            <div className="grid gap-3 rounded-xl border border-line p-4">
              <label className="flex items-center justify-between gap-3">
                <span>
                  <span className="block text-[13px] font-medium">The site needs a sign-in</span>
                  <span className="block text-[12.5px] text-ink-3">Walkcast signs in first, then walks the pages behind it.</span>
                </span>
                <Toggle on={signIn} onChange={setSignIn} disabled={busy} label="The site needs a sign-in" />
              </label>
              {signIn && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5">
                    <span className="eyebrow">Username or email</span>
                    <input autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} disabled={busy} className={fieldClass} />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="eyebrow">Password</span>
                    <span className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={busy}
                        className={cn(fieldClass, "pr-14")}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute right-1 top-1/2 inline-flex h-8 -translate-y-1/2 items-center justify-center rounded-md px-2 text-[12px] font-medium text-ink-3 hover:text-ink"
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </span>
                  </label>
                  <p className="flex items-center gap-1.5 text-[12px] text-ink-3 sm:col-span-2">
                    Kept in memory only. Traces and captions show a placeholder, never the password.
                  </p>
                </div>
              )}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="grid content-start gap-2">
                <div className="flex items-baseline justify-between">
                  <label htmlFor="rec-pages" className="text-[13px] font-medium">
                    Pages to walk
                  </label>
                  <span className="font-mono text-[13px] text-ink">{maxPages}</span>
                </div>
                <input id="rec-pages" type="range" min={1} max={30} value={maxPages} onChange={(e) => setMaxPages(Number(e.target.value))} disabled={busy} />
                <p className="text-[12px] text-ink-3">Stops sooner if the site has fewer pages to reach.</p>
              </div>
              <div className="grid content-start gap-2">
                <span className="text-[13px] font-medium">Narration voice</span>
                <VoicePicker value={voice} onChange={setVoice} available={Boolean(caps?.voices?.available)} />
              </div>
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-line bg-paper/40 p-4 text-[13px]">
              <input type="checkbox" className="mt-0.5 size-4" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} disabled={busy || isSnapshot} />
              <span className="text-ink-2">
                <span className="font-medium text-ink">I own this site or am authorized to test it.</span> The recorder stops at CAPTCHAs and 2FA, submits no
                forms after sign-in, and skips sign-out and delete links.
              </span>
            </label>

            {needsAccount && (
              <p className="rounded-xl border border-line bg-panel-2 px-4 py-3 text-[13px] text-ink-2">
                Recording needs an account.{" "}
                <a className="font-medium text-signal underline" href={`/signup?next=${encodeURIComponent(`/app#record?url=${encodeURIComponent(url)}`)}`}>
                  Create one
                </a>{" "}
                or{" "}
                <a className="font-medium text-signal underline" href={`/login?next=${encodeURIComponent(`/app#record?url=${encodeURIComponent(url)}`)}`}>
                  sign in
                </a>
                .
              </p>
            )}
            {blocked && (
              <p className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[13px] text-warn">
                {blocked}
              </p>
            )}
            {error && <p className="rounded-xl border border-fail/30 bg-fail-soft px-4 py-3 text-[13px] text-fail">{error}</p>}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[12.5px] text-ink-3">
                {caps?.limits && caps.usage ? `${caps.usage.recordingsToday} of ${caps.limits.recordingsPerDay} recordings used today` : " "}
              </span>
              <Button type="submit" tone="primary" disabled={!ready} className="h-11 px-5 text-[14px]">
                <span className={cn("size-2 rounded-full bg-rec", busy && "rec-light")} />
                {busy ? "Recording…" : "Record with narration"}
              </Button>
            </div>
          </form>
        </Panel>

        <div className="grid gap-4 lg:sticky lg:top-20">
          <JobPanel job={job} target={target} />
          {attempts.filter((a) => a.status === "failed").length > 0 && (
            <Panel>
              <h3 className="border-b border-line px-4 py-3 text-[14.5px] font-semibold">This session</h3>
              <ul className="divide-y divide-line">
                {attempts
                  .filter((a) => a.status === "failed")
                  .map((a, i) => (
                    <li key={i} className="grid gap-1 px-4 py-3">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-[12.5px]">{hostOf(a.url)}</span>
                        <Stamp tone="fail">Failed</Stamp>
                      </span>
                      <span className="text-[12px] text-ink-3">{a.message}</span>
                    </li>
                  ))}
              </ul>
            </Panel>
          )}
          {recent.length > 0 && (
            <Panel>
              <h3 className="border-b border-line px-4 py-3 text-[14.5px] font-semibold">Recent walkthroughs</h3>
              <ul className="divide-y divide-line">
                {recent.map((r) => (
                  <li key={r.dir}>
                    <button type="button" onClick={() => go({ view: "library", dir: r.id })} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-panel-2">
                      <span className="truncate text-[13px]">{hostOf(r.url)}</span>
                      <span className="shrink-0 font-mono text-[11px] text-ink-3">{ago(Date.parse(r.createdAt))}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

const STAGES = ["Queued", "Opening", "Signing in", "Walking pages", "Narrating", "Saving"];

function stageOf(job: JobStatus): number {
  if (job.status === "queued") return 0;
  const p = (job.progress ?? "").toLowerCase();
  if (p.includes("sav")) return 5;
  if (p.includes("narrat") || p.includes("encod") || p.includes("voice")) return 4;
  if (p.includes("page")) return 3;
  if (p.includes("sign")) return 2;
  return 1;
}

/** What the recorder is doing right now. */
function JobPanel({ job, target }: { job: JobStatus | null; target: string | null }) {
  const stage = job ? stageOf(job) : -1;
  // A clock that ticks every second, so a queued or running job never looks frozen even if its
  // stage label hasn't changed.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!job || job.status === "succeeded" || job.status === "failed") return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [job?.id, job?.status]);
  const anchor = job?.startedAt || job?.createdAt;
  const elapsedSec = anchor ? Math.max(0, Math.floor((now - Date.parse(anchor)) / 1000)) : 0;
  return (
    <Panel className={cn("overflow-hidden", job && "border-ink")}>
      <div className="relative overflow-hidden px-5 pb-5 pt-5">
        <div className="relative">
          <div className="flex items-center gap-2">
            <span className={cn("size-2.5 rounded-full", job ? "rec-light bg-rec" : "bg-panel-3")} />
            <h3 className="text-[14.5px] font-semibold">{job ? "Recording" : "Ready to record"}</h3>
            {job && (job.status === "queued" || job.status === "running") && (
              <span className="ml-auto font-mono text-[11.5px] text-ink-3">{formatElapsed(elapsedSec)}</span>
            )}
          </div>
          <p className="mt-1 truncate font-mono text-[12.5px] text-ink-3">{target ? hostOf(target) : "No link yet"}</p>
          <ol className="mt-4 grid gap-2.5">
            {STAGES.map((s, i) => (
              <li key={s} className="flex items-center gap-3 text-[13px]">
                <span
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full border font-mono text-[10px]",
                    i < stage ? "border-signal bg-signal text-white" : i === stage ? "border-signal text-signal" : "border-line-strong text-ink-3",
                  )}
                >
                  {i + 1}
                </span>
                <span className={cn(i <= stage ? "text-ink" : "text-ink-3")}>{s}</span>
                {i === stage && job?.progress && <span className="ml-auto truncate font-mono text-[11.5px] text-ink-3">{job.progress}</span>}
              </li>
            ))}
          </ol>
          {job?.status === "queued" && (
            <p className="mt-4 flex items-center gap-2 font-mono text-[11.5px] text-ink-3">
              {job.queue
                ? job.queue.ahead === 0
                  ? "Next up — starting shortly"
                  : `${job.queue.ahead} job${job.queue.ahead === 1 ? "" : "s"} ahead of you`
                : "In the queue"}
              {job.queue && job.queue.waitingMs > 20_000 && (
                <span>· waiting {formatElapsed(Math.floor(job.queue.waitingMs / 1000))}</span>
              )}
            </p>
          )}
          {job && (job.status === "queued" || job.status === "running") && (
            <p className="mt-2 text-[11.5px] text-ink-3">
              You can close this page — the recording finishes in the background and appears in your library.
            </p>
          )}
          {!job && (
            <p className="mt-4 flex items-start gap-2 text-[12.5px] text-ink-3">
              Every line of narration comes from an action the browser actually took.
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}

export function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-50", on ? "bg-signal-strong" : "bg-panel-3")}
    >
      <span className={cn("absolute left-0 top-0.5 size-5 rounded-full bg-white shadow transition-transform", on ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}

