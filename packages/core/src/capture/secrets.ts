/**
 * Known secret values (credentials the harness hands to agents). Anything written to disk is
 * scrubbed: each value becomes a {{secret:name}} placeholder. Replay restores placeholders to the
 * real values in memory, so cassettes never hold a secret yet replayed runs can still sign in.
 */
const SECRETS = new Map<string, string>();

export function registerSecret(name: string, value: string): void {
  // Scrubbing is a find-and-replace over serialized JSON, so a one- or two-character "secret"
  // would rewrite every occurrence of those characters (keys, quotes) and corrupt the trace.
  // Values under 4 characters are not real credentials; skip them.
  if (value.length >= 4) SECRETS.set(name, value);
}

/** Forget secrets when the job that registered them is done (workers run many jobs). */
export function unregisterSecret(...names: string[]): void {
  for (const name of names) SECRETS.delete(name);
}

export function scrub<T>(value: T): T {
  if (SECRETS.size === 0) return value;
  let text = JSON.stringify(value);
  if (text === undefined) return value;
  // Longest secrets first, so a secret that is a substring of another can't be partially replaced.
  const ordered = [...SECRETS.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [name, secret] of ordered) text = text.split(jsonEscape(secret)).join(`{{secret:${name}}}`);
  return JSON.parse(text) as T;
}

export function scrubText(text: string): string {
  let out = text;
  const ordered = [...SECRETS.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [name, secret] of ordered) out = out.split(secret).join(`{{secret:${name}}}`);
  return out;
}

export function unscrub<T>(value: T): T {
  if (SECRETS.size === 0) return value;
  let text = JSON.stringify(value);
  if (text === undefined) return value;
  // Placeholders are distinct strings, so order is not strictly required, but sorting by secret length
  // keeps behaviour symmetric with scrub().
  const ordered = [...SECRETS.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [name, secret] of ordered) text = text.split(`{{secret:${name}}}`).join(jsonEscape(secret));
  return JSON.parse(text) as T;
}

function jsonEscape(s: string): string {
  return JSON.stringify(s).slice(1, -1);
}
