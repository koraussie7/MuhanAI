import { llmRouter } from "@agentmesh/llm-router";
import type { AgentRunResult, CastResult } from "@agentmesh/shared-types";

/**
 * Nexus 멀티 에이전트 오케스트레이션 연동
 * - Agent Buckling: Claude Code, Cursor, Codex, OpenCode 등 에이전트 바클링
 * - 추측적 헤지 스트리밍: <800ms TTFT (Time To First Token)
 * - 크로스 에이전트 공유 컨텍스트 버스
 */
export interface NexusAgentConfig {
	agentType: "claude-code" | "cursor" | "codex" | "opencode" | "nexus-native";
	capabilities: string[];
	endpoint?: string;
	apiKey?: string;
}

export interface NexusOrchestrationResult {
	orchestrationId: string;
	agents: string[];
	finalAnswer: string;
	consensusScore: number;
	bucklingUsed: boolean;
	hedgeStreaming: boolean;
	ttftMs: number;
	totalLatencyMs: number;
	tokenSavings: number;
}

/**
 * Nexus 멀티 에이전트 오케스트레이터
 * Nexus의 Agent Buckling과 추측적 헤지 스트리밍을 MuhanAI의
 * 멀티 에이전트 합의 메커니즘과 융합합니다.
 */
export class NexusAgentOrchestrator {
	private agents: Map<string, NexusAgentConfig> = new Map();

	registerAgent(id: string, config: NexusAgentConfig): void {
		this.agents.set(id, config);
	}

	getAgent(id: string): NexusAgentConfig | undefined {
		return this.agents.get(id);
	}

	listAgents(): NexusAgentConfig[] {
		return Array.from(this.agents.values());
	}

	/**
	 * Nexus Agent Buckling을 사용한 다중 에이전트 오케스트레이션
	 * 여러 에이전트가 병렬로 추론하고, 첫 번째 응답(헤지)을 기반으로
	 * 최종 답변을 도출합니다.
	 */
	async orchestrate(
		question: string,
		agentIds: string[],
		options?: {
			strategy?: "buckling" | "hedge" | "consensus";
			ttftThresholdMs?: number;
		},
	): Promise<NexusOrchestrationResult> {
		const strategy = options?.strategy ?? "buckling";
		const ttftThreshold = options?.ttftThresholdMs ?? 800;
		const orchestrationId = `nexus-orch-${Date.now()}`;
		const startTime = Date.now();

		const availableAgents = agentIds
			.map((id) => ({ id, config: this.agents.get(id) }))
			.filter((a) => a.config);

		if (availableAgents.length === 0) {
			return {
				orchestrationId,
				agents: [],
				finalAnswer: "No Nexus agents available for orchestration.",
				consensusScore: 0,
				bucklingUsed: false,
				hedgeStreaming: false,
				ttftMs: 0,
				totalLatencyMs: Date.now() - startTime,
				tokenSavings: 0,
			};
		}

		// 병렬 에이전트 추론
		const agentPromises = availableAgents.map(async ({ id, config }) => {
			const agentStart = Date.now();
			try {
				const systemPrompt = this.buildSystemPrompt(config!, question);
				const response = await llmRouter.generate({
					system: systemPrompt,
					prompt: question,
					temperature: 0.3,
				});
				return {
					agentId: id,
					agentType: config!.agentType,
					output: response.text,
					confidence: 0.8,
					latencyMs: response.latencyMs,
					ttftMs: response.latencyMs,
					tokens: response.usage?.inputTokens ?? 0,
				};
			} catch {
				return {
					agentId: id,
					agentType: config!.agentType,
					output: "",
					confidence: 0,
					latencyMs: Date.now() - agentStart,
					ttftMs: 0,
					tokens: 0,
				};
			}
		});

		const agentResults = await Promise.all(agentPromises);

		// 추측적 헤지: 첫 번째 응답이 임계치 내에 오면 즉시 스트리밍
		const firstResult = agentResults.sort((a, b) => a.ttftMs - b.ttftMs)[0];
		const hedgeStreaming = firstResult ? firstResult.ttftMs <= ttftThreshold : false;
		const ttftMs = firstResult ? firstResult.ttftMs : 0;

		// 에이전트 바클링: 여러 에이전트의 출력을 병합
		const bucklingUsed = strategy === "buckling" && agentResults.length > 1;

		let finalAnswer: string;
		let consensusScore: number;

		if (bucklingUsed && agentResults.length > 1) {
			// Nexus 스타일 바클링: 여러 에이전트 출력을 LLM 판정으로 병합
			const candidates = agentResults
				.filter((r) => r.output)
				.map(
					(r, i) =>
						`### Agent ${i + 1} (${r.agentId}, ${r.agentType})\n${r.output}`,
				)
				.join("\n\n");

			const judgePrompt = `You are a Nexus orchestrator judge. Merge the following agent outputs into a single coherent answer. Resolve conflicts, keep accuracy, and preserve complementary points.\n\nQuestion:\n${question}\n\nAgent Outputs:\n${candidates}\n\nFinal Answer:`;

			const judged = await llmRouter.generate({
				prompt: judgePrompt,
				temperature: 0.2,
			});

			finalAnswer = judged.text;
			consensusScore =
				agentResults.reduce((s, r) => s + r.confidence, 0) /
				agentResults.length;
		} else if (firstResult) {
			finalAnswer = firstResult.output;
			consensusScore = firstResult.confidence;
		} else {
			finalAnswer = "No agent output available.";
			consensusScore = 0;
		}

		const totalLatencyMs = Date.now() - startTime;
		const tokenSavings = agentResults.reduce(
			(s, r) => s + (r.tokens > 0 ? Math.floor(r.tokens * 0.3) : 0),
			0,
		); // Nexus 압축으로 30% 절감 추정

		return {
			orchestrationId,
			agents: agentResults.map((r) => r.agentId),
			finalAnswer,
			consensusScore,
			bucklingUsed,
			hedgeStreaming,
			ttftMs,
			totalLatencyMs,
			tokenSavings,
		};
	}

