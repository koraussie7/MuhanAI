/**
 * WeKnora MCP client for MuhanAI Personal MCP integration.
 *
 * Wraps WeKnora's 4 core MCP tools over HTTP/SSE transport:
 *   - weknora_search
 *   - weknora_read_document
 *   - weknora_ask
 *   - weknora_list_knowledge_bases
 *
 * Falls back gracefully when WeKnora is not configured.
 */

export interface WeKnoraMcpClientOptions {
	baseUrl: string;
	apiKey?: string;
	timeoutMs?: number;
	fetchImpl?: typeof fetch;
}

export interface SearchResult {
	knowledgeId: string;
	title: string;
	content: string;
	score?: number;
	source?: string;
}

export interface Document {
	knowledgeId: string;
	documentId: string;
	title: string;
	content: string;
	chunks?: Array<{ content: string; score?: number }>;
}

export interface AnswerWithCitations {
	answer: string;
	citations: Array<{
		knowledgeId: string;
		documentId?: string;
		chunkId?: string;
		content: string;
		score?: number;
	}>;
}

export interface KnowledgeBase {
	id: string;
	name: string;
	description?: string;
	documentCount?: number;
	updatedAt?: string;
}

export class WeKnoraMcpClient {
	private readonly baseUrl: string;
	private readonly apiKey: string;
	private readonly timeoutMs: number;
	private sessionId?: string;
	private readonly fetchImpl: typeof fetch;

	constructor(opts: WeKnoraMcpClientOptions) {
		this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
		this.apiKey = opts.apiKey ?? "";
		this.timeoutMs = opts.timeoutMs ?? 30_000;
		this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
	}

	async listKnowledgeBases(): Promise<KnowledgeBase[]> {
		const result = await this.callTool("weknora_list_knowledge_bases", {});
		const items = Array.isArray((result as any)?.knowledge_bases)
			? ((result as any).knowledge_bases as KnowledgeBase[])
			: Array.isArray(result)
				? (result as KnowledgeBase[])
				: [];
		return items.map((kb) => ({
			id: kb.id ?? "",
			name: kb.name ?? "",
			description: kb.description,
			documentCount: kb.documentCount,
			updatedAt: kb.updatedAt,
		}));
	}

	async search(query: string, kbIds?: string[]): Promise<SearchResult[]> {
		const result = await this.callTool("weknora_search", {
			query,
			kb_ids: kbIds,
			limit: 5,
		});
		const items = Array.isArray((result as any)?.results)
			? ((result as any).results as SearchResult[])
			: Array.isArray(result)
				? (result as SearchResult[])
				: [];
	return items.map((r) => ({
		knowledgeId: (r as any).knowledgeId ?? (r as any).knowledge_id ?? "",
		title: (r as any).title ?? "",
		content: (r as any).content ?? "",
		score: (r as any).score,
		source: (r as any).source,
	}));
	}

	async readDocument(kbId: string, docId: string): Promise<Document> {
		const result = await this.callTool("weknora_read_document", {
			knowledge_base_id: kbId,
			document_id: docId,
		});
		const raw = result as any;
		return {
			knowledgeId: raw.knowledgeId ?? raw.knowledge_base_id ?? kbId,
			documentId: raw.documentId ?? raw.document_id ?? docId,
			title: raw.title ?? "",
			content: raw.content ?? "",
			chunks: Array.isArray(raw.chunks) ? raw.chunks : undefined,
		};
	}

	async ask(question: string, kbIds?: string[]): Promise<AnswerWithCitations> {
		const result = await this.callTool("weknora_ask", {
			question,
			kb_ids: kbIds,
		});
		const raw = result as any;
		return {
			answer: raw.answer ?? raw.content ?? String(result),
			citations: Array.isArray(raw.citations)
				? raw.citations.map((c: any) => ({
					knowledgeId: c.knowledgeId ?? c.knowledge_id ?? "",
					documentId: c.documentId ?? c.document_id,
					chunkId: c.chunkId ?? c.chunk_id,
					content: c.content ?? "",
					score: c.score,
				}))
				: [],
		};
	}

	private async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
		const url = `${this.baseUrl}/mcp`;
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;
		if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;

		const body = {
			jsonrpc: "2.0",
			id: Date.now(),
			method: "tools/call",
			params: { name: toolName, arguments: args },
		};

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);

		try {
		const res = await this.fetchImpl(url, {
			method: "POST",
			headers,
			body: JSON.stringify(body),
			signal: controller.signal,
		});

			const sessionHeader = res.headers.get("Mcp-Session-Id");
			if (sessionHeader) this.sessionId = sessionHeader;

			if (!res.ok) {
				throw new Error(`WeKnora MCP ${toolName} failed: ${res.status}`);
			}

			const data = (await res.json()) as {
				result?: { content?: Array<{ type: string; text?: string }> };
				error?: { message?: string };
			};

			if (data.error) {
				throw new Error(data.error.message ?? `WeKnora MCP error for ${toolName}`);
			}

			const text = data.result?.content?.[0]?.text;
			if (!text) return {};
			try {
				return JSON.parse(text) as unknown;
			} catch {
				return text;
			}
		} finally {
			clearTimeout(timer);
		}
	}
}

export const weknoraMcpClient = new WeKnoraMcpClient({
	baseUrl: globalThis.process?.env?.WEKNORA_HOST ?? "",
	apiKey: globalThis.process?.env?.WEKNORA_API_KEY,
});
