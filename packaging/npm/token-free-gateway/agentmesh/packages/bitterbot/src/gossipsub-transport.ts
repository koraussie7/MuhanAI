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

export function toGossipsubTopic(manifestId: string): string {
	return `${TOPIC_PREFIX}${encodeURIComponent(manifestId)}`;
}

export function fromGossipsubTopic(topic: string): string | null {
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
	subscribe(topic: string): void;
	unsubscribe(topic: string): void;
	addEventListener(topic: string, handler: (evt: Event) => void): void;
	removeEventListener(topic: string, handler: (evt: Event) => void): void;
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
	private readonly handlers = new Map<
		string,
		Set<(payload: string) => void | Promise<void>>
	>();
	private readonly listeners = new Map<string, (evt: Event) => void>();

	constructor(
		private readonly pubsub: GossipsubLike,
		private readonly options: GossipsubTransportOptions = {},
	) { }

	async publish(topic: string, payload: string): Promise<void> {
		const gossipsubTopic = toGossipsubTopic(topic);
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
		const gossipsubTopic = toGossipsubTopic(topic);
		let handlers = this.handlers.get(gossipsubTopic);
		if (!handlers) {
			handlers = new Set();
			this.handlers.set(gossipsubTopic, handlers);
		}
		handlers.add(handler);

		// Only attach the libp2p listener on the first local subscriber so
		// several catalog consumers on the same topic share one stream.
		if (this.listeners.get(gossipsubTopic) === undefined) {
			const listener = (evt: Event) => {
				const detail = (evt as CustomEvent<GossipsubMessage>).detail as
					| GossipsubMessage
					| undefined;
				const message = detail ?? (evt as unknown as GossipsubMessage);
				void this.dispatch(message.topic, message.data);
			};
			this.listeners.set(gossipsubTopic, listener);
			this.pubsub.addEventListener(gossipsubTopic, listener);
			this.pubsub.subscribe(gossipsubTopic);
		}

		return () => {
			const current = this.handlers.get(gossipsubTopic);
			if (!current) return;
			current.delete(handler);
			if (current.size === 0) {
				this.handlers.delete(gossipsubTopic);
				const listener = this.listeners.get(gossipsubTopic);
				if (listener) {
					this.pubsub.removeEventListener(gossipsubTopic, listener);
					this.listeners.delete(gossipsubTopic);
				}
				this.pubsub.unsubscribe(gossipsubTopic);
			}
		};
	}

	private async dispatch(topic: string, data: Uint8Array): Promise<void> {
		const manifestId = fromGossipsubTopic(topic);
		if (manifestId === null) return;
		const payload = new TextDecoder().decode(data);
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
	private readonly handlers = new Map<
		string,
		Set<(payload: string) => void | Promise<void>>
	>();
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
