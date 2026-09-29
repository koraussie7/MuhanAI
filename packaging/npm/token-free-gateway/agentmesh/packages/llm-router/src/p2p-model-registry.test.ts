import { InMemoryModelBeaconTransport } from "@agentmesh/bitterbot";
import { buildManifest } from "@agentmesh/noema";
import { describe, expect, it } from "vitest";
import { createP2pModelRegistry } from "./p2p-model-registry.js";
import { P2pNodeRegistry } from "./p2p-node-registry.js";

const sources = [{ kind: "hf" as const, repo: "Qwen/Qwen2.5-7B-Instruct-GGUF", file: "qwen.gguf" }];

function makeManifest(id: string) {
	return buildManifest({
		id,
		name: id,
		sizeBytes: 100,
		sources,
		hashes: { algorithm: "blake3", blake3: "a".repeat(64) },
	});
}

describe("createP2pModelRegistry", () => {
	it("registers a node for each accepted announcement", () => {
		const registry = new P2pNodeRegistry();
		const transport = new InMemoryModelBeaconTransport();
		const p2p = createP2pModelRegistry({
			catalog: undefined,
			registry,
			transport,
			peerId: "peer-A",
		});

		// Inject the envelope directly through the catalogue; the onAccept
		// wiring should upsert a node in the supplied registry.
		const env = {
			schema: "agentmesh.model-manifest/envelope.v1" as const,
			publisher: "peer-B",
			publishedAt: Date.now(),
			manifest: makeManifest("qwen-q4"),
		};
		const result = p2p.catalog.announce(env);
		expect(result.accepted).toBe(true);
		const nodes = registry.getNodesByModel("qwen-q4");
		expect(nodes).toHaveLength(1);
		expect(nodes[0]?.peerId).toBe("peer-B");
	});

	it("beacon publishes to the transport and returns the registry entries", async () => {
		const registry = new P2pNodeRegistry();
		const transport = new InMemoryModelBeaconTransport();
		const p2p = createP2pModelRegistry({
			registry,
			transport,
			peerId: "peer-A",
		});
		await p2p.beacon(makeManifest("llama-8b"));
		expect(transport.published).toHaveLength(1);
		expect(transport.published[0]?.topic).toBe("agentmesh/models/llama-8b");
	});

	it("beacon throws when peerId is missing", async () => {
		const transport = new InMemoryModelBeaconTransport();
		const p2p = createP2pModelRegistry({ transport });
		await expect(p2p.beacon(makeManifest("phi-3"))).rejects.toThrow(/peerId/);
	});

	it("beacon throws when no transport is configured", async () => {
		const p2p = createP2pModelRegistry({ peerId: "peer-A" });
		await expect(p2p.beacon(makeManifest("phi-3"))).rejects.toThrow(/transport/);
	});

	it("listen wires local announcements through the supplied transport", async () => {
		const registry = new P2pNodeRegistry();
		const transport = new InMemoryModelBeaconTransport();
		const p2p = createP2pModelRegistry({
			registry,
			transport,
			peerId: "peer-A",
		});

		const stop = await p2p.listen();
		await p2p.beacon(makeManifest("qwen2.5-7b"));
		expect(registry.getNodesByModel("qwen2.5-7b")).toHaveLength(0);
		stop();
	});

	it("dispose detaches the onAccept listener", () => {
		const registry = new P2pNodeRegistry();
		const p2p = createP2pModelRegistry({
			registry,
			transport: new InMemoryModelBeaconTransport(),
			peerId: "peer-A",
		});
		p2p.dispose();
		p2p.catalog.announce({
			schema: "agentmesh.model-manifest/envelope.v1" as const,
			publisher: "peer-B",
			publishedAt: Date.now(),
			manifest: makeManifest("qwen-q4"),
		});
		expect(registry.getNodesByModel("qwen-q4")).toHaveLength(0);
	});
});
