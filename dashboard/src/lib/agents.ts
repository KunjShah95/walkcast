/** Short descriptions for the agent picker (the authoritative specs live in src/agents). */
export const AGENT_INFO: Record<string, { name: string; kind: "scripted" | "stagehand"; note: string }> = {
  v0: { name: "v0 · naive", kind: "scripted", note: "Acts on its first observation, reuses a cached selector, retries errors blindly, trusts the success toast." },
  v1: { name: "v1 · fixed", kind: "scripted", note: "Waits for the page to settle, targets by label, checks before retrying, verifies the saved record." },
  v2: { name: "v2 · regressed", kind: "scripted", note: "v1 with the read-back before retrying removed, to show a regression being caught." },
  "sh-p0": { name: "sh-p0 · Stagehand", kind: "stagehand", note: "Model-driven loop with Stagehand v4 act(); neutral prompt." },
  "sh-p1": { name: "sh-p1 · Stagehand", kind: "stagehand", note: "Same loop; prompt adds verification and safe-retry guidance." },
};

export const TASKS: { id: string; name: string; goal: string; faults: string[] }[] = [
  { id: "create-lead", name: "Create a lead", goal: "Create Acme Corp (Jane Roe), owner Priya Shah", faults: ["stale-owners", "ui-drift", "gateway-timeout", "session-expiry", "silent-owner-drop"] },
  { id: "reassign-lead", name: "Reassign a lead", goal: "Move the Globex lead to Priya Shah", faults: ["stale-owners", "ui-drift", "gateway-timeout", "session-expiry", "silent-owner-drop"] },
  { id: "lookup-owner", name: "Look up an owner", goal: "Report who owns the Initech lead", faults: ["ui-drift", "gateway-timeout", "session-expiry"] },
];

/** Where each fault lives in the pipeline. */
export const FAULT_NODE: Record<string, string> = {
  "stale-owners": "page",
  "ui-drift": "page",
  "gateway-timeout": "gateway",
  "session-expiry": "auth",
  "silent-owner-drop": "api",
};

export const FAULT_INFO: Record<string, { name: string; what: string }> = {
  "stale-owners": { name: "Stale owner list", what: "The owner dropdown re-sorts shortly after the page loads." },
  "gateway-timeout": { name: "504 after commit", what: "The save commits, then the gateway answers 504." },
  "silent-owner-drop": { name: "Owner silently dropped", what: "The API ignores the owner but still shows success." },
  "session-expiry": { name: "Session expires", what: "The session dies between loading the form and saving it." },
  "ui-drift": { name: "Submit button redesigned", what: "The save button gets a new id and label." },
};
