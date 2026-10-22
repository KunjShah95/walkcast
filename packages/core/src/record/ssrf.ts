import { lookup as dnsLookup } from "node:dns";
import { lookup } from "node:dns/promises";
import { createServer, request as httpRequest, type IncomingMessage } from "node:http";
import { BlockList, connect, isIP, type LookupFunction } from "node:net";
import type { Duplex } from "node:stream";
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

/**
 * A DNS lookup for sockets that refuses private and local answers.
 *
 * Checking a hostname and then letting the client resolve it again leaves a gap: a hostile DNS
 * server can answer the check with a public address and the connection with 127.0.0.1 (DNS
 * rebinding). Handing this to `http.request` / `net.connect` as their `lookup` closes the gap,
 * because the address that was checked is the address the socket connects to.
 */
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    const list = addresses as unknown as { address: string; family: number }[];
    const bad = list.find((a) => isPrivateAddress(a.address));
    if (list.length === 0 || bad) {
      const e = Object.assign(new Error(`${hostname} resolves to a private or local address${bad ? ` (${bad.address})` : ""}.`), { code: "EBLOCKED" });
      return callback(e, "", 0);
    }
    if (options.all) return (callback as unknown as (e: null, a: typeof list) => void)(null, list);
    callback(null, list[0]!.address, list[0]!.family);
  });
};

/** A literal address is checked as it is; a name goes through guardedLookup at connect time. */
function literalBlocked(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "");
  return isIP(h) !== 0 && isPrivateAddress(h);
}

/**
 * A local forward proxy for the recording browser that connects only to public addresses.
 *
 * `guardContext` stops requests whose host looks private when Chromium asks for them, but
 * Chromium then resolves the name again on its own, so a rebinding DNS server could still steer
 * the page at a local service. Sending the browser through this proxy moves the resolution into
 * Node, where `guardedLookup` checks the very address the connection uses. Plain HTTP is
 * forwarded; HTTPS and WebSockets are tunnelled with CONNECT and never decrypted.
 */
export async function startGuardProxy(): Promise<{ server: string; blocked: string[]; close(): Promise<void> }> {
  const blocked: string[] = [];
  const refuse = (where: string) => blocked.push(where);
  const server = createServer((req: IncomingMessage, res) => {
    let target: URL;
    try {
      target = new URL(req.url ?? "");
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (target.protocol !== "http:" || literalBlocked(target.hostname)) {
      refuse(target.toString());
      res.writeHead(403).end();
      return;
    }
    const upstream = httpRequest(
      { host: target.hostname, port: target.port || 80, path: `${target.pathname}${target.search}`, method: req.method, headers: req.headers, lookup: guardedLookup },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on("error", (e) => {
      if ((e as NodeJS.ErrnoException).code === "EBLOCKED") refuse(target.toString());
      if (!res.headersSent) res.writeHead((e as NodeJS.ErrnoException).code === "EBLOCKED" ? 403 : 502);
      res.end();
    });
    req.pipe(upstream);
  });
  server.on("connect", (req: IncomingMessage, client: Duplex, head: Buffer) => {
    const [host = "", portText = "443"] = (req.url ?? "").replace(/^\[(.*)\](?=:)/, "$1").split(/:(?=\d+$)/);
    const port = Number(portText);
    if (!host || !Number.isInteger(port) || literalBlocked(host)) {
      refuse(req.url ?? "");
      client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    const upstream = connect({ host, port, lookup: guardedLookup }, () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on("error", (e) => {
      if ((e as NodeJS.ErrnoException).code === "EBLOCKED") refuse(req.url ?? "");
      client.end(`HTTP/1.1 ${(e as NodeJS.ErrnoException).code === "EBLOCKED" ? "403 Forbidden" : "502 Bad Gateway"}\r\n\r\n`);
    });
    client.on("error", () => upstream.destroy());
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  return {
    server: `http://127.0.0.1:${port}`,
    blocked,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
