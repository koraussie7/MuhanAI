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

// P2: Horizon Glasses knowledge CRDT topic — accessibility memories, obstacle
// reports, and place bookmarks synced across the mesh via floodsub.
export const GLASSES_KNOWLEDGE_TOPIC = "/agentmesh/glasses-knowledge/1.0.0";

export type PulseKind = "pulse" | "presence" | "request" | "reply";

export interface PulseMessage {
	v: 1;
	kind: PulseKind;
	fromPeerId: string;
	payload: unknown;
	ts: number;
}

// --- P2: Glasses knowledge CRDT types (LWW-element-register pattern) ----------

export type KnowledgeCRDTAction = "upsert" | "delete";

export interface GlassesKnowledgeEntry {
	entryId: string;
	ownerPeerId: string;
	type:
		| "voice_memo"
		| "obstacle_report"
		| "place_bookmark"
		| "location_log"
		| "crosswalk_alert"
		| "general";
	title: string;
	content: string;
	tags: string[];
	metadata: Record<string, unknown>;
	createdAt: number;
	updatedAt: number;
	deleted: boolean;
	digest?: string;
}

export interface GlassesCRDTMessage {
	v: 1;
	topic: typeof GLASSES_KNOWLEDGE_TOPIC;
	action: KnowledgeCRDTAction;
	entry: GlassesKnowledgeEntry;
	fromPeerId: string;
	ts: number;
	// LWW tie-breaker: higher (peerId + ts) wins. Both are string-sorted.
	digest: string;
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

// --- P2: Glasses knowledge CRDT encode/decode + LWW merge -------------------

export function encodeGlassesEntry(msg: GlassesCRDTMessage): Uint8Array {
	return new TextEncoder().encode(JSON.stringify(msg));
}

export function decodeGlassesEntry(data: Uint8Array): GlassesCRDTMessage | null {
	try {
		const obj = JSON.parse(new TextDecoder().decode(data)) as Partial<GlassesCRDTMessage>;
		if (obj.v !== 1) return null;
		if (obj.topic !== GLASSES_KNOWLEDGE_TOPIC) return null;
		if (obj.action !== "upsert" && obj.action !== "delete") return null;
		if (typeof obj.fromPeerId !== "string" || typeof obj.ts !== "number") return null;
		const entry = obj.entry;
		if (
			!entry ||
			typeof entry.entryId !== "string" ||
			typeof entry.ownerPeerId !== "string" ||
			typeof entry.type !== "string" ||
			typeof entry.title !== "string" ||
			typeof entry.content !== "string" ||
			typeof entry.createdAt !== "number" ||
			typeof entry.updatedAt !== "number" ||
			typeof entry.deleted !== "boolean"
		) {
			return null;
		}
		return {
			v: 1,
			topic: GLASSES_KNOWLEDGE_TOPIC,
			action: obj.action,
			entry: {
				entryId: entry.entryId,
				ownerPeerId: entry.ownerPeerId,
				type: entry.type,
				title: entry.title,
				content: entry.content,
				tags: Array.isArray(entry.tags) ? entry.tags : [],
				metadata: entry.metadata || {},
				createdAt: entry.createdAt,
				updatedAt: entry.updatedAt,
				deleted: entry.deleted,
			},
			fromPeerId: obj.fromPeerId,
			ts: obj.ts,
			digest: obj.digest || "",
		};
	} catch {
		return null;
	}
}

// LWW merge: returns the "winner" entry — latest updatedAt wins; on tie,
// higher (ownerPeerId + entryId) digest wins.
export function mergeEntries(
	existing: GlassesKnowledgeEntry | null,
	incoming: GlassesKnowledgeEntry,
): GlassesKnowledgeEntry {
	if (!existing) return incoming;
	if (incoming.updatedAt > existing.updatedAt) return incoming;
	if (incoming.updatedAt < existing.updatedAt) return existing;
	// Tie-break: higher digest wins (deterministic across peers)
	const nextDigest = incoming.digest || "";
	const existingDigest = existing.digest || "";
	return nextDigest > existingDigest ? incoming : existing;
}

// Compute the deterministic digest for LWW tie-breaking.
export function computeDigest(ownerPeerId: string, entryId: string, ts: number): string {
	return `${ts}-${ownerPeerId}-${entryId}`;
}
