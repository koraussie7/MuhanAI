import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./server.js";

const originalFetch = globalThis.fetch;

/**
 * Tests for the OpenAI-compatible /v1 surface.
 *
 * fetch is stubbed to always throw so the keyless pool deterministically
 * falls through mesh-llm/omniroute/pollinations into the offline
 * local-knowledge answer path — no network needed.
 */
describe("OpenAI-compatible /v1 routes", () => {
	beforeEach(() => {
		process.env.DISABLE_AUTH = "true";
		delete process.env.OMNIROUTE_BASE_URL;
		globalThis.fetch = (async () => {
			throw new Error("offline test");
		}) as unknown as typeof fetch;
	});

	afterEach(() => {
		delete process.env.DISABLE_AUTH;
		globalThis.fetch = originalFetch;
	});

	it("returns an OpenAI-shaped completion via the offline local-knowledge path", async () => {
		const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
		try {
			const response = await app.inject({
				method: "POST",
				url: "/v1/chat/completions",
				payload: {
					messages: [
						{ role: "system", content: "Answer in one word." },
						{ role: "user", content: "What is the capital of the united states?" },
					],
				},
			});
			expect(response.statusCode).toBe(200);
			const body = response.json();
			expect(body.object).toBe("chat.completion");
			expect(body.model).toBe("local-knowledge");
			expect(body.choices[0].message.content).toContain("Washington, D.C.");
			expect(body.system_fingerprint).toContain("keyless:local-knowledge");
		} finally {
			await app.close();
		}
	});

	it("streams an SSE chunk terminated by [DONE]", async () => {
		const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
		try {
			const response = await app.inject({
				method: "POST",
				url: "/v1/chat/completions",
				payload: {
					stream: true,
					messages: [{ role: "user", content: "What is the boiling point of water?" }],
				},
			});
			expect(response.statusCode).toBe(200);
			expect(String(response.headers["content-type"])).toContain("text/event-stream");
			expect(response.body).toContain("chat.completion.chunk");
			expect(response.body).toContain("100°C");
			expect(response.body).toContain("data: [DONE]");
		} finally {
			await app.close();
		}
	});

	it("rejects an empty message list with 400", async () => {
		const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
		try {
			const response = await app.inject({
				method: "POST",
				url: "/v1/chat/completions",
				payload: { messages: [] },
			});
			expect(response.statusCode).toBe(400);
		} finally {
			await app.close();
		}
	});

	it("lists models in OpenAI list shape", async () => {
		const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
		try {
			const response = await app.inject({ method: "GET", url: "/v1/models" });
			expect(response.statusCode).toBe(200);
			const body = response.json();
			expect(body.object).toBe("list");
			expect(body.data.length).toBeGreaterThan(0);
			expect(body.data[0].object).toBe("model");
		} finally {
			await app.close();
		}
	});
});
