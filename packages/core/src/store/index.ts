import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FileStore } from "./file-store.ts";
import { PgStore } from "./pg-store.ts";
import type { Store } from "./types.ts";

export * from "./types.ts";
export { FileStore, PgStore };

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "supabase", "migrations");

/** The Postgres URL from the environment (Supabase's connection string), if any. */
export function databaseUrl(): string | undefined {
  return process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || undefined;
}

/** Postgres (Supabase) when a database URL is configured, otherwise a JSON file under `root`/.lab. */
export function createStore(root: string, url = databaseUrl()): Store {
  if (url) return new PgStore(url);
  const file = join(root, ".lab", "store.json");
  // Accounts from before the store existed (.lab/users.json) carry over on first start.
  const legacy = join(root, ".lab", "users.json");
  if (!existsSync(file) && existsSync(legacy)) {
    try {
      const old = JSON.parse(readFileSync(legacy, "utf8")) as { users?: unknown[]; sessions?: unknown[] };
      writeFileSync(file, JSON.stringify({ users: old.users ?? [], sessions: old.sessions ?? [] }), { mode: 0o600 });
    } catch {
      // A corrupt legacy file shouldn't block startup; ignore and start with an empty store.
    }
  }
  return new FileStore(file);
}

/**
 * Apply supabase/migrations/*.sql in order, once each (tracked in walkcast_migrations). Teams
 * using the Supabase CLI can run `supabase db push` instead; both are idempotent.
 */
export async function migrate(store: PgStore, log: (line: string) => void = () => undefined): Promise<string[]> {
  const sql = store.sql;
  await sql`create table if not exists walkcast_migrations (name text primary key, applied_at timestamptz not null default now())`;
  await sql`alter table walkcast_migrations enable row level security`;
  const done = new Set((await sql`select name from walkcast_migrations`).map((r) => String(r.name)));
  const applied: string[] = [];
  for (const name of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(name)) continue;
    await sql.begin(async (tx) => {
      // Serialize concurrent deploys running migrations at the same time.
      await tx`select pg_advisory_xact_lock(727274)`;
      const [already] = await tx`select 1 from walkcast_migrations where name = ${name}`;
      if (already) return;
      await tx.unsafe(readFileSync(join(MIGRATIONS, name), "utf8"));
      await tx`insert into walkcast_migrations (name) values (${name})`;
      applied.push(name);
      log(`applied ${name}`);
    });
  }
  return applied;
}
