export interface SignedRecord {
    id: string;
    content: string;
    type: string;
    ownerId: string;
    peerId: string;
    signature: string;
    publicKey: string;
    timestamp: number;
    vectorClock: Record<string, number>;
    sources?: string[];
    metadata?: Record<string, unknown>;
}
export interface QueryMessage {
    type: "query";
    query: string;
    embedding?: number[];
    results?: SignedRecord[];
}
export interface PushMessage {
    type: "push";
    records?: SignedRecord[];
    accepted?: number;
}
export type ProtocolMessage = QueryMessage | PushMessage;
export declare const QUERY_PROTOCOL = "/folklore/query/1.0.0";
export declare const PUSH_PROTOCOL = "/folklore/push/1.0.0";
export declare function encodeMessage(message: ProtocolMessage): Uint8Array;
export declare function decodeMessage(data: Uint8Array): ProtocolMessage;
//# sourceMappingURL=folklore.d.ts.map