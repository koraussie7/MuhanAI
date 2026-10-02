// packages/knowledge-base/src/p2p-memory/p2p-media-loader.stub.ts
//
// Stub for `p2p-media-loader`. The package was unpublished from npm on
// 2023-06-28, so it can no longer be installed and Rollup cannot resolve the
// bare specifier that p2p-stream.ts lazily imports. apps/web/vite.config.ts
// aliases that specifier here.
//
// knowledge-base deliberately treats this dependency as optional (cc5d520):
// P2PMemoryStream loads it lazily and reports 0 peers until it initialises.
// This stub keeps that contract -- the module resolves, getStats() reports no
// peers, and only an actual P2P chunk transfer throws.

const UNAVAILABLE =
	"p2p-media-loader is unavailable: it was unpublished from npm on 2023-06-28. " +
	"P2P chunk streaming is disabled. Use the IPFS-backed store " +
	"(p2p-memory/ipfs-store.ts) instead.";

export class P2PManager {
	constructor(_options?: { runtimeOptions?: { logging?: boolean } }) {}

	getStats(): { peersCount: number } {
		return { peersCount: 0 };
	}

	async shareChunk(_chunkId: string, _data: Uint8Array): Promise<void> {
		throw new Error(UNAVAILABLE);
	}

	async loadChunk(_chunkId: string): Promise<Uint8Array> {
		throw new Error(UNAVAILABLE);
	}

	destroy(): void {}
}

export default { P2PManager };
