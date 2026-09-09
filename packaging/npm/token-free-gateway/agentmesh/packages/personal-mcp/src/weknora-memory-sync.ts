/**
 * WeKnora memory fact types and sync for MuhanAI Personal MCP.
 *
 * Mirrors WeKnora's cross-session memory model:
 *   - profile / preference / fact / task / interest
 *   - auto-extract with confirm
 *   - search_memory tool
 */

export type WeKnoraMemoryFactType = "profile" | "preference" | "fact" | "task" | "interest";

export interface WeKnoraMemoryFact {
	id: string;
	userId: string;
	type: WeKnoraMemoryFactType;
	content: string;
	confidence: number;
	extractedAt: number;
	confirmedByUser?: boolean;
	metadata?: Record<string, unknown>;
}

export interface WeKnoraMemorySearchResult {
	facts: WeKnoraMemoryFact[];
	total: number;
}

export interface WeKnoraMemorySyncOptions {
	baseUrl: string;
	apiKey?: string;
	timeoutMs?: number;
}

export class WeKnoraMemorySync {
	private readonly baseUrl: string;
	private readonly apiKey: string;
	private readonly timeoutMs: number;

	constructor(opts: WeKnoraMemorySyncOptions) {
		this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
		this.apiKey = opts.apiKey ?? "";
		this.timeoutMs = opts.timeoutMs ?? 30_000;
	}

	async extractFacts(userId: string, sessionId: string): Promise<WeKnoraMemoryFact[]> {
		const res = await this.request(
			"POST",
			`/api/v1/memory/${encodeURIComponent(userId)}/extract`,
			{
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ session_id: sessionId }),
			},
		);
		if (!res.ok) {
			if (res.status === 404) return [];
			throw new Error(`WeKnora memory extract failed: ${res.status}`);
		}
		const data = (await res.json()) as { facts?: WeKnoraMemoryFact[] };
		return data.facts ?? [];
	}

	async confirmFact(userId: string, factId: string): Promise<void> {
		const res = await this.request(
			"POST",
			`/api/v1/memory/${encodeURIComponent(userId)}/fact/${encodeURIComponent(factId)}/confirm`,
		);
		if (!res.ok && res.status !== 204) {
			throw new Error(`WeKnora memory confirm failed: ${res.status}`);
		}
	}

	async searchMemories(userId: string, query: string, limit = 10): Promise<WeKnoraMemorySearchResult> {
		const res = await this.request(
			"GET",
			`/api/v1/memory/${encodeURIComponent(userId)}/search?q=${encodeURIComponent(query)}&limit=${limit}`,
		);
		if (!res.ok) {
			if (res.status === 404) return { facts: [], total: 0 };
			throw new Error(`WeKnora memory search failed: ${res.status}`);
		}
		return (await res.json()) as WeKnoraMemorySearchResult;
	}

	async listFacts(userId: string, type?: WeKnoraMemoryFactType): Promise<WeKnoraMemoryFact[]> {
		const query = type ? `?type=${encodeURIComponent(type)}` : "";
		const res = await this.request(
			"GET",
			`/api/v1/memory/${encodeURIComponent(userId)}/facts${query}`,
		);
		if (!res.ok) {
			if (res.status === 404) return [];
			throw new Error(`WeKnora memory list failed: ${res.status}`);
		}
		const data = (await res.json()) as { facts?: WeKnoraMemoryFact[] };
		return data.facts ?? [];
	}

	private async request(
		method: string,
		path: string,
		init?: {
			headers?: Record<string, string>;
			body?: RequestInit["body"];
		},
	): Promise<Response> {
		const url = `${this.baseUrl}${path}`;
		const headers: Record<string, string> = { ...(init?.headers ?? {}) };
		if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);

		try {
			const res = await fetch(url, {
				method,
				headers,
				body: init?.body,
				signal: controller.signal,
			});
			return res;
		} finally {
			clearTimeout(timer);
		}
	}
}

export function createWeKnoraMemorySync(): WeKnoraMemorySync | null {
	const baseUrl = globalThis.process?.env?.WEKNORA_HOST;
	if (!baseUrl) return null;
	return new WeKnoraMemorySync({
		baseUrl,
		apiKey: globalThis.process?.env?.WEKNORA_API_KEY,
	});
}
