import type { DeviceNodeInfo } from "@agentmesh/peer-mesh";
import type { ModelManifest } from "@agentmesh/noema";
import { ModelBeacon, ModelCatalog } from "@agentmesh/bitterbot";
import type {
	GossipsubLike,
	ModelBeaconTransport,
} from "@agentmesh/bitterbot";
import { P2pNodeRegistry } from "./p2p-node-registry.js";

export interface P2pModelRegistryOptions {
	/** Gossip pubsub to beacon model announcements over. */
	gossipsub?: GossipsubLike;
	/** Injectable transport seam (tests, alternate transports). */
	transport?: ModelBeaconTransport;
	/** Catalog instance to reuse; a fresh one is created when omitted. */
	catalog?: ModelCatalog;
	registry?: P2pNodeRegistry;
	/** Local peer id used when publishing announcements. */
	peerId?: string;
	/** Node fields for announced models without device metadata. */
	defaultPort?: number;
	defaultDeviceType?: DeviceNodeInfo["type"];
	defaultPlatform?: DeviceNodeInfo["platform"];
	defaultMaxContextLength?: number;
}

export interface P2pModelRegistry {
	readonly catalog: ModelCatalog;
	readonly registry: P2pNodeRegistry;
	beacon(manifest: ModelManifest): Promise<DeviceNodeInfo[]>;
	nodesByModel(model: string): DeviceNodeInfo[];
	listen(): Promise<() => void>;
	dispose(): void;
}

const nodeIdFor = (publisher: string, modelId: string) => `gossip:${publisher}:${modelId}`;

/**
 * Wires bitterbot's Gossipsub model announcements into the P2P node
 * registry so `P2pLoadBalancer` can route inference to peers that
 * announced a model.
 */
export function createP2pModelRegistry(
	options: P2pModelRegistryOptions = {},
): P2pModelRegistry {
	const catalog = options.catalog ?? new ModelCatalog();
	const registry = options.registry ?? new P2pNodeRegistry();
	const now = Date.now;

	const unsubscribe = catalog.onAccept((envelope) => {
		const { id } = envelope.manifest;
		const nodeId = nodeIdFor(envelope.publisher, id);
		registry.registerNode({
			id: nodeId,
			peerId: envelope.publisher,
			type: options.defaultDeviceType ?? "desktop",
			platform: options.defaultPlatform ?? "linux",
			host: envelope.publisher,
			port: options.defaultPort ?? 8080,
			status: "healthy",
			capabilities: {
				deviceType: options.defaultDeviceType ?? "desktop",
				platform: options.defaultPlatform ?? "linux",
				cpuCores: 1,
				ramTotal: 0,
				ramAvailable: 0,
				gpuAvailable: false,
				maxContextLength: options.defaultMaxContextLength ?? 8192,
				supportedModels: [id],
				supportsStreaming: true,
			},
			metrics: {
				activeRequests: 0,
				totalRequests: 0,
				avgResponseTime: 0,
				tokensPerSecond: 0,
				cpuUsage: 0,
				memoryUsage: 0,
			},
			lastSeen: now(),
			ownerId: envelope.publisher,
		});
	});

	let stopListening: (() => void) | undefined;

	const getTransport = (): ModelBeaconTransport => {
		if (options.transport) return options.transport;
		if (options.gossipsub) return createTransport(options.gossipsub);
		throw new Error("p2p model registry: no transport configured");
	};

	return {
		catalog,
		registry,
		async beacon(manifest) {
			const transport = getTransport();
			if (!options.peerId) throw new Error("p2p model registry: peerId is required");
			await new ModelBeacon(transport, options.peerId).publish(manifest);
			return registry.getNodesByModel(manifest.id);
		},
		nodesByModel: (model) => registry.getNodesByModel(model),
		async listen() {
			if (stopListening) return stopListening;
			const transport = getTransport();
			// Pass the catalogue-wide wildcard `*`; the transport fans this
			// out to the libp2p topic that announces every model.
			stopListening = await catalog.listen(transport, "*");
			return () => {
				stopListening?.();
				stopListening = undefined;
			};
		},
		dispose() {
			stopListening?.();
			stopListening = undefined;
			unsubscribe();
		},
	};
}

function createTransport(gossipsub: GossipsubLike): ModelBeaconTransport {
	const handlers = new Map<string, (payload: string) => void>();
	return {
		async publish(topic, payload) {
			for (const mapped of mapTopics(topic)) {
				await gossipsub.publish(mapped, new TextEncoder().encode(payload));
			}
		},
		async subscribe(topic, handler) {
			const unsubs: Array<() => void> = [];
			for (const mapped of mapTopics(topic)) {
				handlers.set(mapped, handler);
				// Gossipsub's `subscribe(topic)` returns a Promise<void>; the
				// local listener is registered via `addEventListener`. We
				// hook delivery through a single per-topic listener that the
				// subscriber callbacks fan out.
				gossipsub.addEventListener(mapped, (evt) => {
					const payload = new TextDecoder().decode(evt.detail.data);
					handlers.get(mapped)?.(payload);
				});
				await gossipsub.subscribe(mapped);
				unsubs.push(() => gossipsub.unsubscribe(mapped));
			}
			return () => {
				for (const unsub of unsubs) unsub();
				for (const mapped of mapTopics(topic)) handlers.delete(mapped);
			};
		},
	};
}

function mapTopics(topic: string): string[] {
	if (topic === "*") return ["/agentmesh/models/1.0.0"];
	return [topic];
}

