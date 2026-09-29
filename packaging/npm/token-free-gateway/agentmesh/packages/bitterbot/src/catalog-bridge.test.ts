import { buildManifest } from "@agentmesh/noema";
import type { DeviceNodeInfo } from "@agentmesh/peer-mesh";
import { describe, expect, it } from "vitest";
import { bridgeCatalogToNodeRegistry } from "./catalog-bridge.js";
import { ModelCatalog } from "./model-catalog.js";

const sources = [{ kind: "hf" as const, repo: "Qwen/Qwen2.5-7B-Instruct-GGUF", file: "qwen.gguf" }];

function manifest(id = "qwen-q4", name?: string) {
	return buildManifest({
		id,
		name: name ?? id,
		sizeBytes: 100,
		sources,
		hashes: { algorithm: "blake3", blake3: "a".repeat(64) },
	});
}

function envelope(publisher: string, m = manifest()) {
	return {
		schema: "agentmesh.model-manifest/envelope.v1" as const,
		publisher,
		publishedAt: Date.now(),
		manifest: m,
	};
}

describe("bridgeCatalogToNodeRegistry", () => {
	it("projects an accepted announcement into a DeviceNodeInfo", () => {
		const catalog = new ModelCatalog();
		const bridge = bridgeCatalogToNodeRegistry(catalog);

		const result = bridge.ingest(envelope("peer-A"));
		expect(result.accepted).toBe(true);
		expect(bridge.nodes()).toHaveLength(1);

		const node = bridge.nodes()[0] as DeviceNodeInfo;
		expect(node.id).toBe("gossip:peer-A:qwen-q4");
		expect(node.peerId).toBe("peer-A");
		expect(node.capabilities.supportedModels).toContain("qwen-q4");
	});

	it("fires onChange when a new announcement is accepted", () => {
		const catalog = new ModelCatalog();
		const bridge = bridgeCatalogToNodeRegistry(catalog);

		const seen: DeviceNodeInfo[][] = [];
		bridge.onChange((snapshot) => seen.push(snapshot));

		bridge.ingest(envelope("peer-A"));
		bridge.ingest(envelope("peer-B"));

		expect(seen.length).toBe(2);
		expect(seen[0]).toHaveLength(1);
		expect(seen[1]?.length).toBe(2);
	});

	it("upserts the same (publisher, model) entry on repeated announcements", () => {
		const catalog = new ModelCatalog();
		const bridge = bridgeCatalogToNodeRegistry(catalog);

		bridge.ingest(envelope("peer-A"));
		bridge.ingest(envelope("peer-A"));
		expect(bridge.nodes()).toHaveLength(1);
	});

	it("ignores rejected announcements", () => {
		const catalog = new ModelCatalog();
		const bridge = bridgeCatalogToNodeRegistry(catalog);

		bridge.ingest({ schema: "wrong", publisher: "x", publishedAt: 0, manifest: {} });
		expect(bridge.nodes()).toHaveLength(0);
	});

	it("stops firing once the listener is unsubscribed", () => {
		const catalog = new ModelCatalog();
		const bridge = bridgeCatalogToNodeRegistry(catalog);

		const seen: number[] = [];
		const unsubscribe = bridge.onChange((snapshot) => seen.push(snapshot.length));
		unsubscribe();
		bridge.ingest(envelope("peer-A"));
		expect(seen).toEqual([]);
	});

	it("calls dispose to detach the onAccept listener", () => {
		const catalog = new ModelCatalog();
		const bridge = bridgeCatalogToNodeRegistry(catalog);
		const seen: number[] = [];
		bridge.onChange((snapshot) => seen.push(snapshot.length));
		bridge.ingest(envelope("peer-A"));
		expect(seen).toEqual([1]);
		bridge.dispose();
		bridge.ingest(envelope("peer-A"));
		expect(seen).toEqual([1]);
	});
});
