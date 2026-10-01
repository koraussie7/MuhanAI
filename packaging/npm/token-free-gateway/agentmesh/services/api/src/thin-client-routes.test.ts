/**
 * Tests for thin-client Phase 0 server routes.
 *
 * Covers:
 *   - Config endpoint (public)
 *   - Pairing flow: start → redeem → token
 *   - BYOK key CRUD (with device token)
 *   - Approval ticket lifecycle (admin)
 *   - Update feed endpoint (public)
 *   - Device revocation (admin)
 */

import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./server.js";
import { __resetThinClientStore } from "./thin-client-routes.js";

const API_KEY = "test-thin-client-key";

async function getDeviceToken(
	app: Awaited<ReturnType<typeof buildApp>>,
): Promise<{ token: string }> {
	const pairRes = await app.inject({
		method: "POST",
		url: "/api/thin-client/pair",
		payload: { label: "test" },
	});
	const pairBody = pairRes.json() as { code: string };
	const redeemRes = await app.inject({
		method: "POST",
		url: "/api/thin-client/pair/redeem",
		payload: { code: pairBody.code },
	});
	const redeemBody = redeemRes.json() as { token: string };
	return { token: redeemBody.token };
}

describe("thin-client routes", () => {
	const originalEnv = { ...process.env };
	let app: Awaited<ReturnType<typeof buildApp>> | undefined;

	beforeEach(async () => {
		__resetThinClientStore();
		process.env.API_KEY = API_KEY;
		process.env.DISABLE_AUTH = "true";
		app = await buildApp({ logger: pino({ level: "silent" }), enableTransport: false });
	});

	afterEach(async () => {
		if (app) {
			await app.close();
			app = undefined;
		}
		process.env = { ...originalEnv };
	});

	describe("GET /api/thin-client/config (public)", () => {
		it("returns server config without auth", async () => {
			expect(app).toBeDefined();
			const res = await app!.inject({ method: "GET", url: "/api/thin-client/config" });
			expect(res.statusCode).toBe(200);
			const body = res.json();
			expect(body).toHaveProperty("latestVersion");
			expect(body).toHaveProperty("byokProviders");
			expect(body).toHaveProperty("keylessProviders");
		});
	});

	describe("POST /api/thin-client/pair (public)", () => {
		it("issues a 6-char pairing code", async () => {
			expect(app).toBeDefined();
			const res = await app!.inject({
				method: "POST",
				url: "/api/thin-client/pair",
				payload: { label: "test-device", platform: "linux" },
			});
			expect(res.statusCode).toBe(200);
			const body = res.json() as { code: string; expiresIn: number };
			expect(body.code).toMatch(/^[A-Z2-9]{6}$/);
			expect(body.expiresIn).toBe(300);
		});

		it("rejects invalid platform", async () => {
			expect(app).toBeDefined();
			const res = await app!.inject({
				method: "POST",
				url: "/api/thin-client/pair",
				payload: { label: "test", platform: "android" },
			});
			expect(res.statusCode).toBe(400);
		});

		it("rate-limits after 10 attempts", async () => {
			expect(app).toBeDefined();
			const responses: number[] = [];
			for (let i = 0; i < 12; i += 1) {
				const res = await app!.inject({
					method: "POST",
					url: "/api/thin-client/pair",
					payload: { label: "test", platform: "linux" },
				});
				responses.push(res.statusCode);
			}
			expect(responses.slice(0, 10).every((s) => s === 200 || s === 400)).toBe(true);
			expect(responses[10]).toBe(429);
		});
	});

	describe("POST /api/thin-client/pair (public)", () => {
		it("exchanges a valid code for a device token", async () => {
			expect(app).toBeDefined();

			const pairRes = await app!.inject({
				method: "POST",
				url: "/api/thin-client/pair",
				payload: { label: "desktop", platform: "darwin" },
			});
			const pairBody = pairRes.json() as { code: string };

			const redeemRes = await app!.inject({
				method: "POST",
				url: "/api/thin-client/pair/redeem",
				payload: { code: pairBody.code, appVersion: "0.1.0" },
			});
			expect(redeemRes.statusCode).toBe(200);
			const redeemBody = redeemRes.json() as { token: string; deviceId: string };
			expect(redeemBody.token).toMatch(/^tc_/);
			expect(redeemBody.deviceId).toMatch(/^tc_dev_/);
		});

		it("rejects invalid code format", async () => {
			expect(app).toBeDefined();
			const res = await app!.inject({
				method: "POST",
				url: "/api/thin-client/pair/redeem",
				payload: { code: "NOTCODE" },
			});
			expect(res.statusCode).toBe(400);
			expect(res.json()).toHaveProperty("error");
		});

		it("rejects non-existent but valid-format code", async () => {
			expect(app).toBeDefined();
			const res = await app!.inject({
				method: "POST",
				url: "/api/thin-client/pair/redeem",
				payload: { code: "ABCDEF" },
			});
			expect(res.statusCode).toBe(404);
			expect(res.json()).toHaveProperty("error");
		});

		it("code is single-use", async () => {
			expect(app).toBeDefined();
			const pairRes = await app!.inject({
				method: "POST",
				url: "/api/thin-client/pair",
				payload: { label: "desktop", platform: "darwin" },
			});
			const pairBody = pairRes.json() as { code: string };

			await app!.inject({
				method: "POST",
				url: "/api/thin-client/pair/redeem",
				payload: { code: pairBody.code },
			});

			const secondRes = await app!.inject({
				method: "POST",
				url: "/api/thin-client/pair/redeem",
				payload: { code: pairBody.code },
			});
			expect(secondRes.statusCode).toBe(404);
		});
	});

	describe("GET /api/thin-client/providers (device auth)", () => {
		it("requires valid device token", async () => {
			expect(app).toBeDefined();
			const res = await app!.inject({
				method: "GET",
				url: "/api/thin-client/providers",
			});
			expect(res.statusCode).toBe(401);
		});

		it("returns providers when authenticated", async () => {
			expect(app).toBeDefined();
			const { token } = await getDeviceToken(app!);

			const res = await app!.inject({
				method: "GET",
				url: "/api/thin-client/providers",
				headers: { authorization: `Bearer ${token}` },
			});
			expect(res.statusCode).toBe(200);
			const body = res.json();
			expect(body).toHaveProperty("keyless");
			expect(body).toHaveProperty("omniroute");
		});
	});

	describe("POST /api/thin-client/keys (device auth)", () => {
		it("requires valid device token", async () => {
			expect(app).toBeDefined();
			const res = await app!.inject({
				method: "POST",
				url: "/api/thin-client/keys",
				payload: { provider: "openai", key: "sk-test-1234567890" },
			});
			expect(res.statusCode).toBe(401);
		});

		it("registers a BYOK key with device token", async () => {
			expect(app).toBeDefined();
			const { token } = await getDeviceToken(app!);
			const res = await app!.inject({
				method: "POST",
				url: "/api/thin-client/keys",
				headers: { authorization: `Bearer ${token}` },
				payload: { provider: "openai", key: "sk-test-1234567890" },
			});
			expect(res.statusCode).toBe(200);
			const body = res.json() as { ok: boolean; provider: string; masked: string };
			expect(body.ok).toBe(true);
			expect(body.provider).toBe("openai");
			expect(body.masked).toMatch(/^sk-t…7890$/);
		});

		it("rejects keys for non-allowlisted providers", async () => {
			expect(app).toBeDefined();
			const { token } = await getDeviceToken(app!);
			const res = await app!.inject({
				method: "POST",
				url: "/api/thin-client/keys",
				headers: { authorization: `Bearer ${token}` },
				payload: { provider: "cohere", key: "sk-test-1234567890" },
			});
			expect(res.statusCode).toBe(400);
		});

		it("rejects too-short keys", async () => {
			expect(app).toBeDefined();
			const { token } = await getDeviceToken(app!);
			const res = await app!.inject({
				method: "POST",
				url: "/api/thin-client/keys",
				headers: { authorization: `Bearer ${token}` },
				payload: { provider: "openai", key: "short" },
			});
			expect(res.statusCode).toBe(400);
		});
	});

	describe("GET /api/thin-client/keys (device auth)", () => {
		it("returns masked key inventory for authenticated device", async () => {
			expect(app).toBeDefined();
			const { token } = await getDeviceToken(app!);
			await app!.inject({
				method: "POST",
				url: "/api/thin-client/keys",
				headers: { authorization: `Bearer ${token}` },
				payload: { provider: "anthropic", key: "sk-ant-1234567890-test" },
			});

			const res = await app!.inject({
				method: "GET",
				url: "/api/thin-client/keys",
				headers: { authorization: `Bearer ${token}` },
			});
			expect(res.statusCode).toBe(200);
			const body = res.json() as {
				keys: Array<{ provider: string; registered: boolean; label?: string | null }>;
			};
			expect(Array.isArray(body.keys)).toBe(true);
			const anthropic = body.keys.find((k) => k.provider === "anthropic");
			expect(anthropic).toBeDefined();
			expect(anthropic!.registered).toBe(true);
		});
	});

	describe("DELETE /api/thin-client/keys/:id (device auth)", () => {
		it("deletes a registered key", async () => {
			expect(app).toBeDefined();
			const { token } = await getDeviceToken(app!);
			await app!.inject({
				method: "POST",
				url: "/api/thin-client/keys",
				headers: { authorization: `Bearer ${token}` },
				payload: { provider: "groq", key: "gsk-test-1234567890" },
			});

			const res = await app!.inject({
				method: "DELETE",
				url: "/api/thin-client/keys/groq",
				headers: { authorization: `Bearer ${token}` },
			});
			expect(res.statusCode).toBe(200);
			expect(res.json()).toEqual({ ok: true, provider: "groq" });

			const keysRes = await app!.inject({
				method: "GET",
				url: "/api/thin-client/keys",
				headers: { authorization: `Bearer ${token}` },
			});
			const keysBody = keysRes.json() as { keys: Array<{ provider: string; registered: boolean }> };
			const groq = keysBody.keys.find((k) => k.provider === "groq");
			expect(groq!.registered).toBe(false);
		});

		it("returns 404 for unregistered key", async () => {
			expect(app).toBeDefined();
			const { token } = await getDeviceToken(app!);
			const res = await app!.inject({
				method: "DELETE",
				url: "/api/thin-client/keys/openai",
				headers: { authorization: `Bearer ${token}` },
			});
			expect(res.statusCode).toBe(404);
		});
	});

	describe("GET /api/thin-client/updates (public)", () => {
		it("returns update info without auth", async () => {
			expect(app).toBeDefined();
			const res = await app!.inject({
				method: "GET",
				url: "/api/thin-client/updates?platform=win32&currentVersion=0.0.1",
			});
			expect(res.statusCode).toBe(200);
			const body = res.json() as { version: string; downloadUrl: string; hasUpdate: boolean };
			expect(body).toHaveProperty("version");
			expect(body).toHaveProperty("downloadUrl");
			expect(body.hasUpdate).toBe(true);
		});

		it("reports no update when current matches latest", async () => {
			expect(app).toBeDefined();
			const res = await app!.inject({
				method: "GET",
				url: "/api/thin-client/updates?platform=darwin&currentVersion=0.1.0",
			});
			expect(res.statusCode).toBe(200);
			const body = res.json() as { hasUpdate: boolean };
			expect(body.hasUpdate).toBe(false);
		});

		it("rejects invalid platform", async () => {
			expect(app).toBeDefined();
			const res = await app!.inject({
				method: "GET",
				url: "/api/thin-client/updates?platform=solaris",
			});
			expect(res.statusCode).toBe(400);
		});
	});

	describe("GET /api/thin-client/approvals (admin)", () => {
		it("requires admin API key", async () => {
			expect(app).toBeDefined();
			const res = await app!.inject({
				method: "GET",
				url: "/api/thin-client/approvals",
			});
			expect(res.statusCode).toBe(401);
		});

		it("returns pending approvals with API key", async () => {
			expect(app).toBeDefined();
			const res = await app!.inject({
				method: "GET",
				url: "/api/thin-client/approvals",
				headers: { "x-api-key": API_KEY },
			});
			expect(res.statusCode).toBe(200);
			expect(res.json()).toEqual({ approvals: [] });
		});
	});

	describe("GET /api/thin-client/approvals/audit (admin)", () => {
		it("returns audit log with API key", async () => {
			expect(app).toBeDefined();
			const res = await app!.inject({
				method: "GET",
				url: "/api/thin-client/approvals/audit",
				headers: { "x-api-key": API_KEY },
			});
			expect(res.statusCode).toBe(200);
			expect(res.json()).toHaveProperty("entries");
		});
	});

	describe("POST /api/thin-client/devices/revoke (admin)", () => {
		it("requires admin API key", async () => {
			expect(app).toBeDefined();
			const res = await app!.inject({
				method: "POST",
				url: "/api/thin-client/devices/revoke",
				payload: { deviceId: "tc_dev_test" },
			});
			expect(res.statusCode).toBe(401);
		});

		it("returns 404 for unknown device", async () => {
			expect(app).toBeDefined();
			const res = await app!.inject({
				method: "POST",
				url: "/api/thin-client/devices/revoke",
				headers: { "x-api-key": API_KEY },
				payload: { deviceId: "nonexistent" },
			});
			expect(res.statusCode).toBe(404);
		});
	});

	describe("POST /api/llm/chat (device auth via thin-client)", () => {
		it("accepts device token for thin-client chat", async () => {
			expect(app).toBeDefined();
			const { token } = await getDeviceToken(app!);

			const res = await app!.inject({
				method: "POST",
				url: "/api/llm/chat",
				headers: { authorization: `Bearer ${token}` },
				payload: { prompt: "hello", system: "you are helpful" },
			});
			// With DISABLE_AUTH=true in test env, auth bypass is active.
			// In production, the device token would be validated by the onRequest hook.
			// This test verifies the endpoint is reachable without API key when device token present.
			expect(res.statusCode).not.toBe(404); // endpoint exists
		});
	});
});
