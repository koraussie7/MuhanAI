import { describe, expect, it } from "vitest";
import {
	createGhostDiscoveryClient,
	createGhostRegistry,
	createHostAllowlist,
	GhostFetchError,
	type GhostLookup,
	isInternalAddress,
	isInternalHostname,
	parseGhostAgentCard,
} from "./index.js";

/** Stub DNS that always resolves to a public address (hermetic tests). */
const publicLookup: GhostLookup = async () => [{ address: "93.184.216.34", family: 4 }];

const CARD = JSON.stringify({ name: "ghost", capabilities: [] });

function jsonResponse(body: string): Response {
	return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
}

describe("Ghost adapter", () => {
	it("validates and normalizes an Agent Card", () => {
		const card = parseGhostAgentCard(
			{
				name: "local-ghost",
				capabilities: ["local_file_search", "unsupported"],
				privacy: { filesStayLocal: true },
			},
			"https://ghost.example.com",
		);
		expect(card).toMatchObject({
			name: "local-ghost",
			url: "https://ghost.example.com",
			capabilities: ["local_file_search"],
			privacy: { filesStayLocal: true },
		});
	});

	it("discovers a Ghost Agent Card from the standard endpoint", async () => {
		let requestedUrl = "";
		const client = createGhostDiscoveryClient({
			fetchImpl: async (input) => {
				requestedUrl = String(input);
				return jsonResponse(CARD);
			},
			lookup: publicLookup,
		});
		await expect(client.discover("https://ghost.example.com")).resolves.toMatchObject({
			name: "ghost",
			url: "https://ghost.example.com",
		});
		expect(requestedUrl).toBe("https://ghost.example.com/.well-known/agent.json");
	});

	it("tracks heartbeats and removes stale nodes", () => {
		const registry = createGhostRegistry();
		registry.upsert({
			nodeId: "ghost-1",
			card: { name: "ghost", url: "https://ghost.example.com", capabilities: [] },
			lastSeenAt: 10,
		});
		registry.upsert({
			nodeId: "ghost-2",
			card: { name: "ghost-2", url: "https://ghost-2.example.com", capabilities: [] },
			lastSeenAt: 20,
		});
		expect(registry.removeStale(15)).toBe(1);
		expect(registry.list().map((node) => node.nodeId)).toEqual(["ghost-2"]);
	});
});

