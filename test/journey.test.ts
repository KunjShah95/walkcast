import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { JOURNEY_SPEC, journeyAsPlaywright, journeyAsText, parseJourney, writeJourneySpec } from "../packages/core/src/record/journey.ts";

/**
 * A journey: the path through a site that somebody chose.
 *
 * The steps are read the way a person writes them, and a line that cannot be read is reported
 * rather than skipped - a journey that quietly does less than it says is worse than one that
 * says it could not read a line. Every verb the recorder follows prints as Playwright, so the
 * walkthrough and the test it becomes are the same list of steps.
 */

test("a journey is read the way a person would write it", () => {
  const { steps, problems } = parseJourney(`
    # the sign-up flow
    goto /pricing
    click "Buy now"
    fill "Email" "jane@example.com"
    wait 500
    scroll
  `);
  assert.deepEqual(problems, []);
  assert.deepEqual(steps, [
    { kind: "goto", path: "/pricing" },
    { kind: "click", name: "Buy now" },
    { kind: "fill", name: "Email", value: "jane@example.com" },
    { kind: "wait", ms: 500 },
    { kind: "scroll" },
  ]);
});

test("a line that cannot be read is reported, not skipped", () => {
  const { steps, problems } = parseJourney('goto /pricing\nfly to the moon\nclick');
  assert.equal(steps.length, 1, "only the line that could be read became a step");
  assert.equal(problems.length, 2);
  assert.equal(problems[0]!.line, 2);
  assert.match(problems[0]!.why, /not a step/);
  assert.match(problems[1]!.why, /click needs the name/);
});

test("the steps that make a flow a test as well as a tour are read", () => {
  const { steps, problems } = parseJourney(`
    press Enter
    select "Plan" "Pro"
    check "Accept the terms"
    uncheck "Email me offers"
    hover "Features"
    waitFor "Dashboard"
    expect "Thank you"
  `);
  assert.deepEqual(problems, []);
  assert.deepEqual(steps, [
    { kind: "press", key: "Enter" },
    { kind: "select", name: "Plan", option: "Pro" },
    { kind: "check", name: "Accept the terms" },
    { kind: "uncheck", name: "Email me offers" },
    { kind: "hover", name: "Features" },
    { kind: "waitFor", text: "Dashboard" },
    { kind: "expect", text: "Thank you" },
  ]);
});

test("a step that needs more than it was given says what it is missing", () => {
  const { steps, problems } = parseJourney('select "Plan"\npress "the enter key please"\nexpect');
  assert.deepEqual(steps, []);
  assert.match(problems[0]!.why, /option to choose/);
  assert.match(problems[1]!.why, /not a key/);
  assert.match(problems[2]!.why, /expect needs the text/);
});

test("a journey prints as a Playwright script, one numbered step per line", () => {
  const script = journeyAsPlaywright('goto /pricing\nclick "Buy now"\nfill "Email" "jane@example.com"', "https://shop.example");
  assert.match(script, /import \{ test \} from '@playwright\/test';/, "expect is imported only when a step uses it");
  assert.match(script, /test\.use\(\{ baseURL: "https:\/\/shop\.example" \}\);/);
  assert.match(script, /await page\.goto\("\/"\);/);
  assert.match(script, /\/\/ 1\. goto \/pricing\n {2}await page\.goto\("\/pricing"\);/);
  assert.match(script, /getByRole\("button", \{ name: "Buy now" \}\)\.or\(page\.getByText\("Buy now"\)\)\.first\(\)\.click\(\)/);
  assert.match(script, /getByLabel\("Email"\)\.or\(page\.getByPlaceholder\("Email"\)\)\.first\(\)\.fill\("jane@example\.com"\)/);
});

test("a journey with assertions prints assertions, and imports expect to do it", () => {
  const script = journeyAsPlaywright('press Enter\nselect "Plan" "Pro"\ncheck "Terms"\nuncheck "Offers"\nhover "Features"\nwaitFor "Dashboard"\nexpect "Thank you"', "https://shop.example/");
  assert.match(script, /import \{ test, expect \} from '@playwright\/test';/);
  assert.match(script, /test\.use\(\{ baseURL: "https:\/\/shop\.example" \}\);/, "a trailing slash on the site does not double up");
  assert.match(script, /await page\.keyboard\.press\("Enter"\);/);
  assert.match(script, /getByLabel\("Plan"\)\.first\(\)\.selectOption\(\{ label: "Pro" \}\);/);
  assert.match(script, /getByRole\("checkbox", \{ name: "Terms" \}\).*\.check\(\);/);
  assert.match(script, /getByRole\("checkbox", \{ name: "Offers" \}\).*\.uncheck\(\);/);
  assert.match(script, /\.or\(page\.getByRole\("button", \{ name: "Features" \}\)\)\.first\(\)\.hover\(\);/);
  assert.match(script, /await expect\(page\.getByText\("Dashboard"\)\.first\(\)\)\.toBeVisible\(\{ timeout: 10000 \}\);/);
  assert.match(script, /await expect\(page\.getByText\("Thank you"\)\.first\(\)\)\.toBeVisible\(\);/);
});

test("a site's own words are quoted as a string literal, not interpolated", () => {
  const script = journeyAsPlaywright(`click "Bob's best plan"`, "https://shop.example");
  assert.match(script, /getByText\("Bob's best plan"\)/, "an apostrophe is safe inside a quoted step");
  assert.match(script, /\/\/ 1\. click "Bob's best plan"/, "the comment reads as the person wrote it");
});

