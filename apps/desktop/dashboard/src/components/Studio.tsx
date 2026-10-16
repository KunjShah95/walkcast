import { useEffect, useMemo, useRef, useState } from "react";
import { type Capabilities, type Voice, mediaUrl, renarrate, uploadVoiceover, voicePreviewUrl } from "../lib/api.ts";
import { cn, ms } from "../lib/format.ts";
import { VOICE_LABEL, usePrefs } from "../lib/prefs.ts";
import type { RecordingSummary } from "../lib/types.ts";
import { Button, ExhibitTag, Panel, PlayMark, Stamp } from "./ui.tsx";

export const OUTCOME: Record<string, { text: string; tone: "pass" | "fail" | "muted" }> = {
  "signed-in": { text: "Signed in", tone: "pass" },
  "not-attempted": { text: "No sign-in", tone: "muted" },
  rejected: { text: "Sign-in rejected", tone: "fail" },
  captcha: { text: "Stopped at CAPTCHA", tone: "fail" },
  "mfa-required": { text: "Stopped at 2FA", tone: "fail" },
  "no-form": { text: "No sign-in form", tone: "fail" },
};

export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Chapters: the recorder opens each page with an "Opening …" line, so those lines start chapters. */
export function chaptersOf(r: RecordingSummary): { start: number; title: string; line: number }[] {
  const out = r.captions.flatMap((c, i) => (/^Opening\b/.test(c.text) ? [{ start: c.start, line: i, title: c.text.replace(/^Opening\s+/, "").replace(/\.$/, "") }] : []));
  return out.length ? out : r.captions.length ? [{ start: 0, line: 0, title: hostOf(r.url) }] : [];
}

function sourcesOf(r: RecordingSummary) {
  return (
    [
      [r.media.mp4, "video/mp4"],
      [r.media.webm, "video/webm"],
      [r.media.mp4 || r.media.webm ? null : r.media.video, "video/webm"],
    ] as const
  ).flatMap(([file, type]) => {
    const url = file ? mediaUrl(r.dir, file) : undefined;
    return url ? [{ url, type }] : [];
  });
}

/**
 * A walkthrough as evidence: the video, its chapters (one per page opened), and the narration as
 * numbered exhibits. Every line seeks the video; the line being spoken is lit.
 */
