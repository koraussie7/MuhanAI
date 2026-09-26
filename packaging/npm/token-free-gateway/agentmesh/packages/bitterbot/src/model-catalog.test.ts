import { describe, expect, it } from "vitest";
import { buildManifest } from "@agentmesh/noema";
import type { ManifestSource } from "@agentmesh/noema";
import { ModelBeacon, ModelCatalog } from "./model-catalog";

const sources: ManifestSource[] = [
	{ kind: "hf", repo: "Qwen/Qwen2.5-7B-Instruct-GGUF", file: "qwen.gguf" },
];

function manifest(id = "qwen-q4", createdAt = "2026-01-01T00:00:00.000Z") {
	return buildManifest({
		id,
		name: id,
		sizeBytes: 100,
		sources,
		hashes: { algorithm: "blake3", blake3: "a".repeat(64) },
		createdAt,
	});
}

class MemoryBeaconTransport {
	readonly messages: Array<{ topic: string; payload: string }> = [];
	private readonly handlers = new Map<string, Set<(payload: string) => void | Promise<void>>>();

	async publish(topic: string, payload: string): Promise<void> {
		this.messages.push({ topic, payload });
		for (const handler of this.handlers.get(topic) ?? []) await handler(payload);
	}

	async subscribe(topic: string, handler: (payload: string) => void | Promise<void>): Promise<() => void> {
		const handlers = this.handlers.get(topic) ?? new Set();
		handlers.add(handler);
		this.handlers.set(topic, handlers);
		return () => handlers.delete(handler);
	}
}

describe("ModelBeacon", () => {
	it("publishes a model envelope to the model-specific topic", async () => {
		const transport = new MemoryBeaconTransport();
		const beacon = new ModelBeacon(transport, "peer-A");

		const envelope = await beacon.publish(manifest());

		expect(transport.messages).toHaveLength(1);
		expect(transport.messages[0]?.topic).toBe("agentmesh/models/qwen-q4");
		expect(envelope.publisher).toBe("peer-A");
		expect(envelope.manifest.id).toBe("qwen-q4");
	});

	it("passes a signer to the envelope builder", async () => {
		const transport = new MemoryBeaconTransport();
		const beacon = new ModelBeacon(transport, "peer-A", {
			signer: { sign: () => "signed-by-peer-a" },
		});

		const envelope = await beacon.publish(manifest());
		expect(envelope.signature).toBe("signed-by-peer-a");
		expect(envelope.manifest.signature).toBe("signed-by-peer-a");
	});
});

describe("ModelCatalog", () => {
	it("accepts, deduplicates, and indexes announcements", () => {
		let now = Date.parse("2026-01-01T00:01:00.000Z");
		const catalog = new ModelCatalog({ now: () => now });
		const transport = new MemoryBeaconTransport();
		const beacon = new ModelBeacon(transport, "peer-A", { now: () => now });

		return beacon.publish(manifest()).then((envelope) => {
			const first = catalog.announce(envelope);
			expect(first.accepted).toBe(true);
			expect(catalog.get("qwen-q4")).toHaveLength(1);

			const duplicate = catalog.announce(envelope);
			expect(duplicate.accepted).toBe(false);
			expect(duplicate.reason).toBe("duplicate announcement");

			now += 1_000;
			expect(catalog.all()).toHaveLength(1);
		});
	});

	it("accepts announcements from multiple providers", () => {
		const now = Date.parse("2026-01-01T00:01:00.000Z");
		const catalog = new ModelCatalog({ now: () => now });
		const a = new ModelBeacon(new MemoryBeaconTransport(), "peer-A", { now: () => now });
		const b = new ModelBeacon(new MemoryBeaconTransport(), "peer-B", { now: () => now });

		return Promise.all([a.publish(manifest()), b.publish(manifest())]).then(([ea, eb]) => {
			expect(catalog.announce(ea).accepted).toBe(true);
			expect(catalog.announce(eb).accepted).toBe(true);
			expect(catalog.get("qwen-q4").map((entry) => entry.envelope.publisher)).toEqual(["peer-A", "peer-B"]);
		});
	});

	it("rejects malformed wire payloads", () => {
		const catalog = new ModelCatalog();
		const result = catalog.announceWire("not-json");
		expect(result.accepted).toBe(false);
		expect(result.reason).toContain("json parse");
	});

	it("rejects stale and future announcements", () => {
		const now = Date.parse("2026-01-01T00:00:00.000Z");
		const catalog = new ModelCatalog({ now: () => now, maxAgeMs: 60_000 });
		const staleTime = Date.parse("2025-12-31T23:00:00.000Z");
		const futureTime = Date.parse("2026-01-01T01:00:00.000Z");
		const stale = new ModelBeacon(new MemoryBeaconTransport(), "stale", { now: () => staleTime });
		const future = new ModelBeacon(new MemoryBeaconTransport(), "future", { now: () => futureTime });

		return Promise.all([
			stale.publish(manifest("stale", "2025-12-31T23:00:00.000Z")),
			future.publish(manifest("future", "2026-01-01T01:00:00.000Z")),
		]).then(([staleEnvelope, futureEnvelope]) => {
			expect(catalog.announce(staleEnvelope).reason).toBe("announcement is stale");
			expect(catalog.announce(futureEnvelope).reason).toBe("announcement is too far in the future");
		});
	});

	it("listens to a transport topic and ingests wire announcements", async () => {
		const transport = new MemoryBeaconTransport();
		const catalog = new ModelCatalog();
		const unsubscribe = await catalog.listen(transport, "qwen-q4");
		const beacon = new ModelBeacon(transport, "peer-A");

		await beacon.publish(manifest());
		expect(catalog.get("qwen-q4")).toHaveLength(1);
		unsubscribe();
	});
});
