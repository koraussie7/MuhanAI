import type { DeviceNodeInfo } from "@agentmesh/peer-mesh";
import type { ModelAnnouncementResult, ModelCatalog } from "./model-catalog.js";

export interface CatalogBridgeOptions {
	/** Default port a provider exposes its local inference endpoint on. */
	defaultPort?: number;
	/** Default device type when the manifest doesn't carry one. */
	defaultDeviceType?: DeviceNodeInfo["type"];
	/** Default platform when the manifest doesn't carry one. */
	defaultPlatform?: DeviceNodeInfo["platform"];
	/** Default maximum context length when the manifest doesn't carry one. */
	defaultMaxContextLength?: number;
	/** Default supported models list (when manifest has no `supportedModels` metadata). */
	defaultSupportedModels?: string[];
	now?: () => number;
}

export interface CatalogBridge {
	ingest(envelope: unknown): ModelAnnouncementResult;
	nodes(): DeviceNodeInfo[];
	onChange(listener: (nodes: DeviceNodeInfo[]) => void): () => void;
	dispose(): void;
}

/**
 * Bridges `@agentmesh/bitterbot`'s `ModelCatalog` (manifest announcements)
 * to `@agentmesh/llm-router`'s `P2pNodeRegistry` (per-peer `DeviceNodeInfo`
 * records the load balancer selects from).
 *
 * The two layers speak different vocabularies:
 *
 *   - `ModelCatalog` indexes one entry per `(model id, publisher)` and
 *     stores signed manifests with no host/port — a publisher is reachable
 *     only by its peer-id on the libp2p overlay, not by TCP.
 *   - `P2pNodeRegistry` indexes one entry per `node id`, where each node
 *     carries `host:port` and a `capabilities.supportedModels` list — the
 *     `P2pLoadBalancer` selects by that.
 *
 * The bridge fans announcements out: each accepted announcement becomes
 * one `DeviceNodeInfo` keyed by `<publisher>:<model-id>`. When the same
 * publisher announces a new manifest for the same model, the bridge
 * upserts in place. Announcements for `id === host:<port>`-style models
 * (used by the existing P2P HTTP inference fallback) are left untouched —
 * that surface is for HTTP nodes registered out-of-band, and the bridge
 * only converts Gossipsub-style manifest announcements.
 *
 * The bridge is intentionally read-only with respect to the registry: it
 * does not call `registerNode` directly. Callers (LLM router, web app)
 * own the registry and observe it via `onChange`.
 */
export function bridgeCatalogToNodeRegistry(
	catalog: ModelCatalog,
	options: CatalogBridgeOptions = {},
): CatalogBridge {
	const listeners = new Set<(nodes: DeviceNodeInfo[]) => void>();
	const defaultPort = options.defaultPort ?? 8080;
	const defaultType = options.defaultDeviceType ?? "desktop";
	const defaultPlatform = options.defaultPlatform ?? "linux";
	const defaultMaxContext = options.defaultMaxContextLength ?? 8192;
	const defaultModels = options.defaultSupportedModels ?? [];
	const now = options.now ?? Date.now;

	const project = (entry: {
		envelope: { publisher: string; manifest: { id: string; name?: string } };
	}) => {
		const manifest = entry.envelope.manifest;
		const nodeId = `gossip:${entry.envelope.publisher}:${manifest.id}`;
		return {
			id: nodeId,
			peerId: entry.envelope.publisher,
			type: defaultType,
			platform: defaultPlatform,
			host: entry.envelope.publisher,
			port: defaultPort,
			status: "healthy",
			capabilities: {
				deviceType: defaultType,
				platform: defaultPlatform,
				cpuCores: 1,
				ramTotal: 0,
				ramAvailable: 0,
				gpuAvailable: false,
				maxContextLength: defaultMaxContext,
				supportedModels: [manifest.id, ...defaultModels],
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
			ownerId: entry.envelope.publisher,
		} satisfies DeviceNodeInfo;
	};

	const nodes = (): DeviceNodeInfo[] => catalog.all().map(project);

	const fire = () => {
		if (listeners.size === 0) return;
		const snapshot = nodes();
		for (const listener of listeners) listener(snapshot);
	};

	const unsubscribe = catalog.onAccept(() => fire());

	return {
		ingest: (envelope) => catalog.announce(envelope),
		nodes,
		onChange: (listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		dispose: () => unsubscribe(),
	};
}
