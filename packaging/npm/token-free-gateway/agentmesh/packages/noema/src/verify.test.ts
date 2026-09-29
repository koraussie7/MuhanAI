import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { buildManifest, recomputeContentId, resolveHashAlgorithm } from "./manifest.js";
import type { ManifestSource } from "./types.js";
import { signManifest, verifyFile, verifyManifest, verifyStream } from "./verify.js";

const blake3Hex = "b".repeat(64);
const sha256Hex = "c".repeat(64);

const sources: ManifestSource[] = [
	{ kind: "hf", repo: "Qwen/Qwen2.5-7B-Instruct-GGUF", file: "qwen2.5-7b-instruct-q4_k_m.gguf" },
	{ kind: "https", url: "https://mirror.example.com/qwen2.5-7b-instruct-q4_k_m.gguf" },
	{ kind: "mesh", peer: "12D3KooXPubA", contentId: "blake3:" + "d".repeat(64) },
];

function goodManifest(sizeBytes = 16) {
	return buildManifest({
		id: "qwen2.5-7b-instruct-q4_k_m",
		name: "Qwen2.5 7B Instruct GGUF",
		license: "apache-2.0",
		quantization: "Q4_K_M",
		sizeBytes,
		sources,
		hashes: { algorithm: "blake3", blake3: blake3Hex, sha256: sha256Hex },
		createdAt: "2026-01-01T00:00:00Z",
	});
}

describe("verifyManifest", () => {
	it("accepts a well-formed manifest", () => {
		const r = verifyManifest(goodManifest());
		assert.equal(r.ok, true);
		assert.deepEqual(r.failures, []);
	});

	it("rejects non-object", () => {
		assert.equal(verifyManifest(null).ok, false);
		assert.equal(verifyManifest("hi").ok, false);
		assert.equal(verifyManifest(42).ok, false);
	});

	it("rejects missing required fields", () => {
		const m = goodManifest() as unknown as Record<string, unknown>;
		delete m.id;
		const r = verifyManifest(m);
		assert.equal(r.ok, false);
		assert.equal(r.failures[0]?.field, "id");
	});

	it("rejects non-positive sizeBytes", () => {
		// buildManifest throws on sizeBytes <= 0; bypass it with a manual
		// mutation to keep the test focused on verifyManifest's behaviour.
		const m = goodManifest();
		(m as unknown as { sizeBytes: number }).sizeBytes = 0;
		const r = verifyManifest(m);
		assert.equal(r.ok, false);
		assert.equal(r.failures[0]?.field, "sizeBytes");
	});

	it("rejects bad contentId format", () => {
		const m = goodManifest();
		m.contentId = "not-a-hash";
		const r = verifyManifest(m);
		assert.equal(r.ok, false);
		assert.equal(r.failures[0]?.field, "contentId");
	});

	it("rejects when contentId does not match the body", () => {
		const m = goodManifest();
		m.contentId = "sha256:" + "0".repeat(64);
		const r = verifyManifest(m);
		assert.equal(r.ok, false);
		assert.match(r.failures[0]?.reason ?? "", /mismatch/);
	});

	it("rejects bad date", () => {
		const m = goodManifest();
		m.createdAt = "not a date";
		const r = verifyManifest(m);
		assert.equal(r.ok, false);
		assert.equal(r.failures[0]?.field, "createdAt");
	});

	it("rejects when both hashes are missing", () => {
		const m = goodManifest() as unknown as Record<string, unknown>;
		m.hashes = { algorithm: "blake3" };
		const r = verifyManifest(m);
		assert.equal(r.ok, false);
		assert.equal(r.failures[0]?.field, "hashes");
	});

	it("rejects unknown source kinds", () => {
		const m = goodManifest() as unknown as Record<string, unknown>;
		(m.sources as ManifestSource[]).push({ kind: "ftp", url: "x" } as unknown as ManifestSource);
		recomputeContentId(m as unknown as Parameters<typeof recomputeContentId>[0]);
		const r = verifyManifest(m);
		assert.equal(r.ok, false);
		assert.match(r.failures[0]?.field ?? "", /sources\[3\]/);
	});

	it("rejects non-http(s) https sources", () => {
		const m = goodManifest();
		m.sources = [{ kind: "https", url: "file:///etc/passwd" }];
		const r = verifyManifest(m);
		assert.equal(r.ok, false);
		assert.match(r.failures[0]?.field ?? "", /sources\[0\]\.url/);
	});

	it("rejects invalid integrity on https source", () => {
		const m = goodManifest();
		m.sources = [{ kind: "https", url: "https://x.example/model.gguf", integrity: "md5:abcd" }];
		const r = verifyManifest(m);
		assert.equal(r.ok, false);
		assert.match(r.failures[0]?.field ?? "", /integrity/);
	});

	it("rejects mesh source with malformed contentId", () => {
		const m = goodManifest();
		m.sources = [{ kind: "mesh", peer: "12D3Koo", contentId: "garbage" }];
		const r = verifyManifest(m);
		assert.equal(r.ok, false);
		assert.match(r.failures[0]?.field ?? "", /contentId/);
	});
});

