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
 *   wait 500
 *   scroll
 *
 * The same journey prints as a Playwright script, so a walkthrough of a flow can be handed to
 * the person who writes the tests for it.
 */

/** One step of a journey. */
export type JourneyStep =
  | { kind: "goto"; path: string }
  | { kind: "click"; name: string }
  | { kind: "fill"; name: string; value: string }
  | { kind: "wait"; ms: number }
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
      case "wait": {
        const ms = Number(args[0]);
        if (!Number.isFinite(ms) || ms < 0) return problem("wait needs a number of milliseconds, e.g. wait 500");
        steps.push({ kind: "wait", ms });
        return;
      }
      case "scroll":
        steps.push({ kind: "scroll" });
        return;
      default:
        problem(`"${word}" is not a step. Use goto, click, fill, wait or scroll.`);
    }
  });
  return { steps, problems };
}

/** The journey as a Playwright script, so the flow can become a test. */
export function journeyAsPlaywright(journey: string, baseUrl: string): string {
  const { steps, problems } = parseJourney(journey);
  const lines: string[] = [
    "import { test, expect } from '@playwright/test';",
    "",
    `test('the journey', async ({ page }) => {`,
    `  await page.goto('${baseUrl}');`,
  ];
  for (const step of steps) {
    switch (step.kind) {
      case "goto":
        lines.push(`  await page.goto('${baseUrl.replace(/\/$/, "")}${step.path.startsWith("/") ? "" : "/"}${step.path}');`);
        break;
      case "click":
        lines.push(`  await page.getByRole('button', { name: ${JSON.stringify(step.name)} }).or(page.getByText(${JSON.stringify(step.name)})).first().click();`);
        break;
      case "fill":
        lines.push(`  await page.getByLabel(${JSON.stringify(step.name)}).fill(${JSON.stringify(step.value)});`);
        break;
      case "wait":
        lines.push(`  await page.waitForTimeout(${step.ms});`);
        break;
      case "scroll":
        lines.push(`  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));`);
        break;
    }
  }
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
      case "wait":
        return `wait ${step.ms}`;
      case "scroll":
        return "scroll";
    }
  });
}
