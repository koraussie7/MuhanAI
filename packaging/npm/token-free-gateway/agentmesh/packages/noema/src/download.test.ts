import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { downloadFromManifest } from "./download.js";
import { buildManifest, resolveHashAlgorithm } from "./manifest.js";
import type { MeshPeerConnection } from "./mesh-source.js";
import type { DownloadStatus, ManifestSource, ModelManifest } from "./types.js";

describe("downloadFromManifest", () => {
	const content = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
	const preferred = resolveHashAlgorithm("blake3");
	const sha256Hash = createHash("sha256").update(content).digest("hex");
	let blake3Hash: string | undefined;
	try {
		blake3Hash = createHash("blake3").update(content).digest("hex");
	} catch {
		// blake3 not supported in this runtime
	}

	function createTestManifest(sources: ManifestSource[]): ModelManifest {
		return buildManifest({
			id: "test-model-1",
			name: "Test Model",
			sizeBytes: content.byteLength,
			sources,
			hashes: {
				algorithm: preferred,
				...(blake3Hash ? { blake3: blake3Hash } : {}),
				sha256: sha256Hash,
			},
			createdAt: "2026-01-01T00:00:00Z",
		});
	}

	it("completes download and verifies valid hash successfully", async () => {
		const hashPart = blake3Hash ? `blake3:${blake3Hash}` : `sha256:${sha256Hash}`;
		const manifest = createTestManifest([{ kind: "mesh", peer: "peer-ok", contentId: hashPart }]);

		const mockConn: MeshPeerConnection = {
			async dial() {
				return (async function* () {
					yield content.subarray(0, 4);
					yield content.subarray(4);
				})();
			},
			close() {},
		};

		const writtenChunks: Uint8Array[] = [];
		const destination = new WritableStream<Uint8Array>({
			write(chunk) {
				writtenChunks.push(chunk);
			},
		});

		const statuses: DownloadStatus[] = [];
		const result = await downloadFromManifest(manifest, destination, {
			connection: mockConn,
			onStatus: (st) => statuses.push(st),
		});

		assert.equal(result.state, "complete");
		assert.equal(result.progress, 1);
		assert.equal(result.error, undefined);

		const totalWritten = writtenChunks.reduce((acc, c) => acc + c.byteLength, 0);
		assert.equal(totalWritten, 8);

		const states = statuses.map((s) => s.state);
		assert.ok(states.includes("queued"));
		assert.ok(states.includes("downloading"));
		assert.ok(states.includes("verifying"));
		assert.ok(states.includes("complete"));
	});

	it("fails verification and returns failed status on corrupted content", async () => {
		const corruptedContent = new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]);
		const hashPart = blake3Hash ? `blake3:${blake3Hash}` : `sha256:${sha256Hash}`;
		const manifest = createTestManifest([{ kind: "mesh", peer: "peer-bad", contentId: hashPart }]);

		const mockConn: MeshPeerConnection = {
			async dial() {
				return (async function* () {
					yield corruptedContent;
				})();
			},
			close() {},
		};

		const destination = new WritableStream<Uint8Array>();
		const result = await downloadFromManifest(manifest, destination, {
			connection: mockConn,
		});

		assert.equal(result.state, "failed");
		assert.match(result.error ?? "", /Integrity verification failed/);
	});

	it("aborts when signal is aborted", async () => {
		const controller = new AbortController();
		controller.abort(new Error("user canceled"));

		const hashPart = blake3Hash ? `blake3:${blake3Hash}` : `sha256:${sha256Hash}`;
		const manifest = createTestManifest([
			{ kind: "mesh", peer: "peer-abort", contentId: hashPart },
		]);

		const destination = new WritableStream<Uint8Array>();
		const result = await downloadFromManifest(manifest, destination, {
			signal: controller.signal,
		});

		assert.equal(result.state, "failed");
		assert.match(result.error ?? "", /user canceled|Download aborted/);
	});
});
