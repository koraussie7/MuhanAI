/**
 * SSRF guard for Ghost Agent Card discovery.
 *
 * `POST /api/ghost/nodes` makes the API server fetch a URL supplied by the
 * caller (`/.well-known/agent.json` on the registering node). Without a
 * guard that is an open proxy into whatever network the API server can
 * reach: cloud metadata endpoints (169.254.169.254), loopback services,
 * RFC1918 subnets behind the deployment, or — via a public hostname that
 * resolves to a private address — a DNS-rebinding endpoint. Every failure
 * here fails closed: an unparseable address, a failed DNS lookup, or an
 * oversized/unknown response is rejected, never allowed through.
 */
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export type GhostFetchErrorCode =
	| "invalid_url"
	| "unsupported_scheme"
	| "internal_url_blocked"
	| "url_not_allowed"
	| "dns_failed"
	| "too_many_redirects"
	| "response_too_large"
	| "not_json"
	| "http_error"
	| "network_error";

export class GhostFetchError extends Error {
	readonly code: GhostFetchErrorCode;

	constructor(code: GhostFetchErrorCode, message: string) {
		super(message);
		this.name = "GhostFetchError";
		this.code = code;
	}
}

/** One entry of an all-address DNS lookup. Structurally node:dns compatible. */
export interface GhostLookupAddress {
	address: string;
	family?: number;
}

/** `dns.promises.lookup` with `{ all: true }`. Injectable for hermetic tests. */
export type GhostLookup = (
	hostname: string,
	options: { all: true },
) => Promise<GhostLookupAddress[]>;

const defaultLookup: GhostLookup = (hostname, options) => dnsLookup(hostname, options);

/**
 * True for loopback, private (RFC1918), link-local (cloud metadata!),
 * unique-local, multicast, and unspecified addresses. Unparseable input is
 * treated as internal — fail closed.
 */
export function isInternalAddress(address: string): boolean {
	const family = isIP(address);
	if (family === 4) {
		const octets = address.split(".").map(Number);
		if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
			return true;
		}
		const a = octets[0] ?? 0;
		const b = octets[1] ?? 0;
		return (
			a === 0 || // 0.0.0.0/8 "this network"
			a === 10 || // 10/8 RFC1918
			a === 127 || // 127/8 loopback
			(a === 169 && b === 254) || // 169.254/16 link-local — cloud metadata
			(a === 172 && b >= 16 && b <= 31) || // 172.16/12 RFC1918
			(a === 192 && b === 168) || // 192.168/16 RFC1918
			a >= 224 // 224/4 multicast + 240/4 reserved
		);
	}
	if (family === 6) {
		const value = address.toLowerCase();
		if (value === "::" || value === "::1") return true;
		// IPv4-mapped IPv6 (::ffff:a.b.c.d) — the embedded v4 decides.
		const mapped = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
		if (mapped?.[1]) return isInternalAddress(mapped[1]);
		const head = value.split(":")[0] ?? "";
		if (head.startsWith("fc") || head.startsWith("fd")) return true; // fc00::/7 unique-local
		if (/^fe[89ab]/.test(head)) return true; // fe80::/10 link-local
		if (head.startsWith("ff")) return true; // ff00::/8 multicast
		return false;
	}
	return true;
}

/** Hostnames that must never be fetched even though they are not IPs. */
const RESERVED_HOSTNAMES = new Set([
	"localhost",
	"ip6-localhost",
	"ip6-loopback",
	"metadata.google.internal",
	"metadata.goog",
]);

export function isInternalHostname(hostname: string): boolean {
	const host = hostname.trim().toLowerCase().replace(/\.+$/, "");
	if (!host) return true;
	if (RESERVED_HOSTNAMES.has(host)) return true;
	if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
		return true;
	}
	const bare = host.replace(/^\[/, "").replace(/\]$/, "");
	if (isIP(bare) !== 0) return isInternalAddress(bare);
	return false;
}

export interface HostAllowlist {
	/** True when `host[:port]` is listed. Lowercase-exact or `*.suffix` match. */
	allows(host: string, port: string): boolean;
}

/**
 * Parse allowlist entries. Each entry is an exact hostname, optionally
 * `host:port` to pin a port, or `*.example.com` to allow that host and any
 * subdomain under it (any depth, mirroring cookie-domain semantics). Empty
 * input yields `undefined` (= no allowlist; all public hosts remain
 * fetchable subject to the internal-address guard).
 */
export function createHostAllowlist(
	entries: readonly string[] | undefined | null,
): HostAllowlist | undefined {
	if (!entries || entries.length === 0) return undefined;
	const exact = new Set<string>();
	const wildcards: string[] = [];
	for (const entry of entries) {
		const value = entry.trim().toLowerCase();
		if (!value) continue;
		if (value.startsWith("*.")) {
			wildcards.push(value.slice(2));
		} else {
			exact.add(value);
		}
	}
	if (exact.size === 0 && wildcards.length === 0) return undefined;
	return {
		allows(host, port) {
			const cleanHost = host.toLowerCase();
			const candidates = port ? [cleanHost, `${cleanHost}:${port}`] : [cleanHost];
			for (const candidate of candidates) {
				if (exact.has(candidate)) return true;
			}
			return wildcards.some((suffix) => cleanHost === suffix || cleanHost.endsWith(`.${suffix}`));
		},
	};
}

/**
 * Validate a URL for outbound fetching: http(s) only, no embedded
 * credentials, no internal hostnames, and (when an allowlist is configured)
 * host must be listed. Throws `GhostFetchError` with the specific code.
 */
