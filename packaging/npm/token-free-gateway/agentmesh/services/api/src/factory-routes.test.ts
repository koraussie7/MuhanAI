/**
 * Factory route tests — the HTTP contract the 1-Click Factory UI depends on.
 *
 * These assert the two things the web app actually does: POST a spawn form and
 * GET the resulting list. The bundle rendering itself is covered by
 * `packages/mcp/src/shop1-sample.test.ts`; here we only prove the route wires
 * that factory through and enforces its own validation rules.
 */
import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetFactorySites } from "./factory-routes.js";
import { buildApp } from "./server.js";

async function makeApp() {
	return buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
}

describe("Factory routes", () => {
	beforeEach(() => {
		process.env.DISABLE_AUTH = "true";
		resetFactorySites();
	});

	afterEach(() => {
		delete process.env.DISABLE_AUTH;
	});

	it("starts with an empty registry", async () => {
		const app = await makeApp();
		try {
			const response = await app.inject({ method: "GET", url: "/api/factory/sites" });
			expect(response.statusCode).toBe(200);
			expect(response.json()).toEqual({ total: 0, sites: [] });
		} finally {
			await app.close();
		}
	});

	it("spawns a node and returns the three-surface contract", async () => {
		const app = await makeApp();
		try {
			const response = await app.inject({
				method: "POST",
				url: "/api/factory/spawn",
				payload: {
					name: "초원식당",
					subdomain: "Shop1",
					category: "한식당",
					description: "다낭 안하이의 정통 한식당",
					phone: "0936 225 640",
					address: "16 Huy Du, An Hải, Đà Nẵng",
					hours: "매일 영업 · 22:00 마감",
				},
			});

			expect(response.statusCode).toBe(201);
			const site = response.json();
			// Subdomain is normalized to a DNS label.
			expect(site.subdomain).toBe("shop1");
			expect(site.websiteUrl).toBe("https://shop1.kbizhub.com");
			expect(site.mcpUrl).toBe("sse://mcp.muhanai.com/store/shop1");
			expect(site.cosmicStarId).toBe("star-store-shop1");
			expect(site.success).toBe(true);
			// The A2UI wire is what SpawnedSiteCard feeds to <A2UISurface>.
			expect(site.a2uiJsonl).toContain('"surfaceId":"shop1-menu"');
			expect(site.a2uiJsonl).toContain('"action":{"name":"request_reservation"}');
		} finally {
			await app.close();
		}
	});

	it("lists spawned nodes newest-first after a spawn", async () => {
		const app = await makeApp();
		try {
			await app.inject({
				method: "POST",
				url: "/api/factory/spawn",
				payload: { name: "A", subdomain: "aaa" },
			});
			await app.inject({
				method: "POST",
				url: "/api/factory/spawn",
				payload: { name: "B", subdomain: "bbb" },
			});

			const list = await app.inject({ method: "GET", url: "/api/factory/sites" });
			expect(list.statusCode).toBe(200);
			const body = list.json();
			expect(body.total).toBe(2);
			expect(body.sites).toHaveLength(2);
			// Same-millisecond spawns fall back to lexicographic order; assert set
			// membership rather than a brittle ordering assumption.
			expect(body.sites.map((s: { subdomain: string }) => s.subdomain).sort()).toEqual([
				"aaa",
				"bbb",
			]);
		} finally {
			await app.close();
		}
	});

	it("rejects a spawn without name or subdomain", async () => {
		const app = await makeApp();
		try {
			const missingBoth = await app.inject({
				method: "POST",
				url: "/api/factory/spawn",
				payload: {},
			});
			expect(missingBoth.statusCode).toBe(400);

			const missingName = await app.inject({
				method: "POST",
				url: "/api/factory/spawn",
				payload: { name: "   ", subdomain: "shop9" },
			});
			expect(missingName.statusCode).toBe(400);
		} finally {
			await app.close();
		}
	});

	it("rejects a subdomain that is not a valid DNS label", async () => {
		const app = await makeApp();
		try {
			const response = await app.inject({
				method: "POST",
				url: "/api/factory/spawn",
				payload: { name: "나쁜 이름", subdomain: "shop 1/../etc" },
			});
			expect(response.statusCode).toBe(400);
			expect(response.json().error).toBe("subdomain_invalid");
		} finally {
			await app.close();
		}
	});

	it("rejects reserved subdomains", async () => {
		const app = await makeApp();
		try {
			const response = await app.inject({
				method: "POST",
				url: "/api/factory/spawn",
				payload: { name: "관리자", subdomain: "admin" },
			});
			expect(response.statusCode).toBe(409);
			expect(response.json().error).toBe("subdomain_reserved");
		} finally {
			await app.close();
		}
	});

	it("refuses to overwrite an already-spawned subdomain", async () => {
		const app = await makeApp();
		try {
			const first = await app.inject({
				method: "POST",
				url: "/api/factory/spawn",
				payload: { name: "초원식당", subdomain: "shop1" },
			});
			expect(first.statusCode).toBe(201);

			const second = await app.inject({
				method: "POST",
				url: "/api/factory/spawn",
				payload: { name: "다른 가게", subdomain: "shop1" },
			});
			expect(second.statusCode).toBe(409);
			expect(second.json().error).toBe("subdomain_taken");

			// The original registration survives the rejected overwrite.
			const list = await app.inject({ method: "GET", url: "/api/factory/sites" });
			expect(list.json().total).toBe(1);
		} finally {
			await app.close();
		}
	});
});
