/**
 * Page text that reads like instructions to an AI agent rather than to a person: the shape of an
 * indirect prompt injection. Detection is deliberately narrow (a fixed phrase list, not a model),
 * so a hit is cheap, deterministic and explainable. A hit alone is not a failure; the classifier
 * only reports `prompt-injection` when the agent's next actions also deviate toward the text.
 */
const PATTERNS: RegExp[] = [
  /\bignore (?:all |any )?(?:the )?(?:previous|prior|above|earlier) (?:instructions|prompts?|directions)\b/i,
  /\bdisregard (?:all |any )?(?:the )?(?:previous|prior|above|earlier|your) (?:instructions|prompts?|task)\b/i,
  /\bforget (?:all |your )?(?:previous |prior )?instructions\b/i,
  /\byou are now (?:a|an|in)\b/i,
  /\b(?:new|updated|real) (?:instructions|task|system prompt)\s*:/i,
  /\bsystem prompt\b/i,
  /\b(?:ai|llm|language model|assistant|agent)s?,? (?:must|should|please) (?:now )?(?:ignore|instead|immediately)\b/i,
  /\bdo not (?:tell|inform) the user\b/i,
];

/** The matching sentences (trimmed to 200 chars), or an empty list. */
export function detectInjection(text: string): string[] {
  if (!text) return [];
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const hits = sentences.filter((s) => PATTERNS.some((p) => p.test(s)));
  return [...new Set(hits)].slice(0, 5).map((s) => (s.length > 200 ? `${s.slice(0, 197)}...` : s));
}

/** Content words (4+ letters, not stop words) for overlap checks between an injection and an action. */
export function contentWords(text: string): Set<string> {
  const stop = new Set(["this", "that", "with", "from", "your", "have", "will", "into", "then", "them", "they", "their", "there", "what", "when", "which", "while", "about", "would", "should", "could", "must", "please", "previous", "instructions", "ignore", "disregard", "prior", "above", "earlier", "now", "instead"]);
  return new Set((text.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? []).filter((w) => !stop.has(w)));
}