export function Studio({
  recording: r,
  caps,
  onChange,
  compact,
}: {
  recording: RecordingSummary;
  caps?: Capabilities | null;
  onChange?: (next: RecordingSummary) => void;
  compact?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(r.durationMs / 1000);
  const [prefs, setPrefs] = usePrefs();
  const [tab, setTab] = useState<"transcript" | "script" | "voice">("transcript");
  const sources = sourcesOf(r);
  const vtt = mediaUrl(r.dir, r.media.captions);
  const chapters = useMemo(() => chaptersOf(r), [r]);
  const active = r.captions.findIndex((c) => time >= c.start && time < c.end);
  const chapter = chapters.reduce((at, c, i) => (time >= c.start ? i : at), 0);
  // Bust the browser cache after a re-render (same file names, new content).
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const track = video.current?.textTracks[0];
    if (track) track.mode = prefs.captions ? "showing" : "hidden";
  }, [prefs.captions, version, r.dir]);

  useEffect(() => {
    if (active < 0 || !list.current) return;
    const el = list.current.querySelector<HTMLElement>(`[data-line="${active}"]`);
    if (!el) return;
    const box = list.current;
    const top = el.offsetTop - box.offsetTop;
    if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - el.offsetHeight) box.scrollTo({ top: top - box.clientHeight / 3, behavior: "smooth" });
  }, [active]);

  const seek = (t: number, play = true) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = t;
    if (play) void v.play().catch(() => {});
  };

  const outcome = OUTCOME[r.signIn.outcome] ?? { text: r.signIn.outcome, tone: "muted" as const };
  const voiceLine = r.media.voice === "own" ? "Your voice" : r.media.voice === "flite" ? r.media.note.match(/"(\w+)" voice/)?.[1]?.toUpperCase() ?? "Synthetic voice" : "Captions only";

  return (
    <div className={cn("grid min-w-0 gap-4", !compact && "xl:grid-cols-[minmax(0,1fr)_380px]")}>
      <Panel className="min-w-0 overflow-hidden">
        <div className="relative border-b border-line bg-panel-2">
          {sources.length ? (
            <video
              key={`${r.dir}:${version}`}
              ref={video}
              controls
              playsInline
              preload="metadata"
              className="aspect-[16/10] w-full"
              onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
              onLoadedMetadata={(e) => {
                if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration);
                const track = e.currentTarget.textTracks[0];
                if (track) track.mode = prefs.captions ? "showing" : "hidden";
              }}
            >
              {sources.map((s) => (
                <source key={s.url} src={version ? `${s.url}?v=${version}` : s.url} type={s.type} />
              ))}
              {vtt && <track kind="captions" src={version ? `${vtt}?v=${version}` : vtt} srcLang="en" label="Narration" default />}
            </video>
          ) : (
            <div className="grid aspect-[16/10] place-items-center px-6 text-center text-[13px] text-ink-3">The video isn't available here. {r.media.note}</div>
          )}
        </div>

        {chapters.length > 0 && (
          <div className="border-t border-line px-3 pt-2.5" aria-label="Chapters">
            <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
              {chapters.map((c, i) => {
                const end = chapters[i + 1]?.start ?? duration;
                const width = Math.max(2, ((end - c.start) / Math.max(1, duration)) * 100);
                const fill = i < chapter ? 100 : i === chapter ? Math.min(100, ((time - c.start) / Math.max(0.1, end - c.start)) * 100) : 0;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => seek(c.start)}
                    title={`${clock(c.start)} · ${c.title}`}
                    aria-label={`Chapter ${i + 1}: ${c.title}`}
                    className="relative h-full overflow-hidden bg-panel-3 transition-[filter] hover:brightness-150"
                    style={{ width: `${width}%` }}
                  >
                    <span className="absolute inset-y-0 left-0 bg-signal" style={{ width: `${fill}%` }} />
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 py-2 text-[12.5px]">
              <span className="font-mono text-ink-3">
                {chapter + 1}/{chapters.length}
              </span>
              <span className="min-w-0 truncate text-ink-2">{chapters[chapter]?.title}</span>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-3 py-2.5 text-[12.5px]">
          <Stamp tone={outcome.tone}>{outcome.text}</Stamp>
          <span className="font-mono text-ink-3">
            {r.pages.length} pages · {ms(r.durationMs)} · {voiceLine}
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPrefs({ captions: !prefs.captions })}
              aria-pressed={prefs.captions}
              title={prefs.captions ? "Hide captions" : "Show captions"}
              className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-ink-2 hover:bg-panel-2 hover:text-ink", prefs.captions && "text-ink")}
            >
              {prefs.captions ? "Captions on" : "Captions off"}
            </button>
            {!compact &&
              (
                [
                  [r.media.mp4, "MP4"],
                  [r.media.captions, "VTT"],
                  [r.media.audio, "Audio"],
                ] as const
              ).map(([file, label]) => {
                const href = file ? mediaUrl(r.dir, file) : undefined;
                return href ? (
                  <a key={label} href={href} download={`${r.id}-${file}`} className="inline-flex h-8 items-center gap-1 rounded-lg border border-line px-2 text-ink-2 hover:border-line-strong hover:text-ink">
                    {label}
                  </a>
                ) : null;
              })}
          </span>
        </div>
      </Panel>

      <Panel className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        {!compact && (
          <div className="flex gap-1 border-b border-line p-1.5" role="tablist" aria-label="Narration">
            {(
              [
                ["transcript", "Transcript"],
                ["script", "Edit script"],
                ["voice", "Your voice"],
              ] as const
            ).map(([id, name]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn("h-8 flex-1 rounded-lg text-[12.5px] font-medium transition-colors", tab === id ? "bg-panel-3 text-ink" : "text-ink-3 hover:text-ink")}
              >
                {name}
              </button>
            ))}
          </div>
        )}
        {tab === "transcript" && (
          <ol ref={list} className={cn("min-h-0 flex-1 overflow-y-auto p-1.5", compact ? "max-h-[19rem]" : "max-h-[34rem]")}>
            {r.captions.map((c, i) => {
              const startsChapter = chapters.some((ch) => ch.line === i) && i > 0;
              return (
                <li key={i} data-line={i}>
                  {startsChapter && <div className="mx-2 my-1.5 h-px bg-line" aria-hidden />}
                  <button
                    type="button"
                    data-exhibit={`${r.id}:line:${i}`}
                    onClick={() => seek(c.start)}
                    className={cn(
                      "grid w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] leading-snug transition-colors",
                      i === active ? "bg-exhibit-soft text-ink" : "text-ink-2 hover:bg-panel-2 hover:text-ink",
                    )}
                  >
                    <span className="grid justify-items-start gap-1 pt-px">
                      {i === active ? <ExhibitTag n={i + 1} /> : <span className="font-mono text-[10.5px] text-ink-3">EX {i + 1}</span>}
                      <span className="font-mono text-[10.5px] text-ink-3">{clock(c.start)}</span>
                    </span>
                    <span>{c.text}</span>
                  </button>
                </li>
              );
            })}
            {r.captions.length === 0 && <li className="p-4 text-[13px] text-ink-3">This recording has no narration lines.</li>}
          </ol>
        )}
        {tab === "script" && (
          <ScriptEditor
            recording={r}
            caps={caps}
            onSaved={(next) => {
              setVersion((v) => v + 1);
              onChange?.(next);
              setTab("transcript");
            }}
          />
        )}
        {tab === "voice" && (
          <VoiceRecorder
            recording={r}
            caps={caps}
            video={video}
            onSaved={(next) => {
              setVersion((v) => v + 1);
              onChange?.(next);
              setTab("transcript");
            }}
          />
        )}
      </Panel>
    </div>
  );
}

