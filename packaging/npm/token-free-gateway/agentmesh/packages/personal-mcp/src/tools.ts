import type { Tool } from "../../shared/types";
import { getHoundMcpClient, HoundUnavailableError } from "./hound-mcp-client";
import { personalKnowledgeService } from "./knowledge";
import { personalMemoryService } from "./memory";
import { getOmniRouteMcpClient, OmniRouteUnavailableError } from "./omniroute-mcp-client";
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
	{
		id: "omniroute_completion",
		name: "omnirouteCompletion",
		description:
			"Chat completion routed through OmniRoute's intelligent provider mesh (356 providers, 1,312+ models). Use model=`auto` for combo-driven routing, or pass a specific model id.",
		inputSchema: {
			type: "object",
			properties: {
				model: { type: "string", description: "Model id (e.g. `claude-opus-4`) or `auto`" },
				messages: {
					type: "array",
					items: {
						type: "object",
						properties: {
							role: { type: "string", enum: ["system", "user", "assistant", "tool"] },
							content: { type: "string" },
						},
						required: ["role", "content"],
					},
				},
				combo: { type: "string", description: "Optional combo id from omnirouteListCombos" },
				budget: { type: "number", description: "Optional max dollar budget for this request" },
				role: {
					type: "string",
					description: "Optional routing role hint (e.g. `coding`, `summarize`)",
				},
			},
			required: ["model", "messages"],
		},
	},
	{
		id: "omniroute_list_models",
		name: "omnirouteListModels",
		description:
			"List available AI models across all 356 OmniRoute providers with capabilities and pricing. Filter by provider or capability (e.g. `vision`, `tools`, `json`).",
		inputSchema: {
			type: "object",
			properties: {
				provider: { type: "string" },
				capability: { type: "string" },
			},
			required: [],
		},
	},
	{
		id: "omniroute_check_quota",
		name: "omnirouteCheckQuota",
		description:
			"Check remaining free-tier quota for a specific provider (or all providers when omitted). Returns used / limit / remaining / resetAt.",
		inputSchema: {
			type: "object",
			properties: {
				provider: { type: "string" },
				connectionId: { type: "string" },
			},
			required: [],
		},
	},
	{
		id: "omniroute_web_search",
		name: "omnirouteWebSearch",
		description:
			"Web search via OmniRoute's multi-provider gateway (Serper, Brave, Perplexity, Exa, Tavily) with automatic failover. Returns titles, URLs, snippets, and provider used.",
		inputSchema: {
			type: "object",
			properties: {
				query: { type: "string" },
				maxResults: { type: "number" },
				provider: { type: "string" },
				searchType: { type: "string", enum: ["web", "news"] },
			},
			required: ["query"],
		},
	},
	{
		id: "omniroute_web_fetch",
		name: "omnirouteWebFetch",
		description:
			"Fetch and extract content from a URL via OmniRoute's web fetch gateway (Firecrawl, Jina Reader, Tavily, Tinyfish, Context7, Nimble, AnySearch). Returns markdown/html/links/screenshot with metadata.",
		inputSchema: {
			type: "object",
			properties: {
				url: { type: "string" },
				provider: { type: "string" },
				format: { type: "string", enum: ["markdown", "html", "links", "screenshot"] },
				includeMetadata: { type: "boolean" },
				depth: { type: "number" },
				waitForSelector: { type: "string" },
			},
			required: ["url"],
		},
	},
	{
		id: "omniroute_get_health",
		name: "omnirouteGetHealth",
		description:
			"OmniRoute server health: uptime, version, memory usage, circuit breakers, rate limits, cache hit rate, and any degraded upstream sources.",
		inputSchema: {
			type: "object",
			properties: {},
			required: [],
		},
	},
	{
		id: "omniroute_compress_prompt",
		name: "omnirouteCompressPrompt",
		description:
			"Compress a prompt with OmniRoute's RTK + Caveman strategy (15-95% token reduction; average 89%). Use before sending large context to a model.",
		inputSchema: {
			type: "object",
			properties: {
				text: { type: "string", description: "Prompt to compress" },
				level: {
					type: "string",
					enum: ["light", "medium", "heavy", "max"],
					description: "Compression aggressiveness (default: medium)",
				},
				targetModel: {
					type: "string",
					description: "Optional model id to bias the compression toward",
				},
			},
			required: ["text"],
		},
	},
	{
		id: "omniroute_list_combos",
		name: "omnirouteListCombos",
		description:
			"List configured routing combos (named bundles of providers + strategy) usable as the `combo` arg of `omniroute_completion`.",
		inputSchema: {
			type: "object",
			properties: {},
			required: [],
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
			return client.readDocument(String(args.kbId ?? ""), String(args.docId ?? ""));
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

		case "omnirouteCompletion": {
			const client = getOmniRouteClient();
			if (!client) {
				return {
					content: "",
					model: String(args.model ?? ""),
					tokens: { prompt: 0, completion: 0 },
					routing: {
						provider: "omniroute_unavailable",
						combo: null,
						fallbacksTriggered: 0,
						cost: 0,
						latencyMs: 0,
						routingExplanation: "OmniRoute MCP server not configured or binary missing",
					},
					fallback: "omniroute_unavailable",
				};
			}
			const messages = Array.isArray(args.messages)
				? (args.messages as Array<Record<string, unknown>>).map((m) => ({
						role: String(m.role ?? "user") as "system" | "user" | "assistant" | "tool",
						content: String(m.content ?? ""),
					}))
				: [{ role: "user" as const, content: "" }];
			return client.completion({
				model: String(args.model ?? "auto"),
				messages,
				combo: typeof args.combo === "string" ? args.combo : undefined,
				budget: typeof args.budget === "number" ? args.budget : undefined,
				role: typeof args.role === "string" ? args.role : undefined,
			});
		}

		case "omnirouteListModels": {
			const client = getOmniRouteClient();
			if (!client) return { models: [], providers: [], fallback: "omniroute_unavailable" };
			return client.listModels({
				provider: typeof args.provider === "string" ? args.provider : undefined,
				capability: typeof args.capability === "string" ? args.capability : undefined,
			});
		}

		case "omnirouteCheckQuota": {
			const client = getOmniRouteClient();
			if (!client) return { quotas: [], fallback: "omniroute_unavailable" };
			return client.checkQuota({
				provider: typeof args.provider === "string" ? args.provider : undefined,
				connectionId: typeof args.connectionId === "string" ? args.connectionId : undefined,
			});
		}

		case "omnirouteWebSearch": {
			const client = getOmniRouteClient();
			if (!client)
				return { results: [], query: String(args.query ?? ""), fallback: "omniroute_unavailable" };
			return client.webSearch(String(args.query ?? ""), {
				maxResults: typeof args.maxResults === "number" ? args.maxResults : undefined,
				provider: typeof args.provider === "string" ? args.provider : undefined,
				searchType:
					args.searchType === "web" || args.searchType === "news" ? args.searchType : undefined,
			});
		}

		case "omnirouteWebFetch": {
			const client = getOmniRouteClient();
			if (!client) return { url: String(args.url ?? ""), fallback: "omniroute_unavailable" };
			return client.webFetch(String(args.url ?? ""), {
				provider: typeof args.provider === "string" ? args.provider : undefined,
				format:
					args.format === "markdown" ||
					args.format === "html" ||
					args.format === "links" ||
					args.format === "screenshot"
						? args.format
						: undefined,
				includeMetadata:
					typeof args.includeMetadata === "boolean" ? args.includeMetadata : undefined,
				depth: typeof args.depth === "number" ? args.depth : undefined,
				waitForSelector:
					typeof args.waitForSelector === "string" ? args.waitForSelector : undefined,
			});
		}

		case "omnirouteGetHealth": {
			const client = getOmniRouteClient();
			if (!client) return { fallback: "omniroute_unavailable" };
			return client.getHealth();
		}

		case "omnirouteCompressPrompt": {
			const client = getOmniRouteClient();
			if (!client) {
				return {
					compressed: String(args.text ?? ""),
					originalChars: String(args.text ?? "").length,
					compressedChars: String(args.text ?? "").length,
					ratio: 1,
					level: "medium",
					fallback: "omniroute_unavailable",
				};
			}
			return client.compressPrompt({
				text: String(args.text ?? ""),
				level:
					args.level === "light" ||
					args.level === "medium" ||
					args.level === "heavy" ||
					args.level === "max"
						? args.level
						: undefined,
				targetModel: typeof args.targetModel === "string" ? args.targetModel : undefined,
			});
		}

		case "omnirouteListCombos": {
			const client = getOmniRouteClient();
			if (!client) return { combos: [], fallback: "omniroute_unavailable" };
			return client.listCombos();
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

function getOmniRouteClient(): ReturnType<typeof getOmniRouteMcpClient> | null {
	if (isOmniRouteDisabled()) return null;
	try {
		return getOmniRouteMcpClient();
	} catch (err) {
		if (err instanceof OmniRouteUnavailableError) return null;
		throw err;
	}
}

function isOmniRouteDisabled(): boolean {
	const flag = globalThis.process?.env?.OMNIROUTE_DISABLED;
	return typeof flag === "string" && flag !== "" && flag !== "0" && flag !== "false";
}
