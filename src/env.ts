/**
 * Load `.env` (at the repo root) into process.env. Imported first by the CLI so every command,
 * the web app and the workers see it before any other module reads environment variables.
 *
 * Values already present in the environment win over the file, so `LAB_AUTH=off npm run ui` still
 * behaves as documented. Nothing here is required: without a .env file the app runs on defaults.
 * No dependency: a .env file is KEY=VALUE lines (optionally `export`, single or double quotes);
 * keys already set in the shell are left alone.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function loadEnvFile(path: string): void {
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    return; // no .env: use the real environment (and the app's defaults)
  }
  for (const raw of contents.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const body = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eq = body.indexOf("=");
    if (eq < 1) continue;
    const key = body.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = body.slice(eq + 1).trim();
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trimEnd(); // inline comment after an unquoted value
    }
    process.env[key] ??= value;
  }
}

loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
