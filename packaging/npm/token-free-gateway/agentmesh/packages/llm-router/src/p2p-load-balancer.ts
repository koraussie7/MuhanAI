import { p2pNodeRegistry } from "./p2p-node-registry.js";
import type {
	DeviceNodeInfo,
	InferenceRequest,
	LoadBalancingStrategy,
} from "@agentmesh/peer-mesh";

export class P2pLoadBalancer {
	private strategy: LoadBalancingStrategy;
	private roundRobinIndex = 0;

	constructor(strategy?: LoadBalancingStrategy) {
		this.strategy = strategy ?? "least_loaded";
	}

	setStrategy(strategy: LoadBalancingStrategy): void {
		this.strategy = strategy;
	}

	selectNode(request: InferenceRequest, registry = p2pNodeRegistry): DeviceNodeInfo | null {
		const candidates = registry.getNodesByModel(request.model);

		if (candidates.length === 0) {
			return null;
		}

		switch (this.strategy) {
			case "least_loaded":
				return this.selectLeastLoaded(candidates);
			case "round_robin":
				return this.selectRoundRobin(candidates);
			case "capacity_based":
				return this.selectCapacityBased(candidates);
			case "latency_optimized":
				return this.selectLatencyOptimized(candidates);
			default:
				return this.selectLeastLoaded(candidates);
		}
	}

	private selectLeastLoaded(nodes: DeviceNodeInfo[]): DeviceNodeInfo {
		return nodes.reduce((best, node) => {
			const bestLoad = this.effectiveLoad(best);
			const nodeLoad = this.effectiveLoad(node);
			return nodeLoad < bestLoad ? node : best;
		});
	}

	private selectRoundRobin(nodes: DeviceNodeInfo[]): DeviceNodeInfo {
		const node = nodes[this.roundRobinIndex % nodes.length];
		this.roundRobinIndex++;
		return node!;
	}

	private selectCapacityBased(nodes: DeviceNodeInfo[]): DeviceNodeInfo {
		return nodes.reduce((best, node) => {
			const bestScore = this.calculateCapacityScore(best);
			const nodeScore = this.calculateCapacityScore(node);
			return nodeScore > bestScore ? node : best;
		});
	}

	private selectLatencyOptimized(nodes: DeviceNodeInfo[]): DeviceNodeInfo {
		return nodes.reduce((best, node) =>
			this.effectiveLatency(node) < this.effectiveLatency(best) ? node : best
		);
	}

	/** Battery + thermal penalty shared by every strategy (모바일 특화). */
	private mobilePenalty(node: DeviceNodeInfo): number {
		let penalty = 1;
		const battery = node.capabilities.batteryLevel;
		if (battery !== undefined) {
			if (battery < 10) penalty *= 0.3;
			else if (battery < 20) penalty *= 0.5;
			else if (battery < 35) penalty *= 0.8;
		}
		if (node.capabilities.networkType === "cellular") penalty *= 0.9;
		if (node.capabilities.thermalState === "warm") penalty *= 0.7;
		else if (node.capabilities.thermalState === "hot") penalty *= 0.3;
		return penalty;
	}

	private effectiveLoad(node: DeviceNodeInfo): number {
		const cores = Math.max(1, node.capabilities.cpuCores);
		return node.metrics.activeRequests / cores / this.mobilePenalty(node);
	}

	private effectiveLatency(node: DeviceNodeInfo): number {
		return node.metrics.avgResponseTime / this.mobilePenalty(node);
	}

	private calculateCapacityScore(node: DeviceNodeInfo): number {
		let score = node.capabilities.cpuCores * 10;

		if (node.capabilities.gpuAvailable) {
			score += (node.capabilities.gpuMemory ?? 0) / 1024;
		}

		// Available RAM (GB) slightly boosts capacity.
		score += Math.max(0, node.capabilities.ramAvailable) / 1024;

		score *= 1 - Math.min(0.9, node.metrics.cpuUsage / 100);
		score *= 1 - Math.min(0.9, node.metrics.activeRequests / 10);
		score *= this.mobilePenalty(node);

		return score;
	}

	getStrategy(): LoadBalancingStrategy {
		return this.strategy;
	}
}

export const p2pLoadBalancer = new P2pLoadBalancer();
