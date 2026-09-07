import type { SignedRecord } from "@agentmesh/shared";
import type { Transport, TransportOptions } from "./types.js";
export declare class LoopbackTransport implements Transport {
	private readonly peerId;
	private peers;
	private onQuery?;
	constructor(options: TransportOptions);
	setQueryHandler(
		handler: (
			peerId: string,
			query: string,
			embedding: number[] | undefined,
		) => Promise<SignedRecord[]>,
	): void;
	start(): Promise<void>;
	stop(): Promise<void>;
	query(peerId: string, query: string, embedding?: number[]): Promise<SignedRecord[]>;
	push(_peerId: string, _records: SignedRecord[]): Promise<number>;
	getPeers(): Array<{
		peerId: string;
		address: string;
		online: boolean;
	}>;
	addPeer(address: string): Promise<void>;
	removePeer(peerId: string): Promise<void>;
}
//# sourceMappingURL=loopback-transport.d.ts.map
