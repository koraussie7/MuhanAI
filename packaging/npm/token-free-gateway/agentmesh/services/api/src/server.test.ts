import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./server.js";

describe("api server hardening", () => {
	const originalEnv = { ...process.env };
	let app: Awaited<ReturnType<typeof buildApp>> | undefined;

	afterEach(async () => {
		if (app) {
			await app.close();
			app = undefined;
		}
		process.env = { ...originalEnv };
	});

	describe("security headers (helmet)", () => {
		beforeEach(async () => {
			delete process.env.API_KEY;
			delete process.env.DISABLE_AUTH;
			app = await buildApp({ logger: pino({ level: "silent" }) });
		});

		it("sets X-Content-Type-Options to nosniff", async () => {
			const res = await app?.inject({ method: "GET", url: "/health" });
			expect(res!.headers["x-content-type-options"]).toBe("nosniff");
		});

		it("sets X-Frame-Options so clickjacking is blocked", async () => {
			const res = await app?.inject({ method: "GET", url: "/health" });
			expect(res!.headers["x-frame-options"]).toBeDefined();
		});

		it("sets Referrer-Policy", async () => {
			const res = await app?.inject({ method: "GET", url: "/health" });
			expect(res!.headers["referrer-policy"]).toBeDefined();
		});
	});

	describe("request id propagation", () => {
		beforeEach(async () => {
			delete process.env.API_KEY;
			app = await buildApp({ logger: pino({ level: "silent" }) });
		});

		it("echoes a provided x-request-id back on the response", async () => {
			const incoming = "test-req-12345";
			const res = await app?.inject({
				method: "GET",
				url: "/health",
				headers: { "x-request-id": incoming },
			});
			expect(res!.headers["x-request-id"] ?? res!.headers["request-id"]).toBe(incoming);
		});

		it("generates a UUID when no x-request-id is sent", async () => {
			const res = await app?.inject({ method: "GET", url: "/health" });
			const id = (res!.headers["x-request-id"] ?? res!.headers["request-id"]) as string | undefined;
			expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
		});

		it("rejects suspiciously long x-request-id values", async () => {
			const tooLong = "a".repeat(1024);
			const res = await app?.inject({
				method: "GET",
				url: "/health",
				headers: { "x-request-id": tooLong },
			});
			const id = (res!.headers["x-request-id"] ?? res!.headers["request-id"]) as string | undefined;
			expect(id).not.toBe(tooLong);
			expect(id).toMatch(/^[0-9a-f-]{36}$/i);
		});
	});

	describe("rate limiting", () => {
		beforeEach(async () => {
			delete process.env.API_KEY;
			process.env.DISABLE_AUTH = "true";
			process.env.RATE_LIMIT_MAX = "3";
			process.env.RATE_LIMIT_WINDOW = "1 minute";
			app = await buildApp({ logger: pino({ level: "silent" }) });
		});

		it("returns 429 after exceeding the configured max", async () => {
			const responses: number[] = [];
			for (let i = 0; i < 5; i += 1) {
				const res = await app?.inject({
					method: "GET",
					url: "/api/compute/tribute/queue",
				});
				responses.push(res!.statusCode);
			}
			expect(responses.slice(0, 3).every((s) => s === 200 || s === 404)).toBe(true);
			expect(responses[3]).toBe(429);
		});

		it("exempts /health from rate limiting", async () => {
			for (let i = 0; i < 10; i += 1) {
				const res = await app?.inject({ method: "GET", url: "/health" });
				expect(res!.statusCode).not.toBe(429);
			}
		});
	});

	describe("body size limit", () => {
		beforeEach(async () => {
			delete process.env.API_KEY;
			process.env.DISABLE_AUTH = "true";
			app = await buildApp({ logger: pino({ level: "silent" }) });
		});

		it("rejects payloads larger than 1MB with 413", async () => {
			const huge = "x".repeat(1024 * 1024 + 1024);
			const res = await app?.inject({
				method: "POST",
				url: "/api/compute/tribute",
				headers: { "content-type": "application/json" },
				payload: JSON.stringify({ taskId: "t", payload: huge }),
			});
			expect(res!.statusCode).toBe(413);
		});
	});

	describe("API key auth", () => {
		beforeEach(async () => {
			process.env.API_KEY = "secret-test-key";
			app = await buildApp({ logger: pino({ level: "silent" }) });
		});

		it("rejects requests to protected routes without a key", async () => {
			const res = await app?.inject({
				method: "GET",
				url: "/api/compute/tribute/queue",
			});
			expect(res!.statusCode).toBe(401);
			expect(res!.json()).toMatchObject({
				error: expect.stringMatching(/unauthorized/i),
			});
		});

		it("accepts requests with the correct key", async () => {
			const res = await app?.inject({
				method: "GET",
				url: "/api/compute/tribute/queue",
				headers: { "x-api-key": "secret-test-key" },
			});
			expect(res!.statusCode).toBe(200);
		});

		it("still allows public routes without a key", async () => {
			const res = await app?.inject({ method: "GET", url: "/api/agents" });
			expect(res!.statusCode).toBe(200);
		});
	});

	describe("shared logger wiring", () => {
		it("uses the logger instance passed in via options", async () => {
			const events: Array<{ msg: string }> = [];
			const captureLogger = pino(
				{ level: "info" },
				{
					write(msg) {
						const parsed = JSON.parse(msg);
						events.push({ msg: parsed.msg });
					},
				},
			);
			const built = await buildApp({ logger: captureLogger });
			try {
				await built.inject({ method: "GET", url: "/health" });
				expect(events.some((e) => /incoming request/i.test(e.msg))).toBe(true);
			} finally {
				await built.close();
			}
		});
	});
});
