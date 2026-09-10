import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./server.js";

const originalEnv = { ...process.env };

describe("GET /api/credits (aggregate)", () => {
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

	it("returns the full aggregate snapshot", async () => {
		const res = await app?.inject({ method: "GET", url: "/api/credits" });
		expect(res?.statusCode).toBe(200);
		const body = res?.json() as {
			balance: string;
			userId: string;
			dailyLimitCredits: number;
			dailyUsedCredits: number;
			quota: Array<{ name: string; quota: number; used: number }>;
		};
		expect(typeof body.balance).toBe("string");
		expect(body.userId).toBe("default");
		expect(body.dailyLimitCredits).toBe(5000);
		expect(body.dailyUsedCredits).toBeUndefined();
		expect(Array.isArray(body.quota)).toBe(true);
		expect(body.quota.length).toBeGreaterThan(0);
	});

	it("accepts an explicit userId", async () => {
		const res = await app?.inject({
			method: "GET",
			url: "/api/credits?userId=demo-user",
		});
		expect(res?.statusCode).toBe(200);
		const body = res?.json() as { userId: string };
		expect(body.userId).toBe("demo-user");
	});

	it("returns a zero balance string when no wallet exists (first-run UX)", async () => {
		// getCreditBalance throws when the wallet row is missing; we catch
		// it and return 0n so the panel can render "create wallet to start".
		const res = await app?.inject({
			method: "GET",
			url: "/api/credits?userId=brand-new-user-with-no-wallet",
		});
		expect(res?.statusCode).toBe(200);
		const body = res?.json() as { balance: string };
		expect(body.balance).toBe("0");
	});
});
