/**
 * The voices each cloud narration provider can speak with. The dashboard's TTS picker reads this
 * so picking a provider offers that provider's voices rather than the local flite names.
 *
 * Providers whose voice ids are not a stable public list (Murf, Reverie, Bhashini, Sarvam, a custom
 * HTTP endpoint) are typed by hand instead: the picker shows a text box seeded with whatever
 * `*_VOICE` env var the server already has.
 */

/** One selectable voice. `id` is exactly what the provider's API expects. */
export interface CloudVoice {
  id: string;
  name: string;
  note?: string;
}

const CATALOG: Record<string, CloudVoice[]> = {
  elevenlabs: [
    { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", note: "US English, female, warm narration" },
    { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", note: "US English, male, documentary" },
    { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", note: "US English, female, soft" },
    { id: "ErXwobaYiN019PkySvjV", name: "Antoni", note: "US English, male, conversational" },
    { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli", note: "US English, female, young" },
    { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", note: "US English, male, deep" },
    { id: "VR6AewLTigWG4xSOukaG", name: "Arnold", note: "US English, male, narration" },
    { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam", note: "US English, male, raspy" },
  ],
  openai: [
    { id: "alloy", name: "Alloy", note: "Neutral, balanced" },
    { id: "ash", name: "Ash", note: "Low, male" },
    { id: "ballad", name: "Ballad", note: "Soft, British" },
    { id: "coral", name: "Coral", note: "Warm, female" },
    { id: "echo", name: "Echo", note: "Flat, male" },
    { id: "fable", name: "Fable", note: "Storyteller, British" },
    { id: "onyx", name: "Onyx", note: "Deep, male" },
    { id: "nova", name: "Nova", note: "Bright, female" },
    { id: "sage", name: "Sage", note: "Calm, female" },
    { id: "shimmer", name: "Shimmer", note: "Airy, female" },
    { id: "verse", name: "Verse", note: "Expressive, gender-neutral" },
  ],
  google: [
    { id: "en-US-Neural2-A", name: "Neural2 A", note: "US English, female" },
    { id: "en-US-Neural2-D", name: "Neural2 D", note: "US English, male" },
    { id: "en-US-Neural2-F", name: "Neural2 F", note: "US English, female" },
    { id: "en-US-Studio-A", name: "Studio A", note: "Studio quality, female" },
    { id: "en-US-Wavenet-A", name: "Wavenet A", note: "US English, female" },
    { id: "en-US-Wavenet-D", name: "Wavenet D", note: "US English, male" },
    { id: "en-US-Wavenet-F", name: "Wavenet F", note: "US English, female" },
    { id: "en-GB-Neural2-A", name: "Neural2 A (UK)", note: "UK English, female" },
    { id: "en-GB-Neural2-B", name: "Neural2 B (UK)", note: "UK English, male" },
    { id: "en-IN-Neural2-A", name: "Neural2 A (India)", note: "Indian English, female" },
    { id: "en-IN-Neural2-D", name: "Neural2 D (India)", note: "Indian English, male" },
  ],
  azure: [
    { id: "en-US-JennyNeural", name: "Jenny", note: "US English, female, friendly" },
    { id: "en-US-GuyNeural", name: "Guy", note: "US English, male" },
    { id: "en-US-AriaNeural", name: "Aria", note: "US English, female, lively" },
    { id: "en-US-DavisNeural", name: "Davis", note: "US English, male" },
    { id: "en-GB-SoniaNeural", name: "Sonia (UK)", note: "UK English, female" },
    { id: "en-GB-RyanNeural", name: "Ryan (UK)", note: "UK English, male" },
    { id: "en-IN-NeerjaNeural", name: "Neerja (India)", note: "Indian English, female" },
    { id: "en-IN-PrabhatNeural", name: "Prabhat (India)", note: "Indian English, male" },
    { id: "hi-IN-SwaraNeural", name: "Swara (Hindi)", note: "Hindi, female" },
    { id: "hi-IN-MadhurNeural", name: "Madhur (Hindi)", note: "Hindi, male" },
  ],
  awspolly: [
    { id: "Aditi", name: "Aditi", note: "Indian English/Hindi, female" },
    { id: "Amy", name: "Amy", note: "US English, female" },
    { id: "Brian", name: "Brian", note: "US English, male" },
    { id: "Emma", name: "Emma", note: "UK English, female" },
    { id: "Joanna", name: "Joanna", note: "US English, female, narration" },
    { id: "Kevin", name: "Kevin", note: "US English, male" },
    { id: "Salli", name: "Salli", note: "US English, female" },
    { id: "Arthur", name: "Arthur", note: "US English, male" },
    { id: "Kajal", name: "Kajal", note: "Indian English/Hindi, female" },
    { id: "Liam", name: "Liam", note: "Irish English, male" },
    { id: "Zhiyu", name: "Zhiyu", note: "Mandarin, female" },
  ],
};

/** Providers with a curated list; anything else is typed in by hand. */
/** `polly` is the alias AWS Polly is also selected by. */
const ALIASES: Record<string, string> = { polly: "awspolly", maya: "custom" };

export function normalizeProvider(provider: string): string {
  const p = provider.trim().toLowerCase();
  return ALIASES[p] ?? p;
}

export function voicesFor(provider: string): CloudVoice[] {
  return CATALOG[normalizeProvider(provider)] ?? [];
}

/** Whether the picker should offer a list for this provider rather than a text box. */
export function hasVoiceList(provider: string): boolean {
  return voicesFor(provider).length > 0;
}

/** Local (offline) providers speak from ffmpeg's flite names or an uploaded sample, not a list. */
export function isCloudProvider(provider: string): boolean {
  return !["", "flite", "local", "custom-voice", "custom_voice"].includes(provider.trim().toLowerCase());
}

/**
 * The voice used when nothing is chosen: the server's `*_VOICE` env var if set, else the provider's
 * first catalog entry, else a sane built-in default.
 */
const FALLBACK: Record<string, string> = {
  sarvam: "anushka",
  murf: "en-IN-isha",
  reverie: "female",
};

export function defaultVoiceFor(provider: string, env: NodeJS.ProcessEnv = process.env): string {
  const p = normalizeProvider(provider);
  const configured = ({
    elevenlabs: env.ELEVENLABS_VOICE_ID,
    openai: env.OPENAI_TTS_VOICE,
    google: env.GOOGLE_TTS_VOICE,
    azure: env.AZURE_TTS_VOICE,
    awspolly: env.AWS_POLLY_VOICE,
    polly: env.AWS_POLLY_VOICE,
    sarvam: env.SARVAM_SPEAKER,
    murf: env.MURF_VOICE,
    reverie: env.REVERIE_SPEAKER,
    custom: env.LAB_TTS_VOICE,
    maya: env.LAB_TTS_VOICE,
  } as Record<string, string | undefined>)[p];
  if (configured?.trim()) return configured.trim();
  return voicesFor(p)[0]?.id ?? FALLBACK[p] ?? "";
}

/**
 * The voice id to send to a provider: the caller's choice when it is one of the provider's voices,
 * otherwise the provider's default. Keeps a stale id from prefs (or a hand-typed one) from being
 * rejected by the provider mid-recording.
 */
export function resolveVoice(provider: string, chosen?: string | null): string {
  const fallback = defaultVoiceFor(provider);
  if (!chosen?.trim()) return fallback;
  const list = voicesFor(provider);
  if (list.length > 0) return list.some((v) => v.id === chosen.trim()) ? chosen.trim() : fallback;
  // Free-text providers accept any id, so the choice stands.
  return chosen.trim();
}