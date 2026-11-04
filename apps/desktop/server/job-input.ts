import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type TaskId, isTaskId, normalizeScenario } from "../../../packages/core/src/app/faults.ts";
import { allAgents } from "../../../packages/core/src/agents/registry.ts";
import { isVoice } from "../../../packages/core/src/record/media.ts";
import { providerLabel, voicesFor } from "../../../packages/core/src/record/voices.ts";
import { AuthError } from "./auth.ts";

/**
 * What a job request may ask for: the per-user limits, the narration providers on offer, and the
 * validation of a lab run or a recording's form. Moved out of server.ts unchanged; server.ts
 * re-exports the public part.
 */

/** Per-user limits on expensive work (shared across instances through the store). */
export const LIMITS = {
  activeJobsPerUser: Number(process.env.LAB_MAX_ACTIVE_JOBS ?? 1),
  recordingsPerDay: Number(process.env.LAB_RECORDINGS_PER_DAY ?? 20),
  runsPerDay: Number(process.env.LAB_RUNS_PER_DAY ?? 100),
  /** Most recordings one batch-render job may re-export at once. */
  maxBatchRenderItems: Number(process.env.LAB_MAX_BATCH_RENDER_ITEMS ?? 10),
};

/** Every narration provider the dashboard may select, local ones first. */
export const TTS_PROVIDERS = ["kokoro", "flite", "none", "elevenlabs", "openai", "google", "azure", "awspolly", "sarvam", "bhashini", "murf", "reverie", "custom", "custom-voice"] as const;

export const TTS_PROVIDER_LABEL: Record<string, string> = {
  kokoro: "Kokoro (natural, offline)",
  flite: "Basic offline voice (robotic, works offline)",
  none: "No voice (captions only)",
  sarvam: "Sarvam (Indian)",
  bhashini: "Bhashini (Indian, govt)",
  custom: "Custom / Maya",
  "custom-voice": "Custom voice (uploaded sample)",
  ...Object.fromEntries(["elevenlabs", "openai", "google", "azure", "awspolly", "murf", "reverie"].map((p) => [p, providerLabel(p)])),
};

const LIVE_RUNS_OFF = "Live model runs are disabled on this server (they cost money). Set LAB_ALLOW_LIVE_RUNS=1 to allow them.";

/** An agent whose turns are model calls, so a live run of it spends provider credits. */
function isModelBacked(agentId: string): boolean {
  return allAgents().some((a) => a.id === agentId && a.kind === "stagehand");
}

/** Whether replaying `fixture` with `agent` would play recorded calls rather than call the model. */
function replaysRecordedCalls(root: string, fixture: string, agent: string): boolean {
  try {
    const manifest = JSON.parse(readFileSync(join(root, fixture, "manifest.json"), "utf8")) as { original?: { agent?: { id?: string }; model?: { cassette?: string } } };
    const cassette = manifest.original?.model?.cassette;
    return manifest.original?.agent?.id === agent && typeof cassette === "string" && existsSync(join(root, fixture, cassette));
  } catch {
    return false;
  }
}

