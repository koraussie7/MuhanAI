import {
	buildEnvelope,
	decodeEnvelope,
	envelopeId,
	envelopeTopic,
	verifyEnvelope,
} from "@agentmesh/noema";
import type { ManifestEnvelope, ModelManifest } from "@agentmesh/noema";

/** Transport seam for Gossipsub, memory tests, or a future libp2p adapter. */
export interface ModelBeaconTransport {
	publish(topic: string, payload: string): Promise<void>;
	subscribe(topic: string, handler: (payload: string) => void | Promise<void>): Promise<() => void>;
}

export interface ModelCatalogEntry {
	envelope: ManifestEnvelope;
	envelopeId: string;
	lastSeenAt: number;
}

export interface ModelCatalogOptions {
	/** Reject announcements older than this many milliseconds. */
	maxAgeMs?: number;
	/** Clock seam for deterministic tests. */
	now?: () => number;
}

export interface ModelAnnouncementResult {
	accepted: boolean;
	reason?: string;
	entry?: ModelCatalogEntry;
}

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Local model catalog populated by signed manifest announcements.
 *
 * It intentionally stores one latest announcement per (model id, publisher),
 * rather than one global winner. A future router can rank providers by
 * latency, reputation, and availability without losing the complete peer
 * set discovered by gossip.
 */
export class ModelCatalog {
	private readonly entries = new Map<string, ModelCatalogEntry>();
	private readonly maxAgeMs: number;
	private readonly now: () => number;

	constructor(options: ModelCatalogOptions = {}) {
	this.maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
	this.now = options.now ?? Date.now;
	}

	/** Accept and index one wire envelope. Invalid/stale messages are ignored. */
	announce(envelope: unknown): ModelAnnouncementResult {
	const checked = verifyEnvelope(envelope);
	if (!checked.ok) return { accepted: false, reason: checked.reason };

	const age = this.now() - checked.envelope.publishedAt;
	if (age > this.maxAgeMs) {
	return { accepted: false, reason: "announcement is stale" };
	}
	if (age < -5 * 60 * 1000) {
	return { accepted: false, reason: "announcement is too far in the future" };
	}

	const id = envelopeId(checked.envelope);
	const key = this.key(checked.envelope.manifest.id, checked.envelope.publisher);
	const previous = this.entries.get(key);
	if (previous && previous.envelopeId === id) {
	return { accepted: false, reason: "duplicate announcement", entry: previous };
	}
	const entry: ModelCatalogEntry = {
		envelope: checked.envelope,
		envelopeId: id,
	lastSeenAt: this.now(),
	};
	this.entries.set(key, entry);
	return { accepted: true, entry };
	}

	/** Decode and accept a JSON payload received from a transport. */
	announceWire(payload: string): ModelAnnouncementResult {
	const decoded = decodeEnvelope(payload);
	if (!decoded.ok) return { accepted: false, reason: decoded.reason };
	return this.announce(decoded.envelope);
	}

	/** Start listening for a publisher's model topic. */
	async listen(transport: ModelBeaconTransport, modelId: string): Promise<() => void> {
	return transport.subscribe(envelopeTopic(modelId), async (payload) => {
	this.announceWire(payload);
	});
	}

	get(modelId: string): ModelCatalogEntry[] {
	this.evictExpired();
	return [...this.entries.values()].filter((entry) => entry.envelope.manifest.id === modelId);
	}

	all(): ModelCatalogEntry[] {
	this.evictExpired();
	return [...this.entries.values()];
	}

	/** Remove expired entries and return the number removed. */
	evictExpired(): number {
	const cutoff = this.now() - this.maxAgeMs;
	let removed = 0;
	for (const [key, entry] of this.entries) {
	if (entry.envelope.publishedAt < cutoff) {
	this.entries.delete(key);
	removed += 1;
	}
	}
	return removed;
	}

	private key(modelId: string, publisher: string): string {
	return `${publisher}\u0000${modelId}`;
	}
}

export interface ModelBeaconOptions {
	signer?: { sign(bytes: Uint8Array): string };
	/** Clock seam; also controls the envelope's publishedAt timestamp. */
	now?: () => number;
}

/** Publishes local model manifests to the model-specific gossip topic. */
export class ModelBeacon {
	constructor(
	private readonly transport: ModelBeaconTransport,
	private readonly publisher: string,
	private readonly options: ModelBeaconOptions = {},
	) {}

	async publish(manifest: ModelManifest): Promise<ManifestEnvelope> {
	const envelope = buildEnvelope(manifest, this.publisher, {
		signer: this.options.signer,
	});
	if (this.options.now) envelope.publishedAt = this.options.now();
	await this.transport.publish(envelopeTopic(manifest.id), JSON.stringify(envelope));
	return envelope;
	}
}
