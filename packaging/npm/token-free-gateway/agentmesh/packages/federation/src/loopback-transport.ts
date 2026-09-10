import type { SignedRecord } from "@agentmesh/shared-types";
import type { Transport, TransportOptions } from "./types.js";

export class LoopbackTransport implements Transport {
	private readonly peerId: string;
	private peers = new Map<string, { address: string; online: boolean }>();
	private onQuery?: (
		peerId: string,
		query: string,
		embedding: number[] | undefined,
	) => Promise<SignedRecord[]>;

	constructor(options: TransportOptions) {
		this.peerId = options.peerId ?? "loopback";
		this.onQuery = options.listenAddr ? undefined : undefined;
	}

	setQueryHandler(
		handler: (
			peerId: string,
			query: string,
			embedding: number[] | undefined,
		) => Promise<SignedRecord[]>,
	) {
		this.onQuery = handler;
	}

	async start(): Promise<void> {
		// no-op
	}

	async stop(): Promise<void> {
		this.peers.clear();
	}

	async query(peerId: string, query: string, embedding?: number[]): Promise<SignedRecord[]> {
		if (this.onQuery) {
			return this.onQuery(peerId, query, embedding);
		}
		return [];
	}

	async push(_peerId: string, _records: SignedRecord[]): Promise<number> {
		return 0;
	}

	getPeers(): Array<{ peerId: string; address: string; online: boolean }> {
		return Array.from(this.peers.entries()).map(([peerId, info]) => ({
			peerId,
			...info,
		}));
	}

	async addPeer(address: string): Promise<void> {
		const peerId = address;
		this.peers.set(peerId, { address, online: true });
	}

	async removePeer(peerId: string): Promise<void> {
		this.peers.delete(peerId);
	}
}
