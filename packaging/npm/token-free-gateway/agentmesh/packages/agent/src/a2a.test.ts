import { describe, expect, it } from "vitest";
import {
	buildAgentCard,
	createA2aHttpClient,
	createTaskMessage,
	type AgentSkill,
} from "./a2a.js";

const response = (body: unknown, status = 200): Response =>
	new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const skill: AgentSkill = {
	id: "research",
	name: "Research",
	description: "Research skill",
	tags: ["research"],
	inputModes: ["text"],
	outputModes: ["text"],
};

describe("A2A adapter", () => {
	it("builds a public Agent Card", () => {
	const card = buildAgentCard({
	name: "researcher",
		description: "Research agent",
	url: "https://example.test",
	version: "1.0.0",
		skills: [skill],
	streaming: true,
	});

		expect(card.capabilities.streaming).toBe(true);
		expect(card.skills[0]?.id).toBe("research");
	});

	it("sends a JSON-RPC task over HTTP", async () => {
	const calls: Array<{ url: string; body: unknown }> = [];
	const client = createA2aHttpClient({
	baseUrl: "https://agent.test",
		fetchImpl: async (url: Parameters<typeof fetch>[0], init: RequestInit | undefined) => {
	calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
	return response({ jsonrpc: "2.0", id: 1, result: { id: "task-1" } });
	},
	});

	const result = await client.sendTask({
	id: "task-1",
	message: createTaskMessage("user", "hello"),
	});

		expect(result).toEqual({ id: "task-1" });
		expect(calls[0]?.url).toBe("https://agent.test/a2a/rpc");
		expect((calls[0]?.body as { method: string }).method).toBe("tasks/send");
	await client.close();
	});

	it("maps JSON-RPC errors and aborts timed out requests", async () => {
	const errorClient = createA2aHttpClient({
	baseUrl: "https://agent.test",
	fetchImpl: async () => response({ jsonrpc: "2.0", id: 1, error: { code: -1, message: "missing" } }),
	});
	await expect(errorClient.getTask({ id: "missing" })).rejects.toThrow("missing");
	await errorClient.close();

	const timeoutClient = createA2aHttpClient({
	baseUrl: "https://agent.test",
		timeoutMs: 10,
		retries: 0,
		fetchImpl: (_url: Parameters<typeof fetch>[0], init: RequestInit | undefined) =>
	new Promise((_resolve, reject) => {
	init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
	}),
	});
	await expect(timeoutClient.getAgentCard()).rejects.toThrow();
	await timeoutClient.close();
	});
});
