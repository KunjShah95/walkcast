import { existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "supabase", "migrations");

/** Migration file names in apply order. */
export function migrationFiles(): string[] {
  if (!existsSync(MIGRATIONS)) return [];
  return readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
}
