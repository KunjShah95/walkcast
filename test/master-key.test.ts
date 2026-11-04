import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, test } from "node:test";
import { masterKey, open, seal, sealAtRest, sharedKeyConfigured, useLocalKeyFile } from "../packages/core/src/jobs/secret-box.ts";
import { applyCredentialsFile, readCredentials, serveDashboard } from "../apps/desktop/server/server.ts";
import { FileStore } from "../packages/core/src/store/index.ts";

process.env.LAB_LOG = "off";
delete process.env.LAB_SECRET_KEY;

/**
 * WALKCAST_MASTER_KEY: the desktop shell's key from the OS keychain. With it set, secret-box seals
 * under it (no secret.key written), old secrets sealed under a secret.key still open, and the saved
 * credentials are encrypted at rest — a plaintext file from before is migrated, then deleted.
 */
const dirs: string[] = [];
const fresh = () => {
  const d = mkdtempSync(join(tmpdir(), "mk-"));
  dirs.push(d);
  return d;
};
const MASTER = randomBytes(32).toString("hex");
afterEach(() => {
  delete process.env.WALKCAST_MASTER_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ELEVENLABS_API_KEY;
});
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

test("unset: a secret.key is written and used, exactly as before", () => {
  const dir = fresh();
  useLocalKeyFile(dir);
  assert.ok(existsSync(join(dir, "secret.key")));
  assert.equal(masterKey(), null);
  assert.equal(open(seal("pw")), "pw");
});

test("set: no secret.key is written, and sealing uses the master key", () => {
  process.env.WALKCAST_MASTER_KEY = MASTER;
  const dir = fresh();
  useLocalKeyFile(dir);
  assert.ok(!existsSync(join(dir, "secret.key")));
  assert.ok(sharedKeyConfigured(), "a master key is shared with a separate worker that has it");
  const sealed = seal("site-password");
  assert.equal(open(sealed), "site-password");
  // A process with a different master key can't open it.
  process.env.WALKCAST_MASTER_KEY = randomBytes(32).toString("hex");
  assert.throws(() => open(sealed));
});

test("set over an existing secret.key: old sealed jobs still open, new ones use the master key", () => {
  const dir = fresh();
  useLocalKeyFile(dir); // the legacy key file
  const oldSealed = seal("queued-before-upgrade");
  process.env.WALKCAST_MASTER_KEY = MASTER;
  useLocalKeyFile(dir);
  assert.equal(open(oldSealed), "queued-before-upgrade", "decrypt falls back to the legacy key file");
  const fileKey = readFileSync(join(dir, "secret.key"), "utf8");
  const newSealed = seal("queued-after");
  // New secrets are not sealed under the legacy file key: drop the master key and they don't open.
  delete process.env.WALKCAST_MASTER_KEY;
  useLocalKeyFile(dir);
  assert.equal(readFileSync(join(dir, "secret.key"), "utf8"), fileKey, "the legacy file is untouched");
  assert.throws(() => open(newSealed));
});

test("a malformed master key is an error, not a silent fallback", () => {
  process.env.WALKCAST_MASTER_KEY = "not-hex";
  assert.throws(() => masterKey(), /64 hex/);
});

test("credentials: a plaintext file is migrated to the encrypted one and deleted", () => {
  const root = fresh();
  const plain = join(root, ".walkcast-credentials.json");
  writeFileSync(plain, JSON.stringify({ ANTHROPIC_API_KEY: "sk-ant-migrate-me-123456" }));
  process.env.WALKCAST_MASTER_KEY = MASTER;
  assert.deepEqual(readCredentials(root), { ANTHROPIC_API_KEY: "sk-ant-migrate-me-123456" });
  assert.ok(!existsSync(plain), "the plaintext file is gone");
  const enc = readFileSync(join(root, ".walkcast-credentials.enc"), "utf8");
  assert.ok(!enc.includes("sk-ant-migrate-me"), "the key is not readable on disk");
  applyCredentialsFile(root);
  assert.equal(process.env.ANTHROPIC_API_KEY, "sk-ant-migrate-me-123456");
});

test("credentials: an encrypted file the key can't open is not overwritten as if empty", () => {
  const root = fresh();
  process.env.WALKCAST_MASTER_KEY = MASTER;
  writeFileSync(join(root, ".walkcast-credentials.enc"), sealAtRest(JSON.stringify({ ANTHROPIC_API_KEY: "kept" })));
  process.env.WALKCAST_MASTER_KEY = randomBytes(32).toString("hex");
  assert.throws(() => readCredentials(root), /can't be opened/);
});

test("credentials: saving through the API writes only the encrypted file", async () => {
  process.env.WALKCAST_MASTER_KEY = MASTER;
  const root = fresh();
  const store = new FileStore(join(root, ".lab", "store.json"));
  const srv = await serveDashboard(0, { root, unref: true, store, worker: false, requireAuth: false });
  try {
    const r = await fetch(`${srv.url}/api/credentials`, { method: "POST", body: JSON.stringify({ env: "ELEVENLABS_API_KEY", value: "el-secret-value-123456" }) });
    assert.equal(r.status, 200);
    assert.ok(!existsSync(join(root, ".walkcast-credentials.json")));
    assert.ok(!readFileSync(join(root, ".walkcast-credentials.enc"), "utf8").includes("el-secret-value"));
    assert.deepEqual(readCredentials(root), { ELEVENLABS_API_KEY: "el-secret-value-123456" });
    assert.ok(!existsSync(join(root, ".lab", "secret.key")), "no sealing key file beside the store either");
  } finally {
    await srv.close(100);
  }
});

test("credentials: with no master key the plaintext file is used as before", () => {
  const root = fresh();
  writeFileSync(join(root, ".walkcast-credentials.json"), JSON.stringify({ ANTHROPIC_API_KEY: "plain-key-value" }));
  assert.deepEqual(readCredentials(root), { ANTHROPIC_API_KEY: "plain-key-value" });
  assert.ok(existsSync(join(root, ".walkcast-credentials.json")));
});
