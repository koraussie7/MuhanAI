import type { SignedRecord } from "@agentmesh/shared";
import { type QueryMessage } from "./protocols/folklore.js";
export declare function createQueryHandler(handler: (message: QueryMessage) => Promise<SignedRecord[]>): (stream: {
    remotePeer: {
        toString: () => string;
    };
    sink: (data: Uint8Array) => Promise<void>;
} & AsyncIterable<Uint8Array>) => Promise<void>;
export declare function createPushHandler(handler: (records: SignedRecord[]) => Promise<void>): (stream: {
    remotePeer: {
        toString: () => string;
    };
    sink: (data: Uint8Array) => Promise<void>;
} & AsyncIterable<Uint8Array>) => Promise<void>;
//# sourceMappingURL=handlers.d.ts.map