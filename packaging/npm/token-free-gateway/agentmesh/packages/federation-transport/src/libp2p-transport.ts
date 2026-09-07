/**
 * Real libp2p transport — delegates node construction to @agentmesh/p2p.
 *
 * This file owns ONLY the Transport interface implementation. Node
 * construction, identity, pubsub, and peer catalog live in
 * @agentmesh/p2p (see docs/adr/0001-m1-pulse-mesh.md).
 */

import type { PulseMessage, PulseSource } from "@agentmesh/p2p";
import {
	createTransport as createP2PTransport,
	decodePulse,
	encodePulse,
	loadOrCreateIdentity,
	PULSE_TOPIC,
	type TransportHandle,
} from "@agentmesh/p2p";
import type { SignedRecord } from "@agentmesh/shared";
import { peerIdFromString } from "@libp2p/peer-id";
import { multiaddr } from "@multiformats/multiaddr";
import { createPushHandler, createQueryHandler } from "./handlers.js";
import { PUSH_PROTOCOL, QUERY_PROTOCOL } from "./protocols/folklore.js";
import type { Transport, TransportOptions } from "./types.js";

export class Libp2pTransport implements Transport {
	private handle: TransportHandle | null = null;
	private queryHandler:
		| ((message: {
				query: string;
				embedding?: number[];
		  }) => Promise<SignedRecord[]>)
		| null = null;
	private pushHandler: ((records: SignedRecord[]) => Promise<void>) | null =
		null;
	private readonly identityPath: string;
	/** Handlers registered via getPulseSource(). All share one floodsub subscription. */
	private readonly pulseHandlers = new Set<(msg: PulseMessage) => void>();
	/** Whether start() already wired floodsub → pulseHandlers forwarding. */
	private pulseForwarderInstalled = false;

	constructor(options: TransportOptions & { identityPath?: string }) {
		this.identityPath = options.identityPath ?? "./.agentmesh/identity.json";
	}

	async start(): Promise<void> {
		const identity = await loadOrCreateIdentity(this.identityPath);

		const transportResult = await createP2PTransport({
			privateKey: identity.privateKey,
			listen: ["/ip4/127.0.0.1/tcp/0"],
			discovery: ["mdns"],
		});
		if (transportResult.isErr()) {
			throw new Error(
				`transport init failed: ${transportResult.error.message}`,
			);
		}
		this.handle = transportResult.value;

		if (this.queryHandler) {
			const handler = createQueryHandler(this.queryHandler);
			await this.handle.node.handle(QUERY_PROTOCOL, handler);
		}
		if (this.pushHandler) {
			const handler = createPushHandler(this.pushHandler);
			await this.handle.node.handle(PUSH_PROTOCOL, handler);
		}

		// Subscribe to the agentmesh pulse topic and forward decoded inbound
		// messages to every handler registered via getPulseSource(). We install
		// the listener once and fan out via a Set so multiple consumers (e.g.
		// PulseBridge + a side-channel subscriber) share a single floodsub
		// subscription.
		// pubsub is typed as `{}` by ServiceFactoryMap — cast to access the API.
		const pubsub = this.handle.node.services.pubsub as
			| {
					subscribe(topic: string): void;
					publish(topic: string, data: Uint8Array): Promise<void>;
					addEventListener(
						type: string,
						listener: (evt: CustomEvent<unknown>) => void,
					): void;
			  }
			| undefined;
		if (pubsub && !this.pulseForwarderInstalled) {
			pubsub.subscribe(PULSE_TOPIC);
			pubsub.addEventListener("message", (evt) => {
				const detail = (
					evt as CustomEvent<{ topic?: string; data?: Uint8Array }>
				).detail;
				if (detail.topic !== PULSE_TOPIC || !detail.data) return;
				const msg = decodePulse(detail.data);
				if (!msg) return; // malformed payload — silently drop
				for (const handler of this.pulseHandlers) {
					try {
						handler(msg);
					} catch {
						// never let one misbehaving consumer break fan-out
					}
				}
			});
			this.pulseForwarderInstalled = true;
		}
	}

	async stop(): Promise<void> {
		if (this.handle) {
			await this.handle.stop();
			this.handle = null;
		}
	}

