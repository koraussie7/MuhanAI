import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vietnamRoutes } from "./vietnam-routes.js";

describe("vietnam insight routes", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		delete process.env.NAVER_CLIENT_ID;
		delete process.env.NAVER_CLIENT_SECRET;
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		vi.restoreAllMocks();
	});

	it("returns unconfigured payload when Naver credentials are absent", async () => {
		const app = Fastify();
		await app.register(vietnamRoutes);
		const res = await app.inject({ method: "GET", url: "/api/vietnam/insight?q=다낭" });
		expect(res.statusCode).toBe(200);
		const body = res.json();
		expect(body.configured).toBe(false);
		expect(body.items).toEqual([]);
		expect(body.message).toMatch(/NAVER_CLIENT_ID/);
		await app.close();
	});

	it("rejects a too-short query", async () => {
		const app = Fastify();
		await app.register(vietnamRoutes);
		const res = await app.inject({ method: "GET", url: "/api/vietnam/insight?q=a" });
		expect(res.statusCode).toBe(400);
		await app.close();
	});

	it("normalizes Naver news results and strips HTML", async () => {
		process.env.NAVER_CLIENT_ID = "test-id";
		process.env.NAVER_CLIENT_SECRET = "test-secret";
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							items: [
								{
									title: "<b>다낭</b> 한달살기",
									link: "https://example.com/a",
									description: "&quot;생활비&quot; 정리",
									pubDate: "Fri, 25 Sep 2026 10:00:00 +0900",
								},
							],
						}),
						{ status: 200, headers: { "content-type": "application/json" } },
					),
			),
		);

		const app = Fastify();
		await app.register(vietnamRoutes);
		const res = await app.inject({ method: "GET", url: "/api/vietnam/insight?q=다낭%20한달살기" });
		expect(res.statusCode).toBe(200);
		const body = res.json();
		expect(body.configured).toBe(true);
		expect(body.items).toHaveLength(1);
		expect(body.items[0].title).toBe("다낭 한달살기");
		expect(body.items[0].description).toBe('"생활비" 정리');
		await app.close();
	});

	it("returns 502 when the Naver upstream fails", async () => {
		process.env.NAVER_CLIENT_ID = "test-id";
		process.env.NAVER_CLIENT_SECRET = "test-secret";
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("nope", { status: 500 })),
		);

		const app = Fastify();
		await app.register(vietnamRoutes);
		const res = await app.inject({ method: "GET", url: "/api/vietnam/insight?q=다낭%20식당" });
		expect(res.statusCode).toBe(502);
		await app.close();
	});
});
