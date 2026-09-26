/**
 * libp2p pubsub factory — GOSSIPSUB (S1 migration from floodsub).
 *
 * Rationale: @libp2p/gossipsub now supports @libp2p/interface v3.
 * The service API is identical so upgrading is a one-line swap.
 */

import { gossipsub } from "@libp2p/gossipsub";

export const PULSE_TOPIC = "/agentmesh/pulse/1.0.0";

export type PulseKind = "pulse" | "presence" | "request" | "reply";

export interface PulseMessage {
	v: 1;
	kind: PulseKind;
	fromPeerId: string;
	payload: unknown;
	ts: number;
	signature?: string; // Ed25519 signature of the canonical JSON (excluding signature field)
}

export function createPubSub(): ReturnType<typeof gossipsub> {
	return gossipsub({
		allowPublishToZeroTopicPeers: true,
		emitSelf: true,
	});
}

export function encodePulse(msg: PulseMessage): Uint8Array {
	// For signing, we need canonical JSON without the signature field.
	const { signature, ...msgWithoutSig } = msg;
	return new TextEncoder().encode(JSON.stringify(msgWithoutSig));
}

export function decodePulse(data: Uint8Array): PulseMessage | null {
	try {
		const obj = JSON.parse(new TextDecoder().decode(data)) as Partial<PulseMessage>;
		if (obj.v !== 1) return null;
		if (
			obj.kind !== "pulse" &&
			obj.kind !== "presence" &&
			obj.kind !== "request" &&
			obj.kind !== "reply"
		) {
			return null;
		}
		if (typeof obj.fromPeerId !== "string" || typeof obj.ts !== "number") {
			return null;
		}
		return {
			v: 1,
			kind: obj.kind,
			fromPeerId: obj.fromPeerId,
			payload: obj.payload,
			ts: obj.ts,
			signature: obj.signature,
		};
	} catch {
		return null;
	}
}

/**
 * A producer of pulse messages — the libp2p-agnostic contract that callers
 * (e.g. services/api's PulseBridge) consume. Concrete implementations wrap
 * `@libp2p/gossipsub` into this shape.
 *
 * Returned unsubscribe MUST be idempotent and safe to call multiple times.
 */
export interface PulseSource {
	/** Subscribe to inbound messages. Returns an unsubscribe function. */
	subscribe(handler: (msg: PulseMessage) => void): () => void;
	/** Optional publish — read-only sources may omit this. */
	publish?(msg: PulseMessage): Promise<void> | void;
}
