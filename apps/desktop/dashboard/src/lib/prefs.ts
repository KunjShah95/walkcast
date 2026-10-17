import { useEffect, useState } from "react";
import type { Voice } from "./api.ts";

/** Recording defaults, kept in this browser (Settings → Recording defaults). */
export type TtsProvider = "flite" | "sarvam" | "bhashini" | "elevenlabs" | "google" | "azure" | "awspolly" | "openai" | "murf" | "reverie" | "custom" | "custom-voice";
export interface RecordingPrefs {
  voice: Voice;
  ttsProvider: TtsProvider;
  maxPages: number;
  captions: boolean;
}

const KEY = "walkcast:recording-prefs";
const DEFAULTS: RecordingPrefs = { voice: "slt", ttsProvider: "flite", maxPages: 8, captions: true };

export function readPrefs(): RecordingPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<RecordingPrefs>;
    const providers: TtsProvider[] = ["flite", "sarvam", "bhashini", "elevenlabs", "google", "azure", "awspolly", "openai", "murf", "reverie", "custom", "custom-voice"];
    return {
      voice: (["slt", "awb", "kal", "rms"] as const).includes(raw.voice as Voice) ? (raw.voice as Voice) : DEFAULTS.voice,
      ttsProvider: providers.includes(raw.ttsProvider as TtsProvider) ? (raw.ttsProvider as TtsProvider) : DEFAULTS.ttsProvider,
      maxPages: Number.isFinite(raw.maxPages) ? Math.max(1, Math.min(30, Math.trunc(raw.maxPages!))) : DEFAULTS.maxPages,
      captions: typeof raw.captions === "boolean" ? raw.captions : DEFAULTS.captions,
    };
  } catch {
    return DEFAULTS;
  }
}

export function usePrefs(): [RecordingPrefs, (patch: Partial<RecordingPrefs>) => void] {
  const [prefs, setPrefs] = useState(readPrefs);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable: defaults apply next time */
    }
  }, [prefs]);
  return [prefs, (patch) => setPrefs((p) => ({ ...p, ...patch }))];
}

export const VOICE_LABEL: Record<Voice, { name: string; note: string }> = {
  slt: { name: "Slt", note: "US English, female" },
  awb: { name: "Awb", note: "Scottish English, male" },
  kal: { name: "Kal", note: "US English, male, older diphone voice" },
  rms: { name: "Rms", note: "US English, male" },
};
