import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { type Annotation, type Capabilities, type Voice, createAnnotation, deleteAnnotation, exportShape, guideUrl, loadAnnotations, mediaUrl, renarrate, sttCaptions, transcriptUrl, uploadVoiceover, voicePreviewUrl } from "../lib/api.ts";
import { cn, ms } from "../lib/format.ts";
import { VOICE_LABEL, usePrefs } from "../lib/prefs.ts";
import type { RecordingSummary } from "../lib/types.ts";
import { Button, ExhibitTag, Panel, PlayMark, Stamp } from "./ui.tsx";

/** How a cloud provider is named in the voice line under the player. */
const PROVIDER_NAME: Record<string, string> = {
  elevenlabs: "ElevenLabs",
  openai: "OpenAI",
  google: "Google",
  azure: "Azure",
  awspolly: "AWS Polly",
  sarvam: "Sarvam",
  bhashini: "Bhashini",
  murf: "Murf",
  reverie: "Reverie",
  custom: "Custom",
  "custom-voice": "Uploaded",
};

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
  const still = useReducedMotion();
  const video = useRef<HTMLVideoElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(r.durationMs / 1000);
  const [prefs, setPrefs] = usePrefs();
  const [tab, setTab] = useState<"transcript" | "notes" | "script" | "voice">("transcript");
  const sources = sourcesOf(r);
  const vtt = mediaUrl(r.dir, r.media.captions);
  const chapters = useMemo(() => chaptersOf(r), [r]);
  // A picture of each page, in the order the walkthrough opened them. The video says what it
  // shows; the pictures say what it contains.
  const pictures = useMemo(
    () => r.pages.map((p, i) => ({ page: p, at: chapters[i]?.start ?? 0 })).filter((x) => Boolean(x.page.screenshot)),
    [r.pages, chapters],
  );
  const poster = pictures[0]?.page.screenshot ? mediaUrl(r.dir, pictures[0].page.screenshot) : undefined;
  const active = r.captions.findIndex((c) => time >= c.start && time < c.end);
  const chapter = chapters.reduce((at, c, i) => (time >= c.start ? i : at), 0);
  // Bust the browser cache after a re-render (same file names, new content).
  const [version, setVersion] = useState(0);
  const [sttBusy, setSttBusy] = useState(false);
  const [sttError, setSttError] = useState<string | null>(null);
  // Which feed shape is encoding, if any: one at a time, each is a full re-encode.
  const [shaping, setShaping] = useState<"vertical" | "square" | null>(null);
  // Known only on a live server; elsewhere let the server answer.
  const sttMissing = caps?.live && caps.sttProviders?.length === 0;

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
    if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - el.offsetHeight) box.scrollTo({ top: top - box.clientHeight / 3, behavior: still ? "auto" : "smooth" });
  }, [active, still]);

  const seek = (t: number, play = true) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = t;
    if (play) void v.play().catch(() => {});
  };

  const outcome = OUTCOME[r.signIn.outcome] ?? { text: r.signIn.outcome, tone: "muted" as const };
  const engine = r.media.note.match(/"([\w:.-]+)" voice/)?.[1] ?? "";
  const provider = engine.split(":")[0] ?? "";
  const voiceLine =
    r.media.voice === "own"
      ? "Your voice"
      : r.media.voice === "flite"
        ? provider === "windows"
          ? `Windows voice (${engine.slice("windows:".length)})`
          : provider === "flite" || !provider
            ? `Offline voice${engine ? ` (${engine.slice("flite:".length).toUpperCase()})` : ""}`
            : `${PROVIDER_NAME[provider] ?? provider} voice`
        : "Captions only";
  // Say why a recording sounds different from what was picked: a voice that failed part-way, or a
  // fallback that spoke instead. Without this a silent video gives no reason at all.
  const voiceTrouble = /failed|instead|could not reach/i.test(r.media.note) ? r.media.note : "";

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
              poster={poster}
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

        {pictures.length > 0 && (
          <div className="border-t border-line px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-2 pb-1.5">
              <span className="text-[12.5px] text-ink-2">Pages</span>
              <span className="text-[11.5px] text-ink-3">Click a page to jump to it</span>
            </div>
            <ul className="flex gap-2 overflow-x-auto pb-1">
              {pictures.map(({ page, at }, i) => {
                const on = time >= at && (pictures[i + 1]?.at ?? Infinity) > time;
                return (
                  <li key={page.url + i} className="w-[132px] shrink-0">
                    <button
                      type="button"
                      onClick={() => seek(at)}
                      title={page.title || page.url}
                      className={cn(
                        "block w-full overflow-hidden rounded-lg border text-left transition-colors",
                        on ? "border-signal/70" : "border-line hover:border-line-strong",
                      )}
                    >
                      <img
                        src={mediaUrl(r.dir, page.screenshot!)}
                        alt={page.title || page.url}
                        loading="lazy"
                        className="aspect-[16/10] w-full bg-panel-2 object-cover object-top"
                      />
                      <span className="block truncate px-1.5 py-1 text-[11px] text-ink-3">{page.title || page.url}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-3 py-2.5 text-[12.5px]">
          <Stamp tone={outcome.tone}>{outcome.text}</Stamp>
          <span className="font-mono text-ink-3">
            {r.pages.length} pages · {ms(r.durationMs)} · {voiceLine}
            {r.stopped?.reason === "time" ? ` · stopped at ${lengthLabel(r.stopped.limitSeconds ?? 0)}` : ""}
          </span>
          {voiceTrouble ? (
            <span className="text-[12px] text-warn">{voiceTrouble}</span>
          ) : (
            r.narration &&
            !r.narration.reachable && (
              <span className="text-[12px] text-warn">
                {r.narration.asked} was selected but couldn’t be reached, so it didn’t narrate this recording.
              </span>
            )
          )}
          <span className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPrefs({ captions: !prefs.captions })}
              aria-pressed={prefs.captions}
              title={prefs.captions ? "Hide captions" : "Show captions"}
              className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-ink-2 hover:bg-panel-2 hover:text-ink", prefs.captions && "text-ink")}
            >
              {prefs.captions ? "Captions on" : "Captions off"}
            </button>
            <button
              type="button"
              disabled={sttBusy || sttMissing}
              title={sttMissing ? "Add a speech-to-text key (OpenAI, Groq, ElevenLabs or Sarvam) in Settings" : "Transcribe the audio into new captions"}
              onClick={async () => {
                setSttBusy(true);
                setSttError(null);
                try {
                  const next = await sttCaptions(r.id);
                  onChange?.(next);
                } catch (e) {
                  // Shown on the page: the desktop webview doesn't reliably show alert().
                  setSttError(e instanceof Error ? e.message : String(e));
                } finally {
                  setSttBusy(false);
                }
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-2.5 text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-40"
            >
              {sttBusy ? "Transcribing..." : "Auto-captions (STT)"}
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
                  <a key={label} href={href} download={`${r.id}-${file}`} className="inline-flex h-8 items-center gap-1 rounded-full border border-line px-2.5 text-ink-2 hover:border-line-strong hover:text-ink">
                    {label}
                  </a>
                ) : null;
              })}
            {!compact && (
              // The whole visit as one document: the pages, the narration, the notes and what
              // the recorder found — to paste into a ticket, a README or a chat.
              <a href={transcriptUrl(r.id, "md")} download={`${r.id}.md`} className="inline-flex h-8 items-center gap-1 rounded-full border border-line px-2.5 text-ink-2 hover:border-line-strong hover:text-ink">
                Markdown
              </a>
            )}
            {!compact &&
              (
                [
                  ["vertical", "9:16"],
                  ["square", "1:1"],
                ] as const
              ).map(([shape, label]) => {
                const made = r.media.exports?.[shape];
                const cls = "inline-flex h-8 items-center gap-1 rounded-full border border-line px-2.5 text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-40";
                // Made once, then it is a download like the MP4.
                if (made) {
                  return (
                    <a key={shape} href={mediaUrl(r.dir, made)} download={`${r.id}-${made}`} title={`The walkthrough in ${label}, captions burned in`} className={cls}>
                      {label}
                    </a>
                  );
                }
                return (
                  <button
                    key={shape}
                    type="button"
                    disabled={shaping !== null || !r.media.mp4}
                    title={`Re-frame for a feed in ${label}, with the captions burned in`}
                    onClick={async () => {
                      setShaping(shape);
                      setSttError(null);
                      try {
                        onChange?.(await exportShape(r.id, shape));
                      } catch (e) {
                        setSttError(e instanceof Error ? e.message : String(e));
                      } finally {
                        setShaping(null);
                      }
                    }}
                    className={cls}
                  >
                    {shaping === shape ? `Making ${label}…` : `Make ${label}`}
                  </button>
                );
              })}
            {!compact && (
              // The visit as numbered steps, each with a picture of the screen: for a help
              // article or an onboarding doc, where people skim instead of watching.
              <a href={guideUrl(r.id)} target="_blank" rel="noreferrer" title="Every page and every click as numbered steps with pictures" className="inline-flex h-8 items-center gap-1 rounded-full border border-line px-2.5 text-ink-2 hover:border-line-strong hover:text-ink">
                Step guide
              </a>
            )}
          </span>
        </div>
        {sttError && <p className="border-t border-line px-4 py-2.5 text-[12.5px] text-fail">{sttError}</p>}
      </Panel>

      <Panel className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        {!compact && (
          <div className="flex gap-1 border-b border-line p-1.5" role="tablist" aria-label="Narration">
            {(
              [
                ["transcript", "Transcript"],
                ["notes", "Notes"],
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
                className={cn("h-8 flex-1 rounded-full text-[12.5px] font-medium transition-colors", tab === id ? "bg-solid text-on-solid" : "text-ink-3 hover:text-ink")}
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
        {tab === "notes" && (
          <Notes
            recording={r}
            time={time}
            seek={seek}
            onError={setSttError}
          />
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

/**
 * Notes pinned to a moment in the walkthrough.
 *
 * The video shows what the site did; the note says what the owner thinks about it — "the CTA
 * here is wrong", "this page took two seconds to load". A note is private to the walkthrough's
 * owner until they put it on a share link, and it travels with the Markdown export.
 */
function Notes({
  recording,
  time,
  seek,
  onError,
}: {
  recording: RecordingSummary;
  time: number;
  seek: (t: number, play?: boolean) => void;
  onError: (message: string | null) => void;
}) {
  const [notes, setNotes] = useState<Annotation[]>([]);
  const [text, setText] = useState("");
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    void loadAnnotations(recording.id).then((found) => {
      if (!alive) return;
      setNotes(found);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [recording.id]);

  // The note being written is pinned to where the video is now, and follows it until it is saved.
  useEffect(() => setAt(time), [time]);

  const add = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    onError(null);
    try {
      const saved = await createAnnotation(recording.id, at, body);
      setNotes((all) => [...all, saved].sort((a, b) => a.at - b.at));
      setText("");
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (note: Annotation) => {
    setBusy(true);
    onError(null);
    try {
      await deleteAnnotation(recording.id, note.id);
      setNotes((all) => all.filter((n) => n.id !== note.id));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid gap-2 border-b border-line p-3">
        <label className="text-[12.5px] text-ink-2">
          Pin a note to <span className="font-mono text-ink">{clock(at)}</span>
          <textarea
            value={text}
            rows={2}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void add();
              }
            }}
            placeholder="What did you see here?"
            aria-label="Note"
            className="mt-1.5 w-full resize-none rounded-lg border bg-panel px-2.5 py-1.5 text-[13px] leading-snug outline-none transition-shadow focus:border-signal"
          />
        </label>
        <div className="flex items-center gap-2">
          <Button tone="primary" size="sm" disabled={busy || !text.trim()} onClick={add}>
            {busy ? "Saving…" : "Add note"}
          </Button>
          <span className="text-[11.5px] text-ink-3">Ctrl+Enter saves</span>
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {notes.map((note) => (
          <li key={note.id} className="group flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-panel-2">
            <button
              type="button"
              onClick={() => seek(note.at)}
              title="Jump to this moment"
              className="mt-px shrink-0 font-mono text-[10.5px] text-signal hover:underline"
            >
              {clock(note.at)}
            </button>
            <span className="min-w-0 flex-1 text-[13px] leading-snug text-ink-2">{note.text}</span>
            <button
              type="button"
              onClick={() => remove(note)}
              disabled={busy}
              aria-label="Delete this note"
              title="Delete this note"
              className="shrink-0 text-[11.5px] text-ink-3 opacity-0 transition-opacity hover:text-fail focus:opacity-100 group-hover:opacity-100 disabled:opacity-40"
            >
              Delete
            </button>
          </li>
        ))}
        {loaded && notes.length === 0 && (
          <li className="p-4 text-[13px] text-ink-3">
            No notes yet. Play the walkthrough and pin what you see — the note lands at the second you are watching.
          </li>
        )}
      </ul>
    </div>
  );
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

/** The lengths a walkthrough can be capped at, in seconds. 0 is "as long as it takes". */
const LENGTHS = [30, 60, 120, 180, 300, 600, 0] as const;

export function lengthLabel(seconds: number): string {
  if (!seconds) return "No limit";
  if (seconds < 90) return `${seconds} sec`;
  const minutes = seconds / 60;
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min`;
}

/**
 * How long the recording may run. The walk stops at the next page boundary once the budget is
 * spent, so the video ends on a whole page, and the narration says why it stopped there.
 */
export function LengthPicker({ value, onChange, disabled }: { value: number; onChange: (seconds: number) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Recording length" className="flex flex-wrap gap-1.5">
      {LENGTHS.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          disabled={disabled}
          onClick={() => onChange(s)}
          className={cn(
            "h-8 rounded-lg border px-2.5 text-[12.5px] font-medium transition-colors disabled:opacity-40",
            value === s ? "border-signal/60 bg-signal-soft text-signal" : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
          )}
        >
          {lengthLabel(s)}
        </button>
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
                "w-full resize-none rounded-lg border bg-panel px-2.5 py-1.5 text-[13px] leading-snug outline-none transition-shadow focus:border-signal",
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
    // Unmount-only cleanup: runs once, on purpose.
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
