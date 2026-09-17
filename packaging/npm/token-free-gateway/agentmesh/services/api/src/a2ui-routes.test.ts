import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./server.js";

const messages = [
	{ version: "v1.0", createSurface: { surfaceId: "s", catalogId: "basic" } },
	{
		version: "v1.0",
		updateComponents: {
			surfaceId: "s",
			components: [{ id: "root", component: "Text", catalogId: "basic" }],
		},
	},
	{ version: "v1.0", beginRendering: { surfaceId: "s", root: "root" } },
];

describe("A2UI API routes", () => {
	beforeEach(() => {
		process.env.DISABLE_AUTH = "true";
	});

	afterEach(() => {
		delete process.env.DISABLE_AUTH;
	});

	it("folds and validates a surface", async () => {
		const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
		try {
			const response = await app.inject({ method: "POST", url: "/api/a2ui/fold", payload: { messages } });
			expect(response.statusCode).toBe(200);
			expect(response.json().state.status).toBe("ready");
			expect(response.json().tree.valid).toBe(true);
		} finally {
			await app.close();
		}
	});

	it("accepts an allowlisted action and returns a queued event", async () => {
	const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
	try {
	const response = await app.inject({
	method: "POST",
	url: "/api/a2ui/actions",
	payload: {
		surfaceId: "shop1-menu",
	name: "request_reservation",
	arguments: { party_size: 2 },
	},
	});
		expect(response.statusCode).toBe(202);
		expect(response.json()).toMatchObject({
		type: "action.accepted",
		surfaceId: "shop1-menu",
	data: { name: "request_reservation", status: "queued" },
	});
	} finally {
	await app.close();
	}
	});

	it("rejects actions outside the trusted catalog allowlist", async () => {
	const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
	try {
	const response = await app.inject({
	method: "POST",
	url: "/api/a2ui/actions",
	payload: { surfaceId: "shop1-menu", name: "run_shell" },
	});
		expect(response.statusCode).toBe(403);
		expect(response.json()).toEqual({ error: "action_not_allowed" });
	} finally {
	await app.close();
	}
	});

	it("returns a structured error for malformed JSONL", async () => {
	const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
		try {
			const response = await app.inject({
				method: "POST",
				url: "/api/a2ui/fold",
				payload: { jsonl: "not-json" },
			});
			expect(response.statusCode).toBe(400);
			expect(response.json().error).toBe("invalid_a2ui");
		} finally {
			await app.close();
		}
	});
});