	async query(
		peerId: string,
		query: string,
		embedding?: number[],
	): Promise<SignedRecord[]> {
		if (!this.handle) return [];
		try {
			const stream = await this.handle.node.dialProtocol(
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				peerIdFromString(peerId) as any,
				QUERY_PROTOCOL,
			);
			stream.send(
				new TextEncoder().encode(
					JSON.stringify({ type: "query", query, embedding }),
				),
			);
			const chunks: Uint8Array[] = [];
			for await (const chunk of stream) {
				chunks.push(
					chunk instanceof Uint8Array
						? chunk.subarray()
						: new Uint8Array(chunk.slice()).subarray(),
				);
			}
			const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
			const parsed = JSON.parse(buf.toString("utf8")) as {
				results?: SignedRecord[];
			};
			return parsed.results ?? [];
		} catch {
			return [];
		}
	}

	async push(peerId: string, records: SignedRecord[]): Promise<number> {
		if (!this.handle) return 0;
		try {
			const stream = await this.handle.node.dialProtocol(
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				peerIdFromString(peerId) as any,
				PUSH_PROTOCOL,
			);
			stream.send(
				new TextEncoder().encode(JSON.stringify({ type: "push", records })),
			);
			const chunks: Uint8Array[] = [];
			for await (const chunk of stream) {
				chunks.push(
					chunk instanceof Uint8Array
						? chunk.subarray()
						: new Uint8Array(chunk.slice()).subarray(),
				);
			}
			const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
			const parsed = JSON.parse(buf.toString("utf8")) as { accepted?: number };
			return parsed.accepted ?? 0;
		} catch {
			return 0;
		}
	}

	getPeers(): Array<{ peerId: string; address: string; online: boolean }> {
		if (!this.handle) return [];
		return this.handle.catalog.online().map((e) => ({
			peerId: e.id,
			address: e.addrs[0] ?? "",
			online: true,
		}));
	}

	async addPeer(address: string): Promise<void> {
		if (!this.handle) return;
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await this.handle.node.dial(multiaddr(address) as any);
		} catch {
			// best-effort dial
		}
	}

	async removePeer(peerId: string): Promise<void> {
		if (!this.handle) return;
		this.handle.catalog.remove(peerId);
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await this.handle.node.hangUp(peerIdFromString(peerId) as any);
		} catch {
			// peer may not be connected
		}
	}

	/** Publish a pulse message on the agentmesh topic. */
	async publishPulse(
		kind: "pulse" | "presence" | "request" | "reply",
		payload: unknown,
	): Promise<void> {
		if (!this.handle) return;
		const pubsub = this.handle.node.services.pubsub as
			| { publish(topic: string, data: Uint8Array): Promise<void> }
			| undefined;
		if (!pubsub) return;
		await pubsub.publish(
			PULSE_TOPIC,
			encodePulse({
				v: 1,
				kind,
				fromPeerId: this.handle.peerId,
				payload,
				ts: Date.now(),
			}),
		);
	}

	/**
	 * Expose a libp2p-agnostic `PulseSource` that fans out messages from the
	 * agentmesh floodsub topic. Callers (e.g. services/api's PulseBridge) use
	 * this to subscribe without importing libp2p types directly.
	 *
	 * Returns `null` if the transport has not been started yet (or has been
	 * stopped). Returning null lets callers stay in degraded mode rather than
	 * pretending the source is healthy.
	 */
	getPulseSource(): PulseSource | null {
		if (!this.handle) return null;
		const pubsub = this.handle.node.services.pubsub as
			| { publish(topic: string, data: Uint8Array): Promise<void> }
			| undefined;
		if (!pubsub) return null;
		return {
			subscribe: (handler) => {
				this.pulseHandlers.add(handler);
				return () => {
					this.pulseHandlers.delete(handler);
				};
			},
			publish: (msg) => {
				return pubsub.publish(PULSE_TOPIC, encodePulse(msg));
			},
		};
	}
}

export interface Libp2pTransportOptions extends TransportOptions {
	onQuery?: (message: {
		query: string;
		embedding?: number[];
	}) => Promise<SignedRecord[]>;
	onPush?: (records: SignedRecord[]) => Promise<void>;
	identityPath?: string;
}

export function createLibp2pTransport(
	options: Libp2pTransportOptions,
): Libp2pTransport {
	const transport = new Libp2pTransport(options);

	if (options.onQuery) {
		// Bracket notation bypasses TS private check — the handlers are set
		// post-construction so the constructor stays optional-args-only.
		transport["queryHandler"] = options.onQuery;
	}
	if (options.onPush) {
		transport["pushHandler"] = options.onPush;
	}

	return transport;
}
