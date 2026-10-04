/**
 * P2PCLAW Distributed Inference Gateway — Part 2
 *
 * Shared types and routing logic for Free Token Gateway.
 * Compatible with Hermes, OpenClaw, Unsloth OpenAI-compatible endpoints.
 */

export type PrivacyPolicy = "local-only" | "trusted-peers" | "public";

export type QuantizationFormat =
	| "q4_k_m"
	| "q4_k_s"
	| "q5_k_m"
	| "q5_k_s"
	| "q8_0"
	| "f16"
	| "f32"
	| "bf16"
	| "gptq-4bit"
	| "awq-4bit"
	| "exl2-4bit"
	| "other";

export type ComputeBackend = "cuda" | "metal" | "vulkan" | "cpu" | "webgpu" | "rocm";

export interface PeerModelCapability {
	modelId: string;
	modelVersion: string;
	format: "gguf" | "safetensors" | "onnx" | "mlx" | "other";
	quantization: QuantizationFormat;
	backend: ComputeBackend;
	contextLength: number;
	vramRequiredMb: number;
	ramRequiredMb: number;
	estimatedTps: number;
	supportsStreaming: boolean;
	supportsTools: boolean;
	supportsVision: boolean;
	lastBenchmarkedAt: number;
}

export interface PeerCapabilityAdvertisement {
	peerId: string;
	peerName?: string;
	platform: "android" | "macos" | "windows" | "linux" | "raspberry-pi" | "browser" | "unknown";
	models: PeerModelCapability[];
	reputationScore: number;
	healthScore: number;
	cacheHitRate: number;
	avgLatencyMs: number;
	throughputTps: number;
	availableVramMb: number;
	availableRamMb: number;
	lastSeen: number;
	privacyPolicy: PrivacyPolicy;
	trustedPeerIds?: string[];
	status: "healthy" | "degraded" | "offline";
}

export interface P2PInferenceTask {
	taskId: string;
	modelId: string;
	modelVersion?: string;
	messages: P2PMessage[];
	temperature?: number;
	maxTokens?: number;
	stream?: boolean;
	topP?: number;
	tools?: P2PTool[];
	toolChoice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
	privacyPolicy: PrivacyPolicy;
	requesterPeerId: string;
	provenance: TaskProvenance;
	createdAt: number;
	deadlineMs?: number;
	trustedPeerIds?: string[];
}

export interface P2PMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string;
	toolCallId?: string;
	name?: string;
	toolCalls?: P2PToolCall[];
}

export interface P2PToolCall {
	id: string;
	type: "function";
	function: {
		name: string;
		arguments: string;
	};
}

export interface P2PTool {
	type: "function";
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
}

export interface TaskProvenance {
	requestId: string;
	sessionId?: string;
	userId?: string;
	origin: "api" | "p2p" | "cli" | "web";
	metadata?: Record<string, unknown>;
}

export interface P2PInferenceResult {
	taskId: string;
	modelId: string;
	modelVersion: string;
	peerId: string;
	choices: P2PChoice[];
	usage: P2PUsage;
	latencyMs: number;
	ttftMs?: number;
	tokensPerSecond: number;
	provenance: ResultProvenance;
	createdAt: number;
}

export interface P2PChoice {
	index: number;
	message: P2PMessage;
	finishReason: "stop" | "length" | "tool_calls" | "error" | "content_filter";
}

export interface P2PUsage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
}

export interface ResultProvenance {
	sourcePeerId: string;
	sourcePlatform: string;
	modelQuantization: string;
	modelBackend: string;
	cacheHit: boolean;
	verificationHash?: string;
	quorumResults?: QuorumResult[];
}

export interface QuorumResult {
	peerId: string;
	resultHash: string;
	agreementScore: number;
}

