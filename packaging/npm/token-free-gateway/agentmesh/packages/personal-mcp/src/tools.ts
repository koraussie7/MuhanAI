import type { Tool } from "../../shared/types";
import { getHoundMcpClient, HoundUnavailableError } from "./hound-mcp-client";
import { personalKnowledgeService } from "./knowledge";
import { personalMemoryService } from "./memory";
import {
	type AnswerWithCitations,
	type KnowledgeBase,
	type SearchResult,
	weknoraMcpClient,
} from "./weknora-mcp-client";

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
	{
		id: "weknora_search",
		name: "weknora_search",
		description:
			"Hybrid search across WeKnora knowledge bases (vector + keyword). Requires WEKNORA_HOST to be configured.",
		inputSchema: {
			type: "object",
			properties: {
				query: { type: "string" },
				kbIds: { type: "array", items: { type: "string" } },
				limit: { type: "number" },
			},
			required: ["query"],
		},
	},
	{
		id: "weknora_ask",
		name: "weknora_ask",
		description:
			"Ask WeKnora RAG/ReAct pipeline with citations. Falls back to personal knowledge when WeKnora is unavailable.",
		inputSchema: {
			type: "object",
			properties: {
				question: { type: "string" },
				kbIds: { type: "array", items: { type: "string" } },
			},
			required: ["question"],
		},
	},
	{
		id: "weknora_read_document",
		name: "weknora_readDocument",
		description: "Read a single document from a WeKnora knowledge base by ID",
		inputSchema: {
			type: "object",
			properties: {
				kbId: { type: "string" },
				docId: { type: "string" },
			},
			required: ["kbId", "docId"],
		},
	},
	{
		id: "weknora_list_knowledge_bases",
		name: "weknora_listKnowledgeBases",
		description: "List available WeKnora knowledge bases",
		inputSchema: {
			type: "object",
			properties: {},
			required: [],
		},
	},
	{
		id: "hound_web_search",
		name: "houndWebSearch",
		description:
			"Keyless web search across 10+ backends (DDG, Brave, Google, Bing, etc.) with anti-bot bypass. Returns titles, URLs, snippets, and engine consensus.",
		inputSchema: {
			type: "object",
			properties: {
				query: { type: "string" },
				limit: { type: "number" },
				engines: { type: "array", items: { type: "string" } },
			},
			required: ["query"],
		},
	},
	{
		id: "hound_fetch",
		name: "houndFetch",
		description:
			"Fetch a single URL with anti-bot bypass, PDF/OCR extraction, and quality signals (content_ok, quality_score, engines_consensus).",
		inputSchema: {
			type: "object",
			properties: {
				url: { type: "string" },
				focus: { type: "string", description: "Optional BM25-style hint to bias extraction" },
				maxChars: { type: "number" },
			},
			required: ["url"],
		},
	},
	{
		id: "hound_crawl",
		name: "houndCrawl",
		description: "Crawl a host with depth-1 link follow. Returns per-page quality signals.",
		inputSchema: {
			type: "object",
			properties: {
				url: { type: "string" },
				depth: { type: "number" },
				maxPages: { type: "number" },
			},
			required: ["url"],
		},
	},
	{
		id: "hound_screenshot",
		name: "houndScreenshot",
		description: "Render and capture a page as PNG bytes (base64-decoded by the client).",
		inputSchema: {
			type: "object",
			properties: {
				url: { type: "string" },
				fullPage: { type: "boolean" },
				width: { type: "number" },
				height: { type: "number" },
			},
			required: ["url"],
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

		case "weknora_search": {
			const client = getWeKnoraClient();
			if (!client) return { results: [], fallback: "weknora_unconfigured" };
			return client.search(String(args.query ?? ""), args.kbIds as string[] | undefined);
		}

		case "weknora_ask": {
			const client = getWeKnoraClient();
			if (!client) {
				return {
					answer: "WeKnora is not configured.",
					citations: [],
					fallback: "weknora_unconfigured",
				};
			}
			return client.ask(String(args.question ?? ""), args.kbIds as string[] | undefined);
		}

		case "weknora_read_document": {
			const client = getWeKnoraClient();
			if (!client) return { error: "weknora_unconfigured" };
			return client.readDocument(
				String(args.kbId ?? ""),
				String(args.docId ?? ""),
			);
		}

		case "weknora_list_knowledge_bases": {
			const client = getWeKnoraClient();
			if (!client) return { knowledge_bases: [] };
			return client.listKnowledgeBases();
		}

		case "houndWebSearch": {
			const client = getHoundClient();
			if (!client) return { results: [], fallback: "hound_unavailable" };
			const results = await client.search(String(args.query ?? ""), {
				limit: typeof args.limit === "number" ? args.limit : 10,
				engines: Array.isArray(args.engines)
					? (args.engines as string[]).filter((e) => typeof e === "string")
					: undefined,
			});
			return { results };
		}

		case "houndFetch": {
			const client = getHoundClient();
			if (!client) return { content_ok: false, fallback: "hound_unavailable" };
			return client.fetch(String(args.url ?? ""), {
				focus: typeof args.focus === "string" ? args.focus : undefined,
				maxChars: typeof args.maxChars === "number" ? args.maxChars : undefined,
			});
		}

		case "houndCrawl": {
			const client = getHoundClient();
			if (!client) return { pages: [], fallback: "hound_unavailable" };
			return client.crawl(String(args.url ?? ""), {
				depth: typeof args.depth === "number" ? args.depth : undefined,
				maxPages: typeof args.maxPages === "number" ? args.maxPages : undefined,
			});
		}

		case "houndScreenshot": {
			const client = getHoundClient();
			if (!client) return { fallback: "hound_unavailable", mimeType: "application/octet-stream" };
			return client.screenshot(String(args.url ?? ""), {
				fullPage: typeof args.fullPage === "boolean" ? args.fullPage : undefined,
				width: typeof args.width === "number" ? args.width : undefined,
				height: typeof args.height === "number" ? args.height : undefined,
			});
		}

		default:
			throw new Error(`Unknown personal tool: ${toolName}`);
	}
}

function getWeKnoraClient(): ReturnType<typeof createWeKnoraClient> | null {
	const host = globalThis.process?.env?.WEKNORA_HOST;
	if (!host) return null;
	return createWeKnoraClient();
}

function createWeKnoraClient() {
	const { WeKnoraMcpClient } = require("./weknora-mcp-client.js");
	return new WeKnoraMcpClient({
		baseUrl: globalThis.process?.env?.WEKNORA_HOST ?? "",
		apiKey: globalThis.process?.env?.WEKNORA_API_KEY,
	});
}

function getHoundClient(): ReturnType<typeof getHoundMcpClient> | null {
	if (isHoundDisabled()) return null;
	try {
		return getHoundMcpClient();
	} catch (err) {
		if (err instanceof HoundUnavailableError) return null;
		throw err;
	}
}

function isHoundDisabled(): boolean {
	const flag = globalThis.process?.env?.HOUND_DISABLED;
	return typeof flag === "string" && flag !== "" && flag !== "0" && flag !== "false";
}
