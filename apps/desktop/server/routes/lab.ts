import { existsSync } from "node:fs";
import { extname, join } from "node:path";
import { failureDir } from "../../../../packages/core/src/jobs/worker.ts";
import { TYPES, clampInt, streamFile } from "../http.ts";
import type { Route } from "./router.ts";

/** The Lab's data: the index of runs, fixtures, experiments and recordings, failures, and one run's detail. */
export const labRoutes: Route[] = [
  {
    method: "*",
    path: "/api/index",
    auth: "owner-checked",
    handler: async ({ url, user, json, canSee, canSeeLab, deps: { data, store, requireAuth, listRecordings } }) => {
      const limit = clampInt(url.searchParams.get("limit"), 1, 2000, 500);
      const index = data.index(limit);
      const scope = requireAuth ? (user?.id ?? "-") : null;
      const failed = await Promise.all([store.failedJobs(scope, "record", 200), store.failedJobs(scope, "run", 200)]).then((l) => l.flat(), () => []);
      return json(200, {
        ...index,
        runs: index.runs.filter((r) => canSeeLab(r.dir)),
        fixtures: index.fixtures.filter((f) => canSeeLab(f.dir)),
        experiments: index.experiments.filter((e) => canSeeLab(e.dir)),
        recordings: (await listRecordings(user)).filter((r) => canSee(r.owner)),
        failedRecordings: failed.filter((j) => canSee(j.owner)).length,
      });
    },
  },
  // Recordings that failed, for the Lab: the job's error and last stage, plus the report and
  // evidence (screenshot, partial video, pages reached) the worker kept when it could.
  {
    method: "GET",
    path: "/api/failures",
    auth: "owner-checked",
    handler: async ({ user, json, canSee, deps: { store, requireAuth, failureFor, runFailureFor } }) => {
      const scope = requireAuth ? (user?.id ?? "-") : null;
      const [jobs, runs] = await Promise.all([store.failedJobs(scope, "record", 200), store.failedJobs(scope, "run", 200)]);
      return json(200, { failures: jobs.filter((j) => canSee(j.owner)).map((j) => failureFor(j)), runs: runs.filter((j) => canSee(j.owner)).map((j) => runFailureFor(j)) });
    },
  },
  {
    method: ["GET", "HEAD"],
    path: /^\/api\/failures\/([0-9a-f-]{36})\/(failure\.png|video\.webm)$/i,
    auth: "owner-checked",
    handler: async ({ req, res, json, params, canSee, deps: { store, root } }) => {
      const [, id, file] = params as unknown as [string, string, string];
      const job = await store.job(id);
      if (!job || job.kind !== "record" || !canSee(job.owner)) return json(404, { error: "not found" });
      const abs = join(failureDir(root, id), file);
      if (!existsSync(abs)) return json(404, { error: "not found" });
      return streamFile(req, res, abs, TYPES[extname(file).toLowerCase()] ?? "application/octet-stream", "private, max-age=3600");
    },
  },
];

/**
 * One run's detail, for any method but POST (which jobRoutes' POST /api/run answers first). It
 * must stay after jobRoutes in the table: it matches every method on /api/run.
 */
export const labRunRoutes: Route[] = [
  {
    method: "*",
    path: "/api/run",
    auth: "owner-checked",
    handler: ({ url, json, canSeeLab, deps: { data } }) => {
      const dir = url.searchParams.get("dir") ?? "";
      const detail = canSeeLab(dir) ? data.run(dir) : null;
      return detail ? json(200, detail) : json(404, { error: "run not found" });
    },
  },
];