export interface GatewayRoutingConfig {
	defaultPrivacyPolicy: PrivacyPolicy;
	trustedPeerIds: string[];
	selectionWeights: SelectionWeights;
	timeoutMs: number;
	maxRetries: number;
	retryDelayMs: number;
	quorumThreshold: number;
	quorumMinPeers: number;
	fallbackToLocal: boolean;
	localModelId?: string;
}

export interface SelectionWeights {
	cacheAvailability: number;
	latency: number;
	health: number;
	reputation: number;
	throughput: number;
}

export interface PeerScore {
	peerId: string;
	score: number;
	breakdown: {
		cacheAvailability: number;
		latency: number;
		health: number;
		reputation: number;
		throughput: number;
	};
}

export interface InferenceRoute {
	selectedPeerId: string;
	alternatives: string[];
	reason: string;
	estimatedLatencyMs: number;
	privacyPolicy: PrivacyPolicy;
}

const DEFAULT_CONFIG: GatewayRoutingConfig = {
	defaultPrivacyPolicy: "trusted-peers",
	trustedPeerIds: [],
	selectionWeights: {
		cacheAvailability: 0.25,
		latency: 0.25,
		health: 0.2,
		reputation: 0.15,
		throughput: 0.15,
	},
	timeoutMs: 30000,
	maxRetries: 3,
	retryDelayMs: 1000,
	quorumThreshold: 0.66,
	quorumMinPeers: 3,
	fallbackToLocal: true,
};

export function createGatewayConfig(overrides: Partial<GatewayRoutingConfig>): GatewayRoutingConfig {
	return { ...DEFAULT_CONFIG, ...overrides, selectionWeights: { ...DEFAULT_CONFIG.selectionWeights, ...overrides.selectionWeights } };
}

export function calculatePeerScores(
	peers: PeerCapabilityAdvertisement[],
	task: P2PInferenceTask,
	weights: SelectionWeights
): PeerScore[] {
	const eligible = filterEligiblePeers(peers, task);
	return eligible.map(peer => {
		const cacheScore = peer.cacheHitRate;
		const latencyScore = peer.avgLatencyMs > 0 ? Math.max(0, 1 - peer.avgLatencyMs / 5000) : 0.5;
		const healthScore = peer.healthScore;
		const reputationScore = Math.min(1, peer.reputationScore / 100);
		const throughputScore = peer.throughputTps > 0 ? Math.min(1, peer.throughputTps / 100) : 0;

		const score =
			cacheScore * weights.cacheAvailability +
			latencyScore * weights.latency +
			healthScore * weights.health +
			reputationScore * weights.reputation +
			throughputScore * weights.throughput;

		return {
			peerId: peer.peerId,
			score,
			breakdown: { cacheAvailability: cacheScore, latency: latencyScore, health: healthScore, reputation: reputationScore, throughput: throughputScore },
		};
	}).sort((a, b) => b.score - a.score);
}

function filterEligiblePeers(peers: PeerCapabilityAdvertisement[], task: P2PInferenceTask): PeerCapabilityAdvertisement[] {
	return peers.filter(peer => {
		if (peer.peerId === task.requesterPeerId) return false;
		if (peer.status === "offline") return false;
		const hasModel = peer.models.some(m =>
			m.modelId === task.modelId &&
			(task.modelVersion ? m.modelVersion === task.modelVersion : true) &&
			m.contextLength >= estimateContextTokens(task.messages)
		);
		if (!hasModel) return false;

		switch (task.privacyPolicy) {
			case "local-only":
				return peer.peerId === task.requesterPeerId;
			case "trusted-peers":
				return task.trustedPeerIds?.includes(peer.peerId) ?? false;
			case "public":
				return true;
		}
	});
}

function estimateContextTokens(messages: P2PMessage[]): number {
	return messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
}