describe("verifyFile", () => {
	it("accepts bytes that match the preferred algorithm", () => {
		// Runtime-aware: blake3 is preferred, but on older OpenSSL builds
		// the verifier falls through to sha256. Either way the file must
		// be accepted, and the reported algorithm must reflect what was
		// actually used.
		const preferred = resolveHashAlgorithm("blake3");
		const buf = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
		const m = goodManifest(buf.byteLength);
		m.sizeBytes = buf.byteLength;
		m.hashes = {
			algorithm: preferred,
			...(preferred === "blake3" ? { blake3: createHash("blake3").update(buf).digest("hex") } : {}),
			sha256: createHash("sha256").update(buf).digest("hex"),
		};
		const r = verifyFile(m, buf);
		assert.equal(r.ok, true);
		if (r.ok) assert.equal(r.algorithm, preferred);
	});

	it("accepts bytes that match sha256 when blake3 is absent", () => {
		const buf = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
		const m = goodManifest(buf.byteLength);
		m.sizeBytes = buf.byteLength;
		m.hashes = {
			algorithm: "sha256",
			sha256: createHash("sha256").update(buf).digest("hex"),
		};
		const r = verifyFile(m, buf);
		assert.equal(r.ok, true);
		if (r.ok) assert.equal(r.algorithm, "sha256");
	});

	it("rejects on size mismatch", () => {
		const m = goodManifest();
		const r = verifyFile(m, new Uint8Array(10));
		assert.equal(r.ok, false);
		if (!r.ok) assert.match(r.reason, /size/);
	});

	it("rejects on hash mismatch", () => {
		const m = goodManifest();
		const r = verifyFile(m, new Uint8Array(m.sizeBytes).fill(0xff));
		assert.equal(r.ok, false);
		if (!r.ok) assert.match(r.reason, /no hash/);
	});
});

describe("verifyStream", () => {
	it("hashes an async iterable of chunks", async () => {
		const algo = resolveHashAlgorithm("blake3");
		const buf = new Uint8Array([10, 20, 30, 40, 50, 60]);
		const m = goodManifest(buf.byteLength);
		m.hashes = {
			algorithm: algo,
			blake3: algo === "blake3" ? createHash("blake3").update(buf).digest("hex") : undefined,
			sha256: createHash("sha256").update(buf).digest("hex"),
		};

		async function* chunks() {
			yield buf.subarray(0, 3);
			yield buf.subarray(3, 6);
		}
		const r = await verifyStream(m, chunks());
		assert.equal(r.ok, true);
	});
});

describe("signManifest", () => {
	it("returns a manifest with a base64 signature", () => {
		const m = goodManifest();
		const signer = { sign: (_bytes: Uint8Array) => "BASE64-SIGNATURE" };
		const signed = signManifest(m, signer);
		assert.equal(signed.signature, "BASE64-SIGNATURE");
		assert.notStrictEqual(signed, m);
	});
});