export function assertFetchableUrl(rawUrl: string, allowlist?: HostAllowlist): URL {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		throw new GhostFetchError("invalid_url", `not a valid URL: ${rawUrl}`);
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new GhostFetchError("unsupported_scheme", `scheme must be http(s), got ${url.protocol}`);
	}
	if (url.username || url.password) {
		throw new GhostFetchError("invalid_url", "URL must not embed credentials");
	}
	if (isInternalHostname(url.hostname)) {
		throw new GhostFetchError(
			"internal_url_blocked",
			`host is an internal address: ${url.hostname}`,
		);
	}
	if (allowlist && !allowlist.allows(url.hostname, url.port)) {
		throw new GhostFetchError(
			"url_not_allowed",
			`host is not on the Ghost node allowlist: ${url.hostname}`,
		);
	}
	return url;
}

/**
 * DNS-level guard: resolve the hostname and reject if ANY resolved address
 * is internal. This is what stops DNS rebinding (a public name pointing at
 * a private IP). Literal IPs skip the lookup. Lookup failure fails closed.
 */
export async function assertPublicHost(
	hostname: string,
	lookup: GhostLookup = defaultLookup,
): Promise<void> {
	const bare = hostname.replace(/^\[/, "").replace(/\]$/, "");
	if (isIP(bare) !== 0) {
		if (isInternalAddress(bare)) {
			throw new GhostFetchError("internal_url_blocked", `address is internal: ${bare}`);
		}
		return;
	}
	let addresses: GhostLookupAddress[];
	try {
		addresses = await lookup(bare, { all: true });
	} catch (error) {
		throw new GhostFetchError(
			"dns_failed",
			`DNS lookup failed for ${bare}: ${(error as Error).message}`,
		);
	}
	if (addresses.length === 0) {
		throw new GhostFetchError("dns_failed", `DNS returned no addresses for ${bare}`);
	}
	for (const entry of addresses) {
		if (isInternalAddress(entry.address)) {
			throw new GhostFetchError(
				"internal_url_blocked",
				`DNS resolves ${bare} to an internal address (${entry.address})`,
			);
		}
	}
}

export interface GhostFetchPolicy {
	/** Fetch implementation (injectable for tests; defaults to global fetch). */
	fetchImpl?: typeof fetch;
	/** DNS resolver used to vet each hop (defaults to node:dns). */
	lookup?: GhostLookup;
	/** When set, only listed hosts may be fetched. */
	allowlist?: HostAllowlist;
	/** Redirect hops allowed (default 3). */
	maxRedirects?: number;
	/** Per-request timeout in ms (default 5000). */
	timeoutMs?: number;
	/** Maximum body size in bytes (default 64 KiB — an Agent Card is ~1 KiB). */
	maxBytes?: number;
}

const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_BYTES = 65_536;

/**
 * Fetch `/.well-known/agent.json` under the SSRF guard. Redirects are
 * followed manually so every hop re-passes scheme/host/allowlist/DNS
 * validation — an attacker cannot bounce a public URL into an internal
 * address. Returns the parsed JSON document.
 */
export async function fetchAgentCardDocument(
	rawUrl: string,
	policy: GhostFetchPolicy = {},
): Promise<unknown> {
	const fetchImpl = policy.fetchImpl ?? fetch;
	const lookup = policy.lookup ?? defaultLookup;
	const maxRedirects = policy.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
	const timeoutMs = policy.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const maxBytes = policy.maxBytes ?? DEFAULT_MAX_BYTES;

	let current = rawUrl;
	for (let hop = 0; hop <= maxRedirects; hop += 1) {
		const url = assertFetchableUrl(current, policy.allowlist);
		await assertPublicHost(url.hostname, lookup);

		let response: Response;
		try {
			response = await fetchImpl(url.toString(), {
				redirect: "manual",
				signal: AbortSignal.timeout(timeoutMs),
				headers: { accept: "application/json" },
			});
		} catch (error) {
			throw new GhostFetchError(
				"network_error",
				`Agent Card fetch failed: ${(error as Error).message ?? "fetch failed"}`,
			);
		}

		if (response.status >= 300 && response.status < 400) {
			const location = response.headers.get("location");
			if (!location) {
				throw new GhostFetchError("network_error", `redirect ${response.status} without Location`);
			}
			let next: URL;
			try {
				next = new URL(location, url);
			} catch {
				throw new GhostFetchError("network_error", `invalid redirect location: ${location}`);
			}
			current = next.toString();
			continue;
		}

		if (!response.ok) {
			throw new GhostFetchError("http_error", `Agent Card request failed: ${response.status}`);
		}

		const contentType = response.headers.get("content-type") ?? "";
		if (contentType && !contentType.includes("json")) {
			throw new GhostFetchError("not_json", `Agent Card content-type is not JSON: ${contentType}`);
		}

		const buffer = await response.arrayBuffer();
		if (buffer.byteLength > maxBytes) {
			throw new GhostFetchError(
				"response_too_large",
				`Agent Card is ${buffer.byteLength} bytes (limit ${maxBytes})`,
			);
		}

		try {
			return JSON.parse(new TextDecoder().decode(buffer)) as unknown;
		} catch (error) {
			throw new GhostFetchError(
				"not_json",
				`Agent Card is not valid JSON: ${(error as Error).message}`,
			);
		}
	}
	throw new GhostFetchError(
		"too_many_redirects",
		`more than ${maxRedirects} redirects while fetching the Agent Card`,
	);
}