export function selectInferenceRoute(
	scores: PeerScore[],
	task: P2PInferenceTask,
	config: GatewayRoutingConfig
): InferenceRoute | null {
	if (scores.length === 0) return null;
	const top = scores[0];
	if (!top) return null;
	const alternatives = scores.slice(1, 4).map(s => s.peerId);
	return {
		selectedPeerId: top.peerId,
		alternatives,
		reason: `Selected ${top.peerId} (score: ${top.score.toFixed(3)})`,
		estimatedLatencyMs: top.breakdown.latency > 0 ? Math.round(5000 * (1 - top.breakdown.latency)) : 2000,
		privacyPolicy: task.privacyPolicy,
	};
}

export async function executeWithRetry<T>(
	fn: () => Promise<T>,
	config: GatewayRoutingConfig,
	onRetry?: (attempt: number, error: Error) => void
): Promise<T> {
	let lastError: Error | undefined;
	for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
		try {
			return await withTimeout(fn(), config.timeoutMs);
		} catch (e) {
			lastError = e as Error;
			if (attempt < config.maxRetries) {
				onRetry?.(attempt + 1, lastError);
				await sleep(config.retryDelayMs * (attempt + 1));
			}
		}
	}
	throw lastError;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), ms);
	try {
		return await promise;
	} catch (e) {
		if ((e as Error).name === "AbortError") throw new Error(`Timeout after ${ms}ms`);
		throw e;
	} finally {
		clearTimeout(timeout);
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export async function executeQuorum(
	task: P2PInferenceTask,
	peers: string[],
	executeFn: (peerId: string) => Promise<P2PInferenceResult>,
	config: GatewayRoutingConfig
): Promise<P2PInferenceResult> {
	if (peers.length === 0) throw new Error("No peers available");
	const firstPeer = peers[0]!;
	if (peers.length < config.quorumMinPeers) {
		return executeFn(firstPeer);
	}

	const results = await Promise.allSettled(peers.slice(0, config.quorumMinPeers).map(p => executeFn(p)));
	const successful = results.filter(r => r.status === "fulfilled") as PromiseFulfilledResult<P2PInferenceResult>[];

	if (successful.length === 0) {
		return executeFn(firstPeer);
	}
	const firstSuccessful = successful[0]!;
	if (successful.length < config.quorumMinPeers) {
		return firstSuccessful.value ?? (await executeFn(firstPeer));
	}

	const agreement = calculateAgreement(successful.map(r => r.value));
	if (agreement >= config.quorumThreshold) {
		return firstSuccessful.value;
	}

	return firstSuccessful.value;
}

function calculateAgreement(results: P2PInferenceResult[]): number {
	if (results.length <= 1) return 1;
	const firstText = results[0]?.choices[0]?.message.content ?? "";
	let matches = 0;
	for (let i = 1; i < results.length; i++) {
		const text = results[i]?.choices[0]?.message.content ?? "";
		if (text === firstText) matches++;
	}
	return matches / (results.length - 1);
}

export interface OpenAICompatibleRequest {
	model: string;
	messages: OpenAICompatibleMessage[];
	temperature?: number;
	max_tokens?: number;
	stream?: boolean;
	top_p?: number;
	tools?: OpenAICompatibleTool[];
	tool_choice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
}

export interface OpenAICompatibleMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string | null;
	tool_call_id?: string;
	name?: string;
	tool_calls?: OpenAICompatibleToolCall[];
}

export interface OpenAICompatibleToolCall {
	id: string;
	type: "function";
	function: { name: string; arguments: string };
}

