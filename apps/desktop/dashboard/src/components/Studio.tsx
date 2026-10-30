import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { type Annotation, type Capabilities, type Voice, buildSilentCopy, createAnnotation, deleteAnnotation, exportShape, guideUrl, loadAnnotations, mediaUrl, renarrate, sttCaptions, transcriptUrl, uploadVoiceover, voicePreviewUrl } from "../lib/api.ts";
import { guideSteps } from "../../../../../packages/core/src/record/guide.ts";
import { cn, ms } from "../lib/format.ts";
import { VOICE_LABEL, usePrefs } from "../lib/prefs.ts";
import type { RecordingSummary } from "../lib/types.ts";
import { Button, ExhibitTag, Panel, PlayMark, Stamp } from "./ui.tsx";

/** How a cloud provider is named in the voice line under the player. */
const PROVIDER_NAME: Record<string, string> = {
  kokoro: "Kokoro",
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

/**
 * The second each page first appeared.
 *
 * `chaptersOf` reads "Opening …" lines, and a sign-in adds one for the login page that is not in
 * `pages`. The page the recorder landed on after signing in has no opening line of its own: it is
 * on screen when sign-in succeeds and the next line starts scrolling it. So page one takes that
 * moment, and the openings after the login one line up with pages two onwards.
 */
function pageStartsOf(r: RecordingSummary, chapters: ReturnType<typeof chaptersOf>): (number | undefined)[] {
  const loginFirst = Boolean(r.signIn?.attempted && chapters[0] && /login page/i.test(chapters[0].title));
  const signedInAt = r.captions.find((c) => /^Sign-in succeeded/.test(c.text))?.start;
  let next = loginFirst ? 1 : 0;
  return r.pages.map((_, i) => {
    if (i === 0) return loginFirst ? signedInAt ?? chapters[0]?.start : chapters[next++]?.start;
    return chapters[next++]?.start;
  });
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
  const [tab, setTab] = useState<"transcript" | "steps" | "notes" | "script" | "voice">("transcript");
  const sources = sourcesOf(r);
  const vtt = mediaUrl(r.dir, r.media.captions);
  const chapters = useMemo(() => chaptersOf(r), [r]);
  const pageStarts = useMemo(() => pageStartsOf(r, chapters), [r, chapters]);
  // A picture of each page, in the order the walkthrough opened them. The video says what it
  // shows; the pictures say what it contains.
  const pictures = useMemo(
    () => r.pages.map((p, i) => ({ page: p, at: pageStarts[i] ?? 0 })).filter((x) => Boolean(x.page.screenshot)),
    [r.pages, pageStarts],
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
  const [silencing, setSilencing] = useState(false);
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
            {!compact && r.media.voice !== "none" && (() => {
              const cls = "inline-flex h-8 items-center gap-1 rounded-full border border-line px-2.5 text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-40";
              if (r.media.silent) {
                return (
                  <a href={mediaUrl(r.dir, r.media.silent)} download={`${r.id}-${r.media.silent}`} title="The walkthrough with no narration, captions still on" className={cls}>
                    No voice
                  </a>
                );
              }
              return (
                <button
                  type="button"
                  disabled={silencing || !r.media.mp4}
                  title="Make a download of this walkthrough with the narration stripped out"
                  onClick={async () => {
                    setSilencing(true);
                    setSttError(null);
                    try {
                      onChange?.(await buildSilentCopy(r.id));
                    } catch (e) {
                      setSttError(e instanceof Error ? e.message : String(e));
                    } finally {
                      setSilencing(false);
                    }
                  }}
                  className={cls}
                >
                  {silencing ? "Making…" : "Download (no voice)"}
                </button>
              );
            })()}
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
                ["steps", "Steps"],
                ["notes", "Notes"],
                ["script", "Script"],
                ["voice", "Voice"],
              ] as const
            ).map(([id, name]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                title={id === "script" ? "Edit the narration script" : id === "voice" ? "Record or upload your own voice" : undefined}
                className={cn("h-8 flex-1 rounded-full text-[12px] font-medium transition-colors", tab === id ? "bg-solid text-on-solid" : "text-ink-3 hover:text-ink")}
              >
                {name}
              </button>
            ))}
          </div>
        )}
        {tab === "steps" && <Steps recording={r} starts={pageStarts} seek={seek} />}
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

