/**
 * The voices each cloud narration provider can speak with, and the language each one speaks. The
 * dashboard's TTS picker reads this so picking a provider offers that provider's voices rather than
 * the local flite names.
 *
 * Language and voice are one decision, not two: Google, Azure and Polly reject a voice whose
 * language doesn't match, so the voice a person picks carries its language (from the voice id where
 * the provider encodes one, else from the catalog), and only providers whose voices are free-text
 * ids need a language typed alongside them.
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
  /** BCP-47 language tag this voice speaks, when the provider needs one to match it. */
  lang?: string;
}

const CATALOG: Record<string, CloudVoice[]> = {
  // ElevenLabs' premade voices: the only ones a free account may use through the API (library
  // voices answer 402 "paid_plan_required" there). Checked against /v2/voices, October 2026.
  elevenlabs: [
    { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", note: "US English, female, confident narration" },
    { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", note: "British English, male, warm storyteller" },
    { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", note: "British English, female, clear educator" },
    { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", note: "British English, male, steady broadcaster" },
    { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", note: "US English, female, professional" },
    { id: "cjVigY5qzO86Huf0OWal", name: "Eric", note: "US English, male, smooth" },
    { id: "SAz9YHcvj6GT2YYXdXww", name: "River", note: "US English, neutral, relaxed" },
    { id: "nPczCjzI2devNBz1zQrb", name: "Brian", note: "US English, male, deep" },
    { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica", note: "US English, female, bright" },
    { id: "bIHbv24MWmeRgasZH58o", name: "Will", note: "US English, male, relaxed" },
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
    { id: "en-US-Neural2-A", name: "Neural2 A", note: "US English, female", lang: "en-US" },
    { id: "en-US-Neural2-D", name: "Neural2 D", note: "US English, male", lang: "en-US" },
    { id: "en-US-Neural2-F", name: "Neural2 F", note: "US English, female", lang: "en-US" },
    { id: "en-US-Studio-A", name: "Studio A", note: "Studio quality, female", lang: "en-US" },
    { id: "en-US-Wavenet-A", name: "Wavenet A", note: "US English, female", lang: "en-US" },
    { id: "en-US-Wavenet-D", name: "Wavenet D", note: "US English, male", lang: "en-US" },
    { id: "en-US-Wavenet-F", name: "Wavenet F", note: "US English, female", lang: "en-US" },
    { id: "en-GB-Neural2-A", name: "Neural2 A (UK)", note: "UK English, female", lang: "en-GB" },
    { id: "en-GB-Neural2-B", name: "Neural2 B (UK)", note: "UK English, male", lang: "en-GB" },
    { id: "en-IN-Neural2-A", name: "Neural2 A (India)", note: "Indian English, female", lang: "en-IN" },
    { id: "en-IN-Neural2-D", name: "Neural2 D (India)", note: "Indian English, male", lang: "en-IN" },
  ],
  azure: [
    { id: "en-US-JennyNeural", name: "Jenny", note: "US English, female, friendly", lang: "en-US" },
    { id: "en-US-GuyNeural", name: "Guy", note: "US English, male", lang: "en-US" },
    { id: "en-US-AriaNeural", name: "Aria", note: "US English, female, lively", lang: "en-US" },
    { id: "en-US-DavisNeural", name: "Davis", note: "US English, male", lang: "en-US" },
    { id: "en-GB-SoniaNeural", name: "Sonia (UK)", note: "UK English, female", lang: "en-GB" },
    { id: "en-GB-RyanNeural", name: "Ryan (UK)", note: "UK English, male", lang: "en-GB" },
    { id: "en-IN-NeerjaNeural", name: "Neerja (India)", note: "Indian English, female", lang: "en-IN" },
    { id: "en-IN-PrabhatNeural", name: "Prabhat (India)", note: "Indian English, male", lang: "en-IN" },
    { id: "hi-IN-SwaraNeural", name: "Swara (Hindi)", note: "Hindi, female", lang: "hi-IN" },
    { id: "hi-IN-MadhurNeural", name: "Madhur (Hindi)", note: "Hindi, male", lang: "hi-IN" },
  ],
  awspolly: [
    { id: "Aditi", name: "Aditi", note: "Indian English/Hindi, female", lang: "en-IN" },
    { id: "Amy", name: "Amy", note: "UK English, female", lang: "en-GB" },
    { id: "Brian", name: "Brian", note: "UK English, male", lang: "en-GB" },
    { id: "Emma", name: "Emma", note: "UK English, female", lang: "en-GB" },
    { id: "Joanna", name: "Joanna", note: "US English, female, narration", lang: "en-US" },
    { id: "Kevin", name: "Kevin", note: "US English, male", lang: "en-US" },
    { id: "Salli", name: "Salli", note: "US English, female", lang: "en-US" },
    { id: "Arthur", name: "Arthur", note: "UK English, male", lang: "en-GB" },
    { id: "Kajal", name: "Kajal", note: "Indian English/Hindi, female", lang: "en-IN" },
    { id: "Liam", name: "Liam", note: "Canadian French, male", lang: "fr-CA" },
    { id: "Zhiyu", name: "Zhiyu", note: "Mandarin, female", lang: "cmn-CN" },
  ],
  kokoro: [
    { id: "af_heart", name: "Heart", note: "US English, female, warm (open source)" },
    { id: "af_bella", name: "Bella", note: "US English, female, bright" },
    { id: "af_nicole", name: "Nicole", note: "US English, female, calm" },
  ],
};

/** `polly` is the alias AWS Polly is also selected by. */
const ALIASES: Record<string, string> = { polly: "awspolly", maya: "custom" };

/** The credential each cloud provider needs, so "you picked one we can't reach" can say which. */
const CREDENTIAL: Record<string, string> = {
  elevenlabs: "ELEVENLABS_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_TTS_API_KEY",
  azure: "AZURE_TTS_KEY and AZURE_TTS_REGION",
  awspolly: "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY",
  sarvam: "SARVAM_API_KEY",
  bhashini: "BHASHINI_API_KEY and BHASHINI_USER_ID",
  murf: "MURF_API_KEY",
  reverie: "REVERIE_API_KEY and REVERIE_APP_ID",
  custom: "LAB_TTS_ENDPOINT",
};

/** The env var(s) a provider is configured with, or "" when it needs none. */
export function credentialFor(provider: string): string {
  return CREDENTIAL[normalizeProvider(provider)] ?? "";
}

/** How each provider is named in the dashboard, the errors and the narration notes. */
const LABEL: Record<string, string> = {
  flite: "Basic offline voice",
  none: "No voice",
  elevenlabs: "ElevenLabs",
  openai: "OpenAI",
  google: "Google Cloud",
  azure: "Azure",
  awspolly: "AWS Polly",
  sarvam: "Sarvam",
  bhashini: "Bhashini",
  murf: "Murf",
  reverie: "Reverie",
  custom: "Custom TTS",
  "custom-voice": "Custom voice",
  kokoro: "Kokoro (offline)",
};

export function providerLabel(provider: string): string {
  return LABEL[provider.trim().toLowerCase()] ?? provider;
}

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
  return !["", "flite", "none", "local", "custom-voice", "custom_voice", "kokoro"].includes(provider.trim().toLowerCase());
}

/**
 * Providers whose API takes a language that has to match the voice. ElevenLabs' multilingual model
 * and OpenAI's voices infer it from the text, so for those the language is empty by design.
 */
const LANGUAGE_AWARE = new Set(["sarvam", "bhashini", "google", "azure", "awspolly", "reverie", "custom"]);

/** Each provider's fallback language, matching what these engines used before voices were pickable. */
const LANGUAGE_FALLBACK: Record<string, string> = {
  sarvam: "en-IN",
  bhashini: "hi",
  reverie: "hi",
  custom: "en",
  google: "en-US",
  azure: "en-US",
  awspolly: "en-US",
};

/** Free-text voice ids carry no language, so the picker asks for one next to the id. */
export function needsLanguageInput(provider: string): boolean {
  const p = normalizeProvider(provider);
  return LANGUAGE_AWARE.has(p) && !voicesFor(p).some((v) => v.lang);
}

const LOCALE_IN_ID = /^([a-z]{2,3}(?:[-_][A-Za-z]{2,4})?)[-_]/;

/**
 * The language to send alongside `voice`: the one the voice speaks (from its id where the provider
 * encodes it, else from the catalog), then `LAB_TTS_LANGUAGE`, then the provider's default. Voice
 * wins over the env var because a mismatched language makes the provider reject the request.
 */
export function languageFor(provider: string, voice?: string | null, env: NodeJS.ProcessEnv = process.env): string {
  const p = normalizeProvider(provider);
  if (!LANGUAGE_AWARE.has(p)) return "";
  const id = voice?.trim() ?? "";
  const inId = LOCALE_IN_ID.exec(id)?.[1]?.replace("_", "-");
  if (inId) return inId;
  const listed = voicesFor(p).find((v) => v.id === id)?.lang;
  if (listed) return listed;
  return env.LAB_TTS_LANGUAGE?.trim() || LANGUAGE_FALLBACK[p] || "en";
}

/** The language a provider speaks when nothing is chosen. */
export function defaultLanguageFor(provider: string, env: NodeJS.ProcessEnv = process.env): string {
  const p = normalizeProvider(provider);
  if (!LANGUAGE_AWARE.has(p)) return "";
  return env.LAB_TTS_LANGUAGE?.trim() || voicesFor(p).find((v) => v.lang)?.lang || LANGUAGE_FALLBACK[p] || "en";
}

/**
 * The voice used when nothing is chosen: the server's `*_VOICE` env var if set, else the provider's
 * first voice that speaks the deployment's language, else its first voice.
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
  const list = voicesFor(p);
  const wanted = defaultLanguageFor(p, env);
  return list.find((v) => v.lang === wanted)?.id ?? list[0]?.id ?? FALLBACK[p] ?? "";
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

/** The language the picker should send: a valid tag wins, then the voice's own language. */
export function resolveLanguage(provider: string, chosen: string | null | undefined, voice?: string | null): string {
  if (typeof chosen === "string" && /^[a-z]{2,3}(?:[-_][A-Za-z]{2,4})?$/i.test(chosen.trim())) return chosen.trim().replace("_", "-");
  return languageFor(provider, voice);
}