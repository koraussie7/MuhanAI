import { describe, expect, it, vi } from "vitest";
import { WikiSync, type WeKnoraWikiPage } from "./wiki-sync.js";

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

describe("WikiSync", () => {
	it("returns empty array when WeKnora is not configured", async () => {
		const sync = new WikiSync({});
		const pages = await sync.importWikiPages("user-1");
		expect(pages).toEqual([]);
	});

	it("imports wiki pages as KnowledgeNodes", async () => {
		const { fetchMock, enqueue } = makeFetchMock();
		enqueue(
			mockJson({
				pages: [
					{ pageId: "p1", title: "Page 1", content: "Hello [[World]]", updatedAt: "2026-01-01T00:00:00Z" },
				],
			}),
		);

		const sync = new WikiSync({ baseUrl: "http://localhost:8080", fetchImpl: fetchMock });
		const nodes = await sync.importWikiPages("user-1");

		expect(nodes).toHaveLength(1);
		expect(nodes[0]).toMatchObject({
			id: "p1",
			ownerId: "user-1",
			categoryId: "wiki",
			title: "Page 1",
			content: "Hello [[World]]",
			visibility: "shared",
			confidence: 0.9,
			sourceType: "document",
		});
	});

	it("extracts wiki links from content", async () => {
		const { fetchMock, enqueue } = makeFetchMock();
		enqueue(mockJson({ pages: [] }));

		const sync = new WikiSync({ baseUrl: "http://localhost:8080", fetchImpl: fetchMock });
		const nodes = await sync.importWikiPages("user-1");
		expect(nodes).toEqual([]);
	});

	it("returns empty revisions when WeKnora is not configured", async () => {
		const sync = new WikiSync({});
		const revisions = await sync.syncRevisions("node-1");
		expect(revisions).toEqual([]);
	});

	it("returns empty export when WeKnora is not configured", async () => {
		const sync = new WikiSync({});
		await expect(sync.exportKnowledgeNodeToWiki({
			id: "n1",
			ownerId: "u1",
			categoryId: "wiki",
			title: "t",
			content: "c",
			sourceType: "document",
			visibility: "private",
			permissions: { readableBy: ["u1"], usableByAgents: true, commercialUse: false },
			confidence: 0.9,
			createdAt: new Date(),
			updatedAt: new Date(),
		})).resolves.toBeUndefined();
	});
});
