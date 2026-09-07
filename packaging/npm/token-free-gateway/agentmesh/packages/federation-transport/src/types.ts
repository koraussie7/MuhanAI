import type { SignedRecord } from "@agentmesh/shared";

export interface TransportOptions {
	/** Self peerId. Required by Http/Loopback (used as state). Ignored by
	 *  Libp2p — it derives peerId from the loaded identity file. Optional so
	 *  consumers that only need a PulseSource (e.g. services/api) don't have
	 *  to invent a placeholder value. */
	peerId?: string;
	listenAddr?: string;
	bootstrap?: string[];
}

export interface Transport {
	start(): Promise<void>;
	stop(): Promise<void>;
	query(
		peerId: string,
		query: string,
		embedding?: number[],
	): Promise<SignedRecord[]>;
	push(peerId: string, records: SignedRecord[]): Promise<number>;
	getPeers(): Array<{ peerId: string; address: string; online: boolean }>;
	addPeer(address: string): Promise<void>;
	removePeer(peerId: string): Promise<void>;
}

export type TransportKind = "libp2p" | "http" | "loopback";

export interface TransportManagerOptions extends TransportOptions {
	preferred?: TransportKind;
	httpBaseUrl?: string;
}