function editBlocker(caps?: Capabilities | null): string | null {
  if (!caps?.live) return "Editing needs the live server (npm run dev).";
  if (caps.voices && !caps.voices.editable) return "Editing narration needs recordings stored on this server's disk.";
  return null;
}

/** Choose a voice, with a spoken sample. */
export function VoicePicker({ value, onChange, available }: { value: Voice; onChange: (v: Voice) => void; available: boolean }) {
  const [playing, setPlaying] = useState<Voice | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => audio.current?.pause(), []);
  const preview = (v: Voice) => {
    audio.current?.pause();
    if (playing === v) return setPlaying(null);
    const a = new Audio(voicePreviewUrl(v));
    audio.current = a;
    a.onended = () => setPlaying(null);
    a.onerror = () => setPlaying(null);
    setPlaying(v);
    void a.play().catch(() => setPlaying(null));
  };
  return (
    <div role="radiogroup" aria-label="Narration voice" className="grid grid-cols-2 gap-1.5">
      {(Object.keys(VOICE_LABEL) as Voice[]).map((v) => (
        <div
          key={v}
          className={cn(
            "flex items-center gap-1 rounded-lg border p-1 pl-2.5 transition-colors",
            value === v ? "border-signal/60 bg-signal-soft" : "border-line hover:border-line-strong",
          )}
        >
          <button type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className="min-w-0 flex-1 py-0.5 text-left">
            <span className="block text-[13px] font-medium">{VOICE_LABEL[v].name}</span>
            <span className="block truncate text-[11.5px] text-ink-3">{VOICE_LABEL[v].note}</span>
          </button>
          <button
            type="button"
            disabled={!available}
            onClick={() => preview(v)}
            title={available ? `Hear ${VOICE_LABEL[v].name}` : "Voice samples need ffmpeg with flite on the server"}
            aria-label={`Play a sample of ${VOICE_LABEL[v].name}`}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-panel-3 hover:text-ink disabled:opacity-35"
          >
            <PlayMark paused={playing === v} />
          </button>
        </div>
      ))}
    </div>
  );
}

