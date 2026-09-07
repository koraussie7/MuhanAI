import type { Transport, TransportOptions } from "./types.js";
export type TransportKind = "libp2p" | "http" | "loopback";
export interface TransportManagerOptions extends TransportOptions {
	preferred?: TransportKind;
	httpBaseUrl?: string;
}
export declare class TransportManager {
	private readonly transport;
	constructor(options: TransportManagerOptions);
	start(): Promise<void>;
	stop(): Promise<void>;
	getTransport(): Transport;
	getPeers(): Array<{
		peerId: string;
		address: string;
		online: boolean;
	}>;
}
//# sourceMappingURL=transport-manager.d.ts.map
