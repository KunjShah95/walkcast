import assert from "node:assert/strict";
import { test } from "node:test";
import { bareImports, packageOf } from "../apps/desktop/scripts/sidecar-imports.ts";

test("bare imports are found wherever they are", () => {
  const src = [
    'import { readFile } from "node:fs";',
    'import { chromium } from "playwright";',
    'import { z } from "@scope/pkg";',
    'export { thing } from "somewhere";',
    'const mod = await import("dynamic-pkg");',
  ].join("\n");
  assert.deepEqual(bareImports(src), ["node:fs", "playwright", "@scope/pkg", "somewhere", "dynamic-pkg"]);
});

test("an import written as text inside a string is not an import", () => {
  // What the journeys feature writes: a Playwright script the user copies into their own
  // project. Counting it shipped a package that nothing here depends on.
  const src = ['const script = [', '  "import { test, expect } from \'@playwright/test\';",', "].join('\\n');"].join("\n");
  assert.deepEqual(bareImports(src), []);
});

test("a template literal that mentions a package is not an import either", () => {
  const src = "const hint = `run npm i @playwright/test first`;";
  assert.deepEqual(bareImports(src), []);
});

test("an import inside a comment is not an import", () => {
  const src = ["// import { x } from 'commented-pkg';", "/* import { y } from 'also-commented'; */", 'import { z } from "real-pkg";'].join("\n");
  assert.deepEqual(bareImports(src), ["real-pkg"]);
});

test("relative and dot-prefixed specifiers are left to the bundler", () => {
  const src = ['import { a } from "./local.ts";', 'import { b } from "../up/one.ts";'].join("\n");
  assert.deepEqual(bareImports(src), []);
});

test("a package name keeps its scope", () => {
  assert.equal(packageOf("@browserbasehq/stagehand"), "@browserbasehq/stagehand");
  assert.equal(packageOf("@scope/pkg/deep"), "@scope/pkg");
  assert.equal(packageOf("playwright-core"), "playwright-core");
  assert.equal(packageOf("tsx/dist/cli"), "tsx");
});
