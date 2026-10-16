import { persistAgentRun } from "../../agent-core/src/run-store";
import type { Agent, AgentExecutionContext, MeshExecuteParams } from "../../agent-core/src/types";
import { llmRouter } from "../../llm-router/src";
import type { AgentRunResult } from "@agentmesh/shared-types";

export * from "./transports/index.js";

/**
 * Nexus 에이전트 발견 및 등록
 * Nexus의 에이전트 바클링(Buckling) 목록을 MuhanAI P2P 메쉬에 등록합니다.
 */
export interface NexusAgentInfo {
	id: string;
	type: "claude-code" | "cursor" | "codex" | "opencode" | "nexus-native";
	endpoint: string;
	capabilities: string[];
	healthScore: number;
	lastSeen: number;
}

/**
 * Nexus 에이전트 레지스트리
 * Nexus 에이전트들을 MuhanAI 메쉬에 등록하고 발견합니다.
 */
export class NexusAgentRegistry {
	private agents: Map<string, NexusAgentInfo> = new Map();

	register(info: NexusAgentInfo): void {
		this.agents.set(info.id, { ...info, lastSeen: Date.now() });
	}

	unregister(id: string): boolean {
		return this.agents.delete(id);
	}

	get(id: string): NexusAgentInfo | undefined {
		return this.agents.get(id);
	}

	listHealthy(minHealth: number = 0.5): NexusAgentInfo[] {
		const now = Date.now();
		return Array.from(this.agents.values()).filter(
			(a) => a.healthScore >= minHealth && now - a.lastSeen < 300_000, // 5분 내 활동
		);
	}

	listAll(): NexusAgentInfo[] {
		return Array.from(this.agents.values());
	}

	updateHealth(id: string, score: number): void {
		const agent = this.agents.get(id);
		if (agent) {
			agent.healthScore = score;
			agent.lastSeen = Date.now();
		}
	}
}

export const nexusAgentRegistry = new NexusAgentRegistry();

/**
 * Simple domain agent that uses the LLM router.
 */
export class DomainAgent implements Agent {
	constructor(public definition: import("../../agent-core/src/types").AgentDefinition) {}

	async run(ctx: AgentExecutionContext): Promise<AgentRunResult> {
		const knowledgeBlock = ctx.knowledge
			.map((k) => `- [${k.title}]: ${k.content.slice(0, 300)}`)
			.join("\n");

		const personalCtx = typeof ctx.personalMcp === "object" && ctx.personalMcp !== null && "prompts" in ctx.personalMcp
			? await (ctx.personalMcp as { prompts: { personalContext: { render: (args: { query: string }) => Promise<string> } } }).prompts.personalContext.render({
					query: ctx.question,
				})
			: "";

		const system = [
			this.definition.systemPrompt ??
				`You are ${this.definition.name}, an expert in ${this.definition.domain}.`,
			personalCtx ? `\nPersonal user context:\n${personalCtx}` : "",
			knowledgeBlock ? `\nRelevant knowledge:\n${knowledgeBlock}` : "",
		]
			.filter(Boolean)
			.join("\n");

		const prompt = `Category: ${ctx.category.domain}${
			ctx.category.subdomain ? ` / ${ctx.category.subdomain}` : ""
		}
Jurisdiction: ${ctx.category.jurisdiction?.join(", ") ?? "unspecified"}
Risk: ${ctx.category.riskLevel ?? "medium"}

Question:
${ctx.question}

Provide a clear, practical, and accurate answer. Cite knowledge when used.`;

		const response = await llmRouter.generate({
			system,
			prompt,
			temperature: 0.3,
		});

		const result: AgentRunResult = {
			agentId: this.definition.id,
			output: response.text,
			confidence: 0.75,
			sources: ctx.knowledge.map((k) => k.id),
			latencyMs: response.latencyMs,
		};

		// Persist run (no-op in memory mode)
		await persistAgentRun({
			agent: this.definition,
			userId: ctx.userId,
			question: ctx.question,
			result,
		});

		return result;
	}
}

export class AgentMesh {
	async execute(params: MeshExecuteParams): Promise<AgentRunResult[]> {
		const { question, context, agents, knowledge, personalMcp, userId } = params;

		if (agents.length === 0) {
			const general = new DomainAgent({
				id: "agent.general",
				name: "General Assistant",
				domain: "general",
			});
			return [
				await general.run({
					question,
					category: context,
					knowledge,
					personalMcp,
					userId,
				}),
			];
		}

		const results = await Promise.all(
			agents.map((agent) =>
				agent.run({
					question,
					category: context,
					knowledge,
					personalMcp,
					userId,
				}),
			),
		);

		return results;
	}
}

export const agentMesh = new AgentMesh();
