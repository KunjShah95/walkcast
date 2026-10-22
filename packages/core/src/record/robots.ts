/**
 * robots.txt, read the way crawlers read it (RFC 9309).
 *
 * The recorder used to keep only plain `Disallow:` prefixes for `User-agent: *`, so
 * `Disallow: /admin/*` never matched `/admin/settings`, and an `Allow:` exception under a
 * broader `Disallow` was ignored. Rules here match with `*` (any run of characters) and a
 * trailing `$` (end of path); the longest matching rule wins and `Allow` wins a tie.
 */

export interface RobotsRule {
  allow: boolean;
  pattern: string;
}

/** The rules that apply to every crawler (`User-agent: *`). */
export function parseRobots(text: string): RobotsRule[] {
  const rules: RobotsRule[] = [];
  let applies = false;
  let inGroupHeader = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === "user-agent") {
      // Consecutive User-agent lines open one group together.
      applies = inGroupHeader ? applies || value === "*" : value === "*";
      inGroupHeader = true;
      continue;
    }
    inGroupHeader = false;
    if (!applies || !value) continue;
    if (key === "disallow") rules.push({ allow: false, pattern: value });
    else if (key === "allow") rules.push({ allow: true, pattern: value });
  }
  return rules;
}

function matcher(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

/** Whether `path` (pathname plus search) may be visited under `rules`. */
export function robotsAllows(rules: RobotsRule[], path: string): boolean {
  let best: RobotsRule | null = null;
  for (const rule of rules) {
    if (!matcher(rule.pattern).test(path)) continue;
    if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow)) best = rule;
  }
  return best ? best.allow : true;
}
