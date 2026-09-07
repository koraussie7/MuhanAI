import type { Tool } from "../../shared/types";
import { personalKnowledgeService } from "./knowledge";
import { personalMemoryService } from "./memory";

export const PERSONAL_MCP_TOOLS: Tool[] = [
	{
		id: "search_knowledge",
		name: "searchKnowledge",
		description: "Search the user's personal knowledge base",
		inputSchema: {
			type: "object",
			properties: {
				query: { type: "string" },
				categoryId: { type: "string" },
				limit: { type: "number" },
			},
			required: ["query"],
		},
	},
	{
		id: "retrieve_memory",
		name: "retrieveMemory",
		description: "Retrieve relevant memories for the user",
		inputSchema: {
			type: "object",
			properties: {
				query: { type: "string" },
				limit: { type: "number" },
			},
			required: ["query"],
		},
	},
	{
		id: "ask_user_knowledge",
		name: "askUserKnowledge",
		description: "Ask a natural language question against the user's knowledge",
		inputSchema: {
			type: "object",
			properties: {
				question: { type: "string" },
			},
			required: ["question"],
		},
	},
];

export async function executePersonalTool(
	userId: string,
	toolName: string,
	args: Record<string, unknown>,
): Promise<unknown> {
	switch (toolName) {
		case "searchKnowledge":
			return personalKnowledgeService.search({
				userId,
				query: String(args.query ?? ""),
				categoryId: args.categoryId as string | undefined,
				limit: args.limit as number | undefined,
			});

		case "retrieveMemory":
			return personalMemoryService.retrieve(
				userId,
				String(args.query ?? ""),
				undefined,
				(args.limit as number) ?? 5,
			);

		case "askUserKnowledge": {
			const results = await personalKnowledgeService.search({
				userId,
				query: String(args.question ?? ""),
				limit: 5,
			});
			return {
				answerCandidates: results.map((r) => ({
					title: r.title,
					content: r.content,
					confidence: r.confidence,
				})),
			};
		}

		default:
			throw new Error(`Unknown personal tool: ${toolName}`);
	}
}
