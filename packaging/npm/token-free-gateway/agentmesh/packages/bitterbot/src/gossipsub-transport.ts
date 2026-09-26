import type { ModelBeaconTransport } from "./model-catalog.js";

/**
 * Gossipsub topic for model announcements.
 *
 * `ModelCatalog` keys announcements by manifest id (`envelopeTopic`), but
 * Gossipsub requires a single well-formed topic string, so the id is
 * encoded into a versioned topic path. The manifest id can contain
 * characters (`/`, `:`, non-ASCII) that Gossipsub topic validation rejects,
 * hence the explicit encode/decode.
 */
const TOPIC_PREFIX = "/agentmesh/models/1.0.0/";

/** Catalogue topic prefix, as produced by noema's `envelopeTopic`. */
const CATALOG_PREFIX = "agentmesh/models/";

/** The catalogue-wide wildcard manifest id. */
export const WILDCARD_MANIFEST_ID = "*";

/**
 * The catalogue-wide wildcard gossipsub topic. Subscribing to it means
 * "every model announcement"; on the wire that is the bare prefix.
 */
export const WILDCARD_TOPIC = "/agentmesh/models/1.0.0";

/** `agentmesh/models/<id>` -> `<id>`, or `*` / `null` when not a model topic. */
export function manifestIdFromCatalogTopic(topic: string): string | null {
	if (topic === `${CATALOG_PREFIX}${WILDCARD_MANIFEST_ID}`) return WILDCARD_MANIFEST_ID;
	const id = topic.startsWith(CATALOG_PREFIX) ? topic.slice(CATALOG_PREFIX.length) : topic;
	// Bare manifest ids are accepted as a convenience; already-encoded
	// gossipsub topics (leading "/") are not model catalogue topics.
	if (id.length === 0 || id.startsWith("/")) return null;
	return id;
}

export function toGossipsubTopic(manifestId: string): string {
	if (manifestId === WILDCARD_MANIFEST_ID) return WILDCARD_TOPIC;
	return `${TOPIC_PREFIX}${encodeURIComponent(manifestId)}`;
}

export function fromGossipsubTopic(topic: string): string | null {
	if (topic === WILDCARD_TOPIC) return WILDCARD_MANIFEST_ID;
	if (!topic.startsWith(TOPIC_PREFIX)) return null;
	try {
		return decodeURIComponent(topic.slice(TOPIC_PREFIX.length));
	} catch {
		return null;
	}
}

/** The minimal libp2p pubsub surface this transport needs. */
export type GossipsubMessage = { topic: string; data: Uint8Array };

export interface GossipsubLike {
	publish(topic: string, data: Uint8Array): Promise<void>;
	subscribe(topic: string): void | Promise<void>;
	unsubscribe(topic: string): void;
	addEventListener(topic: string, handler: (evt: Event) => void): void;
	removeEventListener(topic: string, handler: (evt: Event) => void): void;
	/**
	 * Catalogue-wide message hook. libp2p gossipsub emits every message it
	 * relays on a topic the node subscribed to, so this is how a wildcard
	 * subscriber sees announcements published on model-specific topics.
	 * Optional: without it the transport falls back to per-topic listeners.
	 */
	onMessage?(handler: (evt: Event) => void): () => void;
}

/** Reads `{ topic, data }` out of a gossipsub event, bare or CustomEvent-shaped. */
function readMessage(evt: Event): GossipsubMessage | null {
	const detail = (evt as CustomEvent<GossipsubMessage>).detail as GossipsubMessage | undefined;
	const message = detail ?? (evt as unknown as GossipsubMessage);
	if (!message || typeof message.topic !== "string" || !message.data) return null;
	return message;
}

export interface GossipsubTransportOptions {
	onError?: (err: unknown, topic: string) => void;
}

/**
 * ModelBeaconTransport backed by a libp2p Gossipsub service.
 *
 * Publishing is fire-and-forget from the caller's point of view: a peer
 * that publishes before it has peers on the topic is a configuration
 * error, not a manifest error, so errors are surfaced through `onError`
 * instead of rejecting the announcement.
 */
export class GossipsubModelBeaconTransport implements ModelBeaconTransport {
	private readonly handlers = new Map<string, Set<(payload: string) => void | Promise<void>>>();
	private readonly listeners = new Map<string, (evt: Event) => void>();
	/** Topics we have called `pubsub.subscribe()` for (refcounted via handlers). */
	private readonly subscribedTopics = new Set<string>();
	private globalListener: ((evt: Event) => void) | undefined;
	private globalOff: (() => void) | undefined;

	constructor(
		private readonly pubsub: GossipsubLike,
		private readonly options: GossipsubTransportOptions = {},
	) {}

	async publish(topic: string, payload: string): Promise<void> {
		const manifestId = manifestIdFromCatalogTopic(topic);
		if (manifestId === null) return;
		const gossipsubTopic = toGossipsubTopic(manifestId);
		try {
			await this.pubsub.publish(gossipsubTopic, new TextEncoder().encode(payload));
		} catch (err) {
			this.options.onError?.(err, topic);
		}
	}

