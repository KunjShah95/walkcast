#!/usr/bin/env node
/**
 * The gate's result, as a pull-request comment.
 *
 * The JSON is what `walkcast ci --json` writes. This turns it into something a person
 * reads: what broke, what is new, what got better, and whether the gate held.
 */
import { readFileSync, writeFileSync } from "node:fs";

/**
 * The JSON, as text.
 *
 * A shell that redirects in UTF-16 (PowerShell) writes a byte-order mark and wide
 * characters; one that redirects in UTF-8 (bash, and GitHub's runner) does not. The gate's
 * result is the same either way, so the file is read as bytes and decoded accordingly.
 */
function readJson(path) {
  const bytes = readFileSync(path);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return JSON.parse(bytes.subarray(2).toString("utf16le"));
  return JSON.parse(bytes.toString("utf8").replace(/^﻿/, ""));
}

const raw = readJson("gate.json");
const results = Array.isArray(raw) ? raw : (raw.results ?? []);
const failed = Boolean(raw.failed) || results.some((r) => r.failed);

const marks = { ok: "✅", regression: "❌", fixed: "🟡", "known-failure": "⚪️", "new-broken": "❌" };
const lines = ["### Walkcast regression gate", ""];

if (!results.length) {
  lines.push("No fixtures were replayed.", "");
} else {
  for (const result of results) {
    lines.push(`**${result.agent}** — ${result.rows.length} fixtures × ${result.trials} trials`, "");
    lines.push("| | fixture | expected | got | why |", "|---|---|---|---|---|");
    for (const row of result.rows) {
      const why = (row.causes ?? []).join(", ") || (row.note ?? "");
      lines.push(`| ${marks[row.verdict] ?? ""} | \`${row.fixture}\` | ${row.expected} | ${row.actual} | ${why} |`);
    }
    lines.push("");
  }
}

if (failed) {
  const regressions = results.flatMap((r) => r.rows).filter((r) => r.verdict === "regression" || r.verdict === "new-broken");
  lines.push(`**The gate failed.** ${regressions.map((r) => `\`${r.fixture}\``).join(", ")} used to work and no longer does.`);
} else {
  lines.push("**The gate held.** Nothing that used to work stopped working.");
}
lines.push("");

const text = lines.join("\n");
writeFileSync("gate-summary.md", text);
if (process.env.GITHUB_STEP_SUMMARY) {
  // The job summary is where a person looks first.
  writeFileSync(process.env.GITHUB_STEP_SUMMARY, text);
}
console.log(text);
