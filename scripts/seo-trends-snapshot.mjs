/**
 * Records the Trends measurements that were captured successfully on 20 October 2026, before the
 * IP was rate-limited, so the research document's numbers stay traceable in the repository.
 *
 *   node scripts/seo-trends-snapshot.mjs
 *
 * The values are copied verbatim from the successful run. Re-running the puller will replace
 * them with fresh numbers whenever Trends is reachable.
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "results/seo-trends.json";
const data = JSON.parse(readFileSync(FILE, "utf8"));

data.trendsSnapshot = {
  provenance:
    "Captured from trends.google.com on 2026-10-20, before the IP was rate-limited (HTTP 429) by the Trends data endpoints. Indices are relative within each group: 0-100 is that group's own peak, so only groups are comparable with groups.",
  groups: {
    "walkthrough-video": {
      "website walkthrough video": { average: 0, peak: 0, total: 0 },
      "product demo video": { average: 0.9, peak: 2, total: 48 },
      "screen recording software": { average: 1.3, peak: 2, total: 68 },
      loom: { average: 71.5, peak: 100, total: 3789 },
      scribe: { average: 34.8, peak: 50, total: 1847 },
    },
    "walkthrough-howto": {
      "how to record website": { average: 31.9, peak: 100, total: 1693 },
      "create product demo video": { average: 0.2, peak: 1, total: 9 },
      "website tutorial video": { average: 12.5, peak: 58, total: 665 },
      "explainer video": { average: 23.4, peak: 35, total: 1239 },
    },
    "agent-testing": {
      "ai agent testing": { average: 2.4, peak: 5, total: 129 },
      "browser agent testing": { average: 0, peak: 1, total: 2 },
      "regression testing": { average: 4.4, peak: 8, total: 235 },
      "test automation": { average: 14.5, peak: 33, total: 768 },
      playwright: { average: 60.5, peak: 100, total: 3209 },
    },
  },
  notCaptured: [
    "browser-agents (browser agent, ai agent, browser automation, ai browser, stagehand)",
    "video-tools (loom, descript, vidyard, screen studio, tldv)",
    "video-tools-2 (clipchamp, obs studio, screenflow, veed, kapwing)",
    "related and rising queries for every seed",
  ],
};

writeFileSync(FILE, JSON.stringify(data, null, 2));
console.log(`snapshot written to ${FILE}`);
