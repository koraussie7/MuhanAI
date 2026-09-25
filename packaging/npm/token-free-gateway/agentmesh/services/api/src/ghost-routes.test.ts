import { pino } from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./server.js";

// The SSRF guard resolves every hostname before fetching. Hermetic tests
// pin this module so lookups always answer with a public address.
vi.mock("node:dns/promises", () => ({
	lookup: async () => [{ address: "93.184.216.34", family: 4 }],
}));

const originalFetch = globalThis.fetch;

function cardResponse(): Response {
	return new Response(
		JSON.stringify({
			name: "local-ghost",
			capabilities: ["local_file_search"],
			privacy: { filesStayLocal: true },
		}),
		{ status: 200, headers: { "content-type": "application/json" } },
	);
}

afterEach(() => {
	globalThis.fetch = originalFetch;
	delete process.env.DISABLE_AUTH;
	delete process.env.GHOST_REGISTRATION_TOKEN;
	delete process.env.GHOST_NODE_URL_ALLOWLIST;
	delete process.env.API_KEY;
	vi.restoreAllMocks();
});

describe("Ghost integration routes", () => {
	beforeEach(() => {
		process.env.DISABLE_AUTH = "true";
		// Hermetic env: `@prisma/client` (imported via ./db.js) auto-loads the
		// developer's agentmesh/.env into process.env, which would otherwise inject
		// API_KEY / AGENTMESH_BRIDGE_TOKEN and make registrationAuthorized()
		// fail-closed (401) on a non-production dev server.
		delete process.env.API_KEY;
		delete process.env.GHOST_REGISTRATION_TOKEN;
		delete process.env.AGENTMESH_BRIDGE_TOKEN;
	});

	it("discovers and registers a Ghost node", async () => {
		globalThis.fetch = vi.fn(async () => cardResponse()) as typeof fetch;
		const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
		try {
			const response = await app.inject({
				method: "POST",
				url: "/api/ghost/nodes",
				payload: { nodeId: "ghost-test", url: "https://ghost.example.com" },
			});
			expect(response.statusCode).toBe(201);
			expect(response.json()).toMatchObject({
				nodeId: "ghost-test",
				card: { name: "local-ghost", privacy: { filesStayLocal: true } },
			});

			const list = await app.inject({ method: "GET", url: "/api/ghost/nodes" });
			expect(list.statusCode).toBe(200);
			expect(list.json()).toHaveLength(1);
		} finally {
			await app.close();
		}
	}, 15_000);

	it("rejects an invalid registration request", async () => {
		const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
		try {
			const response = await app.inject({
				method: "POST",
				url: "/api/ghost/nodes",
				payload: { nodeId: "", url: "not-a-url" },
			});
			expect(response.statusCode).toBe(400);
		} finally {
			await app.close();
		}
	});

	it("rejects an oversized nodeId", async () => {
		const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
		try {
			const response = await app.inject({
				method: "POST",
				url: "/api/ghost/nodes",
				payload: { nodeId: "bad id with spaces", url: "https://ghost.example.com" },
			});
			expect(response.statusCode).toBe(400);
			expect(response.json().error).toBe("invalid_node_id");
		} finally {
			await app.close();
		}
	});

	it("blocks internal targets with 403 before any fetch happens", async () => {
		globalThis.fetch = vi.fn(async () => cardResponse()) as typeof fetch;
		const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
		try {
			for (const url of [
				"http://127.0.0.1:8787",
				"http://169.254.169.254/",
				"http://localhost:3000",
			]) {
				const response = await app.inject({
					method: "POST",
					url: "/api/ghost/nodes",
					payload: { nodeId: "ghost-internal", url },
				});
				expect(response.statusCode, url).toBe(403);
				expect(response.json().error).toBe("internal_url_blocked");
			}
			expect(globalThis.fetch).not.toHaveBeenCalled();
		} finally {
			await app.close();
		}
	});

	it("enforces GHOST_NODE_URL_ALLOWLIST with 403 for unlisted hosts", async () => {
		process.env.GHOST_NODE_URL_ALLOWLIST = "mesh.muhanai.com";
		globalThis.fetch = vi.fn(async () => cardResponse()) as typeof fetch;
		const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
		try {
			const blocked = await app.inject({
				method: "POST",
				url: "/api/ghost/nodes",
				payload: { nodeId: "ghost-x", url: "https://ghost.example.com" },
			});
			expect(blocked.statusCode).toBe(403);
			expect(blocked.json().error).toBe("url_not_allowed");

			const allowed = await app.inject({
				method: "POST",
				url: "/api/ghost/nodes",
				payload: { nodeId: "ghost-x", url: "https://mesh.muhanai.com" },
			});
			expect(allowed.statusCode).toBe(201);
		} finally {
			await app.close();
		}
	});

	describe("registration auth (GHOST_REGISTRATION_TOKEN)", () => {
		it("returns 401 when the token is configured but not presented", async () => {
			process.env.GHOST_REGISTRATION_TOKEN = "s3cret-token";
			const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
			try {
				const response = await app.inject({
					method: "POST",
					url: "/api/ghost/nodes",
					payload: { nodeId: "ghost-x", url: "https://ghost.example.com" },
				});
				expect(response.statusCode).toBe(401);
				expect(response.json().error).toBe("ghost_registration_unauthorized");
			} finally {
				await app.close();
			}
		});

		it("accepts the correct x-ghost-token", async () => {
			process.env.GHOST_REGISTRATION_TOKEN = "s3cret-token";
			globalThis.fetch = vi.fn(async () => cardResponse()) as typeof fetch;
			const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
			try {
				const response = await app.inject({
					method: "POST",
					url: "/api/ghost/nodes",
					headers: { "x-ghost-token": "s3cret-token" },
					payload: { nodeId: "ghost-x", url: "https://ghost.example.com" },
				});
				expect(response.statusCode).toBe(201);
			} finally {
				await app.close();
			}
		});

		it("accepts the platform API key as an operator path", async () => {
			process.env.GHOST_REGISTRATION_TOKEN = "s3cret-token";
			process.env.API_KEY = "platform-key";
			globalThis.fetch = vi.fn(async () => cardResponse()) as typeof fetch;
			const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
			try {
				const response = await app.inject({
					method: "POST",
					url: "/api/ghost/nodes",
					headers: { "x-api-key": "platform-key" },
					payload: { nodeId: "ghost-op", url: "https://ghost.example.com" },
				});
				expect(response.statusCode).toBe(201);
			} finally {
				await app.close();
			}
		});

		it("rejects a wrong token", async () => {
			process.env.GHOST_REGISTRATION_TOKEN = "s3cret-token";
			const app = await buildApp({ enableTransport: false, logger: pino({ level: "silent" }) });
			try {
				const response = await app.inject({
					method: "POST",
					url: "/api/ghost/nodes",
					headers: { "x-ghost-token": "wrong-token" },
					payload: { nodeId: "ghost-x", url: "https://ghost.example.com" },
				});
				expect(response.statusCode).toBe(401);
			} finally {
				await app.close();
			}
		});
	});
});