test("a journey with no site to point at says so instead of printing a broken test", () => {
  const script = journeyAsPlaywright("click \"Buy now\"", "");
  assert.match(script, /set baseURL in playwright\.config\.ts/);
  assert.doesNotMatch(script, /test\.use\(/);
});

test("a line that could not be read is carried into the script as a comment", () => {
  const script = journeyAsPlaywright("click \"Buy now\"\nfly to the moon", "https://shop.example");
  assert.match(script, /\/\/ Lines that could not be read, left out of the script:\n\/\/ {3}line 2: "fly" is not a step/);
});

test("a journey reads back as the steps it is, every verb included", () => {
  const { steps } = parseJourney(
    'goto /pricing\nclick "Buy now"\nfill "Email" "jane@example.com"\npress Enter\nselect "Plan" "Pro"\ncheck "Terms"\nuncheck "Offers"\nhover "Features"\nwait 500\nwaitFor "Dashboard"\nexpect "Thank you"\nscroll',
  );
  assert.deepEqual(journeyAsText(steps), [
    "goto /pricing",
    'click "Buy now"',
    'fill "Email" "jane@example.com"',
    "press Enter",
    'select "Plan" "Pro"',
    'check "Terms"',
    'uncheck "Offers"',
    'hover "Features"',
    "wait 500",
    'waitFor "Dashboard"',
    'expect "Thank you"',
    "scroll",
  ]);
});

const dirs: string[] = [];
after(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A recording folder of its own. */
function recordingDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "walkcast-journey-"));
  dirs.push(dir);
  return dir;
}

const FLOW = [
  "goto /login",
  'fill "Email" "jane@example.com"',
  'fill "Password" "{{secret:site_password}}"',
  'click "Sign in"',
  'waitFor "Dashboard"',
  'select "Plan" "Pro"',
  'check "Terms"',
  'click "Create account"',
  'expect "Welcome"',
].join("\n");

test("the journey's script is a file beside the recording, not a terminal to copy from", () => {
  const dir = recordingDir();
  const written = writeJourneySpec(dir, FLOW, "https://shop.example", "Signing up on Shop");
  assert.equal(written, JOURNEY_SPEC, "the writer says what it wrote");
  const script = readFileSync(join(dir, JOURNEY_SPEC), "utf8");
  assert.equal(script, journeyAsPlaywright(FLOW, "https://shop.example", "Signing up on Shop"), "and the file is the script");
  // A recording folder that a person unzips or a server serves has both halves of the same thing.
  assert.match(script, /^import \{ test, expect \} from '@playwright\/test';/);
  assert.match(script, /test\.use\(\{ baseURL: "https:\/\/shop\.example" \}\);/);
  assert.match(script, /test\("Signing up on Shop", async \(\{ page \}\)/);
});

test("the recording's title names the test, so a folder of scripts is readable", () => {
  // Each script is built into its own const: a regex right after a call's `)` reads as division.
  const titled = journeyAsPlaywright("goto /", "https://shop.example", "Signing up on Shop");
  assert.match(titled, /^test\("Signing up on Shop", async \(\{ page \}\) => \{$/m);
  // A page title that happens to start with "the" reads badly inside test("...").
  const leadingThe = journeyAsPlaywright("goto /", "", "The pricing page");
  assert.match(leadingThe, /^test\("pricing page"/m, "the page title reading is kept out of the test name");
  const untitled = journeyAsPlaywright("goto /", "");
  assert.match(untitled, /^test\("the journey"/m, "with no title the test has the name it always had");
  // A title is a string literal, not interpolation: an apostrophe in a page title is safe, and a
  // quote in one cannot end the string the script is built from.
  const apostrophe = journeyAsPlaywright("goto /", "", "Bob's plan");
  assert.match(apostrophe, /^test\("Bob's plan"/m, "an apostrophe is safe inside a quoted title");
  const quoted = journeyAsPlaywright("goto /", "", 'Our "Pro" plan');
  assert.match(quoted, /^test\("Our \\"Pro\\" plan", async/m, "a quote in a title is escaped, not fatal");
});

test("every step of the journey is in the script, in the journey's own order", () => {
  const script = journeyAsPlaywright(FLOW, "https://shop.example");
  const { steps } = parseJourney(FLOW);
  const said = journeyAsText(steps);
  // The numbered comments are the journey as the person wrote it: if the script and the walk
  // drifted apart, this is where it shows.
  const numbered = script.split("\n").map((l) => l.match(/^\s*\/\/ (\d+)\. (.*)$/)).filter(Boolean) as RegExpMatchArray[];
  assert.equal(numbered.length, steps.length, "one numbered step per journey step");
  numbered.forEach((m, i) => {
    assert.equal(Number(m[1]), i + 1, "the steps are numbered in order");
    assert.equal(m[2], said[i], `step ${i + 1} is the journey's own line`);
  });
});

test("a folder that cannot be written costs the script, never the recording", () => {
  const dir = recordingDir();
  const missing = join(dir, "no-such-folder");
  assert.equal(writeJourneySpec(missing, FLOW, "https://shop.example"), null, "a missing folder is reported, not thrown");
  // A recording folder that already has something called `journey.spec.ts` in it — a directory of
  // that name — cannot hold the script either, and must still come back with the recording.
  const taken = recordingDir();
  mkdirSync(join(taken, JOURNEY_SPEC), { recursive: true });
  assert.equal(writeJourneySpec(taken, FLOW, "https://shop.example"), null, "a path the script can't be written to is reported too");
});
