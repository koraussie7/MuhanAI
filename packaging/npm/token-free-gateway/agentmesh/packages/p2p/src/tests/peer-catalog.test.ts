import { describe, expect, it } from "vitest";
import { DiscoveryMethod, PeerCatalog } from "../peer-catalog.js";

describe("PeerCatalog", () => {
	it("upserts new entries", () => {
		const cat = new PeerCatalog();
		cat.upsert({
			id: "12D3KooA",
			addrs: ["/ip4/1.2.3.4/tcp/4001"],
			addedAt: Date.now(),
			lastSeen: Date.now(),
			discoveryMethod: DiscoveryMethod.Mdns,
			tags: {},
		});
		expect(cat.size()).toBe(1);
		expect(cat.get("12D3KooA")?.discoveryMethod).toBe(DiscoveryMethod.Mdns);
	});

	it("merges tags across upserts", () => {
		const cat = new PeerCatalog();
		const now = Date.now();
		cat.upsert({
			id: "12D3KooA",
			addrs: ["/ip4/1.2.3.4/tcp/4001"],
			addedAt: now,
			lastSeen: now,
			discoveryMethod: DiscoveryMethod.Bootstrap,
			tags: { "keep-alive-agentmesh": { value: 50 } },
		});
		cat.upsert({
			id: "12D3KooA",
			addrs: ["/ip4/1.2.3.4/tcp/4001"],
			addedAt: now,
			lastSeen: now,
			discoveryMethod: DiscoveryMethod.Bootstrap,
			tags: { "ban-reputation": { value: 5 } },
		});
		const entry = cat.get("12D3KooA");
		expect(entry?.tags["keep-alive-agentmesh"]?.value).toBe(50);
		expect(entry?.tags["ban-reputation"]?.value).toBe(5);
	});

	it("filters online (last 5 min)", () => {
		const cat = new PeerCatalog();
		const now = Date.now();
		cat.upsert({
			id: "fresh",
			addrs: [],
			addedAt: now,
			lastSeen: now,
			discoveryMethod: DiscoveryMethod.Mdns,
			tags: {},
		});
		cat.upsert({
			id: "stale",
			addrs: [],
			addedAt: now - 10 * 60_000,
			lastSeen: now - 10 * 60_000,
			discoveryMethod: DiscoveryMethod.Mdns,
			tags: {},
		});
		expect(cat.online().map((e) => e.id)).toEqual(["fresh"]);
	});

	it("removes by id", () => {
		const cat = new PeerCatalog();
		cat.upsert({
			id: "x",
			addrs: [],
			addedAt: 0,
			lastSeen: 0,
			discoveryMethod: DiscoveryMethod.Manual,
			tags: {},
		});
		expect(cat.remove("x")).toBe(true);
		expect(cat.size()).toBe(0);
	});
});
