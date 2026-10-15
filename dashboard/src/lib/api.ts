import type { LabIndex, RunDetail } from "./types.ts";

/** Data source: baked into an exported file, or fetched from `lab ui`. */
interface Baked {
  index: LabIndex;
  details: Record<string, RunDetail>;
  files: Record<string, string>;
}

declare global {
  interface Window {
    __LAB_DATA__?: Baked;
  }
}

const baked = typeof window !== "undefined" ? window.__LAB_DATA__ : undefined;

export const isSnapshot = Boolean(baked);

export async function loadIndex(): Promise<LabIndex> {
  if (baked) return baked.index;
  const res = await fetch("/api/index");
  if (!res.ok) throw new Error(`Could not load the lab index (${res.status}).`);
  return (await res.json()) as LabIndex;
}

export async function loadRun(dir: string): Promise<RunDetail> {
  if (baked) {
    const detail = baked.details[dir];
    if (!detail) throw new Error("This run is not included in the snapshot.");
    return detail;
  }
  const res = await fetch(`/api/run?dir=${encodeURIComponent(dir)}`);
  if (!res.ok) throw new Error(`Could not load run ${dir} (${res.status}).`);
  return (await res.json()) as RunDetail;
}

/** URL for a run artifact (screenshot); recorder stores absolute paths, keep the file name. */
export function fileUrl(runDir: string, absolutePath: string): string | undefined {
  const name = absolutePath.split(/[\\/]/).pop() ?? "";
  const rel = `${runDir}/${name}`;
  if (baked) return baked.files[rel];
  return `/files/${rel.split("/").map(encodeURIComponent).join("/")}`;
}

export interface Capabilities {
  live: boolean;
  running?: string | null;
  stagehand?: boolean;
  providers?: string[];
}

export async function loadCapabilities(): Promise<Capabilities> {
  if (baked) return { live: false };
  try {
    const res = await fetch("/api/capabilities");
    return res.ok ? ((await res.json()) as Capabilities) : { live: false };
  } catch {
    return { live: false };
  }
}

/** Starts a real run on the local server and resolves with its directory when it finishes. */
export async function startRun(input: { agent: string; fault: string; seed: number; task?: string; modelMode?: string }): Promise<string> {
  const res = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const body = (await res.json()) as { dir?: string; error?: string };
  if (!res.ok || !body.dir) throw new Error(body.error ?? `Run failed (${res.status}).`);
  return body.dir;
}

/** URL for a recording's media file (baked as a data URI in snapshots, served by `lab ui` otherwise). */
export function mediaUrl(dir: string, file: string): string | undefined {
  if (!file) return undefined;
  const rel = `${dir}/${file}`;
  if (baked) return baked.files[rel];
  return `/files/${rel.split("/").map(encodeURIComponent).join("/")}`;
}

/** Records a site on the local server; resolves with the recording's directory when done. */
export async function startRecording(input: { url: string; username?: string; password?: string; maxPages: number; authorized: boolean }): Promise<string> {
  const res = await fetch("/api/record", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const body = (await res.json()) as { dir?: string; error?: string };
  if (res.status === 401) throw new SignInRequired(body.error ?? "Sign in to record.");
  if (!res.ok || !body.dir) throw new Error(body.error ?? `Recording failed (${res.status}).`);
  return body.dir;
}

export class SignInRequired extends Error {}

export async function loadMe(): Promise<{ user: { email: string; name?: string } | null; google: boolean; authRequired: boolean } | null> {
  if (baked) return null;
  try {
    const res = await fetch("/api/me");
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