/**
 * The visit as the numbered guide, inside the app.
 *
 * The printable guide opens in a browser tab, which is the right shape for sending to someone.
 * This tab is for the owner: every page and every click with the second it happened, so a step
 * can be checked against the video without leaving the Studio. Page steps use the chapter
 * timestamps already shown above the player, so they seek too.
 */
function Steps({
  recording: r,
  starts,
  seek,
}: {
  recording: RecordingSummary;
  starts: (number | undefined)[];
  seek: (t: number, play?: boolean) => void;
}) {
  const steps = useMemo(
    () =>
      guideSteps(
        r.pages.map((p, i) => ({ ...p, at: starts[i] })),
        r.actions ?? [],
      ),
    [r.pages, r.actions, starts],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5">
        <span className="text-[12.5px] text-ink-2">
          {steps.length} {steps.length === 1 ? "step" : "steps"}. Click one to jump to that moment.
        </span>
        <span className="flex items-center gap-1.5">
          <a
            href={guideUrl(r.id)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-7 items-center rounded-full border border-line px-2.5 text-[11.5px] text-ink-2 hover:border-line-strong hover:text-ink"
          >
            Open guide
          </a>
          <a
            href={guideUrl(r.id, "md")}
            download={`${r.id}-guide.md`}
            className="inline-flex h-7 items-center rounded-full border border-line px-2.5 text-[11.5px] text-ink-2 hover:border-line-strong hover:text-ink"
          >
            Markdown
          </a>
        </span>
      </div>
      <ol className="min-h-0 max-h-[34rem] flex-1 overflow-y-auto p-1.5">
        {steps.map((step) => {
          const jumpable = step.at !== undefined;
          return (
            <li key={step.n}>
              <button
                type="button"
                onClick={() => jumpable && seek(step.at!)}
                disabled={!jumpable}
                title={jumpable ? `Jump to ${clock(step.at!)}` : "No timestamp for this step"}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                  jumpable ? "hover:bg-panel-2" : "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full font-mono text-[10.5px] font-semibold",
                    jumpable ? "bg-exhibit text-exhibit-ink" : "bg-panel-2 text-ink-3",
                  )}
                >
                  {step.n}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium leading-snug text-ink">{step.title}</span>
                  {step.detail && <span className="mt-0.5 block truncate text-[11.5px] text-ink-3">{step.detail}</span>}
                </span>
                {jumpable && <span className="shrink-0 font-mono text-[10.5px] text-ink-3">{clock(step.at!)}</span>}
                {step.image && (
                  <img
                    src={mediaUrl(r.dir, step.image)}
                    alt=""
                    loading="lazy"
                    className="h-10 w-16 shrink-0 rounded border border-line bg-panel-2 object-cover object-left-top"
                  />
                )}
              </button>
            </li>
          );
        })}
        {steps.length === 0 && <li className="p-4 text-[13px] text-ink-3">This recording has no pages or actions to show.</li>}
      </ol>
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
  const [takeDuration, setTakeDuration] = useState(0);
  const [trim, setTrim] = useState({ start: 0, end: 0 });
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const rec = useRef<{ recorder: MediaRecorder; stream: MediaStream; ctx: AudioContext; raf: number; started: number } | null>(null);
  const blocker = editBlocker(caps) ?? (typeof MediaRecorder === "undefined" ? "This browser can't record audio." : null);

  // The cleanup below runs once, on unmount. `take` is state, so a closure would keep the first
  // render's value (always null); a ref always points at the take that is on screen.
  const takeRef = useRef(take);
  takeRef.current = take;

  useEffect(
    () => () => {
      stopAll();
      if (takeRef.current) URL.revokeObjectURL(takeRef.current.url);
    },
    // Unmount-only cleanup: runs once, on purpose.
    [],
  );

  // How long the take is, so the trim handles have a range to work in. Decoding also proves the
  // browser can read its own recording; if it cannot, the take is still uploadable untrimmed.
  useEffect(() => {
    if (!take) {
      setTakeDuration(0);
      setTrim({ start: 0, end: 0 });
      return;
    }
    let alive = true;
    void takeSeconds(take.blob)
      .then((seconds) => {
        if (!alive) return;
        setTakeDuration(seconds);
        setTrim({ start: 0, end: seconds });
      })
      .catch(() => {
        if (!alive) return;
        setTakeDuration(0);
        setTrim({ start: 0, end: 0 });
      });
    return () => {
      alive = false;
    };
  }, [take]);

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
      // Keep the original file when nothing was trimmed; only re-encode a real cut.
      const whole = takeDuration === 0 || (trim.start <= 0.05 && trim.end >= takeDuration - 0.05);
      const audio = whole ? take.blob : await trimTake(take.blob, trim.start, trim.end);
      onSaved(await uploadVoiceover(r.id, audio));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("review");
    }
  };

  /** The player auditions the slice, not the whole take: play from the in point, stop at the out. */
  const playTrim = () => {
    const el = audio.current;
    if (!el || takeDuration === 0) return;
    if (el.currentTime < trim.start || el.currentTime >= trim.end) el.currentTime = trim.start;
  };
  const stopAtEnd = () => {
    const el = audio.current;
    if (!el || takeDuration === 0) return;
    if (el.currentTime >= trim.end) {
      el.pause();
      el.currentTime = trim.start;
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
      {take && state !== "recording" && (
        <>
          <audio ref={audio} controls src={take.url} className="w-full" onPlay={playTrim} onTimeUpdate={stopAtEnd} />
          {takeDuration > 0.3 && (
            <div className="grid gap-2 rounded-xl border border-line bg-panel-2/40 px-3 py-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="text-[12.5px] font-medium text-ink">Trim the take</span>
                <span className="tabular font-mono text-[11.5px] text-ink-3">
                  {clock(trim.start)} – {clock(trim.end)} · {clock(Math.max(0, trim.end - trim.start))} kept
                </span>
              </div>
              <label className="grid gap-1 text-[11.5px] text-ink-3">
                Start
                <input
                  type="range"
                  min={0}
                  max={takeDuration}
                  step={0.05}
                  value={trim.start}
                  onChange={(e) => setTrim((t) => ({ ...t, start: Math.max(0, Math.min(Number(e.target.value), t.end - 0.15)) }))}
                  className="w-full"
                />
              </label>
              <label className="grid gap-1 text-[11.5px] text-ink-3">
                End
                <input
                  type="range"
                  min={0}
                  max={takeDuration}
                  step={0.05}
                  value={trim.end}
                  onChange={(e) => setTrim((t) => ({ ...t, end: Math.min(takeDuration, Math.max(Number(e.target.value), t.start + 0.15)) }))}
                  className="w-full"
                />
              </label>
              <button
                type="button"
                onClick={() => setTrim({ start: 0, end: takeDuration })}
                className="justify-self-start text-[11.5px] text-ink-3 underline-offset-2 hover:text-ink hover:underline"
              >
                Use the whole take
              </button>
            </div>
          )}
        </>
      )}
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

/** How long a recorded take is, read with the same decoder that will trim it. */
async function takeSeconds(blob: Blob): Promise<number> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    return decoded.duration;
  } finally {
    void ctx.close();
  }
}

/**
 * The slice between `start` and `end`, as a mono 16-bit WAV.
 *
 * The server converts a voiceover to 22 kHz mono anyway (media.ts), so downmixing here costs
 * nothing and keeps the upload small. A trimmed take is a real cut: everything outside the
 * handles is not sent.
 */
async function trimTake(blob: Blob, start: number, end: number): Promise<Blob> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const rate = decoded.sampleRate;
    const from = Math.max(0, Math.min(decoded.length, Math.floor(start * rate)));
    const to = Math.max(from + 1, Math.min(decoded.length, Math.ceil(end * rate)));
    const mono = new Float32Array(to - from);
    for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
      const data = decoded.getChannelData(ch);
      for (let i = 0; i < mono.length; i++) mono[i] = (mono[i] ?? 0) + (data[from + i] ?? 0) / decoded.numberOfChannels;
    }
    return encodeWav(mono, rate);
  } finally {
    void ctx.close();
  }
}

/** Mono float samples to a 16-bit PCM WAV, which every ffmpeg can read. */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // bytes per second
  view.setUint16(32, 2, true); // bytes per frame
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0, offset = 44; i < samples.length; i++, offset += 2) {
    const sample = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([view], { type: "audio/wav" });
}
