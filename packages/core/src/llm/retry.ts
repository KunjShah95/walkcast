/**
 * Retrying a model call that failed for a reason that passes.
 *
 * A rate limit (429), an overloaded provider (529) or a server error (5xx) usually clears in
 * seconds. Failing the run on the first one made a single-provider run as fragile as that
 * provider's busiest minute. Each backend retries such a call a few times, backing off and
 * honouring the provider's Retry-After, before the error reaches the fallback chain or the run.
 *
 * The SDK backends (Anthropic, OpenAI-compatible) do this themselves; they are given the same
 * retry count. The raw-fetch backend (ChatGPT Responses) uses `withRetry` below.
 */

/** Retries after the first attempt. LAB_LLM_MAX_RETRIES overrides; 0 turns retrying off. */
export function llmMaxRetries(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.LAB_LLM_MAX_RETRIES);
  return env.LAB_LLM_MAX_RETRIES !== undefined && env.LAB_LLM_MAX_RETRIES.trim() !== "" && Number.isInteger(n) && n >= 0 ? Math.min(n, 10) : 4;
}

/** Statuses worth another attempt: rate limits, timeouts, overload and server errors. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status === 529 || (status >= 500 && status <= 599);
}

/** The longest a single wait may be, whatever Retry-After says: a run has a deadline. */
const MAX_WAIT_MS = 30_000;

/**
 * How long to wait before attempt `attempt` (1 = the first retry): the provider's Retry-After
 * when it sent one (seconds or an HTTP date), else 0.5 s doubling, with jitter so a fleet of
 * workers does not retry in step.
 */
export function retryDelayMs(attempt: number, retryAfter?: string | null, now = Date.now()): number {
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs) && secs >= 0) return Math.min(MAX_WAIT_MS, Math.round(secs * 1000));
    const at = Date.parse(retryAfter);
    if (Number.isFinite(at)) return Math.min(MAX_WAIT_MS, Math.max(0, at - now));
  }
  const base = Math.min(MAX_WAIT_MS, 500 * 2 ** (attempt - 1));
  return Math.round(base * (0.75 + Math.random() * 0.5));
}

/** An HTTP failure a backend can describe: its status and, when sent, its Retry-After. */
export class HttpStatusError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter: string | null = null,
  ) {
    super(message);
    this.name = "HttpStatusError";
  }
}

/**
 * Run `call`, and again after a wait when it fails with a retryable HttpStatusError, up to
 * `retries` more times. Any other error, or the last retryable one, is thrown as it is.
 */
export async function withRetry<T>(
  call: () => Promise<T>,
  options: { retries?: number; signal?: AbortSignal; sleep?: (ms: number) => Promise<void>; onRetry?: (attempt: number, error: HttpStatusError, waitMs: number) => void } = {},
): Promise<T> {
  const retries = options.retries ?? llmMaxRetries();
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    options.signal?.throwIfAborted();
    try {
      return await call();
    } catch (e) {
      if (!(e instanceof HttpStatusError) || !isRetryableStatus(e.status) || attempt >= retries) throw e;
      const wait = retryDelayMs(attempt + 1, e.retryAfter);
      options.onRetry?.(attempt + 1, e, wait);
      await sleep(wait);
    }
  }
}
