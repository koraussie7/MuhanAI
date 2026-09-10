/**
 * @agentmesh/agent-gateway — protocol message types.
 *
 * Wire format used over libp2p pubsub topic "/muhanai/gateway/v1".
 * Every payload is signed with the sender's peer-id-derived key.
 * Receivers MUST verify before acting; gateway does not relay unsigned
 * messages. This prevents a malicious peer from impersonating another
 * user's machine.
 *
 * Schema is a closed discriminated union — receivers reject unknown
 * kinds to keep forward compat cheap (additive only).
 */

/**
 * Wire format uses string peer-ids (libp2p multihash string form) rather
 * than the libp2p PeerId object — keeps this package free of the
 * @libp2p/interface transitive dep, and string is enough for routing.
 */

export const GATEWAY_PROTOCOL_VERSION = 1 as const;
export const GATEWAY_PUBSUB_TOPIC = "/muhanai/gateway/v1" as const;

export type MachinePlatform = "macos" | "linux" | "windows" | "ios" | "android" | "web";

export interface SignedPayload<T extends ProtocolMessage> {
	/** Ed25519 signature over canonical(message). */
	signature: Uint8Array;
	/** Sender's peer-id string (also serves as verification key). */
	from: string;
	message: T;
}

export type ProtocolMessage =
	| MachineClaim
	| MachineRevoke
	| SessionRoute
	| SessionAck
	| PushRelay
	| Heartbeat;

export interface MachineClaim {
	kind: "machine-claim";
	v: typeof GATEWAY_PROTOCOL_VERSION;
	userId: string;
	machineId: string;
	platform: MachinePlatform;
	/** Best-effort human label; never used for auth. */
	label?: string;
	/** ms since epoch. */
	issuedAt: number;
	/** ms since epoch; receivers treat as advisory. */
	ttlMs: number;
}

export interface MachineRevoke {
	kind: "machine-revoke";
	v: typeof GATEWAY_PROTOCOL_VERSION;
	userId: string;
	machineId: string;
	issuedAt: number;
}

export interface SessionRoute {
	kind: "session-route";
	v: typeof GATEWAY_PROTOCOL_VERSION;
	sessionId: string;
	userId: string;
	/** Target machineId; gateway picks if absent. */
	machineId?: string;
	/** Encrypted session payload (E2E between user and machine). */
	ciphertext: Uint8Array;
	/** Push-token hint if machine is expected offline. */
	pushToken?: PushTokenHint;
	issuedAt: number;
}

export interface SessionAck {
	kind: "session-ack";
	v: typeof GATEWAY_PROTOCOL_VERSION;
	sessionId: string;
	machineId: string;
	accepted: boolean;
	reason?: string;
	issuedAt: number;
}

export interface PushRelay {
	kind: "push-relay";
	v: typeof GATEWAY_PROTOCOL_VERSION;
	userId: string;
	machineId: string;
	payload: Uint8Array;
	issuedAt: number;
}

export interface Heartbeat {
	kind: "heartbeat";
	v: typeof GATEWAY_PROTOCOL_VERSION;
	userId: string;
	machineId: string;
	issuedAt: number;
}

export interface PushTokenHint {
	platform: "apns" | "fcm";
	/** Opaque push token, NOT the encryption key. */
	token: string;
}

/**
 * Encode a message for the wire. Canonical byte order:
 *   kind || v || ...fields
 * Implemented here as a stable JSON stringification; receivers MUST
 * decode with the same function. Avoids pulling in protobuf.
 */
export function encodeMessage(msg: ProtocolMessage): Uint8Array {
	const canonical = canonicalJson(msg);
	return new TextEncoder().encode(canonical);
}

export function decodeMessage(bytes: Uint8Array): ProtocolMessage {
	const text = new TextDecoder().decode(bytes);
	const parsed = JSON.parse(text);
	if (!isProtocolMessage(parsed)) {
		throw new Error("invalid gateway protocol message");
	}
	return parsed;
}

function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (value instanceof Uint8Array) {
		return JSON.stringify({ __bytes: Array.from(value) });
	}
	if (Array.isArray(value)) {
		return `[${value.map(canonicalJson).join(",")}]`;
	}
	const obj = value as Record<string, unknown>;
	// Drop undefined values so optional fields don't leak as "key":undefined
	// (which is not valid JSON on the decode side).
	const keys = Object.keys(obj)
		.filter((k) => obj[k] !== undefined)
		.sort();
	const pairs = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
	return `{${pairs.join(",")}}`;
}

const KNOWN_KINDS: ReadonlySet<ProtocolMessage["kind"]> = new Set([
	"machine-claim",
	"machine-revoke",
	"session-route",
	"session-ack",
	"push-relay",
	"heartbeat",
]);

function isProtocolMessage(v: unknown): v is ProtocolMessage {
	if (!v || typeof v !== "object") return false;
	const o = v as Record<string, unknown>;
	if (typeof o.kind !== "string") return false;
	if (!KNOWN_KINDS.has(o.kind as ProtocolMessage["kind"])) return false;
	if (o.v !== GATEWAY_PROTOCOL_VERSION) return false;
	return true;
}
