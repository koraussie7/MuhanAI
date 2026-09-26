import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	buildManifest,
	canonicalJson,
	canonicalManifestBytes,
	hashManifest,
	recomputeContentId,
	resolveHashAlgorithm,
} from "./manifest.js";
import type { ManifestSource } from "./types.js";

const blake3Hex = "a".repeat(64);

function makeSources(): ManifestSource[] {
	return [
		{ kind: "hf", repo: "Qwen/Qwen2.5-7B-Instruct-GGUF", file: "qwen2.5-7b-instruct-q4_k_m.gguf" },
		{ kind: "https", url: "https://mirror.example.com/qwen2.5-7b-instruct-q4_k_m.gguf" },
	];
}

describe("canonicalJson", () => {
	it("sorts keys deterministically", () => {
		const a = canonicalJson({ b: 1, a: 2 });
		const b = canonicalJson({ a: 2, b: 1 });
		assert.equal(a, b);
		assert.equal(a, '{"a":2,"b":1}');
	});

	it("handles nested objects", () => {
		const a = canonicalJson({ z: { y: 1, x: 2 }, a: [{ d: 4, c: 3 }] });
		assert.equal(a, '{"a":[{"c":3,"d":4}],"z":{"x":2,"y":1}}');
	});

	it("drops undefined entries", () => {
		assert.equal(canonicalJson({ a: 1, b: undefined }), '{"a":1}');
	});

	it("rejects non-finite numbers", () => {
		assert.throws(() => canonicalJson({ a: Number.NaN }));
		assert.throws(() => canonicalJson({ a: Infinity }));
	});

	it("rejects unsupported types", () => {
		assert.throws(() => canonicalJson({ a: Symbol("x") }));
	});
});

describe("hashManifest", () => {
	const baseManifest = () =>
		buildManifest({
			id: "qwen2.5-7b-instruct-q4_k_m",
			name: "Qwen2.5 7B Instruct GGUF (Q4_K_M)",
			license: "apache-2.0",
			quantization: "Q4_K_M",
			sizeBytes: 4_500_000_000,
			sources: makeSources(),
			hashes: { algorithm: "blake3", blake3: blake3Hex },
		});

	it("produces a `<algo>:<hex>` contentId", () => {
		const m = baseManifest();
		const algo = resolveHashAlgorithm();
		const re = new RegExp(`^${algo}:[a-f0-9]{64}$`);
		assert.match(m.contentId, re);
	});

	it("is deterministic across constructions", () => {
		const a = baseManifest();
		const b = baseManifest();
		// `createdAt` differs — set them equal to compare contentIds.
		a.createdAt = b.createdAt = "2026-01-01T00:00:00Z";
		recomputeContentId(a);
		recomputeContentId(b);
		assert.equal(a.contentId, b.contentId);
	});

	it("changes when a source is added", () => {
		const m = baseManifest();
		const before = m.contentId;
		m.sources.push({ kind: "mesh", peer: "12D3KooX...", contentId: "blake3:deadbeef" });
		recomputeContentId(m);
		assert.notEqual(m.contentId, before);
	});

	it("omits signature from the hashed body", () => {
		const m = baseManifest();
		const sigless = hashManifest(m);
		m.signature = "test-signature";
		const sigged = hashManifest(m);
		assert.equal(sigless, sigged);
	});
});

describe("buildManifest", () => {
	it("rejects empty id", () => {
		assert.throws(
			() =>
				buildManifest({
					id: "",
					name: "x",
					sizeBytes: 1,
					sources: makeSources(),
					hashes: { algorithm: "blake3", blake3: blake3Hex },
				}),
			/id is required/,
		);
	});

	it("rejects non-positive sizeBytes", () => {
		assert.throws(
			() =>
				buildManifest({
					id: "x",
					name: "x",
					sizeBytes: 0,
					sources: makeSources(),
					hashes: { algorithm: "blake3", blake3: blake3Hex },
				}),
			/sizeBytes/,
		);
	});

	it("rejects empty sources", () => {
		assert.throws(
			() =>
				buildManifest({
					id: "x",
					name: "x",
					sizeBytes: 1,
					sources: [],
					hashes: { algorithm: "blake3", blake3: blake3Hex },
				}),
			/at least one source/,
		);
	});

	it("rejects empty hashes", () => {
		assert.throws(
			() =>
				buildManifest({
					id: "x",
					name: "x",
					sizeBytes: 1,
					sources: makeSources(),
					hashes: { algorithm: "blake3" },
				}),
			/blake3 or sha256/,
		);
	});

	it("includes only defined optional fields", () => {
		const m = buildManifest({
			id: "x",
			name: "x",
			sizeBytes: 1,
			sources: makeSources(),
			hashes: { algorithm: "blake3", blake3: blake3Hex },
		});
		assert.equal("description" in m, false);
		assert.equal("license" in m, false);
		assert.equal("quantization" in m, false);
	});

	it("canonicalManifestBytes round-trips through TextEncoder/Decoder", () => {
		const m = buildManifest({
			id: "x",
			name: "x",
			sizeBytes: 1,
			sources: makeSources(),
			hashes: { algorithm: "blake3", blake3: blake3Hex },
		});
		const bytes = canonicalManifestBytes(m);
		const text = new TextDecoder().decode(bytes);
		assert.match(text, /"id":"x"/);
		assert.ok(!text.includes('"signature"'));
	});
});
