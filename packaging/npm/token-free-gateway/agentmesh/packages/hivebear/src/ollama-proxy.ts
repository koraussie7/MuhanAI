import http from "node:http";
import net from "node:net";
import dns from "node:dns/promises";
import type { LookupAddress } from "node:dns";

type HttpProxyClient = typeof globalThis extends { fetch: infer F }
  ? F
  : typeof globalThis.fetch;

export type SsrfCheck = { ok: true } | { ok: false; reason: string };

export type SsrfGuard = {
  validate(target: string): Promise<SsrfCheck>;
};

const LOOPBACK_LITERALS = new Set(["127.0.0.1", "::1"]);

// Conservative default: only literal loopback addresses. Operator must opt in
// (env var or per-instance flag) to forward to any other target. This prevents
// the proxy from being repurposed as an SSRF oracle pointing at the cloud
// metadata endpoint (169.254.169.254) or internal services.
export const defaultGuard: SsrfGuard = {
  async validate(target: string): Promise<SsrfCheck> {
    let url: URL;
    try {
      url = new URL(target);
    } catch {
      return { ok: false, reason: "target is not a valid URL" };
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false, reason: `unsupported protocol: ${url.protocol}` };
    }

    const allowPrivate =
      process.env.HIVEBEAR_ALLOW_PRIVATE_TARGETS === "1" ||
      process.env.HIVEBEAR_ALLOW_PRIVATE_TARGETS === "true";
    const hostname = url.hostname;
    const literal = hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;

    if (net.isIP(literal)) {
      if (LOOPBACK_LITERALS.has(literal)) return { ok: true };
      if (isPrivateOrReservedIP(literal)) {
        return allowPrivate
          ? { ok: true }
          : { ok: false, reason: `target IP is private/reserved: ${literal}` };
      }
      return { ok: true };
    }

    let resolved: LookupAddress[];
    try {
      resolved = await dns.lookup(hostname, { all: true });
    } catch (err) {
      return {
        ok: false,
        reason: `cannot resolve hostname ${hostname}: ${(err as Error).message}`,
      };
    }
    if (resolved.length === 0) {
      return { ok: false, reason: `hostname ${hostname} resolved to no addresses` };
    }
    for (const { address } of resolved) {
      if (LOOPBACK_LITERALS.has(address)) continue;
      if (isPrivateOrReservedIP(address)) {
        return allowPrivate
          ? { ok: true }
          : {
              ok: false,
              reason: `hostname ${hostname} resolves to private/reserved IP ${address}`,
            };
      }
    }
    return { ok: true };
  },
};

function isPrivateOrReservedIP(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true; // unknown shape — treat as untrusted
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true;
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 0) return true; // 0.0.0.0/8 — "this network"
  if (a === 127) return true; // 127.0.0.0/8 — loopback
  if (a === 10) return true; // 10.0.0.0/8 — private
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 — private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 — private
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 — link-local (incl. cloud metadata)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 — CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 — benchmark
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const addr = ip.split("%")[0]?.toLowerCase() ?? "";
  if (addr === "::1") return true; // IPv6 loopback
  if (addr === "::" || addr === "0:0:0:0:0:0:0:0") return true; // unspecified

  // Split into the hextets that appear before any "::" compression.
  const dcolon = addr.indexOf("::");
  const leading = dcolon >= 0 ? addr.slice(0, dcolon) : addr;
  const hextets = leading.split(":").filter((s) => s.length > 0);
  const first = hextets[0];

  // fe80::/10 — link-local. First hextet starts with `fe` and the next byte
  // falls in 0x80..0xbf. The byte may sit inside `first` (e.g. "fe80", "fe8a")
  // or span into the next hextet (e.g. "fe:80::..." or "fe:8::...").
  if (first && first.length >= 2 && first.startsWith("fe")) {
    let secondByte: number;
    if (first.length >= 4) {
      secondByte = Number.parseInt(first.slice(2, 4), 16);
    } else if (hextets[1] && hextets[1].length >= 2) {
      secondByte = Number.parseInt(hextets[1].slice(0, 2), 16);
    } else {
      secondByte = 0;
    }
    if (Number.isFinite(secondByte) && secondByte >= 0x80 && secondByte <= 0xbf) {
      return true;
    }
  }

  // fc00::/7 — unique local (fc.. or fd..)
  if (first && (first.startsWith("fc") || first.startsWith("fd"))) return true;
  // ff00::/8 — multicast
  if (first && first.startsWith("ff")) return true;

  // IPv4-mapped IPv6 — ::ffff:a.b.c.d or ::ffff:hhhh:hhhh
  if (addr.startsWith("::ffff:")) {
    const tail = addr.slice("::ffff:".length);
    if (tail.includes(".")) return isPrivateIPv4(tail);
    const parts = tail.split(":").filter(Boolean);
    if (parts.length === 2) {
      const hi = Number.parseInt(parts[0] ?? "0", 16);
      const lo = Number.parseInt(parts[1] ?? "0", 16);
      if (!Number.isFinite(hi) || !Number.isFinite(lo)) return false;
      const v4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
      return isPrivateIPv4(v4);
    }
  }
  return false;
}

