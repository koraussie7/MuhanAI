import type { SignedRecord } from "@agentmesh/shared";
import type { Transport, TransportOptions } from "./types.js";
export declare class Libp2pTransport implements Transport {
	private readonly peerId;
	private readonly listenAddr;
	private started;
	constructor(options: TransportOptions);
	start(): Promise<void>;
	stop(): Promise<void>;
	query(_peerId: string, _query: string, _embedding?: number[]): Promise<SignedRecord[]>;
	push(_peerId: string, _records: SignedRecord[]): Promise<number>;
	getPeers(): Array<{
		peerId: string;
		address: string;
		online: boolean;
	}>;
	addPeer(_address: string): Promise<void>;
	removePeer(_peerId: string): Promise<void>;
}
export interface Libp2pTransportOptions extends TransportOptions {
	onQuery?: (message: { query: string; embedding?: number[] }) => Promise<SignedRecord[]>;
	onPush?: (records: SignedRecord[]) => Promise<void>;
}
export declare function createLibp2pTransport(options: Libp2pTransportOptions): Libp2pTransport;
//# sourceMappingURL=libp2p-transport.d.ts.map
