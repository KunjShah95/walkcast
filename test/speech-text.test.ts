import assert from "node:assert/strict";
import { test } from "node:test";
import { forSpeech } from "../packages/core/src/record/speech-text.ts";

test("a hostname is said as words, not spelled with its dots", () => {
  assert.equal(forSpeech("Opening agentic-crm-henna.vercel.app."), "Opening agentic crm henna dot vercel dot app.");
  assert.equal(forSpeech("Opening https://www.acme.io/pricing?x=1 now."), "Opening acme dot io now.");
});

test("an abbreviation or version number is left alone where it reads fine", () => {
  assert.equal(forSpeech("Version 3.5 is out"), "Version 3.5 is out.");
  assert.equal(forSpeech("For example, e.g. the cart"), "For example, for example, the cart.");
});

test("symbols become words", () => {
  assert.equal(forSpeech("Plans & pricing"), "Plans and pricing.");
  assert.equal(forSpeech("Save 20% on $49"), "Save 20 percent on 49 dollars.");
  assert.equal(forSpeech("Home → Pricing"), "Home, then Pricing.");
});

test("a line always ends so the voice lands it", () => {
  assert.equal(forSpeech("That's the tour"), "That's the tour.");
  assert.equal(forSpeech("Is this it?"), "Is this it?");
  assert.equal(forSpeech("It says “Done.”"), "It says “Done.”");
});

test("the same words always make the same speech, so the clip cache stays valid", () => {
  const line = "Signing in at acme.app & opening 2FA.";
  assert.equal(forSpeech(line), forSpeech(line));
});
