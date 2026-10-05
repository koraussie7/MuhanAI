/**
 * GlassesBridge — Device-to-Mesh bridge for Horizon AI Glasses (P1–P2).
 *
 * Bridges a Rokid/Android glasses device to the libp2p floodsub mesh:
 * 1. Device loads its ed25519-raw-v1 identity (shared with peer-mesh/identity.ts)
 * 2. Joins the mesh via createTransport (floodsub, bootstrap, DHT)
 * 3. Subscribes to GLASSES_KNOWLEDGE_TOPIC for CRDT knowledge sync
 * 4. Publishes voice-memories, obstacle reports, and place bookmarks
 * 5. Receives mesh-side corrections (e.g. updated obstacle status, route corrections)
 *
 * The Kotlin app calls this via the Edge Worker (HTTPS /api/glasses/v1/*) and
 * receives mesh messages over libp2p. The bridge is the TypeScript reference
 * implementation; the Kotlin side uses libp2p-multiplexer.
 *
 * Design: docs/horizon-glasses-integration-design.md
 * Contract: docs/horizon-glasses-api-contract.md (§5)
 */

import type { LoadedIdentity, TransportHandle } from "@agentmesh/peer-mesh";
import {
	computeDigest,
	decodeGlassesEntry,
	encodeGlassesEntry,
	GLASSES_KNOWLEDGE_TOPIC,
	type GlassesCRDTMessage,
	type GlassesKnowledgeEntry,
	mergeEntries,
} from "@agentmesh/peer-mesh";

export interface GlassesBridgeConfig {
	identityPath?: string;
	bootstrapPeers?: string[];
	listen?: string[];
	discovery?: ("mdns" | "bootstrap" | "dht")[];
}

export interface GlassesBridgeEvents {
	"knowledge:created": (entry: GlassesKnowledgeEntry) => void;
	"knowledge:updated": (entry: GlassesKnowledgeEntry) => void;
	"knowledge:deleted": (entryId: string) => void;
	"mesh:connected": (peerId: string) => void;
	"mesh:disconnected": (peerId: string) => void;
	"mesh:error": (err: Error) => void;
}

export type GlassesBridgeEventName = keyof GlassesBridgeEvents;

export class GlassesBridge {
	private handle: TransportHandle | null = null;
	private identity: LoadedIdentity | null = null;
	private peerId: string | null = null;
	private knowledgeStore = new Map<string, GlassesKnowledgeEntry>();
	private eventHandlers = new Map<GlassesBridgeEventName, Set<Function>>();
	private isSubscribed = false;

	constructor(private config: GlassesBridgeConfig = {}) {}

	// --- Identity (P2: ed25519-raw-v1) ---------------------------------------

	async init(): Promise<void> {
		const { loadOrCreateIdentity } = await import("@agentmesh/peer-mesh");
		const identityPath = this.config.identityPath || "./.glasses-identity.json";
		this.identity = await loadOrCreateIdentity(identityPath);
		this.peerId = this.identity.peerId;
	}

	// --- Mesh connection ------------------------------------------------------

	async connect(): Promise<void> {
		if (!this.identity) {
			throw new Error("GlassesBridge: call init() before connect()");
		}

		const { createTransport } = await import("@agentmesh/peer-mesh");
		const result = await createTransport({
			privateKey: this.identity.privateKey,
			listen: this.config.listen ?? ["/ip4/127.0.0.1/tcp/0"],
			bootstrapPeers: this.config.bootstrapPeers,
			discovery: this.config.discovery ?? ["mdns", "bootstrap"],
			dhtServer: false,
		});

		if (result.isErr()) {
			this.emit("mesh:error", result.error);
			throw new Error(`Failed to create transport: ${result.error?.message || "unknown"}`);
		}

		this.handle = result.value;
		this.peerId = result.value.peerId;
		this.emit("mesh:connected", this.peerId);

		// Peer connection event handlers (libp2p-typed via peer-mesh)
		const node = this.handle!.node as unknown as {
			addEventListener(
				name: string,
				handler: (evt: { detail: { remotePeer: { toString(): string } } }) => void,
			): void;
		};
		node.addEventListener("peer:connect", (evt) => {
			this.emit("mesh:connected", evt.detail.remotePeer.toString());
		});
		node.addEventListener("peer:disconnect", (evt) => {
			this.emit("mesh:disconnected", evt.detail.remotePeer.toString());
		});

		await this.subscribeKnowledge();
	}

