/**
 * Agent list route tests (bot.muhanai.com).
 *
 * These cover owner resolution and request validation, both of which run
 * before any Prisma query. Happy-path persistence is covered by the database
 * integration suite.
 *
 * Owner resolution is token-based: the id comes from the `sub` claim of an
 * HMAC-signed bearer token. The tests pin two properties:
 *   - a valid token resolves the owner,
 *   - a forged or absent token does not, even when a spoofable header is set.
 */

import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createToken } from "./auth.js";
import { buildApp } from "./server.js";

const originalEnv = { ...process.env };

async function createApp() {
	return buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
}

describe("Agent list routes", () => {
	let app: Awaited<ReturnType<typeof createApp>> | undefined;

	beforeEach(() => {
		process.env.DISABLE_AUTH = "true";
		process.env.NODE_ENV = "development";
		// Hermetic env: `@prisma/client` auto-loads the developer .env, which
		// would otherwise re-introduce API_KEY and fail-closed the auth hook.
		delete process.env.API_KEY;
		delete process.env.AGENTMESH_BRIDGE_TOKEN;
	});

	afterEach(async () => {
		if (app) {
			await app.close();
			app = undefined;
		}
		process.env = { ...originalEnv };
	});

	it("resolves the owner from a signed session token", async () => {
		app = await createApp();
		const token = createToken({ id: "user-token-1" });
		const response = await app.inject({
			method: "GET",
			url: "/api/lists",
			headers: { authorization: `Bearer ${token}` },
		});
		// The query reaches Prisma with the token's `sub`; a 401 would mean the
		// owner was rejected outright, so assert we did not get one.
		expect(response.statusCode).not.toBe(401);
	}, 15_000);

	it("ignores a forged bearer token", async () => {
		app = await createApp();
		const response = await app.inject({
			method: "GET",
			url: "/api/lists",
			headers: { authorization: "Bearer not.a.real.token" },
		});
		expect(response.statusCode).toBe(401);
	}, 15_000);

	it("does not treat x-user-id as an owner source", async () => {
		delete process.env.DISABLE_AUTH;
		app = await createApp();
		const response = await app.inject({
			method: "GET",
			url: "/api/lists",
			headers: { "x-user-id": "attacker" },
		});
		expect(response.statusCode).toBe(401);
	}, 15_000);

	it("rejects a request with no identity when auth is enabled", async () => {
		delete process.env.DISABLE_AUTH;
		app = await createApp();
		const response = await app.inject({ method: "GET", url: "/api/lists" });
		expect(response.statusCode).toBe(401);
	}, 15_000);

	it("rejects an unknown list type", async () => {
		app = await createApp();
		const response = await app.inject({ method: "GET", url: "/api/lists?type=grocery" });
		expect(response.statusCode).toBe(400);
		expect(response.json().error).toContain("type:");
	}, 15_000);

	it("rejects list creation without a name", async () => {
		app = await createApp();
		const response = await app.inject({
			method: "POST",
			url: "/api/lists",
			payload: { listType: "shopping" },
		});
		expect(response.statusCode).toBe(400);
		expect(response.json().error).toContain("name:");
	}, 15_000);

	it("rejects an invalid listType on creation", async () => {
		app = await createApp();
		const response = await app.inject({
			method: "POST",
			url: "/api/lists",
			payload: { name: "Weekend", listType: "grocery" },
		});
		expect(response.statusCode).toBe(400);
		expect(response.json().error).toContain("listType:");
	}, 15_000);

	it("rejects an item without a name", async () => {
		app = await createApp();
		const response = await app.inject({
			method: "POST",
			url: "/api/lists/does-not-exist/items",
			payload: { quantity: 2 },
		});
		expect(response.statusCode).toBe(400);
		expect(response.json().error).toContain("name:");
	}, 15_000);

	it("rejects a patch with no updatable fields", async () => {
		app = await createApp();
		const response = await app.inject({
			method: "PATCH",
			url: "/api/lists/does-not-exist",
			payload: {},
		});
		expect(response.statusCode).toBe(400);
		expect(response.json().error).toContain("no updatable fields");
	}, 15_000);

	it("rejects a malformed share code", async () => {
		app = await createApp();
		const response = await app.inject({ method: "GET", url: "/api/lists/shared/short" });
		expect(response.statusCode).toBe(400);
		expect(response.json().error).toBe("invalid share code");
	}, 15_000);
});
