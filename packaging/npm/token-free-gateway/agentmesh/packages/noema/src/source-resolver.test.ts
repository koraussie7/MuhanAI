import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MeshPeerConnection } from "./mesh-source.js";
import { orderSources, resolveSource } from "./source-resolver.js";
import type { ManifestSource } from "./types.js";

describe("source-resolver", () => {
	const hfSource: ManifestSource = {
		kind: "hf",
		repo: "meta-llama/Llama-3-8B",
		file: "model.gguf",
	};
	const httpsSource: ManifestSource = {
		kind: "https",
		url: "https://example.com/model.gguf",
	};
	const meshSource: ManifestSource = {
		kind: "mesh",
		peer: "12D3KooW",
		contentId: "blake3:abc",
	};

	it("orders sources by priority", () => {
		const sources = [hfSource, httpsSource, meshSource];

		const privacyOrdered = orderSources(sources, "privacy");
		assert.equal(privacyOrdered[0]?.kind, "mesh");
		assert.equal(privacyOrdered[1]?.kind, "hf");
		assert.equal(privacyOrdered[2]?.kind, "https");

		const speedOrdered = orderSources(sources, "speed");
		assert.equal(speedOrdered[0]?.kind, "https");
		assert.equal(speedOrdered[1]?.kind, "hf");
		assert.equal(speedOrdered[2]?.kind, "mesh");

		const balancedOrdered = orderSources(sources, "balanced");
		assert.equal(balancedOrdered[0]?.kind, "mesh");
		assert.equal(balancedOrdered[1]?.kind, "https");
		assert.equal(balancedOrdered[2]?.kind, "hf");
	});

	it("resolves mesh source with mock connection", async () => {
		const mockConn: MeshPeerConnection = {
			async dial() {
				return (async function* () {
					yield new Uint8Array([10, 20]);
				})();
			},
			close() {},
		};

		const res = await resolveSource([meshSource], {
			connection: mockConn,
		});

		assert.equal(res.source.kind, "mesh");
		const chunks: Uint8Array[] = [];
		for await (const chunk of res.stream) {
			chunks.push(chunk);
		}
		assert.equal(chunks[0]?.[0], 10);
		assert.equal(chunks[0]?.[1], 20);
	});

	it("falls back to next source when first source fails", async () => {
		let callCount = 0;
		const mockConn: MeshPeerConnection = {
			async dial() {
				throw new Error("Peer unreachable");
			},
			close() {},
		};

		const customFetcher = async (source: ManifestSource) => {
			callCount++;
			if (source.kind === "mesh") {
				throw new Error("mesh failed");
			}
			return (async function* () {
				yield new Uint8Array([99]);
			})();
		};

		const res = await resolveSource([meshSource, httpsSource], {
			priority: "privacy", // mesh first, then https
			customFetcher,
		});

		assert.equal(res.source.kind, "https");
		assert.equal(callCount, 2);
		const chunks: Uint8Array[] = [];
		for await (const c of res.stream) {
			chunks.push(c);
		}
		assert.equal(chunks[0]?.[0], 99);
	});

	it("throws if all sources fail", async () => {
		const customFetcher = async () => {
			throw new Error("failed network request");
		};

		await assert.rejects(async () => {
			await resolveSource([httpsSource, meshSource], { customFetcher });
		}, /All sources failed to resolve/);
	});
});