	async subscribe(
		topic: string,
		handler: (payload: string) => void | Promise<void>,
	): Promise<() => void> {
		const manifestId = manifestIdFromCatalogTopic(topic);
		if (manifestId === null) throw new Error(`not a model catalogue topic: ${topic}`);
		// Key by the catalogue topic so dispatch can hand handlers the same
		// string the caller subscribed with.
		let handlers = this.handlers.get(topic);
		if (!handlers) {
			handlers = new Set();
			this.handlers.set(topic, handlers);
		}
		handlers.add(handler);
		const gossipsubTopic = toGossipsubTopic(manifestId);

		// A wildcard subscriber cannot enumerate model topics up front, so
		// prefer the pubsub-wide message hook when it is available.
		if (this.pubsub.onMessage && this.globalListener === undefined) {
			const listener = (evt: Event) => {
				const message = readMessage(evt);
				if (message) void this.dispatch(message.topic, message.data);
			};
			this.globalListener = listener;
			this.globalOff = this.pubsub.onMessage(listener);
		}

		// Subscribe the libp2p topic on the first local subscriber so several
		// catalog consumers on the same topic share one stream.
		if (!this.subscribedTopics.has(gossipsubTopic)) {
			this.subscribedTopics.add(gossipsubTopic);
			await this.pubsub.subscribe(gossipsubTopic);
		}

		// Attach the per-topic listener only when there is no pubsub-wide
		// hook: the hook already sees every message, so a second listener
		// would double-dispatch.
		if (!this.pubsub.onMessage && this.listeners.get(gossipsubTopic) === undefined) {
			const listener = (evt: Event) => {
				const message = readMessage(evt);
				if (message) void this.dispatch(message.topic, message.data);
			};
			this.listeners.set(gossipsubTopic, listener);
			this.pubsub.addEventListener(gossipsubTopic, listener);
		}

		return () => {
			const current = this.handlers.get(topic);
			if (!current) return;
			current.delete(handler);
			if (current.size === 0) {
				this.teardownWhenIdle();
				this.handlers.delete(topic);
				const listener = this.listeners.get(gossipsubTopic);
				if (listener) {
					this.pubsub.removeEventListener(gossipsubTopic, listener);
					this.listeners.delete(gossipsubTopic);
				}
				if (this.subscribedTopics.delete(gossipsubTopic)) {
					this.pubsub.unsubscribe(gossipsubTopic);
				}
				this.teardownWhenIdle();
			}
		};
	}

	/** Drops every libp2p listener once no local subscriber remains. */
	private teardownWhenIdle(): void {
		if (this.handlers.size > 0) return;
		for (const [topic, listener] of this.listeners) {
			this.pubsub.removeEventListener(topic, listener);
		}
		this.listeners.clear();
		this.globalOff?.();
		this.globalOff = undefined;
		this.globalListener = undefined;
	}

	private async dispatch(gossipsubTopic: string, data: Uint8Array): Promise<void> {
		const manifestId = fromGossipsubTopic(gossipsubTopic);
		if (manifestId === null) return;
		const payload = new TextDecoder().decode(data);
		// Handlers are keyed by whatever topic string the caller used (a bare
		// manifest id or a catalogue topic), so match on the manifest id.
		const targets = [...this.handlers.keys()].filter((key) => {
			const id = manifestIdFromCatalogTopic(key);
			return id === WILDCARD_MANIFEST_ID || id === manifestId;
		});
		for (const target of new Set(targets)) {
			await this.fanOut(target, payload, manifestId);
		}
	}

	private async fanOut(topic: string, payload: string, manifestId: string): Promise<void> {
		for (const handler of this.handlers.get(topic) ?? []) {
			try {
				await handler(payload);
			} catch (err) {
				this.options.onError?.(err, manifestId);
			}
		}
	}
}

/**
 * In-process transport used by tests and single-process simulations.
 *
 * Publishes are delivered to every subscriber of the same topic, matching
 * the in-process behaviour relied on by the rest of the package.
 */
export class InMemoryModelBeaconTransport implements ModelBeaconTransport {
	private readonly handlers = new Map<string, Set<(payload: string) => void | Promise<void>>>();
	readonly published: Array<{ topic: string; payload: string }> = [];

	async publish(topic: string, payload: string): Promise<void> {
		this.published.push({ topic, payload });
		for (const handler of this.handlers.get(topic) ?? []) await handler(payload);
	}

	async subscribe(
		topic: string,
		handler: (payload: string) => void | Promise<void>,
	): Promise<() => void> {
		const handlers = this.handlers.get(topic) ?? new Set();
		handlers.add(handler);
		this.handlers.set(topic, handlers);
		return () => {
			handlers.delete(handler);
		};
	}
}
