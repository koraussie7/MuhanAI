import { describe, expect, it } from "vitest";
import {
	PrivacyPolicy,
	PeerModelCapability,
	PeerCapabilityAdvertisement,
	P2PInferenceTask,
	P2PInferenceResult,
	GatewayRoutingConfig,
	createGatewayConfig,
	calculatePeerScores,
	selectInferenceRoute,
	executeWithRetry,
	toOpenAIRequest,
	fromOpenAIResponse,
	createSecureLogger,
	sanitizeMetadata,
	type SelectionWeights,
	type InferenceRoute,
	type SecureLogEntry,
	type OpenAICompatibleResponse,
} from "./p2p-inference.js";

const mockPeer: PeerCapabilityAdvertisement = {
	peerId: "peer-1",
	peerName: "test-peer",
	platform: "linux",
	models: [{
		modelId: "llama-3-8b",
		modelVersion: "1.0",
		format: "gguf",
		quantization: "q4_k_m",
		backend: "cuda",
		contextLength: 8192,
		vramRequiredMb: 6000,
		ramRequiredMb: 2000,
		estimatedTps: 50,
		supportsStreaming: true,
		supportsTools: true,
		supportsVision: false,
		lastBenchmarkedAt: Date.now(),
	}],
	reputationScore: 85,
	healthScore: 0.95,
	cacheHitRate: 0.8,
	avgLatencyMs: 200,
	throughputTps: 45,
	availableVramMb: 8000,
	availableRamMb: 16000,
	lastSeen: Date.now(),
	privacyPolicy: "public",
	trustedPeerIds: [],
	status: "healthy",
};

const mockTask: P2PInferenceTask = {
	taskId: "task-1",
	modelId: "llama-3-8b",
	messages: [{ role: "user", content: "Hello" }],
	privacyPolicy: "public",
	requesterPeerId: "requester-1",
	provenance: { requestId: "req-1", origin: "api" },
	createdAt: Date.now(),
};

