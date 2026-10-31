/**
 * A journey: the path through a site that somebody actually wants recorded.
 *
 * A crawl shows a site. A journey shows a flow: "open the pricing page, click Buy, fill in
 * the email". The recorder can already do every one of those things; what it could not do was
 * be told which ones to do, and in what order.
 *
 * The steps are written the way a person would say them out loud, one per line:
 *
 *   goto /pricing
 *   click "Buy now"
 *   fill "Email" "jane@example.com"
 *   select "Plan" "Pro"
 *   expect "30-day money back"
 *   wait 500
 *   scroll
 *
 * The same journey prints as a Playwright script, so a walkthrough of a flow can be handed to
 * the person who writes the tests for it. Every step the recorder can follow is a step the
 * script can run: the two lists are the same list, on purpose.
 */

/** One step of a journey. */
export type JourneyStep =
  | { kind: "goto"; path: string }
  | { kind: "click"; name: string }
  | { kind: "fill"; name: string; value: string }
  | { kind: "press"; key: string }
  | { kind: "select"; name: string; option: string }
  | { kind: "check"; name: string }
  | { kind: "uncheck"; name: string }
  | { kind: "hover"; name: string }
  | { kind: "wait"; ms: number }
  | { kind: "waitFor"; text: string }
  | { kind: "expect"; text: string }
  | { kind: "scroll" };

/** A step that could not be read, with the line it came from. */
export interface JourneyProblem {
  line: number;
  text: string;
  why: string;
}

/** The journey as written, and what could not be read. */
export interface ParsedJourney {
  steps: JourneyStep[];
  problems: JourneyProblem[];
}

/** The verbs a journey understands, in the order a person is likely to need them. */
const VERBS = "goto, click, fill, press, select, check, uncheck, hover, wait, waitFor, expect or scroll";

/** A key press is a key, not a sentence: "Enter", "Tab", "Control+A". */
const KEY = /^[A-Za-z][\w+]*$/;

/**
 * Read a journey.
 *
 * A line that cannot be read is reported rather than skipped: a journey that quietly does
 * less than it says is worse than one that says it could not read a line.
 */
export function parseJourney(text: string): ParsedJourney {
  const steps: JourneyStep[] = [];
  const problems: JourneyProblem[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, index) => {
    const line = raw.trim();
    // A line that starts with "#" is a note to a person, not a step.
    if (!line || line.startsWith("#")) return;
    const problem = (why: string) => problems.push({ line: index + 1, text: line, why });
    const quoted = [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1] ?? "");
    const rest = line.replace(/"[^"]*"/g, " ").trim();
    const [word, ...args] = rest.split(/\s+/);
    switch ((word ?? "").toLowerCase()) {
      case "goto": {
        const path = quoted[0] ?? args[0];
        if (!path) return problem("goto needs a path, e.g. goto /pricing");
        steps.push({ kind: "goto", path });
        return;
      }
      case "click": {
        const name = quoted[0] ?? args.join(" ");
        if (!name) return problem("click needs the name of the control, e.g. click \"Buy now\"");
        steps.push({ kind: "click", name });
        return;
      }
      case "fill": {
        const name = quoted[0] ?? args[0];
        const value = quoted[1] ?? args.slice(1).join(" ");
        if (!name) return problem("fill needs the name of the field, e.g. fill \"Email\" \"jane@example.com\"");
        steps.push({ kind: "fill", name, value });
        return;
      }
      case "press": {
        const key = quoted[0] ?? args[0];
        if (!key) return problem("press needs a key, e.g. press Enter");
        if (!KEY.test(key)) return problem(`"${key}" is not a key. Use a key name such as Enter, Tab or Control+A.`);
        steps.push({ kind: "press", key });
        return;
      }
      case "select": {
        const name = quoted[0] ?? args[0];
        const option = quoted[1] ?? args.slice(1).join(" ");
        if (!name) return problem("select needs the name of the control, e.g. select \"Plan\" \"Pro\"");
        if (!option) return problem("select needs the option to choose, e.g. select \"Plan\" \"Pro\"");
        steps.push({ kind: "select", name, option });
        return;
      }
      case "check":
      case "uncheck": {
        const name = quoted[0] ?? args.join(" ");
        const kind = word!.toLowerCase() as "check" | "uncheck";
        if (!name) return problem(`${kind} needs the name of the control, e.g. ${kind} "Remember me"`);
        steps.push({ kind, name });
        return;
      }
      case "hover": {
        const name = quoted[0] ?? args.join(" ");
        if (!name) return problem("hover needs the name of the control, e.g. hover \"Features\"");
        steps.push({ kind: "hover", name });
        return;
      }
      case "wait": {
        const ms = Number(args[0]);
        if (!Number.isFinite(ms) || ms < 0) return problem("wait needs a number of milliseconds, e.g. wait 500");
        steps.push({ kind: "wait", ms });
        return;
      }
      case "waitfor": {
        const text = quoted[0] ?? args.join(" ");
        if (!text) return problem("waitFor needs the text to wait for, e.g. waitFor \"Dashboard\"");
        steps.push({ kind: "waitFor", text });
        return;
      }
      case "expect": {
        const text = quoted[0] ?? args.join(" ");
        if (!text) return problem("expect needs the text the page should show, e.g. expect \"Thank you\"");
        steps.push({ kind: "expect", text });
        return;
      }
      case "scroll":
        steps.push({ kind: "scroll" });
        return;
      default:
        problem(`"${word}" is not a step. Use ${VERBS}.`);
    }
  });
  return { steps, problems };
}

