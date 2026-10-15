import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { DuplicateError, FileStore, PgStore, migrate, type Store } from "../src/store/index.ts";
import { freshSchema } from "./pg-helper.ts";

/**
 * The same contract for both stores. The Postgres suite runs when TEST_DATABASE_URL points at a
 * database it may wipe (CI starts one; locally: a throwaway Postgres or a Supabase branch).
 */
const dir = mkdtempSync(join(tmpdir(), "lab-store-"));
after(() => rmSync(dir, { recursive: true, force: true }));

const backends: [string, () => Promise<Store>][] = [["file", async () => new FileStore(join(dir, `s-${Math.random()}.json`))]];
const pgUrl = process.env.TEST_DATABASE_URL;
if (pgUrl) {
  backends.push([
    "postgres",
    async () => {
      return freshSchema(pgUrl, 8);
    },
  ]);
}

const user = (id: string, email: string) => ({ id, email, password: "scrypt$1$x$y", createdAt: new Date().toISOString() });

for (const [name, open] of backends) {
  describe(`${name} store`, () => {
    test("users: case-insensitive unique email, lookups, updates", async () => {
      const s = await open();
      try {
        await s.insertUser(user("u1", "Ana@Example.com"));
        await assert.rejects(s.insertUser(user("u2", "ana@example.com")), DuplicateError);
        assert.equal((await s.userByEmail("ANA@example.com"))?.id, "u1");
        await s.updateUser({ ...(await s.userById("u1"))!, google: "g-1", password: undefined as never });
        const u = await s.userByGoogle("g-1");
        assert.equal(u?.id, "u1");
        assert.equal(u?.password, undefined);
        // Supabase Auth link (migration 2): look up by auth id, one account per auth id.
        await s.insertUser({ id: "u3", email: "sb@example.com", authId: "11111111-2222-3333-4444-555555555555", createdAt: new Date().toISOString() });
        assert.equal((await s.userByAuthId("11111111-2222-3333-4444-555555555555"))?.email, "sb@example.com");
        await assert.rejects(s.insertUser({ id: "u4", email: "other@example.com", authId: "11111111-2222-3333-4444-555555555555", createdAt: new Date().toISOString() }));
      } finally {
        await s.close();
      }
    });

    test("sessions: lookup by token hash, expiry, sign-out everywhere", async () => {
      const s = await open();
      try {
        await s.insertUser(user("u1", "a@example.com"));
        await s.createSession("h1", "u1", new Date(Date.now() + 60_000));
        await s.createSession("h2", "u1", new Date(Date.now() - 1));
        assert.equal((await s.sessionUser("h1"))?.id, "u1");
        assert.equal(await s.sessionUser("h2"), null, "expired");
        await s.deleteUserSessions("u1");
        assert.equal(await s.sessionUser("h1"), null);
      } finally {
        await s.close();
      }
    });

    test("rate-limit counters count within a window and reset after it", async () => {
      const s = await open();
      try {
        assert.equal(await s.hit("k", 60_000), 1);
        assert.equal(await s.hit("k", 60_000), 2);
        const counts = await Promise.all(Array.from({ length: 8 }, () => s.hit("k", 60_000)));
        assert.equal(Math.max(...counts), 10, "concurrent hits are all counted");
        assert.equal(await s.hit("short", 1), 1);
        await new Promise((r) => setTimeout(r, 15));
        assert.equal(await s.hit("short", 1), 1, "new window");
      } finally {
        await s.close();
      }
    });

    test("jobs: idempotent enqueue, every job claimed exactly once by competing workers", async () => {
      const s = await open();
      try {
        await s.insertUser(user("u1", "a@example.com"));
        const a = await s.enqueue({ kind: "record", owner: "u1", input: { url: "https://a.example" }, idempotencyKey: "k1" });
        const again = await s.enqueue({ kind: "record", owner: "u1", input: { url: "https://a.example" }, idempotencyKey: "k1" });
        assert.equal(again.id, a.id, "same idempotency key, same job");
        for (let i = 0; i < 9; i++) await s.enqueue({ kind: "run", owner: "u1", input: { i } });
        assert.equal(await s.queueDepth(), 10);
        assert.equal(await s.activeJobs("u1"), 10);

        const claimed: string[] = [];
        await Promise.all(
          Array.from({ length: 6 }, async (_, w) => {
            for (;;) {
              const job = await s.claim(`w${w}`, 60_000);
              if (!job) return;
              claimed.push(job.id);
            }
          }),
        );
        assert.equal(claimed.length, 10);
        assert.equal(new Set(claimed).size, 10, "no job was handed to two workers");
        assert.equal(await s.queueDepth(), 0);
      } finally {
        await s.close();
      }
    });

    test("jobs: heartbeat, finish, retry once, expired leases are reclaimed, release on shutdown", async () => {
      const s = await open();
      try {
        const j = await s.enqueue({ kind: "record", owner: null, input: {}, secret: "sealed", maxAttempts: 2 });
        let c = (await s.claim("w1", 60_000))!;
        assert.equal(c.attempts, 1);
        assert.equal(await s.heartbeat(j.id, "w1", 60_000, "page 2 of 5"), true);
        assert.equal(await s.heartbeat(j.id, "w2", 60_000), false, "not w2's job");
        assert.equal((await s.job(j.id))?.progress, "page 2 of 5");

        await s.finish(j.id, "w1", { status: "failed", error: "browser crashed", retry: true });
        assert.equal((await s.job(j.id))?.status, "queued", "retried");
        c = (await s.claim("w1", 1))!;
        assert.equal(c.attempts, 2);
        await new Promise((r) => setTimeout(r, 20));
        // Lease expired and out of attempts: the next claim fails it for good.
        assert.equal(await s.claim("w2", 60_000), null);
        const failed = (await s.job(j.id))!;
        assert.equal(failed.status, "failed");
        assert.equal(failed.secret, null, "credentials are cleared when a job ends");

        const k = await s.enqueue({ kind: "run", owner: null, input: {} });
        await s.claim("w3", 60_000);
        await s.release(k.id, "w3");
        const back = (await s.job(k.id))!;
        assert.equal(back.status, "queued");
        assert.equal(back.attempts, 0, "a graceful shutdown doesn't use up an attempt");
        const done = (await s.claim("w4", 60_000))!;
        await s.finish(done.id, "w4", { status: "succeeded", result: { dir: "x" } });
        assert.deepEqual((await s.job(k.id))?.result, { dir: "x" });
      } finally {
        await s.close();
      }
    });

    test("recordings index: newest first, filtered by owner", async () => {
      const s = await open();
      try {
        await s.insertUser(user("u1", "a@example.com"));
        await s.insertUser(user("u2", "b@example.com"));
        await s.saveRecording({ id: "r1", owner: "u1", url: "https://1.example", createdAt: "2026-10-01T00:00:00.000Z", summary: { n: 1 } });
        await s.saveRecording({ id: "r2", owner: "u2", url: "https://2.example", createdAt: "2026-10-02T00:00:00.000Z", summary: { n: 2 } });
        await s.saveRecording({ id: "r3", owner: "u1", url: "https://3.example", createdAt: "2026-10-03T00:00:00.000Z", summary: { n: 3 } });
        assert.deepEqual((await s.recordings("u1", 10)).map((r) => r.id), ["r3", "r1"]);
        assert.deepEqual((await s.recording("r2"))?.summary, { n: 2 });
      } finally {
        await s.close();
      }
    });
  });
}
