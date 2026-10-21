/**
 * The runtime packages the staged sources import.
 *
 * A bare import in the code is a package the sidecar must ship. An import written inside a
 * string literal is not: the journeys feature writes a Playwright script as text, and its
 * "import { test, expect } from '@playwright/test'" line is a script the user copies into
 * their own project, not something the server loads. Counting it shipped a package that is
 * not a dependency of anything, and the release build failed on it.
 */

const IMPORT_PREFIX = /(?:from\s+|import\s*\(\s*|import\s+)/y;
const SPECIFIER = /["']([^"'.][^"']*)["']/y;

/**
 * The bare module specifiers imported by this source, in the order they appear.
 * Imports inside a string or a comment are text, not imports, and are skipped.
 */
export function bareImports(src: string): string[] {
  const found: string[] = [];
  let i = 0;
  // The quote that opened the string we are inside, or null when we are in code.
  let quote: string | null = null;
  while (i < src.length) {
    const c = src[i]!;
    if (quote) {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i);
      i = nl === -1 ? src.length : nl;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    IMPORT_PREFIX.lastIndex = i;
    const prefix = IMPORT_PREFIX.exec(src);
    if (!prefix) {
      i++;
      continue;
    }
    const after = i + prefix[0].length;
    SPECIFIER.lastIndex = after;
    const spec = SPECIFIER.exec(src);
    if (!spec) {
      // "import" or "from" that leads to nothing quoted: not an import.
      i = after;
      continue;
    }
    found.push(spec[1]!);
    i = after + spec[0].length;
  }
  return found;
}

/** The package name a specifier belongs to: "@scope/name" stays whole, "name/sub" is "name". */
export function packageOf(specifier: string): string {
  return specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]!;
}
