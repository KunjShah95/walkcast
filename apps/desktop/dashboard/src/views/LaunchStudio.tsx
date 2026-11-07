import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Download, Film, LoaderCircle, Play, Sparkles, Volume2, Globe2 } from "lucide-react";
import type { Route } from "../App.tsx";
import { normalizeUrl, RecordBar } from "../components/RecordBar.tsx";
import { Empty, PageHead, fieldClass } from "../components/ui.tsx";
import { type DesktopTaskStatus, type TtsProviderInfo, loadDesktopTask, loadTtsProviders, recordingAssetUrl, setupLaunchVoice, startLaunchVideo, uploadLaunchVoiceover } from "../lib/api.ts";
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
      return ["http:", "https:"].includes(new URL(recording.url).protocol) && recording.durationMs >= 15_000 && recording.pages.length > 0 && Boolean(recording.media.mp4 || recording.media.video);
    } catch {
      return false;
    }
  }), [index.recordings]);
  const [selected, setSelected] = useState(recordings[0]?.id ?? "");
  const [siteUrl, setSiteUrl] = useState("");
  const [voice, setVoice] = useState("af_heart");
  const [voiceProvider, setVoiceProvider] = useState<"kokoro" | "custom" | "none">("kokoro");
  const [customVoice, setCustomVoice] = useState("");
  const [pronunciation, setPronunciation] = useState("");
  const [narrationPace, setNarrationPace] = useState<"relaxed" | "balanced" | "brisk">("balanced");
  const [motionPace, setMotionPace] = useState<"calm" | "balanced" | "quick">("balanced");
  const [chapterCue, setChapterCue] = useState<-750 | 0 | 750>(0);
  const [tone, setTone] = useState<"polished" | "cinematic" | "playful">("polished");
  const [format, setFormat] = useState<"landscape" | "vertical" | "square">("landscape");
  const [providers, setProviders] = useState<TtsProviderInfo[]>([]);
  const [task, setTask] = useState<DesktopTaskStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refreshRef = useRef(refresh);

  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  useEffect(() => {
    if (!recordings.some((recording) => recording.id === selected)) setSelected(recordings[0]?.id ?? "");
  }, [recordings, selected]);
  useEffect(() => { void loadTtsProviders().then(setProviders); }, []);
  useEffect(() => {
    if (!task || task.status !== "running") return;
    let active = true;
    let requestInFlight = false;
    const poll = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const next = await loadDesktopTask(task.id);
        if (!active) return;
        setTask(next);
        if (next.status === "complete") {
          void refreshRef.current();
          if (next.kind === "kokoro-setup") void loadTtsProviders().then(setProviders);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : String(e));
      } finally {
        requestInFlight = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => { void poll(); }, 1500);
    return () => { active = false; window.clearInterval(timer); };
  }, [task?.id, task?.status]);

  const recording = recordings.find((item) => item.id === selected);
  const kokoro = providers.find((provider) => provider.id === "kokoro");
  const connectedVoice = providers.find((provider) => provider.id === "custom");
  const voices = kokoro?.voices.length ? kokoro.voices : FALLBACK_VOICES;
  const busy = task?.status === "running";
  const latest = recording?.media.launchVideos?.[0];
  const [ownVoiceFile, setOwnVoiceFile] = useState<string | null>(latest?.ownVoiceVideo ?? null);
  const [previewMix, setPreviewMix] = useState<"generated" | "own" | "music">("generated");
  useEffect(() => {
    setOwnVoiceFile(latest?.ownVoiceVideo ?? null);
    setPreviewMix(latest?.ownVoiceVideo ? "own" : "generated");
  }, [latest?.id, latest?.ownVoiceVideo]);
  useEffect(() => {
    if (connectedVoice?.configured && voiceProvider === "kokoro") setVoiceProvider("custom");
    if (!connectedVoice?.configured && voiceProvider === "custom") setVoiceProvider("kokoro");
    if (connectedVoice?.defaultVoice && !customVoice) setCustomVoice(connectedVoice.defaultVoice);
  }, [connectedVoice?.configured, connectedVoice?.defaultVoice, customVoice, voiceProvider]);

  const run = async (action: () => Promise<DesktopTaskStatus>) => {
    setError(null);
    try { setTask(await action()); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div className="grid gap-6">
      <PageHead title="Launch" dim="Studio." description="Turn a real website visit into an editorial walkthrough film with natural narration and an original score." />

      <section className="studio-card relative overflow-hidden rounded-[26px] border p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-signal/10 blur-3xl" />
        <div className="relative grid gap-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(290px,.85fr)] lg:items-center">
          <div className="grid gap-5">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-signal/20 bg-signal-soft px-3 py-1.5 text-[12px] font-medium text-signal">
              <Sparkles className="h-3.5 w-3.5" /> 1080p · 30 fps · natural voiceover
            </div>
            <div className="grid gap-3">
              <h1 className="max-w-2xl text-[clamp(30px,4vw,48px)] font-semibold leading-[1.02] tracking-[-.055em]">Make the walkthrough.<br /><span className="text-ink-3">Keep the craft.</span></h1>
              <p className="max-w-xl text-[15px] leading-7 text-ink-2">Turn a fresh website visit into a natural, chronological walkthrough with editorial motion, automatic narration, and an original score.</p>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-ink-3">
              <span className="inline-flex items-center gap-1.5"><Film className="h-3.5 w-3.5" /> Motion and chapter cards</span>
              <span className="inline-flex items-center gap-1.5"><Volume2 className="h-3.5 w-3.5" /> Ducking and mastered mix</span>
              <span>MP4 · no transcript sidecars</span>
            </div>
          </div>

          <div className="grid gap-4 rounded-2xl border border-line bg-paper/80 p-4 sm:p-5">
            <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); const normalized = normalizeUrl(siteUrl); if (normalized) go({ view: "record", url: normalized }); }}>
              <label htmlFor="launch-site-url" className="text-[12px] font-medium text-ink-2">Start with your website</label>
              <div className="flex gap-2">
                <input id="launch-site-url" className={`${fieldClass} min-w-0 flex-1`} value={siteUrl} onChange={(event) => setSiteUrl(event.target.value)} placeholder="https://yourproduct.com" type="text" inputMode="url" autoComplete="url" disabled={busy} />
                <button type="submit" disabled={!normalizeUrl(siteUrl) || busy} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-panel-2 px-4 text-[12.5px] font-semibold text-ink transition hover:bg-panel-3 disabled:cursor-not-allowed disabled:opacity-50"><Globe2 className="h-4 w-4" /> Record site</button>
              </div>
              <p className="text-[11px] leading-5 text-ink-3">Paste a site you’re authorized to record. Walkcast opens the recorder with this address filled in.</p>
            </form>
            <div className="h-px bg-line" />
            {recordings.length ? <>
              <label className="grid gap-1.5 text-[12px] font-medium text-ink-2">
                Fresh source recording
                <select className={fieldClass} value={selected} onChange={(e) => setSelected(e.target.value)} disabled={busy}>
                  {recordings.map((item) => <option key={item.id} value={item.id}>{new URL(item.url).hostname} · {item.pages.length} pages · {ms(item.durationMs)} · {ago(Date.parse(item.createdAt))}</option>)}
                </select>
              </label>
              <label className="grid gap-1.5 text-[12px] font-medium text-ink-2">Audio track
                <select className={fieldClass} value={voiceProvider} onChange={(e) => setVoiceProvider(e.target.value as typeof voiceProvider)} disabled={busy}>
                  <option value="kokoro">Natural narration + music</option>
                  {connectedVoice?.configured && <option value="custom">My connected voice + music</option>}
                  <option value="none">Music only · no narration</option>
                </select>
                <span className="text-[11px] font-normal leading-5 text-ink-3">When narration is on, Walkcast also builds a music-only download from the same cut.</span>
              </label>
              {voiceProvider === "custom" ? <label className="grid gap-1.5 text-[12px] font-medium text-ink-2">Voice profile ID
                <input className={fieldClass} value={customVoice} onChange={(e) => setCustomVoice(e.target.value)} placeholder="your-cloned-voice-id" disabled={busy} />
                <span className="text-[11px] font-normal leading-5 text-ink-3">Uses your configured LAB_TTS_ENDPOINT. It should return WAV/MP3 bytes or JSON with an audio base64 field.</span>
              </label> : voiceProvider === "kokoro" ? <>
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
                <button type="button" disabled={busy} onClick={() => void run(setupLaunchVoice)} className="inline-flex items-center justify-center gap-2 rounded-full border border-line px-4 py-2.5 text-[13px] font-medium text-ink-2 hover:bg-panel-2 disabled:opacity-50">
                  {busy && task?.kind === "kokoro-setup" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />} Set up Kokoro locally
                </button>
              )}
              </> : null}
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5 text-[12px] font-medium text-ink-2">Film direction
                  <select className={fieldClass} value={tone} onChange={(e) => setTone(e.target.value as typeof tone)} disabled={busy}>
                    <option value="polished">Polished</option><option value="cinematic">Cinematic</option><option value="playful">Playful</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-[12px] font-medium text-ink-2">Video format
                  <select className={fieldClass} value={format} onChange={(e) => setFormat(e.target.value as typeof format)} disabled={busy}>
                    <option value="landscape">Landscape · 16:9</option><option value="vertical">Vertical · 9:16</option><option value="square">Square · 1:1</option>
                  </select>
                </label>
              </div>
              {voiceProvider !== "none" && <>
                <label className="grid gap-1.5 text-[12px] font-medium text-ink-2">Brand and product pronunciation
                  <textarea className={fieldClass} rows={2} maxLength={1000} value={pronunciation} onChange={(e) => setPronunciation(e.target.value)} placeholder="Kokoro = koh-koh-roh; ArchMind = arch mind" disabled={busy} />
                  <span className="text-[11px] font-normal leading-5 text-ink-3">Optional word=pronunciation pairs, separated by semicolons. Used only for the spoken audio.</span>
                </label>
                <label className="grid gap-1.5 text-[12px] font-medium text-ink-2">Narration pace
                  <select className={fieldClass} value={narrationPace} onChange={(e) => setNarrationPace(e.target.value as typeof narrationPace)} disabled={busy}>
                    <option value="relaxed">Relaxed</option><option value="balanced">Balanced</option><option value="brisk">Brisk</option>
                  </select>
                </label>
              </>}
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5 text-[12px] font-medium text-ink-2">Motion pace
                  <select className={fieldClass} value={motionPace} onChange={(e) => setMotionPace(e.target.value as typeof motionPace)} disabled={busy}>
                    <option value="calm">Calm</option><option value="balanced">Balanced</option><option value="quick">Quick</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-[12px] font-medium text-ink-2">Chapter cue
                  <select className={fieldClass} value={chapterCue} onChange={(e) => setChapterCue(Number(e.target.value) as typeof chapterCue)} disabled={busy}>
                    <option value={0}>On the page change</option><option value={-750}>0.75 sec early</option><option value={750}>0.75 sec later</option>
                  </select>
                </label>
              </div>
              <button type="button" disabled={!recording || busy || (voiceProvider === "custom" && !customVoice.trim())} onClick={() => recording && void run(() => startLaunchVideo(recording.id, voiceProvider === "custom" ? customVoice.trim() : voice, { tone, format, voiceProvider, narrationPace, motionPace, chapterCueMs: chapterCue, pronunciation }))} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-solid px-5 text-[14px] font-semibold text-on-solid transition active:scale-[.98] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
                {busy && task?.kind === "launch-video" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />} Make walkthrough film <ArrowRight className="h-4 w-4" />
              </button>
              <p className="text-[11.5px] leading-5 text-ink-3">A continuous cut of the real browser visit with an original mastered score. Narrated films also include a music-only MP4. Walkcast does not export scripts or transcripts. To use a cloned owner voice, configure your pipeline as the custom TTS endpoint and enter its voice-profile ID.</p>
            </> : (
              <div className="grid gap-4">
                <div className="grid gap-1">
                  <h2 className="text-[15px] font-semibold">Record a website to begin</h2>
                  <p className="text-[12.5px] leading-5 text-ink-3">Paste your website above, record its pages, then return here and select that recording to build the film.</p>
                </div>
                {/* Opens the recorder with the link filled in: the owner/authorized confirmation and the
                    voice choice stay there, so a recording never starts from typing a URL here. */}
                <RecordBar onRecord={(url) => go({ view: "record", url })} initial={siteUrl} />
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
        {task.error && <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-panel-2 p-3 font-mono text-[11.5px] text-fail">{task.error}</pre>}
      </section>}

      {recording && latest && <section className="grid gap-4 rounded-2xl border border-line bg-panel p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-[15px] font-semibold">Your latest walkthrough film</h2><p className="mt-1 text-[12px] text-ink-3">Generated {ago(Date.parse(latest.createdAt))} · {latest.voiceProvider === "none" ? "Music only" : latest.voiceProvider === "custom" ? "Connected voice" : latest.voice} · {latest.durationSeconds ?? 58}s · {latest.tone ?? "polished"} · {latest.format ?? "landscape"}</p></div>
          <div className="flex flex-wrap gap-2">
            {latest.voiceProvider !== "none" && <a href={recordingAssetUrl(recording.id, latest.video)} download className="inline-flex h-9 items-center gap-2 rounded-full border border-line px-3 text-[12px] font-medium hover:bg-panel-2"><Download className="h-3.5 w-3.5" /> Generated voice</a>}
            {(latest.noVoiceVideo || latest.voiceProvider === "none") && <a href={recordingAssetUrl(recording.id, latest.noVoiceVideo ?? latest.video)} download className="inline-flex h-9 items-center gap-2 rounded-full border border-line px-3 text-[12px] font-medium hover:bg-panel-2"><Download className="h-3.5 w-3.5" /> Music only</a>}
            {ownVoiceFile && <a href={recordingAssetUrl(recording.id, ownVoiceFile)} download className="inline-flex h-9 items-center gap-2 rounded-full border border-line px-3 text-[12px] font-medium hover:bg-panel-2"><Download className="h-3.5 w-3.5" /> My voice</a>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Preview audio mix">
          {latest.voiceProvider !== "none" && <button type="button" onClick={() => setPreviewMix("generated")} className={`rounded-full px-3 py-1.5 text-[12px] ${previewMix === "generated" ? "bg-solid text-on-solid" : "bg-panel-2 text-ink-2"}`}>Generated voice</button>}
          {ownVoiceFile && <button type="button" onClick={() => setPreviewMix("own")} className={`rounded-full px-3 py-1.5 text-[12px] ${previewMix === "own" ? "bg-solid text-on-solid" : "bg-panel-2 text-ink-2"}`}>My voice</button>}
          {(latest.noVoiceVideo || latest.voiceProvider === "none") && <button type="button" onClick={() => setPreviewMix("music")} className={`rounded-full px-3 py-1.5 text-[12px] ${previewMix === "music" ? "bg-solid text-on-solid" : "bg-panel-2 text-ink-2"}`}>Music only</button>}
        </div>
        <video key={`${latest.id}-${previewMix}-${ownVoiceFile ?? ""}`} controls playsInline poster={recordingAssetUrl(recording.id, latest.poster)} src={recordingAssetUrl(recording.id, previewMix === "own" && ownVoiceFile ? ownVoiceFile : previewMix === "music" ? latest.noVoiceVideo ?? latest.video : latest.video)} className={`mx-auto ${latest.format === "vertical" ? "aspect-[9/16] max-h-[72vh] max-w-[405px]" : latest.format === "square" ? "aspect-square max-w-3xl" : "aspect-video"} w-full rounded-xl bg-black`} />
        <LaunchVoiceRecorder
          recordingId={recording.id}
          filmId={latest.id}
          videoFile={latest.noVoiceVideo ?? (latest.voiceProvider === "none" ? latest.video : null)}
          format={latest.format}
          onSaved={(file) => { setOwnVoiceFile(file); setPreviewMix("own"); }}
        />
      </section>}

      {!recordings.length && <Empty title="No website recordings ready yet" tone="signal" icon={<Film />}>Paste a website above and record it. Once the recording is ready, select it here to generate a launch film.</Empty>}
    </div>
  );
}

