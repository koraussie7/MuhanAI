import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./server.js";

vi.mock("node:dns/promises", () => ({
	lookup: async () => [{ address: "93.184.216.34", family: 4 }],
}));

const originalFetch = globalThis.fetch;

function cardResponse(): Response {
	return new Response(
		JSON.stringify({
			name: "dispatch-test",
			capabilities: ["local_file_search", "desktop_automation"],
			privacy: { filesStayLocal: true },
		}),
		{ status: 200, headers: { "content-type": "application/json" } },
	);
}

afterEach(() => {
	globalThis.fetch = originalFetch;
	delete process.env.DISABLE_AUTH;
	delete process.env.GHOST_REGISTRATION_TOKEN;
	delete process.env.API_KEY;
	vi.restoreAllMocks();
});

describe("Ghost dispatch routes", () => {
	const TOKEN = "test-ghost-token";
	const API_KEY = "test-api-key";

	beforeEach(() => {
		process.env.GHOST_REGISTRATION_TOKEN = TOKEN;
		process.env.API_KEY = API_KEY;
	});

	it("issues a challenge for a registered node", async () => {
		globalThis.fetch = vi.fn(async () => cardResponse()) as typeof fetch;
		const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
		await app.inject({
			method: "POST",
			url: "/api/ghost/nodes",
			headers: { "x-ghost-token": TOKEN, "x-api-key": API_KEY, "content-type": "application/json" },
			payload: { nodeId: "dispatch-node", url: "https://ghost.example.com" },
		});
		const challenge = await app.inject({
			method: "POST",
			url: "/api/ghost/nodes/dispatch-node/challenge",
			headers: { "x-api-key": API_KEY, "content-type": "application/json" },
			payload: { capability: "local_file_search" },
		});
		expect(challenge.statusCode).toBe(200);
		const c = challenge.json();
		expect(c).toHaveProperty("probeId");
		expect(c).toHaveProperty("marker");
	});

	it("blocks desktop_automation without an approval grant", async () => {
		globalThis.fetch = vi.fn(async () => cardResponse()) as typeof fetch;
		const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
		await app.inject({
			method: "POST",
			url: "/api/ghost/nodes",
			headers: { "x-ghost-token": TOKEN, "x-api-key": API_KEY, "content-type": "application/json" },
			payload: { nodeId: "no-approval-node", url: "https://ghost.example.com" },
		});
		const challenge = await app.inject({
			method: "POST",
			url: "/api/ghost/nodes/no-approval-node/challenge",
			headers: { "x-api-key": API_KEY, "content-type": "application/json" },
			payload: { capability: "desktop_automation" },
		});
		expect(challenge.statusCode).toBe(200);
		await app.inject({
			method: "POST",
			url: "/api/ghost/nodes/no-approval-node/verify",
			headers: { "x-ghost-token": TOKEN, "x-api-key": API_KEY, "content-type": "application/json" },
			payload: { probeId: challenge.json().probeId, response: challenge.json().marker },
		});
		const dispatch = await app.inject({
			method: "POST",
			url: "/api/ghost/nodes/no-approval-node/tasks",
			headers: { "x-api-key": API_KEY, "content-type": "application/json" },
			payload: { capability: "desktop_automation", payload: {} },
		});
		expect(dispatch.statusCode).toBe(403);
		expect(dispatch.json().stage).toBe("approval");
	});

	it("rejects an unclaimed capability", async () => {
		globalThis.fetch = vi.fn(async () => cardResponse()) as typeof fetch;
		const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
		await app.inject({
			method: "POST",
			url: "/api/ghost/nodes",
			headers: { "x-ghost-token": TOKEN, "x-api-key": API_KEY, "content-type": "application/json" },
			payload: { nodeId: "cap-node", url: "https://ghost.example.com" },
		});
		const challenge = await app.inject({
			method: "POST",
			url: "/api/ghost/nodes/cap-node/challenge",
			headers: { "x-api-key": API_KEY, "content-type": "application/json" },
			payload: { capability: "offline_inference" },
		});
		expect(challenge.statusCode).toBe(400);
		expect(challenge.json().error).toBe("capability_not_claimed");
	});

	it("replay: dispatching with a consumed taskId is rejected", async () => {
		const { ghostTaskLedger } = await import("./ghost-dispatch-routes.js");
		const record = ghostTaskLedger.issue("replay-node", "local_file_search" as never);
		const first = ghostTaskLedger.consume(record.taskId);
		expect(first.ok).toBe(true);
		const second = ghostTaskLedger.consume(record.taskId);
		expect(second.ok).toBe(false);
		// Narrow the union so TypeScript knows `reason` exists.
		expect(!second.ok ? second.reason : undefined).toBe("replayed");
	});

	it("reports node status", async () => {
		globalThis.fetch = vi.fn(async () => cardResponse()) as typeof fetch;
		const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
		await app.inject({
			method: "POST",
			url: "/api/ghost/nodes",
			headers: { "x-ghost-token": TOKEN, "x-api-key": API_KEY, "content-type": "application/json" },
			payload: { nodeId: "status-node", url: "https://ghost.example.com" },
		});
		const status = await app.inject({
			method: "GET",
			url: "/api/ghost/nodes/status-node/status",
			headers: { "x-api-key": API_KEY },
		});
		expect(status.statusCode).toBe(200);
		expect(status.json().nodeId).toBe("status-node");
	});
});
