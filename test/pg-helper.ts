import { randomBytes } from "node:crypto";
import { PgStore, migrate } from "../src/store/index.ts";

/**
 * A migrated store in a schema of its own, so test files running in parallel against one
 * TEST_DATABASE_URL never touch each other's tables. Dropped when the store closes.
 */
export async function freshSchema(url: string, max = 5): Promise<PgStore & { schema: string }> {
  const schema = `t_${randomBytes(5).toString("hex")}`;
  const admin = new PgStore(url, { max: 1 });
  await admin.sql.unsafe(`create schema ${schema}`);
  await admin.close();
  const store = new PgStore(url, { max, schema }) as PgStore & { schema: string };
  store.schema = schema;
  await migrate(store);
  const close = store.close.bind(store);
  store.close = async () => {
    await close();
    const cleanup = new PgStore(url, { max: 1 });
    await cleanup.sql.unsafe(`drop schema if exists ${schema} cascade`);
    await cleanup.close();
  };
  return store;
}
