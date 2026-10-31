import assert from "node:assert/strict";
import { test } from "node:test";
import { journeyAsPlaywright, journeyAsText, parseJourney } from "../packages/core/src/record/journey.ts";

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
