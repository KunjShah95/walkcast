import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
// @ts-expect-error plain .mjs script without types
import { buildManifest } from "../apps/desktop/scripts/updater-manifest.mjs";

test("updater manifest maps each platform to its updatable installer and signature", () => {
  const dir = mkdtempSync(join(tmpdir(), "manifest-"));
  try {
    const put = (rel: string, body = "x") => {
      mkdirSync(join(dir, rel, ".."), { recursive: true });
      writeFileSync(join(dir, rel), body);
    };
    put("nsis/walkcast_0.3.1_x64-setup.exe");
    put("nsis/walkcast_0.3.1_x64-setup.exe.sig", "SIG-WIN\n");
    put("msi/walkcast_0.3.1_x64_en-US.msi");
    put("macos/walkcast.app.tar.gz");
    put("macos/walkcast.app.tar.gz.sig", "SIG-MAC");
    put("appimage/walkcast_0.3.1_amd64.AppImage");
    put("appimage/walkcast_0.3.1_amd64.AppImage.sig", "SIG-LINUX");
    put("deb/walkcast_0.3.1_amd64.deb");
    const m = buildManifest(dir, "v0.3.1", "o/r", "notes");
    assert.equal(m.version, "0.3.1");
    assert.deepEqual(m.platforms["windows-x86_64"], { signature: "SIG-WIN", url: "https://github.com/o/r/releases/download/v0.3.1/walkcast_0.3.1_x64-setup.exe" });
    assert.equal(m.platforms["darwin-aarch64"].url, "https://github.com/o/r/releases/download/v0.3.1/walkcast.app.tar.gz");
    assert.equal(m.platforms["linux-x86_64"].signature, "SIG-LINUX");

    rmSync(join(dir, "macos/walkcast.app.tar.gz.sig"));
    assert.throws(() => buildManifest(dir, "v0.3.1", "o/r", "notes"), /darwin-aarch64 \(no \.sig/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
