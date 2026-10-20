import { useEffect, useState } from "react";
import { cloudVoicePreviewUrl, loadCapabilities, loadTtsProviders } from "../lib/api.ts";
import { cn } from "../lib/format.ts";
import type { TtsProvider } from "../lib/prefs.ts";
import { Button, fieldClass } from "./ui.tsx";

type Natural = "elevenlabs" | "openai";
const KEY_ENV: Record<Natural, string> = { elevenlabs: "ELEVENLABS_API_KEY", openai: "OPENAI_API_KEY" };
const NATURAL_LABEL: Record<Natural, string> = { elevenlabs: "ElevenLabs", openai: "OpenAI" };

/**
 * Asked once, before the first recording: how should it sound? A voice is preselected, so pressing
 * Continue gives a narrated video. The answer becomes the default; Settings changes it later.
 */
export function VoiceChooser({ onChoose, onCancel }: { onChoose: (provider: TtsProvider) => void; onCancel: () => void }) {
  const [choice, setChoice] = useState<"natural" | "flite" | "none">("flite");
  const [natural, setNatural] = useState<Natural>("elevenlabs");
  const [configured, setConfigured] = useState<Record<Natural, boolean>>({ elevenlabs: false, openai: false });
  const [editable, setEditable] = useState(true);
  // The offline voice needs ffmpeg's flite or Windows speech; macOS and most Linux builds have neither.
  const [offline, setOffline] = useState(true);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void loadCapabilities()
      .then((caps) => {
        if (!live || caps.voices?.available !== false) return;
        setOffline(false);
        setChoice((c) => (c === "flite" ? "none" : c));
      })
      .catch(() => undefined);
    void loadTtsProviders().then((list) => {
      if (!live) return;
      const has = (id: Natural) => Boolean(list.find((p) => p.id === id)?.configured);
      const found = { elevenlabs: has("elevenlabs"), openai: has("openai") };
      setConfigured(found);
      // A key already saved means the natural voice works right now: offer it first.
      if (found.elevenlabs || found.openai) {
        setChoice("natural");
        setNatural(found.elevenlabs ? "elevenlabs" : "openai");
      }
    });
    void fetch("/api/credentials")
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { editable?: boolean } | null) => live && b && setEditable(b.editable !== false))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const needsKey = choice === "natural" && !configured[natural];

  const confirm = async () => {
    setError(null);
    if (choice !== "natural") return onChoose(choice);
    if (!needsKey) return onChoose(natural);
    if (!key.trim()) return setError(`Paste your ${NATURAL_LABEL[natural]} API key, or pick another option.`);
    setSaving(true);
    try {
      const res = await fetch("/api/credentials", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ env: KEY_ENV[natural], value: key.trim() }) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Couldn't save the key (${res.status}).`);
      // Speak one short sample now: a mistyped key or an account without credits should show up
      // here, not minutes into the first recording.
      const check = await fetch(cloudVoicePreviewUrl(natural, ""));
      if (!check.ok) {
        const why = ((await check.json().catch(() => ({}))) as { error?: string }).error;
        // Don't leave a key the provider refused behind: it would read as "key saved" from now on.
        await fetch(`/api/credentials?env=${KEY_ENV[natural]}`, { method: "DELETE" }).catch(() => undefined);
        throw new Error(`${NATURAL_LABEL[natural]} didn't accept that key${why ? `: ${why}` : "."} Check the key, or pick another option.`);
      }
      onChoose(natural);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="voice-chooser-title" className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4" onClick={onCancel}>
      <div className="grid w-full max-w-[520px] gap-4 rounded-2xl border border-line bg-paper p-5 shadow-xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="grid gap-1">
          <h2 id="voice-chooser-title" className="text-[18px] font-semibold tracking-tight">How should your recordings sound?</h2>
          <p className="text-[13px] text-ink-3">Every recording gets captions and a transcript. Pick the voice on top; you can change it later in Settings.</p>
        </div>

        <div className="grid gap-2" role="radiogroup" aria-label="Voice">
          <Option checked={choice === "natural"} onSelect={() => setChoice("natural")} title="Natural voice" note="Best. Uses your own ElevenLabs or OpenAI key." autoFocus />
          {choice === "natural" && (
            <div className="ml-7 grid gap-2">
              <div className="flex gap-1.5">
                {(["elevenlabs", "openai"] as const).map((p) => (
                  <Button key={p} size="sm" tone={natural === p ? "primary" : "secondary"} onClick={() => setNatural(p)}>
                    {NATURAL_LABEL[p]}
                    {configured[p] ? " · key saved" : ""}
                  </Button>
                ))}
              </div>
              {needsKey &&
                (editable ? (
                  <input type="password" autoComplete="off" spellCheck={false} placeholder={`${NATURAL_LABEL[natural]} API key`} value={key} onChange={(e) => setKey(e.target.value)} className={fieldClass} aria-label={`${NATURAL_LABEL[natural]} API key`} />
                ) : (
                  <p className="text-[12px] text-warn">This server's keys are set by its operator. Ask them to add a {NATURAL_LABEL[natural]} key, or pick another option.</p>
                ))}
              {needsKey && editable && <p className="text-[12px] text-ink-3">Saved on this computer only, in Walkcast's settings.</p>}
            </div>
          )}
          <Option checked={choice === "flite"} onSelect={() => setChoice("flite")} title="Basic offline voice" note={offline ? "Works right away, no key. Sounds robotic." : "Not available on this computer."} disabled={!offline} />
          <Option checked={choice === "none"} onSelect={() => setChoice("none")} title="No voice" note="Captions and a transcript only." />
        </div>

        {error && <p className="text-[12.5px] text-fail">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button tone="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button tone="record" onClick={() => void confirm()} disabled={saving || (needsKey && !editable)}>
            {saving ? "Checking key…" : "Continue and record"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Option({ checked, onSelect, title, note, autoFocus, disabled }: { checked: boolean; onSelect: () => void; title: string; note: string; autoFocus?: boolean; disabled?: boolean }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors", checked ? "border-signal bg-signal-soft" : "border-line hover:bg-panel-2", disabled && "cursor-not-allowed opacity-50 hover:bg-transparent")}>
      <input type="radio" name="voice-choice" checked={checked} onChange={onSelect} autoFocus={autoFocus} disabled={disabled} className="mt-1 accent-[var(--signal)]" />
      <span className="grid gap-0.5">
        <span className="text-[14px] font-medium">{title}</span>
        <span className="text-[12.5px] text-ink-3">{note}</span>
      </span>
    </label>
  );
}