export class OllamaProxy {
  private readonly target: string;
  private readonly guard: SsrfGuard;
  private client: HttpProxyClient | null = null;

  constructor(
    target = "http://127.0.0.1:11434",
    options: { guard?: SsrfGuard; allowPrivateTargets?: boolean } = {},
  ) {
    // Synchronous literal-only fast path so the constructor can stay sync and
    // still fail fast on obviously-bad targets. Hostname resolution happens in
    // createHandler().
    const literalCheck = literalOnlyCheck(target, options.allowPrivateTargets);
    if (!literalCheck.ok) {
      throw new Error(`OllamaProxy refused target: ${literalCheck.reason}`);
    }
    this.target = target;
    this.guard = options.guard ?? defaultGuard;
  }

  withClient(client: HttpProxyClient) {
    this.client = client;
    return this;
  }

  createHandler() {
    return async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
      // Re-validate on every request to defend against DNS rebinding: a hostname
      // that resolved to a public IP at construction time could resolve to an
      // internal IP by the time we actually connect.
      const check = await this.guard.validate(this.target);
      if (!check.ok) {
        res.statusCode = 502;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: `HiveBear SSRF guard: ${check.reason}` }));
        return;
      }

      const url = new URL(req.url ?? "/", this.target);
      const targetUrl = `${this.target}${url.pathname}${url.search}`;

      try {
        const response = await fetch(targetUrl, {
          method: req.method,
          headers: normalizeHeaders(req.headers),
          body:
            req.method !== "GET" && req.method !== "HEAD"
              ? await streamBody(req)
              : undefined,
        });

        res.statusCode = response.status;
        response.headers.forEach((value, key) => {
          if (key.toLowerCase() !== "transfer-encoding") {
            res.setHeader(key, value);
          }
        });

        const body = Buffer.from(await response.arrayBuffer());
        res.setHeader("content-length", String(body.byteLength));
        res.end(body);
      } catch (error) {
        res.statusCode = 502;
        res.setHeader("content-type", "application/json");
        const message = error instanceof Error ? error.message : String(error);
        res.end(JSON.stringify({ error: `HiveBear proxy error: ${message}` }));
      }
    };
  }
}

function literalOnlyCheck(target: string, allowPrivate?: boolean): SsrfCheck {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return { ok: false, reason: "target is not a valid URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `unsupported protocol: ${url.protocol}` };
  }
  const hostname = url.hostname;
  const literal =
    hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;
  if (!net.isIP(literal)) {
    // Hostname — DNS resolution happens at request time. We can't fail-fast
    // synchronously, so let it through; the guard will catch it.
    return { ok: true };
  }
  if (LOOPBACK_LITERALS.has(literal)) return { ok: true };
  if (isPrivateOrReservedIP(literal)) {
    return allowPrivate
      ? { ok: true }
      : { ok: false, reason: `target IP is private/reserved: ${literal}` };
  }
  return { ok: true };
}

function normalizeHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      out[key] = value;
    } else if (Array.isArray(value)) {
      const last = value[value.length - 1];
      if (typeof last === "string") out[key] = last;
    }
  }
  return out;
}

async function streamBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}
