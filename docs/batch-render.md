# Batch render

Re-export several existing recordings to a feed shape (9:16 or 1:1) in one background job,
instead of one `POST /api/recordings/:id/export` call per recording. The per-item work is
exactly what that single-recording endpoint does; this just runs it over a list, sequentially,
so one bad recording in the batch doesn't sink the rest.

## `POST /api/recordings/batch-render`

Requires a signed-in session, same as every other `/api/*` route — signed out gets a plain
`401`:

```json
{ "error": "Sign in to use the dashboard.", "signIn": "/login?next=%2Fapp" }
```

**Request body**

```json
{ "recordingIds": ["rec-1", "rec-2", "rec-3"], "shape": "vertical" }
```

- `recordingIds` — non-empty array of recording ids. Every id must exist and belong to the
  signed-in account.
- `shape` — `"vertical"` (9:16) or `"square"` (1:1).

**Success — `202`**

```json
{ "jobId": "j_abc123" }
```

Unlike `/api/run` and `/api/record`, which return `{ job: {...} }`, this returns only `jobId`, to poll with
[`GET /api/jobs/:id`](#polling) below. The whole batch — regardless of how many recordings it
contains — counts as exactly **one** active job for the per-user active-job limit.

**Errors**

| Status | When | Notes |
|---|---|---|
| `401` | Not signed in. | Same gate as the rest of the dashboard API. |
| `400` | `recordingIds` missing, not an array, or empty. | |
| `400` | `recordingIds` longer than `LAB_MAX_BATCH_RENDER_ITEMS` (default 10). | Message names the limit. |
| `400` | `shape` is missing or not `"vertical"`/`"square"`. | |
| `404` | Any id in `recordingIds` doesn't exist, or isn't owned by the signed-in account. | **All-or-nothing**: every id is checked before anything is enqueued. If id #9 of 10 is bad, nothing from that request runs — not even the first 8 — so the caller finds out which one is bad before burning any of the batch. |
| `429` | The account is already at `LIMITS.activeJobsPerUser` (default 1) active jobs. | Same limit `POST /api/record` and `POST /api/run` share; a batch doesn't get its own separate allowance. |

## Configuration: `LAB_MAX_BATCH_RENDER_ITEMS`

The most recordings one batch-render request may include. Read once at startup from the
`LAB_MAX_BATCH_RENDER_ITEMS` environment variable; **default 10** if unset.

```bash
LAB_MAX_BATCH_RENDER_ITEMS=25 npm run app
```

This is deliberately an environment variable rather than a constant in `server.ts`: an
operator who wants a larger (or smaller) ceiling for their deployment sets it where every
other per-deployment limit already lives (`LAB_MAX_ACTIVE_JOBS`, `LAB_JOB_DEADLINE_MS`, etc.),
with no code change and no redeploy of a different build. If you're running your own instance
and the default of 10 doesn't fit how your users batch-render, raise (or lower) it with this
variable — don't fork the limit into code.

## Polling result and progress

There is no separate batch-render polling route. Progress and the final result come back
through the existing generic job endpoint:

```
GET /api/jobs/:id
```

While the job runs, `progress` is a string of the form `"rendering {i}/{n}"` (1-indexed),
updated as each recording finishes its turn.

On completion, `result` is:

```json
{
  "total": 3,
  "succeeded": 2,
  "failed": 1,
  "items": [
    { "recordingId": "rec-1", "status": "ok" },
    { "recordingId": "rec-2", "status": "error", "error": "Recording not found." },
    { "recordingId": "rec-3", "status": "ok" }
  ]
}
```

Per-item failures (a recording deleted after the job was enqueued, a corrupt or missing
source file, an ownership mismatch discovered again at render time) are caught and recorded
in `items` — they do not fail the job as a whole or stop the remaining items from being
processed. The job itself only fails outright for something outside any single item, such as
hitting its overall time ceiling.

## User configuration guide

Nothing about batch size is hardcoded: `LAB_MAX_BATCH_RENDER_ITEMS` is the one knob, read from
the environment at startup, with a sane default (10) so most deployments never need to touch
it. If your users regularly want larger batches, set the environment variable for your
deployment — there's no code path that needs to change to support a different limit.
