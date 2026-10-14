/**
 * Known secret values (credentials the harness hands to agents). Anything written to disk is
 * scrubbed: each value becomes a {{secret:name}} placeholder. Replay restores placeholders to the
 * real values in memory, so cassettes never hold a secret yet replayed runs can still sign in.
 */
const SECRETS = new Map<string, string>();

export function registerSecret(name: string, value: string): void {
  if (value.length >= 4) SECRETS.set(name, value);
}

export function scrub<T>(value: T): T {
  if (SECRETS.size === 0) return value;
  let text = JSON.stringify(value);
  if (text === undefined) return value;
  for (const [name, secret] of SECRETS) text = text.split(jsonEscape(secret)).join(`{{secret:${name}}}`);
  return JSON.parse(text) as T;
}

export function scrubText(text: string): string {
  let out = text;
  for (const [name, secret] of SECRETS) out = out.split(secret).join(`{{secret:${name}}}`);
  return out;
}

export function unscrub<T>(value: T): T {
  if (SECRETS.size === 0) return value;
  let text = JSON.stringify(value);
  if (text === undefined) return value;
  for (const [name, secret] of SECRETS) text = text.split(`{{secret:${name}}}`).join(jsonEscape(secret));
  return JSON.parse(text) as T;
}

function jsonEscape(s: string): string {
  return JSON.stringify(s).slice(1, -1);
}
