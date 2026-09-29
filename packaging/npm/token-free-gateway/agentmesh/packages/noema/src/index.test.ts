import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	buildEnvelope,
	decodeEnvelope,
	encodeEnvelope,
	envelopeId,
	envelopeTopic,
	verifyEnvelope,
} from "./export.js";
import { buildManifest, canonicalJson, resolveHashAlgorithm } from "./manifest.js";
import type { ManifestSource } from "./types.js";
import { signManifest, verifyManifest } from "./verify.js";

const blake3Hex = "9".repeat(64);

function makeSources(): ManifestSource[] {
	return [
		{ kind: "hf", repo: "Qwen/Qwen2.5-7B-Instruct-GGUF", file: "qwen2.5-7b-instruct-q4_k_m.gguf" },
		{ kind: "https", url: "https://mirror.example.com/qwen2.5-7b-instruct-q4_k_m.gguf" },
	];
}

describe("end-to-end manifest + envelope", () => {
	it("round-trips a signed manifest through the envelope", () => {
		const m = buildManifest({
			id: "qwen2.5-7b-instruct-q4_k_m",
			name: "Qwen2.5 7B Instruct GGUF",
			license: "apache-2.0",
			quantization: "Q4_K_M",
			sizeBytes: 4_500_000_000,
			sources: makeSources(),
			hashes: { algorithm: "blake3", blake3: blake3Hex, sha256: "8".repeat(64) },
		});

		const signer = { sign: (_b: Uint8Array) => "SIGNATURE-BYTES" };
		const signed = signManifest(m, signer);
		assert.equal(signed.signature, "SIGNATURE-BYTES");

		const env = buildEnvelope(signed, "12D3KooPeerA", { signer });
		assert.equal(env.schema, "agentmesh.model-manifest/envelope.v1");
		assert.equal(env.publisher, "12D3KooPeerA");
		assert.equal(env.manifest.signature, "SIGNATURE-BYTES");
		assert.ok(env.publishedAt > 0);

		const wire = encodeEnvelope(env);
		assert.ok(wire.includes('"schema":"agentmesh.model-manifest/envelope.v1"'));

		const decoded = decodeEnvelope(wire);
		assert.equal(decoded.ok, true);
		if (!decoded.ok) return;

		const verified = verifyManifest(decoded.envelope.manifest);
		assert.equal(verified.ok, true);

		const id = envelopeId(decoded.envelope);
		const algo = resolveHashAlgorithm();
		assert.match(id, new RegExp(`^${algo}:[a-f0-9]{64}$`));
	});

	it("rejects an envelope with a tampered manifest", () => {
		const m = buildManifest({
			id: "x",
			name: "x",
			sizeBytes: 1,
			sources: makeSources(),
			hashes: { algorithm: "blake3", blake3: blake3Hex },
			createdAt: "2026-01-01T00:00:00Z",
		});
		const env = buildEnvelope(m, "peer-A");
		// Tamper with the manifest but leave the original (now stale)
		// contentId in place — verifyManifest will catch the mismatch.
		env.manifest.sizeBytes = 9999;
		const wire = encodeEnvelope(env);
		const decoded = decodeEnvelope(wire);
		assert.equal(decoded.ok, false);
	});

	it("rejects an envelope with an unknown schema", () => {
		const wire = JSON.stringify({
			schema: "agentmesh.model-manifest/envelope.v999",
			publisher: "peer-A",
			publishedAt: 1,
			manifest: {},
		});
		const decoded = decodeEnvelope(wire);
		assert.equal(decoded.ok, false);
		if (!decoded.ok) assert.match(decoded.reason, /unsupported schema/);
	});

	it("emits a topic that includes the manifest id", () => {
		assert.equal(
			envelopeTopic("qwen2.5-7b-instruct-q4_k_m"),
			"agentmesh/models/qwen2.5-7b-instruct-q4_k_m",
		);
	});

	it("re-exports canonicalJson", () => {
		assert.equal(canonicalJson({ a: 1, b: 2 }), '{"a":1,"b":2}');
	});
});
