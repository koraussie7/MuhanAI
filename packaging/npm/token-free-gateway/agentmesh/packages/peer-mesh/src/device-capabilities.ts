export type DeviceNodeType = "mobile" | "desktop" | "server" | "browser";

export type DevicePlatform =
	| "ios"
	| "android"
	| "harmonyos"
	| "tvos"
	| "macos"
	| "linux"
	| "windows"
	| "web";

export type NodeStatus = "healthy" | "degraded" | "offline";

export interface DeviceCapabilities {
	deviceType: DeviceNodeType;
	platform: DevicePlatform;
	cpuCores: number;
	ramTotal: number;
	ramAvailable: number;
	gpuAvailable: boolean;
	gpuMemory?: number;
	maxContextLength: number;
	supportedModels: string[];
	supportsStreaming: boolean;
	batteryLevel?: number;
	thermalState?: "normal" | "warm" | "hot";
	networkType?: "wifi" | "cellular" | "ethernet" | "unknown";
}

export interface DeviceMetrics {
	activeRequests: number;
	totalRequests: number;
	avgResponseTime: number;
	tokensPerSecond: number;
	cpuUsage: number;
	memoryUsage: number;
	gpuUsage?: number;
	batteryDrainRate?: number;
}

export interface DeviceNodeInfo {
	id: string;
	peerId: string;
	type: DeviceNodeType;
	platform: DevicePlatform;
	host: string;
	port: number;
	status: NodeStatus;
	capabilities: DeviceCapabilities;
	metrics: DeviceMetrics;
	lastSeen: number;
	ownerId?: string;
}

export interface InferenceRequest {
	id: string;
	model: string;
	messages: Message[];
	temperature?: number;
	maxTokens?: number;
	stream?: boolean;
	topP?: number;
	frequencyPenalty?: number;
	presencePenalty?: number;
}

export interface Message {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface InferenceResponse {
	id: string;
	model: string;
	choices: Choice[];
	usage: Usage;
	created: number;
}

export interface Choice {
	index: number;
	message: Message;
	finishReason: "stop" | "length" | "error";
}

export interface Usage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
}

export type LoadBalancingStrategy =
	| "least_loaded"
	| "round_robin"
	| "capacity_based"
	| "latency_optimized";

export interface ClusterConfig {
	loadBalancingStrategy: LoadBalancingStrategy;
	healthCheckInterval: number;
	nodeTimeoutMs: number;
	enableP2PDiscovery: boolean;
}

export interface InferenceResult {
	text: string;
	promptTokens: number;
	completionTokens: number;
	tokensPerSecond: number;
	latencyMs: number;
}
