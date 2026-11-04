import { existsSync } from "node:fs";
import { extname, join, sep } from "node:path";
import { TYPES, streamFile } from "../http.ts";
import type { Route } from "./router.ts";

/** /files/: a recording's media (through the media store) and the Lab's own output on disk. */
export const fileRoutes: Route[] = [
  {
    method: "*",
    path: /^\/files\//,
    auth: "owner-checked",
    handler: async ({ req, res, url, json, redirect, canSee, canSeeLab, deps: { data, media, findRecording } }) => {
      let rel: string;
      try {
        rel = decodeURIComponent(url.pathname.slice("/files/".length));
      } catch {
        return json(400, { error: "bad path" });
      }
      // Accept a backslash as a separator too: recordings indexed before this was normalised on
      // Windows carry "recordings\<id>" in their `dir`, and those are already on disk.
      const rec = /^recordings[\\/]([^\\/]+)[\\/]([^\\/]+)$/.exec(rel);
      if (rec) {
        const [, id, file] = rec as unknown as [string, string, string];
        const row = await findRecording(id);
        if (!row || !canSee(row.owner)) return json(404, { error: "not found" });
        const where = await media.locate(id, file);
        if (!where) return json(404, { error: "not found" });
        if ("redirect" in where) return redirect(where.redirect);
        return streamFile(req, res, where.path, TYPES[extname(file).toLowerCase()] ?? "application/octet-stream", "private, max-age=3600");
      }
      const abs = data.safe(rel);
      const type = abs ? TYPES[extname(abs).toLowerCase()] : undefined;
      const inRecordings = !!abs && (abs === join(data.root, "recordings") || abs.startsWith(join(data.root, "recordings") + sep));
      if (!abs || !type || !existsSync(abs) || inRecordings || !canSeeLab(abs)) return json(404, { error: "not found" });
      return streamFile(req, res, abs, type, "private, max-age=3600");
    },
  },
];
