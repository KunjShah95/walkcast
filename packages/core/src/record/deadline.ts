/**
 * Cap how long a promise may take.
 *
 * Playwright's `page.evaluate` and `$eval` have no timeout of their own: a page stuck in a
 * long task, a hung renderer or a dialog nobody dismissed never answers, and the recording
 * waits with it until the job's own deadline kills everything. Racing the call against a timer
 * turns "the page stopped answering" into an ordinary rejection the caller already handles.
 *
 * The slow call is not cancelled (Playwright cannot), only abandoned; its late result or error
 * is swallowed so it never becomes an unhandled rejection.
 */
export const EVALUATE_MS = 8000;

export class DeadlineError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} did not answer within ${Math.round(ms / 1000)}s`);
    this.name = "DeadlineError";
  }
}

export async function withDeadline<T>(work: Promise<T>, ms: number = EVALUATE_MS, label = "The page"): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineError(label, ms)), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
    work.catch(() => undefined);
  }
}
