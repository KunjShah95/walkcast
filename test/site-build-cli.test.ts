import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const REPO = resolve(import.meta.dirname, "..");
const run = (args: string[], env: Record<string, string> = {}): string =>
  execFileSync(process.execPath, ["--import", "tsx", "src/cli.ts", "site:build", ...args], {
    cwd: REPO,
    encoding: "utf8",
    // A clean environment: the repo .env sets LAB_SITE_URL to 127.0.0.1, which must not mask a test.
    env: { PATH: process.env.PATH ?? "", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });

const outDir = () => join(mkdtempSync(join(tmpdir(), "walkcast-sb-")), "dist");

/** execFileSync puts the child's stderr on the error's `stderr`, not always in `message`. */
function messageOf(e: unknown): string {
  if (typeof e !== "object" || e === null) return String(e);
  const err = e as { message?: string; stderr?: string | Buffer };
  return `${err.message ?? ""}\n${typeof err.stderr === "string" ? err.stderr : err.stderr?.toString() ?? ""}`;
}

test("site:build refuses to publish localhost URLs", () => {
  // Regression: an early deployment shipped a canonical of http://localhost:4320/ on every page
  // and a sitemap full of localhost URLs, because an unset LAB_SITE_URL fell back silently.
  const noOrigin: Record<string, string>[] = [
  {},
  { LAB_SITE_URL: "http://localhost:4320" },
  { LAB_SITE_URL: "http://127.0.0.1:4320" },
];
for (const env of noOrigin) {
    assert.throws(
      () => run([], env),
      (e: unknown) => /site:build needs a real origin/.test(messageOf(e)),
      `must refuse with LAB_SITE_URL=${env.LAB_SITE_URL ?? "<unset>"}`,
    );
  }
});

test("site:build exports for a real origin, via the env var or the flag", () => {
  const origin = "https://walkcast.example";
  for (const args of [[], ["--site-url", origin]]) {
    const out = outDir();
    run([...args, "--out", out, ...(args.length ? [] : [])], args.length ? {} : { LAB_SITE_URL: origin });
    const sitemap = readFileSync(join(out, "sitemap.xml"), "utf8");
    assert.match(sitemap, new RegExp(`<loc>${origin}/</loc>`), `args=${JSON.stringify(args)}`);
    assert.doesNotMatch(sitemap, /localhost/, `args=${JSON.stringify(args)}`);
    const robots = readFileSync(join(out, "robots.txt"), "utf8");
    assert.match(robots, new RegExp(`Sitemap: ${origin}/sitemap.xml`));
    rmSync(out.replace(/\/dist$/, ""), { recursive: true, force: true });
  }
});

test("--allow-localhost still exports, but says so", () => {
  const out = outDir();
  const stdout = run(["--allow-localhost", "--out", out], { LAB_SITE_URL: "http://127.0.0.1:4320" });
  assert.match(stdout, /127\.0\.0\.1:4320/, "the output names the origin it exported for");
  assert.match(readFileSync(join(out, "sitemap.xml"), "utf8"), /<loc>http:\/\/127\.0\.0\.1:4320\/<\/loc>/);
  rmSync(out.replace(/\/dist$/, ""), { recursive: true, force: true });
});