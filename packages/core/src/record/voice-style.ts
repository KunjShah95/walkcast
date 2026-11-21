/**
 * How the narrator talks, not just who.
 *
 * A voice id picks a throat. What makes narration sound like a person is the delivery: how fast
 * it goes, how much it varies, and whether each line sounds like a continuation of the last. A
 * style is one name for that delivery, translated into the controls each engine actually has:
 *
 *   Kokoro      pace, and a blend of two voices when the style calls for one
 *   ElevenLabs  stability / style exaggeration, and the lines before and after for continuity
 *   OpenAI      the free-text `instructions` that gpt-4o-mini-tts follows
 *
 * Engines without such controls (flite, Windows speech, the other cloud providers) ignore it.
 */

export const VOICE_STYLES = ["warm", "calm", "upbeat", "authoritative"] as const;
export type VoiceStyle = (typeof VOICE_STYLES)[number];

export interface StyleSpec {
  label: string;
  blurb: string;
  /** Multiplier on a voice's own pace. */
  pace: number;
  /** Kokoro voice (or an equal blend, comma separated) used when the person has not chosen one. */
  kokoro: string;
  /** ElevenLabs: lower stability varies the delivery more, `style` pushes expressiveness. */
  elevenlabs: { stability: number; similarity_boost: number; style: number; use_speaker_boost: boolean };
  /** OpenAI gpt-4o-mini-tts delivery instructions. */
  instructions: string;
}

export const STYLES: Record<VoiceStyle, StyleSpec> = {
  warm: {
    label: "Warm",
    blurb: "A friendly colleague walking you through it.",
    pace: 1,
    kokoro: "af_heart",
    elevenlabs: { stability: 0.4, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
    instructions:
      "Speak like a friendly product designer showing a colleague around a website: warm, relaxed, natural. Conversational rhythm, slight smile in the voice, small pauses between ideas. Never sound like an announcer or a robot.",
  },
  calm: {
    label: "Calm",
    blurb: "Unhurried and soft, good for tutorials.",
    pace: 0.93,
    kokoro: "af_heart,af_nicole",
    elevenlabs: { stability: 0.6, similarity_boost: 0.8, style: 0.1, use_speaker_boost: true },
    instructions:
      "Speak calmly and unhurriedly, like a patient teacher recording a tutorial. Soft, even, reassuring. Leave a beat after each sentence.",
  },
  upbeat: {
    label: "Upbeat",
    blurb: "Brighter and quicker, good for launches.",
    pace: 1.07,
    kokoro: "af_bella,af_heart",
    elevenlabs: { stability: 0.3, similarity_boost: 0.75, style: 0.5, use_speaker_boost: true },
    instructions:
      "Speak with genuine, upbeat energy, like a founder who is proud of the product but not selling. Bright and quick, with natural emphasis. Never shout and never sound scripted.",
  },
  authoritative: {
    label: "Authoritative",
    blurb: "Steady and confident, good for reviews and demos to clients.",
    pace: 0.97,
    kokoro: "am_adam",
    elevenlabs: { stability: 0.55, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true },
    instructions:
      "Speak with steady, quiet confidence, like an experienced engineer presenting to a client. Measured pace, clear emphasis on the important word, no hype.",
  },
};

/** The style asked for, by option or environment; warm when neither names a real one. */
export function resolveStyle(option?: string | null, env: NodeJS.ProcessEnv = process.env): VoiceStyle {
  const v = (option ?? env.WALKCAST_VOICE_STYLE ?? "").trim().toLowerCase();
  return (VOICE_STYLES as readonly string[]).includes(v) ? (v as VoiceStyle) : "warm";
}