function LaunchVoiceRecorder({
  recordingId,
  filmId,
  videoFile,
  format,
  onSaved,
}: {
  recordingId: string;
  filmId: string;
  videoFile: string | null;
  format?: "landscape" | "vertical" | "square";
  onSaved: (file: string) => void;
}) {
  const [state, setState] = useState<"idle" | "recording" | "review" | "saving">("idle");
  const [take, setTake] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const player = useRef<HTMLVideoElement | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const startedAt = useRef(0);
  const chunks = useRef<Blob[]>([]);
  const busy = state === "recording" || state === "saving";

  useEffect(() => () => {
    const active = recorder.current;
    if (active && active.state !== "inactive") active.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
    const el = player.current;
    if (el) { el.pause(); el.muted = false; }
    if (take) URL.revokeObjectURL(take.url);
  }, [take]);

  const stop = () => {
    const active = recorder.current;
    recorder.current = null;
    if (active && active.state !== "inactive") active.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    const el = player.current;
    if (el) { el.pause(); el.muted = false; el.onended = null; }
  };

  const start = async () => {
    setError(null);
    if (!videoFile) {
      setError("Regenerate this film in the current Launch Studio to create its separate music track before recording your voice.");
      return;
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("Microphone capture needs a secure localhost connection in a current desktop browser.");
      return;
    }
    let liveStream: MediaStream | null = null;
    try {
      liveStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const el = player.current;
      if (!el) throw new Error("The voice-recording preview is not ready.");
      el.pause();
      el.currentTime = 0;
      el.muted = true;
      await el.play();
      const active = new MediaRecorder(liveStream);
      chunks.current = [];
      active.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      active.onstop = () => {
        const blob = new Blob(chunks.current, { type: active.mimeType || "audio/webm" });
        setTake((old) => {
          if (old) URL.revokeObjectURL(old.url);
          return { blob, url: URL.createObjectURL(blob) };
        });
        setState("review");
      };
      stream.current = liveStream;
      recorder.current = active;
      startedAt.current = Date.now();
      active.start(250);
      setState("recording");
      const tick = () => {
        if (recorder.current !== active) return;
        setElapsed((Date.now() - startedAt.current) / 1000);
        requestAnimationFrame(tick);
      };
      tick();
      el.onended = stop;
    } catch (cause) {
      liveStream?.getTracks().forEach((track) => track.stop());
      const el = player.current;
      if (el) { el.pause(); el.muted = false; }
      const name = cause instanceof DOMException ? cause.name : "";
      setError(name === "NotAllowedError" || name === "SecurityError"
        ? "Microphone blocked: open the browser site controls by the address bar, set Microphone to Allow, and reload Walkcast. Also check Windows Settings → Privacy & security → Microphone."
        : name === "NotFoundError" ? "No microphone was found. Connect or enable one, then try again."
          : cause instanceof Error ? cause.message : String(cause));
    }
  };

  const save = async () => {
    if (!take) return;
    setState("saving");
    setError(null);
    try {
      onSaved(await uploadLaunchVoiceover(recordingId, filmId, take.blob));
      setState("review");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setState("review");
    }
  };

  return (
    <div className="grid gap-3 rounded-xl border border-line bg-paper/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h3 className="text-[13px] font-semibold">Record your own voice</h3><p className="mt-1 max-w-xl text-[11.5px] leading-5 text-ink-3">The music-only cut plays from the start while you speak. Walkcast ducks the score under your voice and saves a separate MP4.</p></div>
        {state === "recording" && <span className="font-mono text-[12px] text-rec">REC · {Math.floor(elapsed / 60)}:{String(Math.floor(elapsed % 60)).padStart(2, "0")}</span>}
      </div>
      {videoFile ? <video ref={player} key={`${filmId}-${videoFile}`} src={recordingAssetUrl(recordingId, videoFile)} playsInline preload="metadata" className={`w-full max-w-xl rounded-lg bg-black ${format === "vertical" ? "aspect-[9/16] max-h-[55vh]" : format === "square" ? "aspect-square" : "aspect-video"}`} /> : <p className="rounded-lg bg-panel-2 px-3 py-2 text-[11.5px] text-ink-3">Regenerate this older film to create the separate music track needed for your own voice mix.</p>}
      {take && state !== "recording" && <audio controls src={take.url} className="w-full" />}
      {error && <p role="alert" className="text-[12px] text-fail">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {state === "recording" ? <button type="button" onClick={stop} className="rounded-full bg-rec px-4 py-2 text-[12px] font-semibold text-white">Stop recording</button> : <button type="button" disabled={!videoFile || busy} onClick={() => void start()} className="rounded-full bg-panel-2 px-4 py-2 text-[12px] font-semibold text-ink disabled:opacity-50">{take ? "Record again" : "Record my voice"}</button>}
        {take && state !== "recording" && <button type="button" disabled={busy} onClick={() => void save()} className="rounded-full bg-solid px-4 py-2 text-[12px] font-semibold text-on-solid disabled:opacity-50">{state === "saving" ? "Mixing…" : "Use this take"}</button>}
      </div>
    </div>
  );
}
