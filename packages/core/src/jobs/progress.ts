/**
 * Rate-limits job progress writes without ever losing the newest value.
 *
 * The recorder reports a stage every few seconds and sometimes three at once at the end, while
 * every write is a row update the database pays for. A plain leading-edge throttle drops the
 * values in the middle of a burst — including the last, which is the one the user keeps looking
 * at. This keeps the first write immediate, spends at most one write per `minGapMs`, and always
 * flushes the newest value.
 *
 * The point of the window is that progress can be written at *stage* cadence — what the app
 * polls for (see `dashboard/src/lib/api.ts`) — instead of only on the 20 s lease heartbeat,
 * which read as a frozen screen for exactly the minutes a user watches (docs/SCALING.md §7).
 */
export interface ProgressThrottle {
  /** Record a value: written now when the window is open, otherwise when it closes. */
  push(value: string): void;
  /** Write any pending value and wait for the writes so far (call before finishing the job). */
  flush(): Promise<void>;
}

export function progressThrottle(write: (value: string) => unknown, minGapMs = 1000): ProgressThrottle {
  let lastAt = 0;
  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> = Promise.resolve();

  const send = (value: string) => {
    lastAt = Date.now();
    pending = null;
    // A progress label is never worth failing a job over: the async wrapper turns a synchronous
    // throw from `write` into a rejection this catches.
    inFlight = (async () => {
      await write(value);
    })().catch(() => undefined);
  };

  const closeWindow = () => {
    timer = null;
    if (pending !== null) send(pending);
  };

  return {
    push(value) {
      const elapsed = Date.now() - lastAt;
      if (elapsed >= minGapMs) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        send(value);
        return;
      }
      pending = value;
      timer ??= setTimeout(closeWindow, minGapMs - elapsed);
    },
    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (pending !== null) send(pending);
      await inFlight;
    },
  };
}
