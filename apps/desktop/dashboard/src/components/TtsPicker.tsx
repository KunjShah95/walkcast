import { useEffect, useRef, useState } from "react";
import { type TtsProviderInfo, cloudVoicePreviewUrl, loadTtsProviders } from "../lib/api.ts";
import { cn } from "../lib/format.ts";
import type { TtsProvider } from "../lib/prefs.ts";
import { PlayMark } from "./ui.tsx";

/** Providers that speak from the machine itself, so the flite picker is the right control for them. */
const LOCAL = new Set(["flite", "custom-voice"]);

export interface TtsPickerProps {
  provider: TtsProvider;
  /** The voice id chosen inside `provider`. Empty means the provider's own default. */
  voice: string;
  onProvider: (p: TtsProvider) => void;
  onVoice: (voice: string) => void;
  /** The flite picker, rendered for the local providers. */
  localVoicePicker?: React.ReactNode;
  className?: string;
  selectClassName?: string;
  disabled?: boolean;
}

/**
 * Provider + voice in one control: pick who speaks, then which of that provider's voices. The
 * catalog comes from the server, so a voice this build doesn't know about still shows up as the
 * provider's default rather than silently speaking something else.
 */
export function TtsPicker({ provider, voice, onProvider, onVoice, localVoicePicker, className, selectClassName, disabled }: TtsPickerProps) {
  const [providers, setProviders] = useState<TtsProviderInfo[]>([]);
  useEffect(() => {
    let live = true;
    void loadTtsProviders().then((list) => live && setProviders(list));
    return () => {
      live = false;
    };
  }, []);

  const info = providers.find((p) => p.id === provider);
  if (LOCAL.has(provider)) {
    return (
      <div className={cn("grid gap-2", className)}>
        <ProviderSelect providers={providers} value={provider} onChange={onProvider} disabled={disabled} className={selectClassName} />
        {localVoicePicker}
      </div>
    );
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <ProviderSelect providers={providers} value={provider} onChange={onProvider} disabled={disabled} className={selectClassName} />
      {info && <VoiceControl info={info} voice={voice} onVoice={onVoice} disabled={disabled} />}
    </div>
  );
}

function ProviderSelect({ providers, value, onChange, disabled, className }: { providers: TtsProviderInfo[]; value: string; onChange: (p: TtsProvider) => void; disabled?: boolean; className?: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as TtsProvider)}
      disabled={disabled}
      aria-label="Narration provider"
      className={className ?? "h-9 w-full rounded-lg border border-line bg-panel px-3 text-[13px]"}
    >
      {(providers.length > 0 ? providers : [{ id: value, label: value, cloud: true, hasList: false, configured: true, defaultVoice: "", voices: [] }]).map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}
          {p.cloud && !p.configured ? " — needs an API key" : ""}
        </option>
      ))}
    </select>
  );
}

/** The provider's own voices: a select when it publishes a list, a text box when it doesn't. */
function VoiceControl({ info, voice, onVoice, disabled }: { info: TtsProviderInfo; voice: string; onVoice: (v: string) => void; disabled?: boolean }) {
  const chosen = voice || info.defaultVoice;
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => audio.current?.pause(), []);

  const preview = () => {
    audio.current?.pause();
    if (playing) return setPlaying(false);
    const a = new Audio(cloudVoicePreviewUrl(info.id, chosen));
    audio.current = a;
    a.onended = () => setPlaying(false);
    a.onerror = () => setPlaying(false);
    setPlaying(true);
    void a.play().catch(() => setPlaying(false));
  };

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-2">
        {info.hasList ? (
          <select
            value={chosen}
            onChange={(e) => onVoice(e.target.value)}
            disabled={disabled}
            aria-label={`${info.label} voice`}
            className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 text-[13px]"
          >
            {info.voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.note ? ` — ${v.note}` : ""}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={voice}
            onChange={(e) => onVoice(e.target.value)}
            disabled={disabled}
            placeholder={info.defaultVoice || "Voice id"}
            aria-label={`${info.label} voice id`}
            spellCheck={false}
            className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 font-mono text-[12.5px]"
          />
        )}
        <button
          type="button"
          onClick={preview}
          disabled={disabled || !info.configured || !chosen}
          title={info.configured ? `Hear this voice` : "Add this provider's API key in Settings to hear a sample"}
          aria-label="Play a sample of this voice"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-panel-3 hover:text-ink disabled:opacity-35"
        >
          <PlayMark paused={!playing} />
        </button>
      </div>
      {info.hasList ? (
        <p className="text-[12px] text-ink-3">{info.voices.find((v) => v.id === chosen)?.note ?? "Sent to the provider as-is."}</p>
      ) : (
        <p className="text-[12px] text-ink-3">This provider's voices aren't a public list, so its voice id goes here.</p>
      )}
      {!info.configured && <p className="text-[12px] text-warn">No API key for {info.label} on this server — add it in Settings, or the recording falls back to the built-in voice.</p>}
    </div>
  );
}