function ScriptEditor({ recording: r, caps, onSaved }: { recording: RecordingSummary; caps?: Capabilities | null; onSaved: (r: RecordingSummary) => void }) {
  const [prefs] = usePrefs();
  const [lines, setLines] = useState(() => r.captions.map((c) => c.text));
  const [voice, setVoice] = useState<Voice>(prefs.voice);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocker = editBlocker(caps) ?? (caps?.voices && !caps.voices.available ? "Re-rendering needs ffmpeg with the flite voice on the server." : null);
  const changed = lines.some((t, i) => t !== r.captions[i]?.text);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const captions = r.captions.map((c, i) => ({ ...c, text: lines[i]?.trim() || c.text }));
      onSaved(await renarrate(r.id, captions, voice));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid gap-2 border-b border-line p-3">
        <div className="text-[12.5px] text-ink-2">Voice for the new narration</div>
        <VoicePicker value={voice} onChange={setVoice} available={Boolean(caps?.voices?.available)} />
      </div>
      <ol className="max-h-[22rem] min-h-0 flex-1 overflow-y-auto p-2">
        {lines.map((text, i) => (
          <li key={i} className="grid grid-cols-[2.6rem_minmax(0,1fr)] items-start gap-2 py-1">
            <span className="pt-2 font-mono text-[10.5px] text-ink-3">{clock(r.captions[i]!.start)}</span>
            <textarea
              value={text}
              rows={Math.min(4, Math.ceil(text.length / 44) || 1)}
              onChange={(e) => setLines((all) => all.map((t, j) => (j === i ? e.target.value : t)))}
              aria-label={`Line ${i + 1}`}
              className={cn(
                "w-full resize-none rounded-lg border bg-paper/60 px-2.5 py-1.5 text-[13px] leading-snug outline-none focus:border-signal",
                text !== r.captions[i]?.text ? "border-exhibit/50" : "border-line",
              )}
            />
          </li>
        ))}
      </ol>
      <div className="grid gap-2 border-t border-line p-3">
        {error && <p className="text-[12.5px] text-fail">{error}</p>}
        {blocker && <p className="text-[12.5px] text-ink-3">{blocker}</p>}
        <div className="flex items-center gap-2">
          <Button tone="ghost" size="sm" disabled={!changed || busy} onClick={() => setLines(r.captions.map((c) => c.text))}>
            Reset
          </Button>
          <Button tone="primary" size="sm" className="ml-auto" disabled={Boolean(blocker) || busy} onClick={save}>
                        {busy ? "Re-rendering…" : "Re-render narration"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Narrate it yourself: the video plays muted from the start while the microphone records, so
 * the voice lines up with the picture. The take replaces the synthetic narration.
 */
function VoiceRecorder({
  recording: r,
  caps,
  video,
  onSaved,
}: {
  recording: RecordingSummary;
  caps?: Capabilities | null;
  video: React.RefObject<HTMLVideoElement | null>;
  onSaved: (r: RecordingSummary) => void;
}) {
  const [state, setState] = useState<"idle" | "recording" | "review" | "saving">("idle");
  const [take, setTake] = useState<{ blob: Blob; url: string } | null>(null);
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<{ recorder: MediaRecorder; stream: MediaStream; ctx: AudioContext; raf: number; started: number } | null>(null);
  const blocker = editBlocker(caps) ?? (typeof MediaRecorder === "undefined" ? "This browser can't record audio." : null);

  useEffect(
    () => () => {
      stopAll();
      if (take) URL.revokeObjectURL(take.url);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function stopAll() {
    const cur = rec.current;
    if (!cur) return;
    cancelAnimationFrame(cur.raf);
    if (cur.recorder.state !== "inactive") cur.recorder.stop();
    cur.stream.getTracks().forEach((t) => t.stop());
    void cur.ctx.close();
    rec.current = null;
    const v = video.current;
    if (v) {
      v.pause();
      v.muted = false;
    }
  }

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        setTake((old) => {
          if (old) URL.revokeObjectURL(old.url);
          return { blob, url: URL.createObjectURL(blob) };
        });
        setState("review");
      };
      const started = performance.now();
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const x of data) peak = Math.max(peak, Math.abs(x - 128) / 128);
        setLevel(peak);
        setElapsed((performance.now() - started) / 1000);
        if (rec.current) rec.current.raf = requestAnimationFrame(tick);
      };
      rec.current = { recorder, stream, ctx, raf: 0, started };
      recorder.start(250);
      const v = video.current;
      if (v) {
        v.muted = true;
        v.currentTime = 0;
        v.onended = () => stopAll();
        void v.play().catch(() => {});
      }
      setState("recording");
      tick();
    } catch (e) {
      setError(e instanceof DOMException && e.name === "NotAllowedError" ? "Microphone access was blocked. Allow it in the browser's address bar and try again." : e instanceof Error ? e.message : String(e));
    }
  };

  const save = async () => {
    if (!take) return;
    setState("saving");
    setError(null);
    try {
      onSaved(await uploadVoiceover(r.id, take.blob));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("review");
    }
  };

  const bars = 28;
  return (
    <div className="grid gap-4 p-4">
      <p className="text-[13px] text-ink-2">
        Press record and talk over the walkthrough. The video plays muted from the start so your voice lines up with the picture; your take
        replaces the synthetic narration. Captions keep the written script.
      </p>
      <div className="flex h-14 items-center justify-center gap-[3px] rounded-xl border border-line bg-paper/60 px-3" aria-hidden>
        {Array.from({ length: bars }, (_, i) => {
          const wave = state === "recording" ? Math.max(0.08, level * (0.55 + 0.45 * Math.sin(i * 1.7 + elapsed * 9))) : 0.08;
          return <span key={i} className={cn("w-1 rounded-full transition-[height] duration-75", state === "recording" ? "bg-rec" : "bg-panel-3")} style={{ height: `${Math.round(wave * 100)}%` }} />;
        })}
      </div>
      {state === "recording" && (
        <div className="flex items-center justify-between font-mono text-[12px]">
          <span className="flex items-center gap-2 text-rec">
            <span className="rec-light size-2 rounded-full bg-rec" /> Recording
          </span>
          <span className="text-ink-2">{clock(elapsed)}</span>
        </div>
      )}
      {take && state !== "recording" && <audio controls src={take.url} className="w-full" />}
      {error && <p className="text-[12.5px] text-fail">{error}</p>}
      {blocker && <p className="text-[12.5px] text-ink-3">{blocker}</p>}
      <div className="flex flex-wrap gap-2">
        {state === "recording" ? (
          <Button tone="danger" onClick={stopAll}>
            Stop
          </Button>
        ) : (
          <Button tone={take ? "secondary" : "primary"} disabled={Boolean(blocker) || state === "saving"} onClick={start}>
            {take ? "Record again" : "Record my voice"}
          </Button>
        )}
        {take && state !== "recording" && (
          <Button tone="primary" disabled={state === "saving" || Boolean(blocker)} onClick={save} className="ml-auto">
                        {state === "saving" ? "Mixing…" : "Use this take"}
          </Button>
        )}
      </div>
    </div>
  );
}
