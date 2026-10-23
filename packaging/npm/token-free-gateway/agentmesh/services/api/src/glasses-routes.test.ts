import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./server.js";

/**
 * Horizon Glasses device API.
 *
 * The load-bearing parts are the invariants from docs/horizon-glasses/CLAUDE.md:
 * safety judgement never leaves the device, and no token is accepted unless the
 * server secret signed it.
 */
describe("Glasses device API", () => {
	const SECRET = "test-device-secret";
	let app: Awaited<ReturnType<typeof buildApp>>;

	beforeEach(async () => {
		process.env.DISABLE_AUTH = "true";
		process.env.GLASSES_DEVICE_SECRET = SECRET;
		// Keep revocation state out of /var/lib during tests.
		process.env.GLASSES_REVOKED_FILE = `/tmp/glasses-revoked-${Date.now()}-${Math.random()}.json`;
		app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
	});

	afterEach(async () => {
		await app.close();
		delete process.env.DISABLE_AUTH;
		delete process.env.GLASSES_DEVICE_SECRET;
		delete process.env.GLASSES_REVOKED_FILE;
	});

	async function register(): Promise<string> {
		const res = await app.inject({
			method: "POST",
			url: "/api/glasses/v1/devices/register",
			payload: { deviceId: "rokid-1", model: "rokid-max" },
		});
		expect(res.statusCode).toBe(200);
		return res.json().access_token as string;
	}

	it("manifest is public and marks safety tasks on-device only", async () => {
		const res = await app.inject({ method: "GET", url: "/api/glasses/v1/manifest" });
		expect(res.statusCode).toBe(200);
		const body = res.json();
		expect(body.onDeviceOnly).toContain("traffic-light");
		expect(body.limits.maxImageBytes).toBe(512 * 1024);
	});

	it("registers a device and rejects a tampered token", async () => {
		const token = await register();
		expect(token.split(".")).toHaveLength(2);

		// A valid token authenticates.
		const ok = await app.inject({
			method: "POST",
			url: "/api/glasses/v1/devices/revoke",
			headers: { authorization: `Bearer ${token}` },
		});
		expect(ok.statusCode).toBe(200);

		// Same token again: now revoked.
		const again = await app.inject({
			method: "POST",
			url: "/api/glasses/v1/devices/revoke",
			headers: { authorization: `Bearer ${token}` },
		});
		expect(again.statusCode).toBe(401);
	});

	it("refuses a token signed with the wrong secret", async () => {
		const token = await register();
		const [payload, sig] = token.split(".");
		const forged = `${payload}.${"0".repeat((sig ?? "").length)}`;

		const res = await app.inject({
			method: "POST",
			url: "/api/glasses/v1/devices/revoke",
			headers: { authorization: `Bearer ${forged}` },
		});
		expect(res.statusCode).toBe(401);
	});

	it("rejects safety tasks before any upstream call", async () => {
		const token = await register();
		const res = await app.inject({
			method: "POST",
			url: "/api/glasses/v1/llm/chat",
			headers: { authorization: `Bearer ${token}` },
			payload: {
				mode: "chat",
				task: "crosswalk",
				messages: [{ role: "user", content: "Can I cross?" }],
			},
		});
		expect(res.statusCode).toBe(400);
		expect(res.body).toContain("SAFETY_TASK_FORBIDDEN");
	});

	it("requires consent for vision and caps the image size", async () => {
		const token = await register();

		const noConsent = await app.inject({
			method: "POST",
			url: "/api/glasses/v1/llm/vision",
			headers: { authorization: `Bearer ${token}` },
			payload: { image: "AAAA" },
		});
		expect(noConsent.statusCode).toBe(400);

		// 512KB+1 of base64 decodes to just over the cap.
		const tooBig = Buffer.alloc(513 * 1024).toString("base64");
		const big = await app.inject({
			method: "POST",
			url: "/api/glasses/v1/llm/vision",
			headers: { authorization: `Bearer ${token}` },
			payload: { image: tooBig, consent: true },
		});
		expect(big.statusCode).toBe(413);
	});

	it("rejects raw media in telemetry", async () => {
		const token = await register();
		const res = await app.inject({
			method: "POST",
			url: "/api/glasses/v1/telemetry",
			headers: { authorization: `Bearer ${token}` },
			payload: { battery: 80, audio: "..." },
		});
		expect(res.statusCode).toBe(400);
	});

	it("refuses to issue tokens when no secret is configured", async () => {
		delete process.env.GLASSES_DEVICE_SECRET;
		const res = await app.inject({
			method: "POST",
			url: "/api/glasses/v1/devices/register",
			payload: { deviceId: "d", model: "m" },
		});
		expect(res.statusCode).toBe(503);
	});
});
