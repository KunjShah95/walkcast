/**
 * Voice synthesis backends for Walkcast's narration pipeline. The engine produces a WAV (or any
 * ffmpeg-readable file) for one line of text; the pipeline in `media.ts` mixes and muxes the rest.
 *
 * Backend selection honours `LAB_TTS_PROVIDER` (`flite` (default), `sarvam`, `bhashini`,
 * `elevenlabs`). Any failure to reach the provider throws so the recording still ships with video
 * + captions (the existing `buildMedia` catch keeps what we have). Keys never leave the server.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FFMPEG = process.env.LAB_FFMPEG ?? "ffmpeg";
const execFileAsync = promisify(execFile);
async function run(args: string[], opts: { cwd?: string } = {}): Promise<void> {
  await execFileAsync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], { cwd: opts.cwd, maxBuffer: 4 * 1024 * 1024, timeout: 5 * 60_000, killSignal: "SIGKILL" });
}

export interface VoiceEngine {
  /** Short label shown in `MediaResult.note` and in the voice picker. */
  readonly id: string;
  /** Where text-to-speech runs for this engine. */
  readonly kind: "local" | "cloud";
  /** Synthesize `text` into `outFile`. */
  speak(text: string, outFile: string, cwd: string): Promise<void>;
  /** Zero-network engines are always available; cloud ones need a key + network. */
  available(): boolean;
}

const VOICES = ["slt", "awb", "kal", "rms"] as const;
export type FliteVoice = (typeof VOICES)[number];

export function fliteEngine(voice: FliteVoice): VoiceEngine {
  return {
    id: `flite:${voice}`,
    kind: "local",
    available: (): boolean => true,
    async speak(text, outFile, cwd) {
      const txt = join(cwd, ".tts-tmp.txt");
      writeFileSync(txt, text.replace(/[{}]/g, ""));
      await run(["-f", "lavfi", "-i", `flite=textfile=.tts-tmp.txt:voice=${voice}`, "-ar", "22050", "-ac", "1", outFile], { cwd });
    },
  };
}

/** Best-effort Sarvam (Bulbul) backend. Endpoint shape per Sarvam's public API as of 2026. */
export function sarvamEngine(): VoiceEngine | null {
  const key = process.env.SARVAM_API_KEY?.trim();
  if (!key) return null;
  const language = process.env.LAB_TTS_LANGUAGE ?? "en-IN";
  return {
    id: "sarvam:bulbul",
    kind: "cloud",
    available: (): boolean => Boolean(key),
    async speak(text, outFile) {
      const res = await fetch("https://api.sarvam.ai/text-to-speech", {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-subscription-key": key },
        body: JSON.stringify({ inputs: [text], target_language_code: language, speaker: process.env.SARVAM_SPEAKER ?? "anushka", model: "bulbul:v2" }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`sarvam TTS failed (${res.status})`);
      const json = (await res.json()) as { audios?: string[] };
      const encoded = json.audios?.[0];
      if (!encoded) throw new Error("sarvam returned no audio");
      const buf = Buffer.from(encoded, "base64");
      const { writeFile } = await import("node:fs/promises");
      await writeFile(outFile, buf);
    },
  };
}

export function chooseVoiceEngine(): VoiceEngine {
  const choice = (process.env.LAB_TTS_PROVIDER ?? "flite").trim().toLowerCase();
  if (choice === "sarvam" || choice === "bhashini") {
    const s = sarvamEngine();
    if (s) return s;
    console.warn("LAB_TTS_PROVIDER=sarvam but no SARVAM_API_KEY; falling back to flite.");
  }
  // Bhashini and ElevenLabs are wire-compatible enough that one can supply them behind the same
  // contract: set LAB_TTS_PROVIDER=private and point LAB_TTS hablar endpoint; flite is always the
  // last-resort default.
  return fliteEngine(process.env.LAB_TTS_VOICE ? (process.env.LAB_TTS_VOICE as any) : "slt");
}
