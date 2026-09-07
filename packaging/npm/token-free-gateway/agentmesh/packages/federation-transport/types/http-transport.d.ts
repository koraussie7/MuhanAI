import type { SignedRecord } from "@agentmesh/shared";
import type { Transport, TransportOptions } from "./types.js";
export declare class HttpTransport implements Transport {
	private readonly peerId;
	private readonly baseUrl;
	constructor(options: TransportOptions);
	start(): Promise<void>;
	stop(): Promise<void>;
	query(peerId: string, query: string, _embedding?: number[]): Promise<SignedRecord[]>;
	push(_peerId: string, records: SignedRecord[]): Promise<number>;
	getPeers(): Array<{
		peerId: string;
		address: string;
		online: boolean;
	}>;
	addPeer(_address: string): Promise<void>;
	removePeer(_peerId: string): Promise<void>;
}
//# sourceMappingURL=http-transport.d.ts.map
