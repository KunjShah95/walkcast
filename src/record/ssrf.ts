import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import type { BrowserContext } from "playwright";

/**
 * SSRF guard for a recorder that is reachable from other machines: whoever asks for a recording
 * must not be able to make the server's browser load (and film) addresses on the server's own
 * network. Checked for the first URL and, through a request route, for every request the browser
 * makes afterwards (redirects, iframes, images, scripts).
 *
 * Partial mitigation for DNS rebinding: allowed (public) lookups are never cached, so a hostname
 * is re-resolved on every request (redirects, iframes, images, scripts) and a second lookup that
 * returns a private address is caught the next time. Only negative results are briefly cached, so
 * a blocked host stays fail-closed and cheap. For a public deployment, still also block private
 * ranges at the network/egress layer; this code path alone cannot guarantee correctness.
 */
const PRIVATE = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) PRIVATE.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) PRIVATE.addSubnet(net, prefix, "ipv6");

/** IPv4-mapped/compatible IPv6 (::ffff:127.0.0.1, ::ffff:7f00:1) as the IPv4 address it carries. */
function unmap(address: string): string {
  // dotted-quad embeddings with any known prefix
  const dotted = /::(?:ffff(?::0)?:)?(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
              || /^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (dotted) return dotted[1]!;
  const toIp = (hi: string, lo: string) => {
    const h = Number.parseInt(hi, 16);
    const l = Number.parseInt(lo, 16);
    return `${h >> 8}.${h & 255}.${l >> 8}.${l & 255}`;
  };
  // hex-pair embeddings: ::7f00:1, ::ffff:7f00:1, ::ffff:0:7f00:1, 64:ff9b::7f00:1, 64:ff9b::0:7f00:1
  const prefixes: Array<[RegExp, (m: RegExpExecArray) => string]> = [
    [/^::ffff:0:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i, (m) => toIp(m[1]!, m[2]!)],
    [/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i, (m) => toIp(m[1]!, m[2]!)],
    [/^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i, (m) => toIp(m[1]!, m[2]!)],
    [/^64:ff9b::0:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i, (m) => toIp(m[1]!, m[2]!)],
    [/^64:ff9b::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i, (m) => toIp(m[1]!, m[2]!)],
  ];
  for (const [re, fn] of prefixes) {
    const m = re.exec(address);
    if (m) return fn(m);
  }
  return address;
}

export function isPrivateAddress(address: string): boolean {
  const a = unmap(address.replace(/^\[|\]$/g, "").replace(/%.*$/, ""));
  const family = isIP(a);
  if (family === 4) return PRIVATE.check(a, "ipv4");
  if (family === 6) return PRIVATE.check(a, "ipv6");
  return true;
}

const cache = new Map<string, { at: number; blocked: string | null }>();

/**
 * DNS rebinding mitigation: a name that returned a public address on the first lookup can
 * return a private one on the second one. We never trust an "allowed" result across a cache
 * window, so every request re-resolves, which is what `guardContext` relies on to keep a
 * private address out even after a rebind. Only negative results (host resolves to a private
 * or unresolvable address) are kept briefly, so a blocked host stays cheaply and fail-closed.
 */
const BLOCKED_TTL_MS = 60_000;

/** Why `hostname` may not be visited (it is, or resolves to, a private address), or null. */
export async function blockedHost(hostname: string): Promise<string | null> {
  const host = hostname.replace(/^\[|\]$/g, "");
  const hit = cache.get(host);
  if (hit && hit.blocked !== null && Date.now() - hit.at < BLOCKED_TTL_MS) return hit.blocked;
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true, verbatim: true }).catch(() => [])).map((a) => a.address);
  const bad = addresses.length === 0 ? null : addresses.find(isPrivateAddress);
  const blocked = addresses.length === 0 ? `Could not resolve ${host}.` : bad ? `${host} resolves to a private or local address (${bad}).` : null;
  if (blocked !== null) cache.set(host, { at: Date.now(), blocked });
  else cache.delete(host);
  return blocked;
}

/** Clear the blocked-host cache. Intended for tests (and forced re-validation). */
export function clearBlockedHostCache(): void {
  cache.clear();
}

/** Abort every browser request to a private or local address. Returns the list of blocked URLs. */
export async function guardContext(context: BrowserContext): Promise<string[]> {
  const blocked: string[] = [];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if ((url.protocol === "http:" || url.protocol === "https:" || url.protocol === "ws:" || url.protocol === "wss:") && (await blockedHost(url.hostname))) {
      blocked.push(url.toString());
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  return blocked;
}