/** A string as a JavaScript string literal: a site's own words are quoted, never interpolated. */
const jq = (s: string) => JSON.stringify(s);

/** An absolute URL or a site-relative path, the way the recorder itself reads a goto. */
function target(path: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(path) ? path : `/${path.replace(/^\/+/, "")}`;
}

/** The one line of Playwright that does a journey step. */
function stepCode(step: JourneyStep): string {
  switch (step.kind) {
    case "goto":
      return `await page.goto(${jq(target(step.path))});`;
    case "click":
      // A control is named the way its owner names it: role and name first, then its own text.
      return `await page.getByRole("button", { name: ${jq(step.name)} }).or(page.getByText(${jq(step.name)})).first().click();`;
    case "fill":
      return `await page.getByLabel(${jq(step.name)}).or(page.getByPlaceholder(${jq(step.name)})).first().fill(${jq(step.value)});`;
    case "press":
      return `await page.keyboard.press(${jq(step.key)});`;
    case "select":
      return `await page.getByLabel(${jq(step.name)}).first().selectOption({ label: ${jq(step.option)} });`;
    case "check":
      return `await page.getByRole("checkbox", { name: ${jq(step.name)} }).or(page.getByLabel(${jq(step.name)})).first().check();`;
    case "uncheck":
      return `await page.getByRole("checkbox", { name: ${jq(step.name)} }).or(page.getByLabel(${jq(step.name)})).first().uncheck();`;
    case "hover":
      return `await page.getByText(${jq(step.name)}).or(page.getByRole("button", { name: ${jq(step.name)} })).first().hover();`;
    case "wait":
      return `await page.waitForTimeout(${Math.round(step.ms)});`;
    case "waitFor":
      // Waiting is what expect already does, and it waits for the element to be visible.
      return `await expect(page.getByText(${jq(step.text)}).first()).toBeVisible({ timeout: 10000 });`;
    case "expect":
      return `await expect(page.getByText(${jq(step.text)}).first()).toBeVisible();`;
    case "scroll":
      return "await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));";
  }
}

/**
 * The journey as a Playwright script, so the flow can become a test.
 *
 * One numbered step per journey line, and the site as the base URL, so a failure in the report
 * names the line of the journey it came from instead of "somewhere in the test". Only the
 * imports the script uses are imported: a copied file that does not lint is a file nobody runs.
 */
export function journeyAsPlaywright(journey: string, baseUrl: string): string {
  const { steps, problems } = parseJourney(journey);
  const base = baseUrl.trim().replace(/\/+$/, "");
  const awaited = steps.map(stepCode);
  const needsExpect = awaited.some((line) => line.startsWith("await expect("));
  const header = base ? `// The journey recorded on ${base.replace(/^https?:\/\//, "")}: ${steps.length} step${steps.length === 1 ? "" : "s"}.` : `// The journey: ${steps.length} step${steps.length === 1 ? "" : "s"}.`;
  const lines: string[] = [`import { test${needsExpect ? ", expect" : ""} } from '@playwright/test';`, "", header, ""];
  if (base) lines.push(`test.use({ baseURL: ${jq(base)} });`, "");
  lines.push("test('the journey', async ({ page }) => {");
  lines.push(base ? `  await page.goto(${jq("/")});` : `  await page.goto("/"); // set baseURL in playwright.config.ts, or replace "/" with the site`);
  steps.forEach((step, i) => {
    lines.push("", `  // ${i + 1}. ${journeyAsText([step])[0]}`, `  ${awaited[i]}`);
  });
  lines.push("});", "");
  if (problems.length) {
    lines.push("// Lines that could not be read, left out of the script:");
    for (const problem of problems) lines.push(`//   line ${problem.line}: ${problem.why}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** The journey as one line each, for the person to read back. */
export function journeyAsText(steps: JourneyStep[]): string[] {
  return steps.map((step) => {
    switch (step.kind) {
      case "goto":
        return `goto ${step.path}`;
      case "click":
        return `click "${step.name}"`;
      case "fill":
        return `fill "${step.name}" "${step.value}"`;
      case "press":
        return `press ${step.key}`;
      case "select":
        return `select "${step.name}" "${step.option}"`;
      case "check":
        return `check "${step.name}"`;
      case "uncheck":
        return `uncheck "${step.name}"`;
      case "hover":
        return `hover "${step.name}"`;
      case "wait":
        return `wait ${step.ms}`;
      case "waitFor":
        return `waitFor "${step.text}"`;
      case "expect":
        return `expect "${step.text}"`;
      case "scroll":
        return "scroll";
    }
  });
}
