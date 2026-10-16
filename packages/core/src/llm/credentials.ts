import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-job model credentials, carried by async context instead of process.env.
 *
 * process.env is process-global: one user's job once set OPENROUTER_API_KEY globally to run a
 * run, and restored it afterwards. That is only safe while a worker holds one job at a time —
 * the second a worker runs two lab jobs concurrently, tenant A's key can charge tenant B's run.
 * A worker resolves the job owner's connected keys and runs the job inside this scope instead,
 * so each run resolves its own keys no matter how many runs share the process.
 */
export type CredentialOverrides = Record<string, string>;

const storage = new AsyncLocalStorage<CredentialOverrides>();

/**
 * Run `fn` with `overrides` answering credential lookups first. Values the owner did not
 * connect stay answered by process.env (a shared server key), exactly as before. An empty map
 * skips the scope entirely.
 */
export function withCredentials<T>(overrides: CredentialOverrides, fn: () => Promise<T>): Promise<T> {
  if (Object.keys(overrides).length === 0) return fn();
  return storage.run(overrides, fn);
}

/** Credential lookup: the job's overrides inside the scope, process.env otherwise/nullary. */
export function lookup(name: string): string | undefined {
  const overrides = storage.getStore();
  const value = overrides?.[name];
  if (value) return value;
  return process.env[name];
}
