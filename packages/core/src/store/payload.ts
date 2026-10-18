import type { Job } from "./types.ts";

/** The body of a `job.completed` event. No input, no secret: only what the owner already sees. */
export function jobCompletedPayload(job: Job): Record<string, unknown> {
  return {
    job: {
      id: job.id,
      kind: job.kind,
      status: job.status,
      owner: job.owner,
      ...(job.status === "succeeded" ? { result: job.result } : { error: job.error }),
      attempts: job.attempts,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
    },
  };
}
