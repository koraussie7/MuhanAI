import { beforeEach, describe, expect, it } from "vitest";
import { MockDnsLinkAdapter } from "./dnslink.js";
import { MockIpfsAdapter } from "./mock.js";

describe("MockIpfsAdapter", () => {
	const adapter = new MockIpfsAdapter();

	it("adds a bundle and returns a deterministic mock CID", async () => {
		const result = await adapter.add({
			"index.html": "<h1>hi</h1>",
			".well-known/mcp.json": '{"name":"x"}',
		});
		expect(result.cid).toMatch(/^bafymock/);
		expect(result.size).toBe(11 + 12); // raw byte length of both files
		// Same content → same CID (deterministic)
		const again = await adapter.add({
			"index.html": "<h1>hi</h1>",
			".well-known/mcp.json": '{"name":"x"}',
		});
		expect(again.cid).toBe(result.cid);
	});

	it("pins content and returns success", async () => {
		const result = await adapter.pin("bafytest123");
		expect(result.success).toBe(true);
		expect(result.cid).toBe("bafytest123");
		expect(result.pinStatus).toBe("pinned");
	});

	it("tracks pin status", async () => {
		await adapter.pin("bafytest456", { replication: 5 });
		const status = await adapter.status("bafytest456");
		expect(status.status).toBe("pinned");
		expect(status.replication).toBe(5);
	});

	it("unpins content", async () => {
		await adapter.pin("bafytest789");
		const result = await adapter.unpin("bafytest789");
		expect(result.success).toBe(true);
		expect(result.pinStatus).toBe("unpinned");
		const status = await adapter.status("bafytest789");
		expect(status.status).toBe("unpinned");
	});

	it("lists all pins", async () => {
		await adapter.pin("bafy1");
		await adapter.pin("bafy2");
		const pins = await adapter.listPins();
		expect(pins.length).toBeGreaterThanOrEqual(2);
	});

	it("returns unpinned status for unknown CID", async () => {
		const status = await adapter.status("unknown-cid");
		expect(status.status).toBe("unpinned");
		expect(status.replication).toBe(0);
	});

	it("fails to unpin unknown CID", async () => {
		const result = await adapter.unpin("unknown-cid");
		expect(result.success).toBe(false);
		expect(result.error).toBe("CID not found");
	});
});

describe("MockDnsLinkAdapter", () => {
	const adapter = new MockDnsLinkAdapter();

	it("updates DNSLink record", async () => {
		const record = await adapter.updateDnsLink("test-store", "bafytestcid");
		expect(record.subdomain).toBe("test-store");
		expect(record.cid).toBe("bafytestcid");
		expect(record.txtValue).toBe("/ipfs/bafytestcid");
	});

	it("retrieves DNSLink record", async () => {
		await adapter.updateDnsLink("my-store", "bafymycid");
		const record = await adapter.getDnsLink("my-store");
		expect(record).not.toBeNull();
		expect(record?.cid).toBe("bafymycid");
		expect(record?.txtValue).toBe("/ipfs/bafymycid");
	});

	it("returns null for unknown subdomain", async () => {
		const record = await adapter.getDnsLink("unknown-store");
		expect(record).toBeNull();
	});

	it("rolls back to previous CID", async () => {
		await adapter.updateDnsLink("rollback-store", "bafy-new-cid");
		const record = await adapter.rollbackDnsLink("rollback-store", "bafy-old-cid");
		expect(record.cid).toBe("bafy-old-cid");
		expect(record.txtValue).toBe("/ipfs/bafy-old-cid");
	});

	it("lists all DNSLink records", async () => {
		await adapter.updateDnsLink("store-a", "bafya");
		await adapter.updateDnsLink("store-b", "bafyb");
		const records = await adapter.listDnsLinks();
		expect(records.length).toBeGreaterThanOrEqual(2);
		const subdomains = records.map((r) => r.subdomain);
		expect(subdomains).toContain("store-a");
		expect(subdomains).toContain("store-b");
	});
});
