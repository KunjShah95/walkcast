import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import type { BrowserContext } from "playwright";

/**
 * SSRF guard for a recorder that is reachable from other machines: whoever asks for a recording
 * must not be able to make the server's browser load (and film) addresses on the server's own
 * network. Checked for the first URL and, through a request route, for every request the browser
 * makes afterwards (redirects, iframes, images, scripts).
 *
 * Limits: the browser resolves names itself, so a hostile DNS server that answers differently on
 * the second lookup (DNS rebinding) can still slip through; for a public deployment, also run the
 * recorder behind an egress proxy or firewall that blocks private ranges.
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
  const m = /^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (m) return m[1]!;
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (hex) {
    const hi = Number.parseInt(hex[1]!, 16);
    const lo = Number.parseInt(hex[2]!, 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
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

/** Why `hostname` may not be visited (it is, or resolves to, a private address), or null. */
export async function blockedHost(hostname: string): Promise<string | null> {
  const host = hostname.replace(/^\[|\]$/g, "");
  const hit = cache.get(host);
  if (hit && Date.now() - hit.at < 60_000) return hit.blocked;
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true, verbatim: true }).catch(() => [])).map((a) => a.address);
  const bad = addresses.length === 0 ? null : addresses.find(isPrivateAddress);
  const blocked = addresses.length === 0 ? `Could not resolve ${host}.` : bad ? `${host} resolves to a private or local address (${bad}).` : null;
  cache.set(host, { at: Date.now(), blocked });
  return blocked;
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