export interface OpenAICompatibleTool {
	type: "function";
	function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface OpenAICompatibleResponse {
	id: string;
	object: string;
	created: number;
	model: string;
	choices: OpenAICompatibleChoice[];
	usage: OpenAICompatibleUsage;
}

export interface OpenAICompatibleChoice {
	index: number;
	message: OpenAICompatibleMessage;
	finish_reason: "stop" | "length" | "tool_calls" | "content_filter";
}

export interface OpenAICompatibleUsage {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
}

export function toOpenAIRequest(task: P2PInferenceTask): OpenAICompatibleRequest {
	return {
		model: task.modelId,
		messages: task.messages.map(m => ({
			role: m.role,
			content: m.content,
			tool_call_id: m.toolCallId,
			name: m.name,
			tool_calls: m.toolCalls?.map(tc => ({
				id: tc.id,
				type: "function",
				function: { name: tc.function.name, arguments: tc.function.arguments },
			})),
		})),
		temperature: task.temperature,
		max_tokens: task.maxTokens,
		stream: task.stream,
		top_p: task.topP,
		tools: task.tools?.map(t => ({
			type: "function",
			function: { name: t.function.name, description: t.function.description, parameters: t.function.parameters },
		})),
		tool_choice: task.toolChoice,
	};
}

export function fromOpenAIResponse(
	response: OpenAICompatibleResponse,
	task: P2PInferenceTask,
	peerId: string,
	provenance: ResultProvenance
): P2PInferenceResult {
	return {
		taskId: task.taskId,
		modelId: response.model,
		modelVersion: task.modelVersion ?? "unknown",
		peerId,
		choices: response.choices.map(c => ({
			index: c.index,
			message: {
				role: c.message.role,
				content: c.message.content ?? "",
				tool_call_id: c.message.tool_call_id,
				name: c.message.name,
				tool_calls: c.message.tool_calls?.map(tc => ({
					id: tc.id,
					type: "function",
					function: { name: tc.function.name, arguments: tc.function.arguments },
				})),
			},
			finishReason: c.finish_reason,
		})),
		usage: {
			promptTokens: response.usage.prompt_tokens,
			completionTokens: response.usage.completion_tokens,
			totalTokens: response.usage.total_tokens,
		},
		latencyMs: 0,
		ttftMs: undefined,
		tokensPerSecond: response.usage.completion_tokens > 0 ? response.usage.completion_tokens / (response.usage.total_tokens / 1000) : 0,
		provenance,
		createdAt: Date.now(),
	};
}

export interface SecureLogEntry {
	timestamp: number;
	level: "debug" | "info" | "warn" | "error";
	event: string;
	taskId?: string;
	peerId?: string;
	modelId?: string;
	metadata?: Record<string, unknown>;
}

export function createSecureLogger(prefix: string) {
	return {
		debug: (event: string, meta?: Omit<SecureLogEntry, "timestamp" | "level" | "event">) => log("debug", event, meta),
		info: (event: string, meta?: Omit<SecureLogEntry, "timestamp" | "level" | "event">) => log("info", event, meta),
		warn: (event: string, meta?: Omit<SecureLogEntry, "timestamp" | "level" | "event">) => log("warn", event, meta),
		error: (event: string, meta?: Omit<SecureLogEntry, "timestamp" | "level" | "event">) => log("error", event, meta),
	};

	function log(level: SecureLogEntry["level"], event: string, meta?: Omit<SecureLogEntry, "timestamp" | "level" | "event">) {
		const entry: SecureLogEntry = {
			timestamp: Date.now(),
			level,
			event: `[${prefix}] ${event}`,
			...meta,
		};
		const safeMeta = sanitizeMetadata(entry.metadata);
		console[level](JSON.stringify({ ...entry, metadata: safeMeta }));
	}
}

export function sanitizeMetadata(meta?: Record<string, unknown>): Record<string, unknown> {
	if (!meta) return {};
	const forbidden = ["prompt", "messages", "content", "authorization", "apikey", "secret", "token", "password", "privatekey"];
	const safe: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(meta)) {
		const kl = k.toLowerCase();
		if (forbidden.some(f => kl === f || kl.endsWith(f) || kl.includes(f + "_") || kl.includes(f + "-"))) {
			safe[k] = "[REDACTED]";
		} else if (typeof v === "object" && v !== null) {
			safe[k] = sanitizeMetadata(v as Record<string, unknown>);
		} else {
			safe[k] = v;
		}
	}
	return safe;
}