export function validateRun(b: Record<string, unknown>, allowLiveRuns: boolean, root = process.cwd()): Record<string, unknown> {
  const op = b.op === undefined ? "run" : String(b.op);
  if (!["run", "replay", "experiment"].includes(op)) throw new AuthError(400, `Unknown lab operation "${op}".`);
  const known = (id: string) => allAgents().some((a) => a.id === id);
  const trials = Math.max(1, Math.min(5, Math.trunc(Number(b.trials ?? (op === "replay" ? 3 : 1)) || 1)));
  if (op === "replay") {
    // A fixture the index listed: a relative path under fixtures/, runs/_fixtures/ or results/<exp>/fixtures/.
    const fixture = String(b.fixture ?? "").replace(/\\/g, "/");
    if (!/^(fixtures|runs\/_fixtures|results\/[\w.-]+\/fixtures)\/[\w.+-]+$/.test(fixture) || !existsSync(join(root, fixture, "manifest.json"))) {
      throw new AuthError(400, "That fixture doesn't exist here.");
    }
    const agent = String(b.agent ?? "v1");
    if (!known(agent)) throw new AuthError(400, `Unknown agent "${agent}".`);
    // How the agent's model answers: the recorded calls, the deterministic stand-in, or a live
    // model. Without this the choice was made for the person — a browser agent whose fixture
    // holds no recorded calls was pushed into a live run, which needs a key and costs money,
    // and the replay could not be tried at all without one.
    const modelMode = b.modelMode === undefined ? undefined : String(b.modelMode);
    if (modelMode !== undefined && !["live", "replay", "scripted"].includes(modelMode)) throw new AuthError(400, `Unknown model mode "${modelMode}".`);
    if (modelMode === "live" && !allowLiveRuns) throw new AuthError(403, LIVE_RUNS_OFF);
    // No mode given: a model-backed agent replays the fixture's recorded calls when it is the
    // agent that made them, and otherwise goes live (lab/fixture.ts). Decide that here, where the
    // live-run switch is checked, so leaving the field out is never a way past it.
    if (modelMode === undefined && isModelBacked(agent) && !allowLiveRuns) {
      if (!replaysRecordedCalls(root, fixture, agent)) throw new AuthError(403, `${LIVE_RUNS_OFF} This fixture has no recorded model calls for agent ${agent}, so replaying it would call the model live.`);
      return { op, fixture, agent, trials, fault: "none", seed: 1, task: "create-lead", modelMode: "replay" };
    }
    return { op, fixture, agent, trials, fault: "none", seed: 1, task: "create-lead", ...(modelMode ? { modelMode } : {}) };
  }
  if (op === "experiment") {
    // Scripted agents only: an experiment is dozens of runs, and from the app it must never spend
    // model credits by accident.
    const scripted = (id: string) => allAgents().some((a) => a.id === id && a.kind === "scripted");
    const baseline = String(b.baseline ?? "v0");
    const candidates = (Array.isArray(b.candidates) ? b.candidates : ["v1", "v2"]).map(String).filter((c) => c !== baseline).slice(0, 4);
    for (const id of [baseline, ...candidates]) if (!scripted(id)) throw new AuthError(400, `Experiments from the app use the scripted agents only; "${id}" isn't one.`);
    if (candidates.length === 0) throw new AuthError(400, "Pick at least one candidate agent to compare with the baseline.");
    const seeds = Math.max(1, Math.min(3, Math.trunc(Number(b.seeds ?? 1)) || 1));
    const task: TaskId = isTaskId(String(b.task ?? "")) ? (b.task as TaskId) : "create-lead";
    return { op, baseline, candidates, trials: Math.min(trials, 3), seed: seeds, agent: baseline, fault: "none", task };
  }
  const agent = String(b.agent ?? "v0");
  if (!allAgents().some((a) => a.id === agent)) throw new AuthError(400, `Unknown agent "${agent}".`);
  const modelMode = b.modelMode === undefined ? undefined : String(b.modelMode);
  if (modelMode !== undefined && !["live", "replay", "scripted"].includes(modelMode)) throw new AuthError(400, `Unknown model mode "${modelMode}".`);
  if (modelMode === "live" && !allowLiveRuns) throw new AuthError(403, LIVE_RUNS_OFF);
  // A model-backed agent with no mode runs live (lab/runner.ts): the same switch applies.
  if (modelMode === undefined && isModelBacked(agent) && !allowLiveRuns) {
    throw new AuthError(403, `${LIVE_RUNS_OFF} Pick the scripted or replay model mode for agent ${agent}.`);
  }
  let fault: string;
  try {
    fault = normalizeScenario(String(b.fault ?? "none"));
  } catch (e) {
    throw new AuthError(400, e instanceof Error ? e.message : String(e));
  }
  const task: TaskId = isTaskId(String(b.task ?? "")) ? (b.task as TaskId) : "create-lead";
  const seed = Number.isFinite(Number(b.seed)) ? Math.trunc(Number(b.seed)) : 1;
  return { agent, fault, task, seed, ...(modelMode ? { modelMode } : {}) };
}

/** Sample-site recordings: always on the desktop, opt-in (LAB_DEMO_SITE=1) on a shared server. */
export function demoSiteEnabled(exposed: boolean): boolean {
  return !exposed || process.env.LAB_DEMO_SITE === "1";
}