describe("Ghost SSRF guard", () => {
	it("classifies internal addresses", () => {
		for (const internal of [
			"127.0.0.1",
			"10.0.0.5",
			"172.16.0.1",
			"172.31.255.255",
			"192.168.1.1",
			"169.254.169.254", // cloud metadata
			"0.0.0.0",
			"255.255.255.255",
			"::1",
			"::ffff:127.0.0.1", // IPv4-mapped loopback
			"fd00::1", // unique-local
			"fe80::1", // link-local
			"not-an-ip",
		]) {
			expect(isInternalAddress(internal), internal).toBe(true);
		}
		for (const external of ["8.8.8.8", "93.184.216.34", "2606:4700::1111"]) {
			expect(isInternalAddress(external), external).toBe(false);
		}
	});

	it("classifies internal hostnames", () => {
		for (const internal of [
			"localhost",
			"METADATA.GOOGLE.INTERNAL",
			"box.local",
			"svc.internal",
			"127.0.0.1",
		]) {
			expect(isInternalHostname(internal), internal).toBe(true);
		}
		expect(isInternalHostname("ghost.example.com")).toBe(false);
	});

	it("rejects internal targets without calling fetch", async () => {
		let fetchCalled = false;
		const client = createGhostDiscoveryClient({
			fetchImpl: async () => {
				fetchCalled = true;
				return jsonResponse(CARD);
			},
			lookup: publicLookup,
		});
		await expect(client.discover("http://127.0.0.1:8787")).rejects.toMatchObject({
			code: "internal_url_blocked",
		});
		await expect(client.discover("http://169.254.169.254/")).rejects.toMatchObject({
			code: "internal_url_blocked",
		});
		expect(fetchCalled).toBe(false);
	});

	it("rejects a public hostname that resolves to a private address", async () => {
		// DNS rebinding: public name, private answer.
		const client = createGhostDiscoveryClient({
			fetchImpl: async () => jsonResponse(CARD),
			lookup: async () => [{ address: "192.168.0.10", family: 4 }],
		});
		await expect(client.discover("https://ghost.example.com")).rejects.toMatchObject({
			code: "internal_url_blocked",
		});
	});

	it("fails closed when DNS lookup fails", async () => {
		const client = createGhostDiscoveryClient({
			fetchImpl: async () => jsonResponse(CARD),
			lookup: async () => {
				throw new Error("NXDOMAIN");
			},
		});
		await expect(client.discover("https://ghost.example.com")).rejects.toMatchObject({
			code: "dns_failed",
		});
	});

	it("enforces the host allowlist", async () => {
		const allowlist = createHostAllowlist(["ghost.example.com", "*.mesh.example.com"]);
		expect(allowlist?.allows("ghost.example.com", "")).toBe(true);
		expect(allowlist?.allows("GHOST.EXAMPLE.COM", "")).toBe(true);
		expect(allowlist?.allows("edge.mesh.example.com", "")).toBe(true);
		expect(allowlist?.allows("mesh.example.com", "")).toBe(true);
		expect(allowlist?.allows("evil.example.org", "")).toBe(false);
		expect(allowlist?.allows("deep.sub.mesh.example.com", "")).toBe(true);
		expect(allowlist?.allows("mesh.example.org", "")).toBe(false);

		const client = createGhostDiscoveryClient({
			fetchImpl: async () => jsonResponse(CARD),
			lookup: publicLookup,
			allowlist,
		});
		await expect(client.discover("https://ghost.example.com")).resolves.toMatchObject({
			name: "ghost",
		});
		await expect(client.discover("https://evil.example.org")).rejects.toMatchObject({
			code: "url_not_allowed",
		});
	});

	it("follows redirects between public hosts", async () => {
		const client = createGhostDiscoveryClient({
			fetchImpl: async (input: Parameters<typeof fetch>[0]) => {
				const url = String(input);
				if (url === "https://ghost.example.com/.well-known/agent.json") {
					return new Response(null, {
						status: 302,
						headers: { location: "https://real.example.com/card.json" },
					});
				}
				expect(url).toBe("https://real.example.com/card.json");
				return jsonResponse(CARD);
			},
			lookup: publicLookup,
		});
		await expect(client.discover("https://ghost.example.com")).resolves.toMatchObject({
			name: "ghost",
		});
	});

	it("rejects a redirect that bounces into an internal address", async () => {
		const client = createGhostDiscoveryClient({
			fetchImpl: async () =>
				new Response(null, {
					status: 302,
					headers: { location: "http://169.254.169.254/latest/meta-data/" },
				}),
			lookup: publicLookup,
		});
		await expect(client.discover("https://ghost.example.com")).rejects.toMatchObject({
			code: "internal_url_blocked",
		});
	});

	it("rejects oversized and non-JSON responses", async () => {
		const small = createGhostDiscoveryClient({
			fetchImpl: async () => jsonResponse("x".repeat(100)),
			lookup: publicLookup,
			maxBytes: 64,
		});
		await expect(small.discover("https://ghost.example.com")).rejects.toMatchObject({
			code: "response_too_large",
		});

		const notJson = createGhostDiscoveryClient({
			fetchImpl: async () =>
				new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }),
			lookup: publicLookup,
		});
		await expect(notJson.discover("https://ghost.example.com")).rejects.toMatchObject({
			code: "not_json",
		});
	});

	it("exposes GhostFetchError with a stable code", () => {
		const error = new GhostFetchError("internal_url_blocked", "blocked");
		expect(error.code).toBe("internal_url_blocked");
		expect(error.name).toBe("GhostFetchError");
	});
});
