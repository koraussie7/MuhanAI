import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./server.js";

const originalEnv = { ...process.env };

describe("/api/security routes", () => {
	let app: Awaited<ReturnType<typeof buildApp>> | undefined;

	beforeEach(async () => {
		process.env.DISABLE_AUTH = "true";
		process.env.NODE_ENV = "development";
		app = await buildApp({
			logger: pino({ level: "silent" }),
			enableTransport: false,
		});
	});

	afterEach(async () => {
		if (app) {
			await app.close();
			app = undefined;
		}
		process.env = { ...originalEnv };
	});

	it("GET /api/security returns the full snapshot", async () => {
		const res = await app?.inject({ method: "GET", url: "/api/security" });
		expect(res?.statusCode).toBe(200);
		const body = res?.json() as {
			toggles: Record<string, boolean>;
			dailyLimitCredits: number;
			dailyUsedCredits: number;
			quota: unknown[];
			gateways: unknown[];
			keys: unknown[];
			audit: unknown[];
		};
		expect(body.toggles.zeroTrustEnabled).toBe(true);
		expect(body.dailyLimitCredits).toBe(5000);
		expect(body.gateways.length).toBeGreaterThan(0);
		expect(body.keys.length).toBeGreaterThan(0);
		expect(body.audit.length).toBeGreaterThan(0);
	});

	it("POST /api/security/toggles updates toggles and appends audit", async () => {
		const res = await app?.inject({
			method: "POST",
			url: "/api/security/toggles",
			payload: {
				zeroTrustEnabled: false,
				relayEncryption: true,
				budgetGuardEnabled: false,
				apiVaultEnabled: true,
			},
		});
		expect(res?.statusCode).toBe(200);
		const body = res?.json() as { toggles: Record<string, boolean> };
		expect(body.toggles.zeroTrustEnabled).toBe(false);
		expect(body.toggles.apiVaultEnabled).toBe(true);

		// Re-fetch — toggles persisted.
		const after = await app?.inject({ method: "GET", url: "/api/security" });
		const snap = after?.json() as { toggles: Record<string, boolean>; audit: unknown[] };
		expect(snap.toggles.zeroTrustEnabled).toBe(false);
		// audit list grew (at least one new entry).
		expect(snap.audit.length).toBeGreaterThan(3);
	});

	it("POST /api/security/toggles rejects malformed payloads", async () => {
		const res = await app?.inject({
			method: "POST",
			url: "/api/security/toggles",
			payload: { zeroTrustEnabled: "yes" }, // wrong type
		});
		expect(res?.statusCode).toBe(400);
	});

	it("POST /api/security/daily-limit enforces positive integer", async () => {
		const ok = await app?.inject({
			method: "POST",
			url: "/api/security/daily-limit",
			payload: { limit: 8000 },
		});
		expect(ok?.statusCode).toBe(200);

		const bad = await app?.inject({
			method: "POST",
			url: "/api/security/daily-limit",
			payload: { limit: -5 },
		});
		expect(bad?.statusCode).toBe(400);
	});

	it("POST /api/security/keys/:service/revoke removes the key", async () => {
		const ok = await app?.inject({
			method: "POST",
			url: "/api/security/keys/groq/revoke",
		});
		expect(ok?.statusCode).toBe(200);
		const body = ok?.json() as { revoked: string };
		expect(body.revoked).toBe("groq");

		const notFound = await app?.inject({
			method: "POST",
			url: "/api/security/keys/unknown-svc/revoke",
		});
		expect(notFound?.statusCode).toBe(404);
	});
});
