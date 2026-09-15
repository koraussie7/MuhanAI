import type { FastifyInstance } from "fastify";

interface ModelItem {
	name: string;
	provider: string;
	status: "Online" | "Busy" | "Offline";
	backend: string;
	size: string;
	ctx: number;
}

interface SearchResult {
	title: string;
	snippet: string;
	verified: boolean;
	source: string;
	confidence: number;
}

interface OllamaTagsResponse {
	models?: Array<{
		name: string;
		size?: number;
		context_length?: number;
	}>;
}

/**
 * Catalog routes — `/api/models`, `/api/search`.
 *
 * Both endpoints return an empty array when no real backend has been wired.
 * The contract is stable so UI components can rely on the response shape:
 * they get `[]`, render an empty state, and never see hardcoded demo rows.
 *
 * When an Ollama daemon is reachable (env OLLAMA_BASE_URL, default
 * http://127.0.0.1:11434), `/api/models` lists its tags. Otherwise it
 * returns []. Likewise for `/api/search`: when no federated index exists,
 * returns [].
 */
export async function catalogRoutes(app: FastifyInstance) {
	app.get("/api/models", async (_request, reply) => {
		const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 2_000);
		try {
			const res = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
			clearTimeout(timeout);
			if (!res.ok) return reply.send([] as ModelItem[]);
			const data = (await res.json()) as OllamaTagsResponse;
			const models: ModelItem[] = (data.models ?? []).map((m) => ({
				name: m.name,
				provider: "Ollama",
				status: "Online",
				backend: "Ollama",
				size: m.size ? `${(m.size / 1_000_000_000).toFixed(1)}GB` : "—",
				ctx: m.context_length ?? 0,
			}));
			return models;
		} catch {
			clearTimeout(timeout);
			return [] as ModelItem[];
		}
	});

	app.get<{ Querystring: { q?: string; filter?: string } }>(
		"/api/search",
		async (request, reply) => {
			const q = (request.query.q ?? "").trim();
			if (!q) return reply.send([] as SearchResult[]);
			return [] as SearchResult[];
		},
	);
}