	private async subscribeKnowledge(): Promise<void> {
		if (!this.handle || this.isSubscribed) return;
		const pubsub = (this.handle.node.services as Record<string, unknown>).pubsub as
			| { subscribe: (topic: string, handler: (data: Uint8Array) => void) => Promise<void> }
			| undefined;
		if (!pubsub?.subscribe) {
			this.emit("mesh:error", new Error("pubsub service not available"));
			return;
		}

		await pubsub.subscribe(GLASSES_KNOWLEDGE_TOPIC, (data: Uint8Array) => {
			const msg = decodeGlassesEntry(data);
			if (!msg) return;
			this.handleCRDTMessage(msg);
		});

		this.isSubscribed = true;
	}

	// --- CRDT message handling ------------------------------------------------

	private handleCRDTMessage(msg: GlassesCRDTMessage): void {
		if (msg.fromPeerId === this.peerId) return;

		const existing = this.knowledgeStore.get(msg.entry.entryId);

		if (msg.action === "delete") {
			const tombstone: GlassesKnowledgeEntry = { ...msg.entry, deleted: true };
			this.knowledgeStore.set(msg.entry.entryId, tombstone);
			this.emit("knowledge:deleted", msg.entry.entryId);
			return;
		}

		const merged = mergeEntries(existing ?? null, { ...msg.entry, digest: msg.digest });
		this.knowledgeStore.set(msg.entry.entryId, merged);

		if (!existing) {
			this.emit("knowledge:created", merged);
		} else if (merged.entryId !== existing.entryId || merged.updatedAt !== existing.updatedAt) {
			this.emit("knowledge:updated", merged);
		}
	}

	// --- Publish knowledge (P2: CRDT knowledge sync) --------------------------

	async publishKnowledge(params: {
		type: GlassesKnowledgeEntry["type"];
		title: string;
		content: string;
		tags?: string[];
		metadata?: Record<string, unknown>;
	}): Promise<string | null> {
		if (!this.handle || !this.peerId) {
			throw new Error("GlassesBridge: not connected");
		}

		const entryId = `${this.peerId}-${Date.now()}`;
		const now = Date.now();
		const entry: GlassesKnowledgeEntry = {
			entryId,
			ownerPeerId: this.peerId,
			type: params.type,
			title: params.title,
			content: params.content,
			tags: params.tags || [],
			metadata: params.metadata || {},
			createdAt: now,
			updatedAt: now,
			deleted: false,
			digest: computeDigest(this.peerId, entryId, now),
		};

		this.knowledgeStore.set(entryId, entry);

		const crdtMsg: GlassesCRDTMessage = {
			v: 1,
			topic: GLASSES_KNOWLEDGE_TOPIC,
			action: "upsert",
			entry,
			fromPeerId: this.peerId,
			ts: now,
			digest: entry.digest ?? computeDigest(this.peerId, entryId, now),
		};

		const pubsub = (this.handle.node.services as Record<string, unknown>).pubsub as
			| { publish: (topic: string, data: Uint8Array) => Promise<void> }
			| undefined;
		if (pubsub?.publish) {
			await pubsub.publish(GLASSES_KNOWLEDGE_TOPIC, encodeGlassesEntry(crdtMsg));
		}

		return entryId;
	}

	// --- Local knowledge store access -----------------------------------------

	getAllEntries(): GlassesKnowledgeEntry[] {
		return Array.from(this.knowledgeStore.values()).filter((e) => !e.deleted);
	}

	getEntry(entryId: string): GlassesKnowledgeEntry | undefined {
		return this.knowledgeStore.get(entryId);
	}

	searchEntries(query: string): GlassesKnowledgeEntry[] {
		const q = query.toLowerCase();
		return this.getAllEntries().filter(
			(e) =>
				e.title.toLowerCase().includes(q) ||
				e.content.toLowerCase().includes(q) ||
				e.tags.some((t) => t.toLowerCase().includes(q)),
		);
	}

	// --- Event system ---------------------------------------------------------

	on(name: GlassesBridgeEventName, handler: Function): () => void {
		if (!this.eventHandlers.has(name)) {
			this.eventHandlers.set(name, new Set());
		}
		this.eventHandlers.get(name)!.add(handler);
		return () => {
			this.eventHandlers.get(name)?.delete(handler);
		};
	}

	private emit(name: GlassesBridgeEventName, ...args: unknown[]): void {
		this.eventHandlers.get(name)?.forEach((h) => h(...args));
	}

	// --- Cleanup ---------------------------------------------------------------

	async stop(): Promise<void> {
		if (this.handle) {
			await this.handle.stop();
			this.handle = null;
		}
		this.knowledgeStore.clear();
		this.isSubscribed = false;
	}

	getPeerId(): string | null {
		return this.peerId;
	}
}
