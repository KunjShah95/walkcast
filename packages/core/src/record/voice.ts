/**
 * Voice synthesis backends for Walkcast's narration pipeline. The engine produces a WAV (or any
 * ffmpeg-readable file) for one line of text; the pipeline in `media.ts` mixes and muxes the rest.
 *
 * Backend selection honours `LAB_TTS_PROVIDER` (`flite` (default), `sarvam`, `bhashini`,
 * `elevenlabs`). Any failure to reach the provider throws so the recording still ships with video
 * + captions (the existing `buildMedia` catch keeps what we have). Keys never leave the server.
 */
import { execFile, spawnSync } from "node:child_process";
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

/**
 * The speech engine built into Windows (SAPI, System.Speech), driven through PowerShell. Every
 * Windows 10/11 install has it, while the ffmpeg builds people get on Windows (gyan.dev, BtbN)
 * leave out flite, so this is what narrates on Windows. The flite voice names map to a gender:
 * slt is female, the others male; Windows picks its installed voice for that gender.
 */
export function sapiEngine(voice: FliteVoice): VoiceEngine {
  const gender = voice === "slt" ? "Female" : "Male";
  return {
    id: `windows:${gender.toLowerCase()}`,
    kind: "local",
    available: sapiAvailable,
    async speak(text, outFile, cwd) {
      const txt = join(cwd, ".tts-tmp.txt");
      writeFileSync(txt, text, "utf8");
      // Paths and text reach PowerShell through the environment, so nothing needs quoting.
      await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", SAPI_SCRIPT], {
        env: { ...process.env, WALKCAST_TTS_IN: txt, WALKCAST_TTS_OUT: outFile, WALKCAST_TTS_GENDER: gender },
        timeout: 60_000,
        windowsHide: true,
      });
      if (!existsSync(outFile)) throw new Error("Windows speech produced no audio");
    },
  };
}

const SAPI_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "Add-Type -AssemblyName System.Speech",
  "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
  "try { $s.SelectVoiceByHints([System.Speech.Synthesis.VoiceGender]::$env:WALKCAST_TTS_GENDER) } catch {}",
  "$f = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)",
  "$s.SetOutputToWaveFile($env:WALKCAST_TTS_OUT, $f)",
  "$s.Speak([IO.File]::ReadAllText($env:WALKCAST_TTS_IN))",
  "$s.Dispose()",
].join("; ");

let sapi: boolean | undefined;
/** Whether Windows speech is usable here: Windows, PowerShell, and at least one installed voice. */
export function sapiAvailable(): boolean {
  if (sapi === undefined) {
    if (process.platform !== "win32" || process.env.LAB_TTS_PROVIDER === "flite") return (sapi = false);
    const out = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices().Count"],
      { encoding: "utf8", timeout: 30_000, windowsHide: true },
    );
    sapi = out.status === 0 && Number.parseInt(out.stdout.trim(), 10) > 0;
  }
  return sapi;
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
