import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Download, Film, LoaderCircle, Play, Sparkles, Volume2 } from "lucide-react";
import type { Route } from "../App.tsx";
import { Empty, PageHead, fieldClass } from "../components/ui.tsx";
import { type DesktopTaskStatus, type TtsProviderInfo, loadDesktopTask, loadTtsProviders, recordingAssetUrl, setupLaunchVoice, startLaunchVideo } from "../lib/api.ts";
import type { LabIndex } from "../lib/types.ts";
import { ago, ms } from "../lib/format.ts";

const FALLBACK_VOICES = [
  { id: "af_heart", name: "Heart · American English" },
  { id: "af_bella", name: "Bella · American English" },
  { id: "am_michael", name: "Michael · American English" },
  { id: "bf_emma", name: "Emma · British English" },
];

export function LaunchStudio({ index, go, refresh }: { index: LabIndex; go: (route: Route) => void; refresh: () => Promise<LabIndex> }) {
  const recordings = useMemo(() => (index.recordings ?? []).filter((recording) => {
    try {
      const host = new URL(recording.url).hostname.toLowerCase();
      const paths = recording.pages.map((page) => new URL(page.url).pathname.toLowerCase());
      const hasLab = paths.some((path) => path === "/lab" || path.startsWith("/lab/"));
      const hasDownload = paths.some((path) => path === "/download" || path.startsWith("/download/"));
      return (host === "walkcast.kunjshah.in" || host === "www.walkcast.kunjshah.in") && hasLab && hasDownload && recording.durationMs >= 60_000 && Boolean(recording.media.mp4 || recording.media.video);
    } catch {
      return false;
    }
  }), [index.recordings]);
  const [selected, setSelected] = useState(recordings[0]?.id ?? "");
  const [voice, setVoice] = useState("af_heart");
  const [providers, setProviders] = useState<TtsProviderInfo[]>([]);
  const [task, setTask] = useState<DesktopTaskStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recordings.some((recording) => recording.id === selected)) setSelected(recordings[0]?.id ?? "");
  }, [recordings, selected]);
  useEffect(() => { void loadTtsProviders().then(setProviders); }, []);
  useEffect(() => {
    if (!task || task.status !== "running") return;
    const timer = window.setInterval(() => {
      void loadDesktopTask(task.id).then((next) => {
        setTask(next);
        if (next.status === "complete") {
          void refresh();
          if (next.kind === "kokoro-setup") void loadTtsProviders().then(setProviders);
        }
      }, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    }, 1500);
    return () => window.clearInterval(timer);
  }, [task?.id, task?.status, refresh]);

  const recording = recordings.find((item) => item.id === selected);
  const kokoro = providers.find((provider) => provider.id === "kokoro");
  const voices = kokoro?.voices.length ? kokoro.voices : FALLBACK_VOICES;
  const busy = task?.status === "running";
  const latest = recording?.media.launchVideos?.[0];

  const run = async (action: () => Promise<DesktopTaskStatus>) => {
    setError(null);
    try { setTask(await action()); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div className="grid gap-6">
      <PageHead title="Launch" dim="Studio." description="Turn a fresh Walkcast recording into a complete product-launch film." />

      <section className="studio-card relative overflow-hidden rounded-[26px] border p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-signal/10 blur-3xl" />
        <div className="relative grid gap-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(290px,.85fr)] lg:items-center">
          <div className="grid gap-5">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-signal/20 bg-signal-soft px-3 py-1.5 text-[12px] font-medium text-signal">
              <Sparkles className="h-3.5 w-3.5" /> 1080p · 30 fps · Kokoro voice
            </div>
            <div className="grid gap-3">
              <h1 className="max-w-2xl text-[clamp(30px,4vw,48px)] font-semibold leading-[1.02] tracking-[-.055em]">Make the launch film.<br /><span className="text-ink-3">Keep the craft.</span></h1>
              <p className="max-w-xl text-[15px] leading-7 text-ink-2">A designed 88-second Walkcast film: fresh site footage, a custom motion story, locally generated narration, original music, synced sound effects, and captions.</p>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-ink-3">
              <span className="inline-flex items-center gap-1.5"><Film className="h-3.5 w-3.5" /> Motion and chapter cards</span>
              <span className="inline-flex items-center gap-1.5"><Volume2 className="h-3.5 w-3.5" /> Ducking and mastered mix</span>
              <span>MP4 + VTT captions</span>
            </div>
          </div>

          <div className="grid gap-4 rounded-2xl border border-line bg-paper/80 p-4 sm:p-5">
            {recordings.length ? <>
              <label className="grid gap-1.5 text-[12px] font-medium text-ink-2">
                Fresh source recording
                <select className={fieldClass} value={selected} onChange={(e) => setSelected(e.target.value)} disabled={busy}>
                  {recordings.map((item) => <option key={item.id} value={item.id}>{new URL(item.url).hostname} · {item.pages.length} pages · {ms(item.durationMs)} · {ago(Date.parse(item.createdAt))}</option>)}
                </select>
              </label>
              <label className="grid gap-1.5 text-[12px] font-medium text-ink-2">
                Kokoro narrator
                <select className={fieldClass} value={voice} onChange={(e) => setVoice(e.target.value)} disabled={busy}>
                  {voices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              {kokoro?.configured ? (
                <div className="flex items-center justify-between gap-3 rounded-xl bg-pass-soft px-3 py-2 text-[12px] text-pass">
                  <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5" /> Kokoro is installed on this computer</span>
                  <button type="button" disabled={busy} onClick={() => void run(setupLaunchVoice)} className="font-medium underline decoration-pass/40 underline-offset-2 disabled:opacity-50">Prepare model</button>
                </div>
              ) : (
                <button type="button" disabled={busy} onClick={() => void run(setupLaunchVoice)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-line px-3 py-2.5 text-[13px] font-medium text-ink-2 hover:bg-panel-2 disabled:opacity-50">
                  {busy && task?.kind === "kokoro-setup" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />} Set up Kokoro locally
                </button>
              )}
              <button type="button" disabled={!recording || busy} onClick={() => recording && void run(() => startLaunchVideo(recording.id, voice))} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-solid px-4 text-[14px] font-semibold text-on-solid shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
                {busy && task?.kind === "launch-video" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />} Generate launch film <ArrowRight className="h-4 w-4" />
              </button>
              <p className="text-[11.5px] leading-5 text-ink-3">For the full story, record walkcast.kunjshah.in from Home through Download and Lab in one fresh walkthrough. Rendering happens on this computer.</p>
            </> : (
              <div className="grid gap-4">
                <div className="grid gap-1">
                  <h2 className="text-[15px] font-semibold">Record the source first</h2>
                  <p className="text-[12.5px] leading-5 text-ink-3">Capture Home, Download, and Lab in one Walkcast walkthrough. A fresh recording of at least one minute appears here automatically.</p>
                </div>
                <button type="button" onClick={() => go({ view: "record", url: "https://walkcast.kunjshah.in/" })} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-solid px-4 text-[13.5px] font-semibold text-on-solid hover:brightness-110">
                  Record Walkcast now <ArrowRight className="h-4 w-4" />
                </button>
                <p className="text-[11px] leading-5 text-ink-3">Existing recordings of other websites stay in Library; this launch-film template is the Walkcast product story.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {error && <p role="alert" className="rounded-xl border border-fail/30 bg-fail-soft px-4 py-3 text-[13px] text-fail">{error}</p>}
      {task && <section className="grid gap-3 rounded-2xl border border-line bg-panel p-4 sm:p-5" aria-live="polite">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[13px] font-medium">
            {task.status === "running" ? <LoaderCircle className="h-4 w-4 animate-spin text-signal" /> : task.status === "complete" ? <Check className="h-4 w-4 text-pass" /> : <span className="h-2 w-2 rounded-full bg-fail" />}
            {task.status === "failed" ? "Video generation stopped" : task.message}
          </div>
          <span className="font-mono text-[12px] text-ink-3">{task.progress}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-panel-3"><div className="h-full rounded-full bg-signal transition-[width] duration-700" style={{ width: `${task.progress}%` }} /></div>
        {task.error && <p className="text-[12.5px] text-fail">{task.error}</p>}
      </section>}

      {recording && latest && <section className="grid gap-4 rounded-2xl border border-line bg-panel p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-[15px] font-semibold">Your latest launch film</h2><p className="mt-1 text-[12px] text-ink-3">Generated {ago(Date.parse(latest.createdAt))} · {latest.voice}</p></div>
          <a href={recordingAssetUrl(recording.id, latest.video)} download className="inline-flex h-9 items-center gap-2 rounded-full border border-line px-3 text-[12px] font-medium hover:bg-panel-2"><Download className="h-3.5 w-3.5" /> Download MP4</a>
        </div>
        <video key={latest.id} controls playsInline poster={recordingAssetUrl(recording.id, latest.poster)} className="aspect-video w-full rounded-xl bg-black">
          <source src={recordingAssetUrl(recording.id, latest.video)} type="video/mp4" />
          <track kind="captions" src={recordingAssetUrl(recording.id, latest.captions)} srcLang="en" label="English" default />
        </video>
      </section>}

      {!recordings.length && <Empty title="No fresh Walkcast recording yet" tone="signal" icon={<Film />}>Record the Walkcast site first, then Launch Studio will build the motion film from that new capture.</Empty>}
    </div>
  );
}
