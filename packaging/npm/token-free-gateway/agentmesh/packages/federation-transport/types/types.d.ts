import type { SignedRecord } from "@agentmesh/shared";
export interface TransportOptions {
    peerId: string;
    listenAddr?: string;
    bootstrap?: string[];
}
export interface Transport {
    start(): Promise<void>;
    stop(): Promise<void>;
    query(peerId: string, query: string, embedding?: number[]): Promise<SignedRecord[]>;
    push(peerId: string, records: SignedRecord[]): Promise<number>;
    getPeers(): Array<{
        peerId: string;
        address: string;
        online: boolean;
    }>;
    addPeer(address: string): Promise<void>;
    removePeer(peerId: string): Promise<void>;
}
export type TransportKind = "libp2p" | "http" | "loopback";
export interface TransportManagerOptions extends TransportOptions {
    preferred?: TransportKind;
    httpBaseUrl?: string;
}
//# sourceMappingURL=types.d.ts.map