export function validateRecord(b: Record<string, unknown>, exposed: boolean, owner: string | null = null): Record<string, unknown> {
  const pagesIn = Number(b.maxPages);
  if (b.demo === true) {
    // The worker starts its own sample CRM and records that: no user-supplied URL, nothing the
    // SSRF guard needs to judge, and it works when the worker is a separate machine.
    if (!demoSiteEnabled(exposed)) throw new AuthError(403, "The sample site is turned off on this server.");
    return {
      demo: true,
      url: "sample:minicrm",
      maxPages: Number.isFinite(pagesIn) ? Math.max(1, Math.min(10, Math.trunc(pagesIn))) : 5,
      ...(isVoice(b.voice) ? { voice: b.voice } : {}),
      // The sample site narrates with the voice the person picked, like any other recording.
      ...voiceBlock(b),
      ...lengthBlock(b),
      ...(b.zoom === false ? { zoom: false } : {}),
      ...(b.narration === "plain" ? { narration: "plain" } : {}),
      blockPrivate: false,
    };
  }
  if (b.authorized !== true) throw new AuthError(400, "Confirm that you own this site or are authorized to test it.");
  if (typeof b.url !== "string" || !b.url.trim()) throw new AuthError(400, "Paste the site's URL.");
  let url: URL;
  try {
    url = new URL(b.url.trim());
  } catch {
    throw new AuthError(400, "That doesn't look like a web address. Paste the full link, starting with https://");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new AuthError(400, "Only http(s) addresses can be recorded.");
  return {
    url: url.toString(),
    ...(typeof b.username === "string" && b.username ? { username: b.username.slice(0, 200) } : {}),
    maxPages: Number.isFinite(Number(b.maxPages)) ? Math.max(1, Math.min(30, Math.trunc(Number(b.maxPages)))) : 8,
    ...lengthBlock(b),
    ...(isVoice(b.voice) ? { voice: b.voice } : {}),
    ...voiceBlock(b),
    ...journeyBlock(b),
    ...(b.zoom === false ? { zoom: false } : {}),
    ...(b.narration === "plain" ? { narration: "plain" } : {}),
    blockPrivate: exposed && process.env.LAB_ALLOW_PRIVATE !== "1",
    // The "I own this site or am authorized to test it" box, kept as a record of who confirmed
    // it, when, and for which address — not just a boolean the client sent and nobody kept.
    authorizedBy: owner ?? "local",
    authorizedAt: new Date().toISOString(),
    authorizedUrl: url.toString(),
  };
}

/**
 * A journey: the path through the site to record, one step per line.
 *
 * Only the text is taken; the steps are read by the recorder itself, so a line that cannot be
 * read is reported in the walkthrough rather than refused here.
 */
function journeyBlock(b: Record<string, unknown>): { journey?: string } {
  const journey = typeof b.journey === "string" ? b.journey.trim() : "";
  if (!journey) return {};
  return { journey: journey.slice(0, 4000) };
}

/** The length cap in seconds, or nothing for "as many pages as it reaches". */
function lengthBlock(b: Record<string, unknown>): { maxSeconds?: number } {
  const asked = Number(b.maxSeconds);
  return Number.isFinite(asked) && asked > 0 ? { maxSeconds: Math.max(15, Math.min(3600, Math.trunc(asked))) } : {};
}

/** The provider, its voice and its language, validated against what that provider actually has. */
function voiceBlock(b: Record<string, unknown>): { ttsProvider?: string; ttsVoice?: string; ttsLanguage?: string } {
  // "polly" and "maya" are older aliases of two providers still in the list.
  const allowed = [...TTS_PROVIDERS, "polly", "maya"];
  const ttsProvider = typeof b.ttsProvider === "string" && allowed.includes(b.ttsProvider.toLowerCase() as typeof allowed[number]) ? b.ttsProvider.toLowerCase() : undefined;
  if (!ttsProvider) return {};
  // A chosen voice must be one this provider actually has, unless the provider has no public list
  // (Murf, a custom endpoint), where the id is passed through as typed.
  const chosen = typeof b.ttsVoice === "string" ? b.ttsVoice.trim().slice(0, 120) : "";
  const list = voicesFor(ttsProvider);
  const ttsVoice = chosen && (list.length === 0 || list.some((v) => v.id === chosen)) ? chosen : undefined;
  // A language is only meaningful where the provider needs one and the voice doesn't carry it.
  const asked = typeof b.ttsLanguage === "string" ? b.ttsLanguage.trim().slice(0, 20) : "";
  const ttsLanguage = /^[a-z]{2,3}([-_][A-Za-z]{2,4})?$/i.test(asked) ? asked.replace("_", "-") : undefined;
  return { ttsProvider, ...(ttsVoice ? { ttsVoice } : {}), ...(ttsLanguage ? { ttsLanguage } : {}) };
}