describe("p2p-inference types and routing", () => {
	it("creates default gateway config", () => {
		const config = createGatewayConfig({});
		expect(config.defaultPrivacyPolicy).toBe("trusted-peers");
		expect(config.timeoutMs).toBe(30000);
		expect(config.maxRetries).toBe(3);
		expect(config.quorumThreshold).toBe(0.66);
	});

	it("merges custom config overrides", () => {
		const config = createGatewayConfig({ timeoutMs: 60000, maxRetries: 5, defaultPrivacyPolicy: "local-only" });
		expect(config.timeoutMs).toBe(60000);
		expect(config.maxRetries).toBe(5);
		expect(config.defaultPrivacyPolicy).toBe("local-only");
		expect(config.selectionWeights.cacheAvailability).toBe(0.25);
	});

it("calculates peer scores with all weights", () => {
		const weights: SelectionWeights = { cacheAvailability: 0.25, latency: 0.25, health: 0.2, reputation: 0.15, throughput: 0.15 };
		const scores = calculatePeerScores([mockPeer], mockTask, weights);
		expect(scores).toHaveLength(1);
		const firstScore = scores[0]!;
		expect(firstScore.peerId).toBe("peer-1");
		expect(firstScore.score).toBeGreaterThan(0);
		expect(firstScore.score).toBeLessThanOrEqual(1);
		expect(firstScore.breakdown).toEqual(expect.objectContaining({
			cacheAvailability: expect.any(Number),
			latency: expect.any(Number),
			health: expect.any(Number),
			reputation: expect.any(Number),
			throughput: expect.any(Number),
		}));
	});

	it("filters peers by privacy policy: local-only", () => {
		const localTask = { ...mockTask, privacyPolicy: "local-only" as PrivacyPolicy };
		const scores = calculatePeerScores([mockPeer], localTask, createGatewayConfig({}).selectionWeights);
		expect(scores).toHaveLength(0);
	});

	it("filters peers by privacy policy: trusted-peers", () => {
		const trustedTask = { ...mockTask, privacyPolicy: "trusted-peers" as PrivacyPolicy, trustedPeerIds: ["peer-2"] };
		const scores = calculatePeerScores([mockPeer], trustedTask, createGatewayConfig({}).selectionWeights);
		expect(scores).toHaveLength(0);

		const allowedTask = { ...mockTask, privacyPolicy: "trusted-peers" as PrivacyPolicy, trustedPeerIds: ["peer-1"] };
		const allowedScores = calculatePeerScores([mockPeer], allowedTask, createGatewayConfig({}).selectionWeights);
		expect(allowedScores).toHaveLength(1);
	});

	it("filters peers by model availability", () => {
		const wrongModelTask = { ...mockTask, modelId: "non-existent-model" };
		const scores = calculatePeerScores([mockPeer], wrongModelTask, createGatewayConfig({}).selectionWeights);
		expect(scores).toHaveLength(0);
	});

	it("selects inference route from scored peers", () => {
		const scores = calculatePeerScores([mockPeer], mockTask, createGatewayConfig({}).selectionWeights);
		const route = selectInferenceRoute(scores, mockTask, createGatewayConfig({}));
		expect(route).not.toBeNull();
		expect(route!.selectedPeerId).toBe("peer-1");
		expect(route!.alternatives).toEqual([]);
		expect(route!.privacyPolicy).toBe("public");
	});

	it("returns null route when no eligible peers", () => {
		const route = selectInferenceRoute([], mockTask, createGatewayConfig({}));
		expect(route).toBeNull();
	});

	it("executes with retry and succeeds on first try", async () => {
		const result = await executeWithRetry(async () => "success", createGatewayConfig({ maxRetries: 3, retryDelayMs: 10 }));
		expect(result).toBe("success");
	});

	it("executes with retry and retries on failure", async () => {
		let attempts = 0;
		const config = createGatewayConfig({ maxRetries: 3, retryDelayMs: 5, timeoutMs: 5000 });
		await expect(executeWithRetry(async () => {
			attempts++;
			if (attempts < 2) throw new Error("fail");
			return "success";
		}, config)).resolves.toBe("success");
		expect(attempts).toBe(2);
	});

	it("throws after max retries exhausted", async () => {
		const config = createGatewayConfig({ maxRetries: 2, retryDelayMs: 5, timeoutMs: 5000 });
		await expect(executeWithRetry(async () => { throw new Error("always fail"); }, config)).rejects.toThrow("always fail");
	});

	it("converts P2P task to OpenAI-compatible request", () => {
		const task: P2PInferenceTask = {
			...mockTask,
			modelId: "llama-3-8b",
			messages: [
				{ role: "system", content: "You are helpful" },
				{ role: "user", content: "Hello" },
			],
			temperature: 0.7,
			maxTokens: 100,
			stream: true,
			topP: 0.9,
		};
		const req = toOpenAIRequest(task);
		expect(req.model).toBe("llama-3-8b");
		expect(req.messages).toHaveLength(2);
		expect(req.temperature).toBe(0.7);
		expect(req.max_tokens).toBe(100);
		expect(req.stream).toBe(true);
		expect(req.top_p).toBe(0.9);
	});

	it("converts OpenAI response to P2P result with provenance", () => {
		const openAIResp: OpenAICompatibleResponse = {
			id: "chatcmpl-1",
			object: "chat.completion",
			created: Date.now(),
			model: "llama-3-8b",
			choices: [{ index: 0, message: { role: "assistant" as const, content: "Hi there!" }, finish_reason: "stop" }],
			usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
		};
		const provenance = { sourcePeerId: "peer-1", sourcePlatform: "linux", modelQuantization: "q4_k_m", modelBackend: "cuda", cacheHit: false };
		const result = fromOpenAIResponse(openAIResp, mockTask, "peer-1", provenance);
		expect(result.taskId).toBe("task-1");
		expect(result.peerId).toBe("peer-1");
		expect(result.choices[0]!.message.content).toBe("Hi there!");
		expect(result.usage.totalTokens).toBe(15);
		expect(result.provenance).toEqual(provenance);
	});
});

describe("sanitizeMetadata", () => {
	it("redacts sensitive fields", () => {
		const input = {
			prompt: "secret",
			messages: [{ role: "user", content: "secret" }],
			authorization: "Bearer secret",
			apiKey: "key123",
			normalField: "visible",
			nested: { secret: "value", normal: "ok" },
		};
		const result = sanitizeMetadata(input);
		expect(result.prompt).toBe("[REDACTED]");
		expect(result.messages).toBe("[REDACTED]");
		expect(result.authorization).toBe("[REDACTED]");
		expect(result.apiKey).toBe("[REDACTED]");
		expect(result.normalField).toBe("visible");
		const nested = result.nested as Record<string, unknown>;
		expect(nested.secret).toBe("[REDACTED]");
		expect(nested.normal).toBe("ok");
	});

	it("handles null and undefined", () => {
		expect(sanitizeMetadata(undefined)).toEqual({});
		expect(sanitizeMetadata({})).toEqual({});
	});

	it("redacts nested sensitive keys", () => {
		const input = {
			config: { apiKey: "secret", token: "hidden", normal: "ok" },
			headers: { authorization: "Bearer token" },
		};
		const result = sanitizeMetadata(input);
		const config = result.config as Record<string, unknown>;
		const headers = result.headers as Record<string, unknown>;
		expect(config.apiKey).toBe("[REDACTED]");
		expect(config.token).toBe("[REDACTED]");
		expect(config.normal).toBe("ok");
		expect(headers.authorization).toBe("[REDACTED]");
	});

	it("preserves non-sensitive fields", () => {
		const input = { modelId: "llama", temperature: 0.7, maxTokens: 100 };
		const result = sanitizeMetadata(input);
		expect(result).toEqual(input);
	});
});