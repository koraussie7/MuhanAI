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

export const QUERY_PROTOCOL = "/folklore/query/1.0.0";
export const PUSH_PROTOCOL = "/folklore/push/1.0.0";

export function encodeMessage(message: ProtocolMessage): Uint8Array {
	const text = JSON.stringify(message);
	return new TextEncoder().encode(text);
}

export function decodeMessage(data: Uint8Array): ProtocolMessage {
	const text = new TextDecoder().decode(data);
	return JSON.parse(text) as ProtocolMessage;
}
