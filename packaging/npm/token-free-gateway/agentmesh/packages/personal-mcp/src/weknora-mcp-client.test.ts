import { describe, expect, it, vi } from "vitest";
import { WeKnoraMcpClient, type AnswerWithCitations } from "./weknora-mcp-client.js";

function mockJson(body: unknown, init: ResponseInit = {}): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
		...init,
	});
}

function makeFetchMock() {
	const queue: Response[] = [];
	const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
		const next = queue.shift();
		if (!next) throw new Error("unhandled fetch");
		return next;
	}) as unknown as typeof fetch;
	return { fetchMock, enqueue: (res: Response) => queue.push(res) };
}

describe("WeKnoraMcpClient", () => {
	it("returns knowledge bases from list tool", async () => {
		const { fetchMock, enqueue } = makeFetchMock();
		enqueue(
			mockJson({
				result: {
					content: [
						{ type: "text", text: JSON.stringify({ knowledge_bases: [{ id: "kb1", name: "Docs" }] }) },
					],
				},
			}),
		);

		const client = new WeKnoraMcpClient({ baseUrl: "http://localhost:8080", fetchImpl: fetchMock });
		const kbs = await client.listKnowledgeBases();
		expect(kbs).toEqual([{ id: "kb1", name: "Docs" }]);
	});

	it("searches with normalized result fields", async () => {
		const { fetchMock, enqueue } = makeFetchMock();
		enqueue(
			mockJson({
				result: {
					content: [
						{ type: "text", text: JSON.stringify({ results: [{ knowledge_id: "kb1", title: "t", content: "c", score: 0.9 }] }) },
					],
				},
			}),
		);

		const client = new WeKnoraMcpClient({ baseUrl: "http://localhost:8080", fetchImpl: fetchMock });
		const results = await client.search("hello");
		expect(results).toEqual([{ knowledgeId: "kb1", title: "t", content: "c", score: 0.9 }]);
	});

	it("reads a document by kbId and docId", async () => {
		const { fetchMock, enqueue } = makeFetchMock();
		enqueue(
			mockJson({
				result: {
					content: [
						{ type: "text", text: JSON.stringify({ knowledge_base_id: "kb1", document_id: "d1", title: "Doc", content: "body" }) },
					],
				},
			}),
		);

		const client = new WeKnoraMcpClient({ baseUrl: "http://localhost:8080", fetchImpl: fetchMock });
		const doc = await client.readDocument("kb1", "d1");
		expect(doc).toEqual({ knowledgeId: "kb1", documentId: "d1", title: "Doc", content: "body", chunks: undefined });
	});

	it("asks and returns normalized answer with citations", async () => {
		const { fetchMock, enqueue } = makeFetchMock();
		enqueue(
			mockJson({
				result: {
					content: [
						{
							type: "text",
							text: JSON.stringify({
								answer: "yes",
								citations: [{ knowledge_id: "kb1", document_id: "d1", chunk_id: "c1", content: "cite", score: 0.8 }],
							}),
						},
					],
				},
			}),
		);

		const client = new WeKnoraMcpClient({ baseUrl: "http://localhost:8080", fetchImpl: fetchMock });
		const out = await client.ask("question?");
		expect(out).toEqual<AnswerWithCitations>({
			answer: "yes",
			citations: [{ knowledgeId: "kb1", documentId: "d1", chunkId: "c1", content: "cite", score: 0.8 }],
		});
	});

	it("throws on upstream failure", async () => {
		const { fetchMock, enqueue } = makeFetchMock();
		enqueue(new Response("upstream timeout", { status: 502 }));

		const client = new WeKnoraMcpClient({ baseUrl: "http://localhost:8080", fetchImpl: fetchMock });
		await expect(client.search("x")).rejects.toThrow("WeKnora MCP weknora_search failed: 502");
	});

	it("preserves Mcp-Session-Id across calls", async () => {
		const { fetchMock, enqueue } = makeFetchMock();
		enqueue(
			mockJson({ result: { content: [{ type: "text", text: JSON.stringify({ knowledge_bases: [] }) }] } }, {
				headers: { "Mcp-Session-Id": "sess-123" },
			}),
		);
		enqueue(
			mockJson({ result: { content: [{ type: "text", text: JSON.stringify({ knowledge_bases: [] }) }] } }, {
				headers: { "Mcp-Session-Id": "sess-123" },
			}),
		);

		const client = new WeKnoraMcpClient({ baseUrl: "http://localhost:8080", fetchImpl: fetchMock });
		await client.listKnowledgeBases();
		await client.listKnowledgeBases();

		const calls = (fetchMock as any).mock?.calls ?? [];
		expect(calls[1]?.[1]?.headers?.["Mcp-Session-Id"]).toBe("sess-123");
	});
});
