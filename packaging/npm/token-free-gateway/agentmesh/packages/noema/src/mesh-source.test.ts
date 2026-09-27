import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	DEFAULT_PIECE_SIZE,
	fetchFromMeshSource,
	type MeshPeerConnection,
} from "./mesh-source.js";

describe("mesh-source", () => {
	it("downloads pieces from a mock connection", async () => {
		const chunksSent = [
			new Uint8Array([1, 2, 3]),
			new Uint8Array([4, 5]),
			new Uint8Array([6, 7, 8, 9]),
		];

		const mockConn: MeshPeerConnection = {
			async dial(peerId: string, protocol: string) {
				assert.equal(peerId, "peer-123");
				assert.match(protocol, /\/agentmesh\/noema\/piece\/1\.0\.0\?contentId=blake3%3Aabc/);
				return (async function* () {
					for (const chunk of chunksSent) {
						yield chunk;
					}
				})();
			},
			close() {},
		};

		const progressUpdates: number[] = [];
		const iterator = fetchFromMeshSource(
			{ kind: "mesh", peer: "peer-123", contentId: "blake3:abc" },
			{
				connection: mockConn,
				onProgress: (received) => progressUpdates.push(received),
			},
		);

		const received: Uint8Array[] = [];
		for await (const piece of iterator) {
			received.push(piece);
		}

		const totalBytes = received.reduce((acc, c) => acc + c.byteLength, 0);
		assert.equal(totalBytes, 9);
		assert.deepEqual(progressUpdates, [3, 5, 9]);
	});

	it("slices chunks that exceed pieceSize", async () => {
		const largeChunk = new Uint8Array(100);
		largeChunk.fill(42);

		const mockConn: MeshPeerConnection = {
			async dial() {
				return (async function* () {
					yield largeChunk;
				})();
			},
			close() {},
		};

		const iterator = fetchFromMeshSource(
			{ kind: "mesh", peer: "peer-abc", contentId: "blake3:xyz" },
			{
				connection: mockConn,
				pieceSize: 30,
			},
		);

		const pieces: Uint8Array[] = [];
		for await (const p of iterator) {
			pieces.push(p);
		}

		assert.equal(pieces.length, 4); // 30, 30, 30, 10
		assert.equal(pieces[0]?.byteLength, 30);
		assert.equal(pieces[1]?.byteLength, 30);
		assert.equal(pieces[2]?.byteLength, 30);
		assert.equal(pieces[3]?.byteLength, 10);
	});

	it("aborts when signal is already aborted", async () => {
		const controller = new AbortController();
		controller.abort(new Error("pre-aborted"));

		const mockConn: MeshPeerConnection = {
			async dial() {
				throw new Error("should not be called");
			},
			close() {},
		};

		const iterator = fetchFromMeshSource(
			{ kind: "mesh", peer: "peer-1", contentId: "cid-1" },
			{
				connection: mockConn,
				signal: controller.signal,
			},
		);

		await assert.rejects(async () => {
			for await (const _ of iterator) {
				// empty
			}
		}, /pre-aborted/);
	});

	it("aborts mid-stream when signal is triggered", async () => {
		const controller = new AbortController();
		const mockConn: MeshPeerConnection = {
			async dial() {
				return (async function* () {
					yield new Uint8Array([1, 2, 3]);
					controller.abort(new Error("stopped mid-stream"));
					yield new Uint8Array([4, 5, 6]);
				})();
			},
			close() {},
		};

		const iterator = fetchFromMeshSource(
			{ kind: "mesh", peer: "peer-1", contentId: "cid-1" },
			{
				connection: mockConn,
				signal: controller.signal,
			},
		);

		await assert.rejects(async () => {
			for await (const _ of iterator) {
				// empty
			}
		}, /stopped mid-stream/);
	});
});
