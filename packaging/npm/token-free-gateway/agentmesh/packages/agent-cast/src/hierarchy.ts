import { llmRouter } from "../../llm-router/src";
import type { AgentRunResult, CastResult } from "../../shared/types";

export interface DirectorPlan {
	task: string;
	subtasks: Array<{ id: string; prompt: string; assignedTo: string }>;
}

export interface CollaboratorResult {
	subtaskId: string;
	agentId: string;
	result: AgentRunResult;
}

export class HierarchicalAgentCast {
	private directorPrompt =
		`You are a Director agent. Decompose the following task into 2-4 independent subtasks.
Return JSON only:
{"task":"...","subtasks":[{"id":"1","prompt":"...","assignedTo":"Researcher"},{"id":"2","prompt":"...","assignedTo":"Analyst"}]}`;

	private collaboratorPrompts: Record<string, string> = {
		Researcher: "You are a Researcher agent. Gather facts and evidence for the subtask.",
		Analyst: "You are an Analyst agent. Analyze, compare, and extract insights.",
		Writer: "You are a Writer agent. Synthesize findings into a clear final answer.",
		Verifier: "You are a Verifier agent. Check accuracy and completeness.",
	};

	async cast(question: string, agentResults: AgentRunResult[]): Promise<CastResult> {
		if (agentResults.length === 0) {
			return {
				finalAnswer: "No agents produced a result.",
				agentResults: [],
				consensusScore: 0,
				selectedAgents: [],
			};
		}

		const directorResult = await this.runDirector(question);
		const collaboratorResults = await this.runCollaborators(directorResult, question);

		const finalAnswer = await this.synthesize(question, collaboratorResults);
		const consensusScore =
			collaboratorResults.reduce((s, r) => s + r.result.confidence, 0) / collaboratorResults.length;

		return {
			finalAnswer,
			agentResults: collaboratorResults.map((r) => r.result),
			consensusScore,
			selectedAgents: collaboratorResults.map((r) => r.agentId),
		};
	}

	private async runDirector(question: string): Promise<DirectorPlan> {
		const result = await llmRouter.generate({
			prompt: `${this.directorPrompt}\n\nTask: ${question}`,
			temperature: 0.2,
		});

		try {
			const parsed = JSON.parse(result.text);
			return {
				task: parsed.task ?? question,
				subtasks: Array.isArray(parsed.subtasks)
					? parsed.subtasks
					: [{ id: "1", prompt: question, assignedTo: "Writer" }],
			};
		} catch {
			return {
				task: question,
				subtasks: [{ id: "1", prompt: question, assignedTo: "Writer" }],
			};
		}
	}

	private async runCollaborators(
		plan: DirectorPlan,
		question: string,
	): Promise<CollaboratorResult[]> {
		const results: CollaboratorResult[] = [];

		for (const subtask of plan.subtasks) {
			const systemPrompt =
				this.collaboratorPrompts[subtask.assignedTo] ?? this.collaboratorPrompts.Writer;
			const result = await llmRouter.generate({
				prompt: `${systemPrompt}\n\nOriginal task: ${question}\nSubtask: ${subtask.prompt}`,
				temperature: 0.3,
			});

			results.push({
				subtaskId: subtask.id,
				agentId: subtask.assignedTo,
				result: {
					agentId: subtask.assignedTo,
					output: result.text,
					confidence: 0.7,
					latencyMs: result.latencyMs,
				},
			});
		}

		return results;
	}

	private async synthesize(question: string, results: CollaboratorResult[]): Promise<string> {
		const inputs = results
			.map((r, _i) => `### ${r.agentId} Result\n${r.result.output}`)
			.join("\n\n");

		const result = await llmRouter.generate({
			prompt: `Synthesize the following collaborator results into a single final answer.\n\nQuestion: ${question}\n\n${inputs}\n\nFinal Answer:`,
			temperature: 0.2,
		});

		return result.text;
	}
}

export const hierarchicalAgentCast = new HierarchicalAgentCast();