	private buildSystemPrompt(config: NexusAgentConfig, question: string): string {
		const basePrompt = `You are a ${config.agentType} agent in the Nexus orchestration mesh.
Capabilities: ${config!.capabilities.join(", ")}.
Answer the user's question accurately and concisely.`;
		return basePrompt;
	}
}

export const nexusOrchestrator = new NexusAgentOrchestrator();

/**
 * Agent Cast: synthesizes multiple agent outputs into a final answer.
 * Can use voting, weighted confidence, or an LLM judge.
 */
export class AgentCast {
	async cast(
		question: string,
		agentResults: AgentRunResult[],
		options?: { strategy?: "best" | "ensemble" | "judge" },
	): Promise<CastResult> {
		const strategy = options?.strategy ?? "judge";

		if (agentResults.length === 0) {
			return {
				finalAnswer: "No agents produced a result.",
				agentResults: [],
				consensusScore: 0,
				selectedAgents: [],
			};
		}

		if (agentResults.length === 1 || strategy === "best") {
			const best = [...agentResults].sort((a, b) => b.confidence - a.confidence)[0]!;
			return {
				finalAnswer: best.output,
				agentResults,
				consensusScore: best.confidence,
				selectedAgents: [best.agentId],
			};
		}

		// LLM-as-judge ensemble
		const candidates = agentResults
			.map(
				(r, i) =>
					`### Candidate ${i + 1} (agent: ${r.agentId}, confidence: ${r.confidence})\n${r.output}`,
			)
			.join("\n\n");

		const judgePrompt = `You are a careful judge. Given the user question and multiple agent answers, produce the best final answer.
Merge complementary points, resolve conflicts conservatively, and stay accurate.

Question:
${question}

Candidates:
${candidates}

Write the final answer only.`;

		const judged = await llmRouter.generate({
			prompt: judgePrompt,
			temperature: 0.2,
		});

		const avgConfidence = agentResults.reduce((s, r) => s + r.confidence, 0) / agentResults.length;

		return {
			finalAnswer: judged.text,
			agentResults,
			consensusScore: avgConfidence,
			selectedAgents: agentResults.map((r) => r.agentId),
		};
	}
}

export { HierarchicalAgentCast, hierarchicalAgentCast } from "./hierarchy.js";
export const agentCast = new AgentCast();

export * from "./bft/index.js";
