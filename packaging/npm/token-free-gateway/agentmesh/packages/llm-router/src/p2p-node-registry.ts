import type { DeviceNodeInfo, ClusterConfig } from "@agentmesh/peer-mesh";

const DEFAULT_CONFIG: ClusterConfig = {
	loadBalancingStrategy: "least_loaded",
	healthCheckInterval: 5_000,
	nodeTimeoutMs: 30_000,
	enableP2PDiscovery: true,
};

export type P2pNodesChangeCallback = (nodes: DeviceNodeInfo[]) => void;

export class P2pNodeRegistry {
	private nodes: Map<string, DeviceNodeInfo> = new Map();
	private nodeTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
	private config: ClusterConfig;
	private listeners: Set<P2pNodesChangeCallback> = new Set();

	constructor(config?: Partial<ClusterConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	registerNode(nodeInfo: DeviceNodeInfo): void {
		this.nodes.set(nodeInfo.id, {
			...nodeInfo,
			lastSeen: Date.now(),
			status: "healthy",
		});
		this.resetNodeTimeout(nodeInfo.id);
		this.emitChange();
	}

	/** 30s TTL heartbeat — refreshes lastSeen and revives the node. */
	heartbeat(nodeId: string): void {
		const existing = this.nodes.get(nodeId);
		if (!existing) return;
		this.nodes.set(nodeId, {
			...existing,
			lastSeen: Date.now(),
			status: "healthy",
		});
		this.resetNodeTimeout(nodeId);
		this.emitChange();
	}

	updateNode(nodeId: string, updates: Partial<DeviceNodeInfo>): void {
		const existing = this.nodes.get(nodeId);
		if (!existing) return;
		this.nodes.set(nodeId, { ...existing, ...updates, lastSeen: Date.now() });
		this.resetNodeTimeout(nodeId);
		this.emitChange();
	}

	removeNode(nodeId: string): void {
		this.nodes.delete(nodeId);
		const timeout = this.nodeTimeouts.get(nodeId);
		if (timeout) {
			clearTimeout(timeout);
			this.nodeTimeouts.delete(nodeId);
		}
		this.emitChange();
	}

	getNode(nodeId: string): DeviceNodeInfo | undefined {
		return this.nodes.get(nodeId);
	}

	getAllNodes(): DeviceNodeInfo[] {
		return Array.from(this.nodes.values());
	}

	getHealthyNodes(): DeviceNodeInfo[] {
		return this.getAllNodes().filter((node) => node.status === "healthy");
	}

	getNodesByModel(model: string): DeviceNodeInfo[] {
		return this.getHealthyNodes().filter((node) =>
			node.capabilities.supportedModels.includes(model),
		);
	}

	getNodesByPlatform(platform: string): DeviceNodeInfo[] {
		return this.getHealthyNodes().filter((node) => node.platform === platform);
	}

	onNodesChange(callback: P2pNodesChangeCallback): () => void {
		this.listeners.add(callback);
		return () => {
			this.listeners.delete(callback);
		};
	}

	/** Alias kept for callers expecting an `onChange` registration API. */
	onChange(callback: P2pNodesChangeCallback): () => void {
		return this.onNodesChange(callback);
	}

	getConfig(): ClusterConfig {
		return { ...this.config };
	}

	/** Remove all nodes and clear all TTL timers (useful for tests/teardown). */
	clear(): void {
		for (const timeout of this.nodeTimeouts.values()) clearTimeout(timeout);
		this.nodeTimeouts.clear();
		this.nodes.clear();
		this.emitChange();
	}

	private resetNodeTimeout(nodeId: string): void {
		const existing = this.nodeTimeouts.get(nodeId);
		if (existing) clearTimeout(existing);

		const timeout = setTimeout(() => {
			const node = this.nodes.get(nodeId);
			if (node && node.status !== "offline") {
				this.updateNode(nodeId, { status: "offline" });
			}
		}, this.config.nodeTimeoutMs);

		this.nodeTimeouts.set(nodeId, timeout);
	}

	private emitChange(): void {
		if (this.listeners.size === 0) return;
		const snapshot = this.getAllNodes();
		for (const listener of this.listeners) listener(snapshot);
	}
}

export const p2pNodeRegistry = new P2pNodeRegistry();
