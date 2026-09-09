/**
 * Identity bridge between MuhanAI DIDs and AXL peer IDs.
 *
 * Both identity systems coexist in MuhanAI:
 *   - MuhanAI DID (did:muhan:<method>): subject identity, reputation-bound
 *   - AXL peerId (hex ed25519, 64 chars): transport-level address
 *
 * A peer often has both. The mapping lets the agent layer say "ask DID
 * did:muhan:abc..." and have the transport look up the right ed25519
 * key for /send or /a2a/ calls.
 */

import type { PeerId } from "./types.js";

export const DID_METHOD = "muhan";

export interface IdentityRecord {
	did: string;
	axlPeerId: PeerId;
	publicKeyJwk?: JsonWebKeyShape;
	createdAt: number;
}

/** JWK-flavored shape — kept loose so we don't pull DOM lib into every consumer. */
export interface JsonWebKeyShape {
	kty: string;
	crv?: string;
	x?: string;
	y?: string;
	n?: string;
	e?: string;
	[key: string]: unknown;
}

/**
 * Stable mapping derived from ed25519 public key bytes. We use the
 * first 16 bytes (32 hex chars) as the DID suffix — short enough to
 * read, collision-resistant enough for a P2P overlay.
 */
export function didFromAxlPeerId(peerId: PeerId): string {
	if (!/^[0-9a-fA-F]{64}$/.test(peerId)) {
		throw new Error(`didFromAxlPeerId: invalid peer ID "${peerId}"`);
	}
	const suffix = peerId.slice(0, 32).toLowerCase();
	return `did:${DID_METHOD}:${suffix}`;
}

/**
 * Inverse of didFromAxlPeerId — returns the peerId whose first 32 hex
 * chars match the DID suffix. Returns null if the DID isn't ours.
 *
 * Note: the full 64-char peerId carries more entropy than the DID, so
 * this is a one-way "match by prefix" lookup. Callers needing the
 * canonical key should resolve through the registry instead.
 */
export function axlPeerIdFromDid(did: string, candidatePeerIds: PeerId[]): PeerId | null {
	const prefix = did.split(":").pop();
	if (!prefix || !/^[0-9a-fA-F]+$/.test(prefix)) return null;
	const needle = prefix.toLowerCase();
	for (const peerId of candidatePeerIds) {
		if (peerId.toLowerCase().startsWith(needle)) return peerId;
	}
	return null;
}

/**
 * Normalize a peer ID — accepts either hex ed25519, did:muhan:..., or
 * short prefixes (8+ hex chars) that uniquely identify a peer within
 * the topology. Returns the full 64-char hex form or null.
 */
export function normalizePeerId(
	input: string,
	candidatePeerIds: PeerId[] = [],
): PeerId | null {
	const trimmed = input.trim();
	if (!trimmed) return null;

	if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return trimmed.toLowerCase();

	if (trimmed.startsWith(`did:${DID_METHOD}:`)) {
		return axlPeerIdFromDid(trimmed, candidatePeerIds);
	}

	// Short hex prefix — only resolve if exactly one match.
	if (/^[0-9a-fA-F]{8,63}$/.test(trimmed)) {
		const needle = trimmed.toLowerCase();
		const matches = candidatePeerIds.filter((p) => p.toLowerCase().startsWith(needle));
		return matches.length === 1 ? (matches[0]?.toLowerCase() ?? null) : null;
	}

	return null;
}

/**
 * In-memory identity registry — production deployments should back
 * this with the knowledge-base or a CRDT, but for the agent layer we
 * just need a lookup that survives a session.
 */
export class IdentityRegistry {
	private readonly byDid = new Map<string, IdentityRecord>();
	private readonly byPeer = new Map<PeerId, IdentityRecord>();

	upsert(record: Omit<IdentityRecord, "createdAt"> & { createdAt?: number }): IdentityRecord {
		const existing = this.byPeer.get(record.axlPeerId);
		const full: IdentityRecord = {
			...record,
			createdAt: existing?.createdAt ?? record.createdAt ?? Date.now(),
		};
		this.byDid.set(full.did, full);
		this.byPeer.set(full.axlPeerId, full);
		return full;
	}

	getByDid(did: string): IdentityRecord | undefined {
		return this.byDid.get(did);
	}

	getByPeerId(peerId: PeerId): IdentityRecord | undefined {
		return this.byPeer.get(peerId.toLowerCase() as PeerId);
	}

	resolve(input: string): PeerId | null {
		const direct = this.byDid.get(input);
		if (direct) return direct.axlPeerId;
		const lowered = input.toLowerCase() as PeerId;
		if (this.byPeer.has(lowered)) return lowered;
		return null;
	}

	list(): IdentityRecord[] {
		return Array.from(this.byDid.values());
	}

	size(): number {
		return this.byDid.size;
	}
}
