import type {
	DeviceNodeInfo,
	DeviceCapabilities,
	DeviceMetrics,
	ClusterConfig,
	InferenceRequest,
	InferenceResponse,
	InferenceResult,
} from "@agentmesh/peer-mesh";
import { p2pNodeRegistry } from "@agentmesh/llm-router";

export const DEVICE_HEARTBEAT_INTERVAL_MS = 5_000;
export const DEVICE_NODE_TIMEOUT_MS = 30_000;

export interface DeviceNodeDaemonOptions {
	nodeId: string;
	capabilities: DeviceCapabilities;
	host: string;
	port: number;
	ownerId?: string;
	onInference?: (req: InferenceRequest) => Promise<InferenceResult>;
	config?: Partial<ClusterConfig>;
}

export class DeviceNodeDaemon {
	private nodeInfo: DeviceNodeInfo;
	private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
	private readonly heartbeatIntervalMs: number;
	private activeRequests = 0;
	private totalRequests = 0;
	private totalLatencyMs = 0;
	private totalTokensGenerated = 0;
	private onInference?: (req: InferenceRequest) => Promise<InferenceResult>;

	constructor(opts: DeviceNodeDaemonOptions) {
		this.onInference = opts.onInference;
		this.heartbeatIntervalMs =
			opts.config?.healthCheckInterval ?? DEVICE_HEARTBEAT_INTERVAL_MS;
		this.nodeInfo = {
			id: opts.nodeId,
			peerId: opts.nodeId,
			type: opts.capabilities.deviceType,
			platform: opts.capabilities.platform,
			host: opts.host,
			port: opts.port,
			status: "healthy",
			capabilities: opts.capabilities,
			metrics: this.createEmptyMetrics(),
			lastSeen: Date.now(),
			ownerId: opts.ownerId,
		};
	}

	start(): void {
		p2pNodeRegistry.registerNode(this.nodeInfo);
		this.startHeartbeat();
	}

	stop(): void {
		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
			this.heartbeatInterval = null;
		}
		p2pNodeRegistry.removeNode(this.nodeInfo.id);
	}

	getNodeInfo(): DeviceNodeInfo {
		return { ...this.nodeInfo };
	}

	async handleInference(req: InferenceRequest): Promise<InferenceResponse> {
		const start = Date.now();
		this.activeRequests++;
		this.totalRequests++;

		try {
			let result: InferenceResult;

			if (this.onInference) {
				result = await this.onInference(req);
			} else {
				result = {
					text: `[mock] received ${req.messages.length} messages for model ${req.model}`,
					promptTokens: req.messages.reduce((sum, m) => sum + m.content.length / 4, 0),
					completionTokens: 10,
					tokensPerSecond: 0,
					latencyMs: 0,
				};
			}

			const latencyMs = Date.now() - start;
			this.totalLatencyMs += latencyMs;
			this.totalTokensGenerated += result.completionTokens;

			this.updateMetrics(latencyMs, result.tokensPerSecond);

			return {
				id: req.id,
				model: req.model,
				choices: [
					{
						index: 0,
						message: { role: "assistant", content: result.text },
						finishReason: "stop",
					},
				],
				usage: {
					promptTokens: result.promptTokens,
					completionTokens: result.completionTokens,
					totalTokens: result.promptTokens + result.completionTokens,
				},
				created: Date.now(),
			};
		} catch (err) {
			p2pNodeRegistry.updateNode(this.nodeInfo.id, { status: "degraded" });
			throw err;
		} finally {
			this.activeRequests--;
		}
	}

	getMetrics(): DeviceMetrics {
		return {
			activeRequests: this.activeRequests,
			totalRequests: this.totalRequests,
			avgResponseTime: this.totalRequests > 0 ? this.totalLatencyMs / this.totalRequests : 0,
			tokensPerSecond: this.nodeInfo.metrics.tokensPerSecond,
			cpuUsage: this.nodeInfo.metrics.cpuUsage,
			memoryUsage: this.nodeInfo.metrics.memoryUsage,
			gpuUsage: this.nodeInfo.metrics.gpuUsage,
			batteryDrainRate: this.nodeInfo.metrics.batteryDrainRate,
		};
	}

	updateCapabilities(capabilities: Partial<DeviceCapabilities>): void {
		this.nodeInfo.capabilities = { ...this.nodeInfo.capabilities, ...capabilities };
		p2pNodeRegistry.updateNode(this.nodeInfo.id, {
			capabilities: this.nodeInfo.capabilities,
		});
	}

	updateMetrics(latencyMs: number, tokensPerSecond: number): void {
		const metrics: DeviceMetrics = {
			activeRequests: this.activeRequests,
			totalRequests: this.totalRequests,
			avgResponseTime: this.totalRequests > 0 ? this.totalLatencyMs / this.totalRequests : 0,
			tokensPerSecond,
			cpuUsage: this.nodeInfo.metrics.cpuUsage,
			memoryUsage: this.nodeInfo.metrics.memoryUsage,
			gpuUsage: this.nodeInfo.metrics.gpuUsage,
			batteryDrainRate: this.nodeInfo.metrics.batteryDrainRate,
		};

		this.nodeInfo.metrics = metrics;
		p2pNodeRegistry.updateNode(this.nodeInfo.id, { metrics });
	}

	private startHeartbeat(): void {
		if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
		this.heartbeatInterval = setInterval(() => {
			p2pNodeRegistry.heartbeat(this.nodeInfo.id);
		}, this.heartbeatIntervalMs);
		// Allow Node.js to exit even if the daemon is still running.
		if (typeof (this.heartbeatInterval as unknown as { unref?: () => void }).unref === "function") {
			(this.heartbeatInterval as unknown as { unref: () => void }).unref();
		}
	}

	private createEmptyMetrics(): DeviceMetrics {
		return {
			activeRequests: 0,
			totalRequests: 0,
			avgResponseTime: 0,
			tokensPerSecond: 0,
			cpuUsage: 0,
			memoryUsage: 0,
		};
	}
}
