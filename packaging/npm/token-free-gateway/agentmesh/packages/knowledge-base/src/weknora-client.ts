/**
 * WeKnora REST API client for MuhanAI knowledge-base integration.
 *
 * Covers document upload, reparse, status, listing, and deletion.
 * Falls back gracefully when WeKnora is not configured.
 */

export interface WeKnoraDocument {
	documentId: string;
	title: string;
	content?: string;
	status?: string;
	parseStatus?: string;
	createdAt?: string;
	updatedAt?: string;
}

export interface WeKnoraParseStatus {
	documentId: string;
	status: "pending" | "parsing" | "completed" | "failed";
	progress?: number;
	error?: string;
	chunksCount?: number;
}

export interface WeKnoraListResponse {
	documents: WeKnoraDocument[];
	total: number;
}

export class WeKnoraClient {
	private readonly baseUrl: string;
	private readonly apiKey: string;
	private readonly timeoutMs: number;
	private readonly fetchImpl: typeof fetch;

	constructor(opts: { baseUrl: string; apiKey?: string; timeoutMs?: number; fetchImpl?: typeof fetch }) {
		this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
		this.apiKey = opts.apiKey ?? "";
		this.timeoutMs = opts.timeoutMs ?? 60_000;
		this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
	}

	async uploadDocument(
		kbId: string,
		file: File,
		processConfig?: Record<string, unknown>,
	): Promise<WeKnoraDocument> {
		const form = new FormData();
		form.append("file", file);
		if (processConfig) {
			form.append("process_config", JSON.stringify(processConfig));
		}

		const res = await this.request(
			`POST`,
			`/api/v1/knowledge_base/${encodeURIComponent(kbId)}/document/upload`,
			{ body: form as any },
		);
		if (!res.ok) throw new Error(`WeKnora upload failed: ${res.status}`);
		return (await res.json()) as WeKnoraDocument;
	}

	async reparseDocument(
		kbId: string,
		docId: string,
		processConfig?: Record<string, unknown>,
	): Promise<void> {
		const res = await this.request(
			`POST`,
			`/api/v1/knowledge_base/${encodeURIComponent(kbId)}/document/${encodeURIComponent(docId)}/reparse`,
			{
				headers: processConfig ? { "Content-Type": "application/json" } : undefined,
				body: processConfig ? JSON.stringify({ process_config: processConfig }) : undefined,
			},
		);
		if (!res.ok && res.status !== 202) throw new Error(`WeKnora reparse failed: ${res.status}`);
	}

	async getParseStatus(kbId: string, docId: string): Promise<WeKnoraParseStatus> {
		const res = await this.request(
			`GET`,
			`/api/v1/knowledge_base/${encodeURIComponent(kbId)}/document/${encodeURIComponent(docId)}/status`,
		);
		if (!res.ok) throw new Error(`WeKnora status failed: ${res.status}`);
		return (await res.json()) as WeKnoraParseStatus;
	}

	async listDocuments(kbId: string): Promise<WeKnoraListResponse> {
		const res = await this.request(
			`GET`,
			`/api/v1/knowledge_base/${encodeURIComponent(kbId)}/document`,
		);
		if (!res.ok) throw new Error(`WeKnora list failed: ${res.status}`);
		return (await res.json()) as WeKnoraListResponse;
	}

	async deleteDocument(kbId: string, docId: string): Promise<void> {
		const res = await this.request(
			`DELETE`,
			`/api/v1/knowledge_base/${encodeURIComponent(kbId)}/document/${encodeURIComponent(docId)}`,
		);
		if (!res.ok && res.status !== 204) throw new Error(`WeKnora delete failed: ${res.status}`);
	}

	async createWikiPage(
		kbId: string,
		page: {
			pageId: string;
			title: string;
			content: string;
			links?: string[];
		},
	): Promise<void> {
		const res = await this.request(
			`POST`,
			`/api/v1/knowledge_base/${encodeURIComponent(kbId)}/wiki`,
			{
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(page),
			},
		);
		if (!res.ok && res.status !== 201) throw new Error(`WeKnora wiki create failed: ${res.status}`);
	}

	async listWikiPages(kbId: string): Promise<Array<{
		pageId: string;
		title: string;
		content: string;
		revisionId?: string;
		updatedAt?: string;
		links?: string[];
	}>> {
		const res = await this.request(`GET`, `/api/v1/knowledge_base/${encodeURIComponent(kbId)}/wiki`);
		if (!res.ok) throw new Error(`WeKnora wiki list failed: ${res.status}`);
		const data = (await res.json()) as { pages?: Array<{
			pageId: string;
			title: string;
			content: string;
			revisionId?: string;
			updatedAt?: string;
			links?: string[];
		}> };
		return data.pages ?? [];
	}

	async getWikiRevisions(kbId: string, pageId: string): Promise<Array<{
		pageId: string;
		title: string;
		content: string;
		revisionId?: string;
		updatedAt?: string;
	}>> {
		const res = await this.request(
			`GET`,
			`/api/v1/knowledge_base/${encodeURIComponent(kbId)}/wiki/${encodeURIComponent(pageId)}/revisions`,
		);
		if (!res.ok) throw new Error(`WeKnora wiki revisions failed: ${res.status}`);
		const data = (await res.json()) as { revisions?: Array<{
			pageId: string;
			title: string;
			content: string;
			revisionId?: string;
			updatedAt?: string;
		}> };
		return data.revisions ?? [];
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
			const res = await this.fetchImpl(url, {
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
