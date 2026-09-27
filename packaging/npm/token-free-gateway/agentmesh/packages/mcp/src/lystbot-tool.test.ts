import { describe, expect, it } from "vitest";
import { buildLystBotTools, createLystBotRestCall } from "./lystbot-tool.js";

describe("buildLystBotTools", () => {
	it("exposes the list and reminder tool set", () => {
		const { tools, handlers } = buildLystBotTools();
		expect(tools.map((tool) => tool.name)).toEqual([
			"lystbot_list_create",
			"lystbot_list_add_item",
			"lystbot_list_get",
			"lystbot_reminder_create",
			"lystbot_search",
		]);
		expect(handlers.size).toBe(tools.length);
		expect(tools.every((tool) => tool.inputSchema.type === "object")).toBe(true);
	});

	it("throws instead of silently succeeding when no transport is configured", async () => {
		const { handlers } = buildLystBotTools();
		await expect(handlers.get("lystbot_search")?.({ query: "milk" })).rejects.toThrow(
			"transport call function is not configured",
		);
	});

	it("delegates execution to the supplied call function", async () => {
		const calls: Array<{ tool: string; input: unknown }> = [];
		const { handlers } = buildLystBotTools(async (tool, input) => {
			calls.push({ tool, input });
			return { ok: true };
		});
		await handlers.get("lystbot_list_add_item")?.({ listId: "l1", item: { name: "milk" } });
		expect(calls).toEqual([
			{ tool: "lystbot_list_add_item", input: { listId: "l1", item: { name: "milk" } } },
		]);
	});
});

describe("createLystBotRestCall", () => {
	it("maps reads to GET and writes to POST with bearer auth", async () => {
		const requests: Array<{ url: string; method?: string; auth?: string }> = [];
		const call = createLystBotRestCall({
			baseUrl: "https://lyst.example.test/",
			token: "secret-token",
			fetcher: (async (input: RequestInfo | URL, init?: RequestInit) => {
				requests.push({
					url: String(input),
					method: init?.method,
					auth: (init?.headers as Record<string, string> | undefined)?.Authorization,
				});
				return new Response(JSON.stringify({ ok: true }), { status: 200 });
			}) as unknown as typeof fetch,
		});

		await call("lystbot_search", { query: "milk" });
		await call("lystbot_list_create", { name: "Shopping" });

		expect(requests[0]).toMatchObject({ method: "GET", auth: "Bearer secret-token" });
		expect(requests[0]?.url).toContain("/search?q=milk");
		expect(requests[1]).toMatchObject({ method: "POST", auth: "Bearer secret-token" });
		expect(requests[1]?.url).toBe("https://lyst.example.test/list_create");
	});

	it("surfaces non-OK responses as errors", async () => {
		const call = createLystBotRestCall({
			baseUrl: "https://lyst.example.test",
			fetcher: (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch,
		});
		await expect(call("lystbot_list_get", { listId: "l1" })).rejects.toThrow("HTTP 500");
	});
});
