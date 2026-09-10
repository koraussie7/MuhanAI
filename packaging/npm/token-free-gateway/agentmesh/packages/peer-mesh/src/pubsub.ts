/**
 * libp2p pubsub factory — FLOODSUB (D1 from INTEGRATED-CODE-PLAN.md).
 *
 * Rationale (verbatim from folklore/peer-transport.ts:26-32):
 *   "Gossipsub 14.x still targets @libp2p/interface v2 while folklore uses
 *    v3, so floodsub is the right fit until @chainsafe ships a v3-compatible
 *    gossipsub release. The service API is identical so upgrading later is a
 *    one-line swap."
 *
 * When @chainsafe ships a v3-compatible gossipsub, replace the body of
 * `createPubSub()` with `gossipsub()`. The PULSE_TOPIC / PulseMessage
 * shape stays the same.
 */

import { floodsub } from "@libp2p/floodsub";

export const PULSE_TOPIC = "/agentmesh/pulse/1.0.0";

export type PulseKind = "pulse" | "presence" | "request" | "reply";

export interface PulseMessage {
	v: 1;
	kind: PulseKind;
	fromPeerId: string;
	payload: unknown;
	ts: number;
}

export function createPubSub(): ReturnType<typeof floodsub> {
	return floodsub();
}

export function encodePulse(msg: PulseMessage): Uint8Array {
	return new TextEncoder().encode(JSON.stringify(msg));
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
		};
	} catch {
		return null;
	}
}

/**
 * A producer of pulse messages — the libp2p-agnostic contract that callers
 * (e.g. services/api's PulseBridge) consume. Concrete implementations wrap
 * `@libp2p/floodsub` (or future gossipsub) into this shape.
 *
 * Returned unsubscribe MUST be idempotent and safe to call multiple times.
 */
export interface PulseSource {
	/** Subscribe to inbound messages. Returns an unsubscribe function. */
	subscribe(handler: (msg: PulseMessage) => void): () => void;
	/** Optional publish — read-only sources may omit this. */
	publish?(msg: PulseMessage): Promise<void> | void;
}
