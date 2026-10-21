import assert from "node:assert/strict";
import { test } from "node:test";
import { journeyAsPlaywright, journeyAsText, parseJourney } from "../packages/core/src/record/journey.ts";

/**
 * A journey: the path through a site that somebody chose.
 *
 * The steps are read the way a person writes them, and a line that cannot be read is reported
 * rather than skipped — a journey that quietly does less than it says is worse than one that
 * says it could not read a line.
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

test("a journey prints as a Playwright script", () => {
  const script = journeyAsPlaywright('goto /pricing\nclick "Buy now"\nfill "Email" "jane@example.com"', "https://shop.example");
  assert.match(script, /import \{ test, expect \} from '@playwright\/test';/);
  assert.match(script, /await page\.goto\('https:\/\/shop\.example'\);/);
  assert.match(script, /await page\.goto\('https:\/\/shop\.example\/pricing'\);/);
  assert.match(script, /getByRole\('button', \{ name: "Buy now" \}\)/);
  assert.match(script, /getByLabel\("Email"\)\.fill\("jane@example\.com"\);/);
});

test("a journey reads back as the steps it is", () => {
  const { steps } = parseJourney('goto /pricing\nclick "Buy now"');
  assert.deepEqual(journeyAsText(steps), ["goto /pricing", 'click "Buy now"']);
});
